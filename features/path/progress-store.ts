import type { ActivityResult } from './activity-result.js'

// Локальний прогрес карти шляху (Home Mode, до появи батьківських акаунтів).
// localStorage-схема версіонована; кожен результат додатково потрапляє в чергу
// подій з ідемпотентним ключем — на етапі серверного синку чергу можна дослати
// без переробки формату (сервер робить upsert кращого результату).

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface PointProgress {
  pointId: string
  status: 'completed'
  bestStars: number
  attempts: number
  updatedAt: string
}

export interface QueuedResult {
  /** Idempotency key: point + activity + version + completion time. */
  key: string
  pointId: string
  result: ActivityResult
}

interface ProgressState {
  version: 1
  points: Record<string, PointProgress>
  queue: QueuedResult[]
}

const SCHEMA_VERSION = 1 as const
const QUEUE_LIMIT = 200 // захист від розростання storage при довгій офлайн-грі

function emptyState(): ProgressState {
  return { version: SCHEMA_VERSION, points: {}, queue: [] }
}

function isValidState(raw: unknown): raw is ProgressState {
  if (typeof raw !== 'object' || raw === null) return false
  const s = raw as ProgressState
  return s.version === SCHEMA_VERSION
    && typeof s.points === 'object' && s.points !== null
    && Array.isArray(s.queue)
}

export function createProgressStore(storage: StorageLike, profileKey = 'local') {
  const storageKey = `rozumko:path-progress:v${SCHEMA_VERSION}:${profileKey}`
  let memoryState: ProgressState | null = null

  function load(): ProgressState {
    if (memoryState) return memoryState
    try {
      const raw = storage.getItem(storageKey)
      if (!raw) {
        memoryState = emptyState()
        return memoryState
      }
      const parsed: unknown = JSON.parse(raw)
      memoryState = isValidState(parsed) ? parsed : emptyState()
    } catch {
      memoryState = emptyState() // зіпсований JSON → чистий старт, не падаємо
    }
    return memoryState
  }

  function save(state: ProgressState) {
    memoryState = state
    try {
      storage.setItem(storageKey, JSON.stringify(state))
    } catch {
      // Квота/приватний режим: прогрес сесії живе, просто не переживе reload.
    }
  }

  /**
   * Записує завершення точки. Ідемпотентно за (pointId, completedAt):
   * повторний виклик із тим самим результатом нічого не змінює.
   * Повертає актуальний прогрес точки.
   */
  function recordResults(pointId: string, results: ActivityResult[]): PointProgress {
    if (!results.length) throw new Error('Point completion requires at least one activity result')
    const state = load()
    const existing = state.points[pointId]
    const fresh = results.filter(result => {
      const key = `${pointId}:${result.activityId}:v${result.activityVersion}:${result.completedAt}`
      if (state.queue.some(q => q.key === key)) return false
      state.queue.push({ key, pointId, result })
      return true
    })

    if (fresh.length) {
      if (state.queue.length > QUEUE_LIMIT) state.queue.splice(0, state.queue.length - QUEUE_LIMIT)
      const sessionStars = Math.round(results.reduce((sum, result) => sum + result.stars, 0) / results.length)
      const updatedAt = results.reduce((latest, result) => result.completedAt > latest ? result.completedAt : latest, results[0].completedAt)

      state.points[pointId] = {
        pointId,
        status: 'completed',
        bestStars: Math.max(existing?.bestStars ?? 0, sessionStars),
        attempts: (existing?.attempts ?? 0) + 1,
        updatedAt,
      }
      save(state)
    }
    const progress = load().points[pointId]
    if (!progress) throw new Error('Point progress was not recorded')
    return progress
  }

  function recordResult(pointId: string, result: ActivityResult): PointProgress {
    return recordResults(pointId, [result])
  }

  function getPoint(pointId: string): PointProgress | null {
    return load().points[pointId] ?? null
  }

  function isCompleted(pointId: string): boolean {
    return load().points[pointId]?.status === 'completed'
  }

  function completedIds(): string[] {
    return Object.keys(load().points)
  }

  /** Черга несинхронізованих результатів (для майбутнього серверного синку). */
  function pendingQueue(): QueuedResult[] {
    return [...load().queue]
  }

  /** Підтвердити доставку подій на сервер — прибрати їх із черги. */
  function ackQueue(keys: string[]) {
    const state = load()
    const drop = new Set(keys)
    state.queue = state.queue.filter(q => !drop.has(q.key))
    save(state)
  }

  /**
   * Applies a trusted server snapshot. A local browser result must never
   * override verified stars or attempt counts; unsent local events stay in
   * queue until the server validates them.
   */
  function mergeServer(serverPoints: PointProgress[]) {
    const state = load()
    for (const sp of serverPoints) {
      state.points[sp.pointId] = { ...sp }
    }
    save(state)
  }

  /** Повне скидання прогресу профілю (кнопка «почати заново» тощо). */
  function reset() {
    memoryState = emptyState()
    storage.removeItem(storageKey)
  }

  return { recordResult, recordResults, getPoint, isCompleted, completedIds, pendingQueue, ackQueue, mergeServer, reset }
}

export type ProgressStore = ReturnType<typeof createProgressStore>
