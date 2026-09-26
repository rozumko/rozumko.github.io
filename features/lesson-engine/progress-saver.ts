import type { LessonProgress } from './types.js'

interface SavedDraft { revision: number; progress: LessonProgress; sent?: LessonProgress; updatedAt: number }

/** PostgreSQL jsonb can reorder object properties; order never changes a checkpoint. */
function fingerprint(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]])) : entry)
}

export interface ProgressSaverDeps {
  read(): string | null
  write(value: string | null): void
  send(revision: number, progress: LessonProgress): Promise<{ revision: number }>
  refused(code: string): void
}

/** Single writer with revision checks; storage contains the child's raw work only. */
export function createProgressSaver(revision: number, initial: LessonProgress | null, deps: ProgressSaverDeps) {
  let progress = initial
  let pending = false
  let stopped = false
  let inFlight: Promise<void> | null = null
  let sent: LessonProgress | undefined
  try {
    const raw = deps.read()
    const draft = raw ? JSON.parse(raw) as SavedDraft : null
    if (draft && Number.isFinite(draft.updatedAt) && Date.now() - draft.updatedAt < 12 * 60 * 60 * 1000 && typeof draft.progress === 'object' && draft.progress !== null &&
      (draft.revision === revision || (draft.revision + 1 === revision && fingerprint(draft.sent) === fingerprint(initial)))) {
      progress = draft.progress
      pending = true
    } else deps.write(null)
  } catch { /* Recovery storage is best effort. */ }

  function persist() {
    try { deps.write(pending && progress ? JSON.stringify({ revision, progress, sent, updatedAt: Date.now() }) : null) } catch { /* Keep the in-memory draft. */ }
  }

  function save(next: LessonProgress) {
    if (stopped || fingerprint(next) === fingerprint(progress)) return
    progress = structuredClone(next)
    pending = true
    persist()
  }

  function flush(): Promise<void> {
    if (inFlight) return inFlight
    if (stopped || !pending || !progress) return Promise.resolve()
    inFlight = (async () => {
      try {
        while (pending && progress && !stopped) {
          const current = progress
          sent = current
          persist()
          const response = await deps.send(revision, current)
          revision = response.revision
          pending = progress !== current
          sent = undefined
          persist()
        }
      } catch (err) {
        const { status, code } = err as { status?: number; code?: string }
        if (status === 400 || status === 401 || status === 404 || (status === 409 && code !== 'RETRY')) {
          stopped = true
          pending = false
          persist()
          deps.refused(code ?? 'DEVICE_INVALID')
        }
        // Network/5xx/429 failures retain the local draft for the next flush.
      } finally { inFlight = null }
    })()
    return inFlight
  }

  return { initial: progress, save, flush }
}
