// Offline outbox for a child's answers (stage J). Every submission is saved
// on the device *before* it is sent, keyed by its client attempt id. If the
// network drops, the answer waits and is sent again on reconnect, on the next
// poll and on the next page load. The server is idempotent per (device,
// clientAttemptId), so a send whose response was lost can never count twice.
//
// The outbox never stores the device token: sending needs the token that
// lives in sessionStorage, so an answer is only ever sent by its own device.
// Type-only imports keep this module importable by node tests.

export interface OutboxItem {
  clientAttemptId: string
  deviceId: string
  dispatchId: string
  payload: {
    lessonRunStudentId?: string
    assignmentVersion?: number
    answer?: unknown
    gameResult?: { correct: number; total: number; mistakes: number; durationSec: number }
  }
  /** Client clock, for ordering and expiry only — never sent to the server. */
  queuedAt: number
}

/** Durable storage; best effort. The in-memory list is what the page uses. */
export interface OutboxStore {
  load(): Promise<OutboxItem[]>
  put(item: OutboxItem): Promise<void>
  remove(clientAttemptId: string): Promise<void>
}

/** Mirrors RETRYABLE_ATTEMPT_REFUSALS in backend/src/lib/lesson-attempt-refusals.ts. */
export const RETRYABLE_REFUSAL_CODES: readonly string[] = ['NOT_MAPPED', 'RUN_NOT_ACTIVE', 'RETRY']

/** A queued answer older than this is never sent: its lesson is long over. */
export const OUTBOX_MAX_AGE_MS = 12 * 60 * 60 * 1000

/** Thrown to the submitter when an answer is saved on the device for later. */
export class QueuedAttemptError extends Error {
  constructor() {
    super('Немає зв\'язку. Відповідь збережено на цьому пристрої — надішлемо її, щойно з\'явиться інтернет.')
    this.name = 'QueuedAttemptError'
  }
}

export type SubmitFailureKind = 'retry' | 'reject'

/**
 * Keep or drop? Network errors, server errors and rate limits are transient;
 * so are the refusals the server marks retryable (e.g. the lesson is paused).
 * Everything else — a closed task, used attempts, a revoked device — is final.
 */
export function classifySubmitFailure(err: unknown): SubmitFailureKind {
  const { status, code } = (err ?? {}) as { status?: unknown; code?: unknown }
  if (typeof status !== 'number') return 'retry'
  if (status >= 500 || status === 429 || status === 408) return 'retry'
  if (status === 409 && typeof code === 'string' && RETRYABLE_REFUSAL_CODES.includes(code)) return 'retry'
  return 'reject'
}

export interface AttemptOutboxOptions<R> {
  store: OutboxStore
  send(item: OutboxItem): Promise<R>
  /** An answer confirmed later, in the background (not by its own submit call). */
  onDelivered(item: OutboxItem, response: R): void
  /** An answer the server finally refused in the background. */
  onRejected(item: OutboxItem, message: string): void
  now(): number
}

export interface AttemptOutbox<R> {
  /** Resolves once the stored list is loaded (expired items are dropped). */
  readonly ready: Promise<void>
  /** Saves, then tries to send now. Rejects with QueuedAttemptError if it must wait. */
  submit(item: Omit<OutboxItem, 'queuedAt'>): Promise<R>
  /** Sends everything waiting, oldest first; stops at the first transient failure. */
  flush(): Promise<void>
  hasPending(deviceId: string, dispatchId: string): boolean
  pendingCount(): number
  /** Forgets a device's answers (its lesson is over or it was revoked). */
  dropDevice(deviceId: string): Promise<number>
}

interface Waiter<R> {
  resolve(response: R): void
  reject(err: Error): void
}

export function createAttemptOutbox<R>(options: AttemptOutboxOptions<R>): AttemptOutbox<R> {
  let items: OutboxItem[] = []
  const waiters = new Map<string, Waiter<R>>()
  let running: Promise<void> | null = null
  let again = false

  async function persist(action: () => Promise<void>) {
    try {
      await action()
    } catch { /* storage unavailable: the in-memory copy still covers this page */ }
  }

  const ready = (async () => {
    let stored: OutboxItem[] = []
    try {
      stored = await options.store.load()
    } catch { /* nothing stored */ }
    const cutoff = options.now() - OUTBOX_MAX_AGE_MS
    for (const item of stored) {
      if (item.queuedAt < cutoff) await persist(() => options.store.remove(item.clientAttemptId))
    }
    const fresh = stored.filter(item => item.queuedAt >= cutoff)
    // Items submitted while loading are already in the list; keep them.
    const known = new Set(items.map(i => i.clientAttemptId))
    items = [...fresh.filter(i => !known.has(i.clientAttemptId)), ...items].sort((a, b) => a.queuedAt - b.queuedAt)
  })()

  async function forget(item: OutboxItem) {
    items = items.filter(i => i.clientAttemptId !== item.clientAttemptId)
    await persist(() => options.store.remove(item.clientAttemptId))
  }

  async function drain() {
    for (const item of [...items]) {
      let response: R
      try {
        response = await options.send(item)
      } catch (err) {
        if (classifySubmitFailure(err) === 'retry') return
        await forget(item)
        const message = (err as Error)?.message || 'Відповідь не зараховано.'
        const waiter = waiters.get(item.clientAttemptId)
        waiters.delete(item.clientAttemptId)
        if (waiter) waiter.reject(new Error(message))
        else options.onRejected(item, message)
        continue
      }
      await forget(item)
      const waiter = waiters.get(item.clientAttemptId)
      waiters.delete(item.clientAttemptId)
      if (waiter) waiter.resolve(response)
      else options.onDelivered(item, response)
    }
  }

  function flush(): Promise<void> {
    if (running) {
      again = true
      return running
    }
    running = (async () => {
      await ready
      do {
        again = false
        await drain()
      } while (again)
    })().finally(() => { running = null })
    return running
  }

  return {
    ready,
    async submit(input) {
      const item: OutboxItem = { ...input, queuedAt: options.now() }
      items = [...items.filter(i => i.clientAttemptId !== item.clientAttemptId), item]
      // Saved before the first byte goes out: a crash mid-send still retries.
      await persist(() => options.store.put(item))
      return new Promise<R>((resolve, reject) => {
        waiters.set(item.clientAttemptId, { resolve, reject })
        void flush().then(() => {
          const waiter = waiters.get(item.clientAttemptId)
          if (!waiter) return
          // Still waiting: from now on it is delivered in the background.
          waiters.delete(item.clientAttemptId)
          waiter.reject(new QueuedAttemptError())
        })
      })
    },
    flush,
    hasPending: (deviceId, dispatchId) => items.some(i => i.deviceId === deviceId && i.dispatchId === dispatchId),
    pendingCount: () => items.length,
    async dropDevice(deviceId) {
      const dropped = items.filter(i => i.deviceId === deviceId)
      for (const item of dropped) {
        waiters.get(item.clientAttemptId)?.reject(new Error('Відповідь не надіслано.'))
        waiters.delete(item.clientAttemptId)
        await forget(item)
      }
      return dropped.length
    },
  }
}

/** For tests and for browsers without IndexedDB (answers then last for the page). */
export function memoryOutboxStore(initial: OutboxItem[] = []): OutboxStore & { items: Map<string, OutboxItem> } {
  const map = new Map(initial.map(item => [item.clientAttemptId, item]))
  return {
    items: map,
    async load() { return [...map.values()] },
    async put(item) { map.set(item.clientAttemptId, item) },
    async remove(id) { map.delete(id) },
  }
}
