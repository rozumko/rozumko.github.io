import test from 'node:test'
import assert from 'node:assert/strict'

import { GRADE2_PATH } from './path-data.ts'
import { createProgressStore } from './progress-store.ts'
import { syncPathProgress } from './path-sync.ts'

function storage() {
  const data = new Map()
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  }
}

function activity(activityId, completedAt, stars = 2) {
  return {
    activityType: 'game', activityId, activityVersion: 1, grade: 2,
    curriculum: [], trust: 'client-unverified', stars, correct: 4, total: 5,
    durationSec: null, completedAt,
  }
}

function fakeApi(initial = []) {
  const progress = [...initial]
  const submissions = []
  return {
    progress,
    submissions,
    async getProgress() { return { progress: progress.map(row => ({ ...row })) } },
    async submitProgress(_profileId, payload) {
      submissions.push(payload)
      const stars = Math.round(payload.results.reduce((sum, row) => sum + row.stars, 0) / payload.results.length)
      const existing = progress.find(row => row.pointId === payload.pointId)
      if (existing) {
        existing.bestStars = Math.max(existing.bestStars, stars)
        existing.attempts += 1
        return existing
      }
      const row = { pointId: payload.pointId, status: 'completed', bestStars: stars, attempts: 1, updatedAt: '2026-07-10T12:00:00Z' }
      progress.push(row)
      return row
    },
  }
}

test('sync sends a single-activity point, acknowledges it and merges server state', async () => {
  const store = createProgressStore(storage(), 'child-a')
  store.recordResult('g2-info-start', activity('path:g2-info-start:infosort', '2026-07-10T10:00:00Z', 3))
  const api = fakeApi()
  const result = await syncPathProgress(store, GRADE2_PATH, 'child-a', api)
  assert.equal(result.syncedEvents, 1)
  assert.equal(result.pendingEvents, 0)
  assert.equal(api.submissions.length, 1)
  assert.equal(store.getPoint('g2-info-start').attempts, 1)
})

test('sync groups both required activities into one point completion', async () => {
  const store = createProgressStore(storage(), 'child-a')
  store.recordResults('g2-ct-algorithms', [
    activity('path:g2-ct-algorithms:algorithms-mission', '2026-07-10T10:00:00Z', 3),
    activity('path:g2-ct-algorithms:algorithms-puzzles', '2026-07-10T10:02:00Z', 1),
  ])
  const api = fakeApi()
  const result = await syncPathProgress(store, GRADE2_PATH, 'child-a', api)
  assert.equal(result.syncedEvents, 2)
  assert.equal(api.submissions.length, 1)
  assert.equal(api.submissions[0].results.length, 2)
  assert.equal(api.progress[0].bestStars, 2)
})

test('offline sync preserves the queue and local progress', async () => {
  const store = createProgressStore(storage(), 'child-a')
  store.recordResult('g2-info-start', activity('path:g2-info-start:infosort', '2026-07-10T10:00:00Z'))
  const result = await syncPathProgress(store, GRADE2_PATH, 'child-a', {
    async getProgress() { throw new Error('offline') },
    async submitProgress() { throw new Error('offline') },
  })
  assert.equal(result.online, false)
  assert.equal(result.pendingEvents, 1)
  assert.equal(store.isCompleted('g2-info-start'), true)
})

test('stale activity versions remain queued and are never submitted', async () => {
  const store = createProgressStore(storage(), 'child-a')
  store.recordResult('g2-info-start', { ...activity('path:g2-info-start:infosort', '2026-07-10T10:00:00Z'), activityVersion: 2 })
  const api = fakeApi()
  const result = await syncPathProgress(store, GRADE2_PATH, 'child-a', api)
  assert.equal(result.staleEvents, 1)
  assert.equal(result.pendingEvents, 1)
  assert.equal(api.submissions.length, 0)
})
