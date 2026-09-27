import type { LessonDefinitionV1 } from './curriculum-lesson-schema.js'

/**
 * A run's lesson snapshot is immutable (database trigger, migration 0050), so
 * device polls can share one parsed copy instead of reading the jsonb column
 * every two seconds. Bounded LRU; concurrent misses share a single load.
 */
export function createRunSnapshotCache(maxEntries = 16) {
  const entries = new Map<string, LessonDefinitionV1>()
  const loading = new Map<string, Promise<LessonDefinitionV1>>()

  async function get(runId: string, load: () => Promise<unknown>): Promise<LessonDefinitionV1> {
    const hit = entries.get(runId)
    if (hit) {
      entries.delete(runId)
      entries.set(runId, hit)
      return hit
    }
    const pending = loading.get(runId)
    if (pending) return pending
    const request = (async () => {
      try {
        const snapshot = await load()
        if (!snapshot || typeof snapshot !== 'object') throw new Error(`Lesson run ${runId} has no snapshot`)
        const lesson = snapshot as LessonDefinitionV1
        entries.set(runId, lesson)
        while (entries.size > maxEntries) entries.delete(entries.keys().next().value!)
        return lesson
      } finally {
        loading.delete(runId)
      }
    })()
    loading.set(runId, request)
    return request
  }

  return { get, size: () => entries.size }
}
