// Round building for the typing activities: a queue that never repeats a target
// until the whole set has been shown, so a child sees the letters they are meant
// to practise rather than two of them over and over.

export function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
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
