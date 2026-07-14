import type { ParentPathActivityResult, ParentPathProgress } from '../api/client.js'
import type { GradePathMap } from './path-data.js'
import type { ProgressStore, QueuedResult } from './progress-store.js'

export interface PathSyncApi {
  getProgress(childProfileId: string, pathId: string): Promise<{ progress: ParentPathProgress[] }>
  submitProgress(
    childProfileId: string,
    payload: { pathId: string; pathVersion: number; pointId: string; results: ParentPathActivityResult[] },
  ): Promise<ParentPathProgress>
}

interface CompletionBatch {
  pointId: string
  pathVersion: number
  entries: QueuedResult[]
}

function completionBatches(map: GradePathMap, queue: QueuedResult[]) {
  const batches: CompletionBatch[] = []
  const staleKeys: string[] = []
  const versionedKeys = new Set<string>()

  const versioned = new Map<string, QueuedResult[]>()
  for (const entry of queue) {
    if (!entry.batchId || !entry.pathVersion) continue
    const entries = versioned.get(entry.batchId) ?? []
    entries.push(entry)
    versioned.set(entry.batchId, entries)
    versionedKeys.add(entry.key)
  }
  for (const entries of versioned.values()) {
    batches.push({ pointId: entries[0].pointId, pathVersion: entries[0].pathVersion!, entries })
  }

  const legacyQueue = queue.filter(entry => !versionedKeys.has(entry.key))

  for (const point of map.points) {
    const required = new Map(point.activities
      .filter(step => step.required)
      .map(step => [`path:${point.id}:${step.id}`, step.version]))
    const entries = legacyQueue.filter(entry => entry.pointId === point.id)
    let current = new Map<string, QueuedResult>()

    for (const entry of entries) {
      const expectedVersion = required.get(entry.result.activityId)
      if (expectedVersion !== entry.result.activityVersion) {
        staleKeys.push(entry.key)
        continue
      }
      if (current.has(entry.result.activityId)) {
        staleKeys.push(...[...current.values()].map(value => value.key))
        current = new Map()
      }
      current.set(entry.result.activityId, entry)
      if (current.size === required.size) {
        batches.push({ pointId: point.id, pathVersion: map.version, entries: [...current.values()] })
        current = new Map()
      }
    }
    staleKeys.push(...[...current.values()].map(value => value.key))
  }

  const knownPoints = new Set(map.points.map(point => point.id))
  for (const entry of legacyQueue) {
    if (!knownPoints.has(entry.pointId)) staleKeys.push(entry.key)
  }
  return { batches, staleKeys: [...new Set(staleKeys)] }
}

function toApiResult(entry: QueuedResult): ParentPathActivityResult {
  const result = entry.result
  return {
    activityId: result.activityId,
    activityVersion: result.activityVersion,
    ...(result.contentVersion !== undefined ? { contentVersion: result.contentVersion } : {}),
    trust: 'client-unverified',
    stars: result.stars,
    correct: result.correct,
    total: result.total,
    completedAt: result.completedAt,
  }
}

export async function syncPathProgress(
  store: ProgressStore,
  map: GradePathMap,
  childProfileId: string,
  api: PathSyncApi,
): Promise<{ syncedEvents: number; pendingEvents: number; staleEvents: number; online: boolean }> {
  const pathId = `grade-${map.grade}`
  try {
    const initial = await api.getProgress(childProfileId, pathId)
    store.mergeServer(initial.progress)
  } catch {
    return { syncedEvents: 0, pendingEvents: store.pendingQueue().length, staleEvents: 0, online: false }
  }

  const { batches, staleKeys } = completionBatches(map, store.pendingQueue())
  let syncedEvents = 0
  for (const batch of batches) {
    try {
      await api.submitProgress(childProfileId, {
        pathId,
        pathVersion: batch.pathVersion,
        pointId: batch.pointId,
        results: batch.entries.map(toApiResult),
      })
      const keys = batch.entries.map(entry => entry.key)
      store.ackQueue(keys)
      syncedEvents += keys.length
    } catch {
      break
    }
  }

  try {
    const final = await api.getProgress(childProfileId, pathId)
    store.mergeServer(final.progress)
  } catch {
    return {
      syncedEvents,
      pendingEvents: store.pendingQueue().length,
      staleEvents: staleKeys.length,
      online: false,
    }
  }

  return {
    syncedEvents,
    pendingEvents: store.pendingQueue().length,
    staleEvents: staleKeys.length,
    online: true,
  }
}
