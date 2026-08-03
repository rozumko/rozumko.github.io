// Round building for the typing activities: a queue that never repeats a target
// until the whole set has been shown, so a child sees the letters they are meant
// to practise rather than two of them over and over.

/**
 * The server refuses a result with more mistakes than this
 * (ACTIVITY_MAX_MISTAKES in backend/src/lib/school-activities.ts). Typing runs
 * are the only ones long enough to approach it — a child stuck on a key they
 * cannot find can press a lot of wrong ones — and losing the whole result over
 * the count is worse than reporting it capped.
 */
export const MAX_REPORTED_MISTAKES = 999

export function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/**
 * Endless queue with no repeats: the set is handed out shuffled and reshuffled
 * only once it runs dry, so a sprint shows the whole set before repeating.
 */
export function createBag<T>(items: readonly T[]): { next: () => T | null } {
  const source = [...items]
  let pool: T[] = []
  let last: unknown = null

  return {
    next() {
      if (source.length === 0) return null
      if (pool.length === 0) {
        pool = shuffled(source)
        if (pool.length > 1 && identity(pool[0]) === last) {
          ;[pool[0], pool[1]] = [pool[1]!, pool[0]!]
        }
      }
      const item = pool.shift()!
      last = identity(item)
      return item
    },
  }
}

function identity(item: unknown): unknown {
  return item && typeof item === 'object' && 'id' in item ? (item as { id: unknown }).id : item
}

/**
 * `length` targets drawn from `items`. The set is reshuffled only once it runs
 * out, and a refill never starts with the target that just went by.
 */
export function buildRound<T>(items: readonly T[], length: number): T[] {
  if (items.length === 0 || length <= 0) return []

  const result: T[] = []
  let pool: T[] = []

  while (result.length < length) {
    if (pool.length === 0) {
      pool = shuffled(items)
      const last = result[result.length - 1]
      if (result.length > 0 && pool.length > 1 && identity(pool[0]) === identity(last)) {
        ;[pool[0], pool[1]] = [pool[1]!, pool[0]!]
      }
    }
    result.push(pool.shift()!)
  }

  return result
}
