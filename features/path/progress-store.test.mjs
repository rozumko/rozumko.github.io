import test from 'node:test'
import assert from 'node:assert/strict'

import { createProgressStore } from './progress-store.ts'
import { fromSortingSummary, fromPuzzleSummary, fromMissionSummary, missionStars } from './activity-result.ts'
import { starRating } from '../missions/mission-result.ts'

function fakeStorage() {
  const m = new Map()
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, v) },
    removeItem: k => { m.delete(k) },
    _raw: m,
  }
}

const at = iso => ({
  activityId: 'path:g2-ct-sort:attributes',
  activityVersion: 1,
  grade: 2,
  curriculum: [{ track: 'computational-thinking', topic: 'classification' }],
  now: () => new Date(iso),
})

function result(iso, stars = 2) {
  return fromSortingSummary({ totalItems: 10, mistakes: 3 - stars, levels: 5, stars, bestStreak: 4 }, at(iso))
}

test('recordResult: перше проходження створює completed-точку і подію в черзі', () => {
  const store = createProgressStore(fakeStorage())
  const p = store.recordResult('p1', result('2026-07-10T10:00:00Z', 2))
  assert.equal(p.status, 'completed')
  assert.equal(p.bestStars, 2)
  assert.equal(p.attempts, 1)
  assert.equal(store.isCompleted('p1'), true)
  assert.equal(store.pendingQueue().length, 1)
})

test('recordResult: ідемпотентність за (pointId, completedAt)', () => {
  const store = createProgressStore(fakeStorage())
  const r = result('2026-07-10T10:00:00Z', 2)
  store.recordResult('p1', r)
  const p = store.recordResult('p1', r)
  assert.equal(p.attempts, 1)
  assert.equal(store.pendingQueue().length, 1)
})

test('recordResult: повторне проходження — attempts++, кращі зірки лишаються', () => {
  const store = createProgressStore(fakeStorage())
  store.recordResult('p1', result('2026-07-10T10:00:00Z', 3))
  const p = store.recordResult('p1', result('2026-07-10T11:00:00Z', 1))
  assert.equal(p.attempts, 2)
  assert.equal(p.bestStars, 3)
  assert.equal(store.pendingQueue().length, 2)
})

test('ackQueue: прибирає лише підтверджені події', () => {
  const store = createProgressStore(fakeStorage())
  store.recordResult('p1', result('2026-07-10T10:00:00Z'))
  store.recordResult('p2', result('2026-07-10T10:05:00Z'))
  const [first] = store.pendingQueue()
  store.ackQueue([first.key])
  const rest = store.pendingQueue()
  assert.equal(rest.length, 1)
  assert.equal(rest[0].pointId, 'p2')
})

test('зіпсований JSON у storage → чистий старт без падіння', () => {
  const storage = fakeStorage()
  storage.setItem('rozumko:path-progress:v1:local', '{broken')
  const store = createProgressStore(storage)
  assert.deepEqual(store.completedIds(), [])
  store.recordResult('p1', result('2026-07-10T10:00:00Z'))
  assert.equal(store.isCompleted('p1'), true)
})

test('профілі ізольовані за profileKey', () => {
  const storage = fakeStorage()
  const a = createProgressStore(storage, 'child-a')
  const b = createProgressStore(storage, 'child-b')
  a.recordResult('p1', result('2026-07-10T10:00:00Z'))
  assert.equal(b.isCompleted('p1'), false)
})

test('recordResult: недоступний localStorage не перериває поточну сесію', () => {
  const storage = {
    getItem: () => null,
    setItem: () => { throw new Error('quota exceeded') },
    removeItem: () => {},
  }
  const store = createProgressStore(storage)
  const saved = store.recordResult('p1', result('2026-07-10T10:00:00Z', 2))
  assert.equal(saved.status, 'completed')
  assert.equal(store.isCompleted('p1'), true)
  assert.equal(store.pendingQueue().length, 1)
})

test('recordResults: кілька активностей завершують точку як одну спробу', () => {
  const store = createProgressStore(fakeStorage())
  const first = result('2026-07-10T10:00:00Z', 3)
  const second = result('2026-07-10T10:01:00Z', 1)
  const saved = store.recordResults('p1', [first, second])
  assert.equal(saved.attempts, 1)
  assert.equal(saved.bestStars, 2)
  assert.equal(store.pendingQueue().length, 2)
})

test('mergeServer: авторитетний серверний знімок замінює локальні результати', () => {
  const store = createProgressStore(fakeStorage())
  store.recordResult('p1', result('2026-07-10T10:00:00Z', 3))
  store.mergeServer([
    { pointId: 'p1', status: 'completed', bestStars: 1, attempts: 5, updatedAt: '2026-07-11T09:00:00Z' },
    { pointId: 'p9', status: 'completed', bestStars: 2, attempts: 1, updatedAt: '2026-07-09T09:00:00Z' },
  ])
  const p1 = store.getPoint('p1')
  assert.equal(p1.bestStars, 1)
  assert.equal(p1.attempts, 5)
  assert.equal(p1.updatedAt, '2026-07-11T09:00:00Z')
  assert.equal(store.isCompleted('p9'), true)
})

test('clearPoint: видаляє точку та її черговий запис, не чіпає решту', () => {
  const store = createProgressStore(fakeStorage())
  store.recordResult('p1', result('2026-07-10T10:00:00Z'))
  store.recordResult('p2', result('2026-07-10T10:05:00Z'))
  store.clearPoint('p1')
  assert.equal(store.isCompleted('p1'), false)
  assert.equal(store.isCompleted('p2'), true)
  const queue = store.pendingQueue()
  assert.equal(queue.length, 1)
  assert.equal(queue[0].pointId, 'p2')
})

test('clearPoint: не зачіпає прогрес інших профілів у тому самому storage', () => {
  const storage = fakeStorage()
  const a = createProgressStore(storage, 'child-a')
  const b = createProgressStore(storage, 'local')
  b.recordResult('p1', result('2026-07-10T10:00:00Z'))
  b.clearPoint('p1')
  a.recordResult('p1', result('2026-07-10T10:00:00Z'))
  assert.equal(a.isCompleted('p1'), true)
})

test('reset: скидає прогрес лише свого профілю', () => {
  const storage = fakeStorage()
  const a = createProgressStore(storage, 'child-a')
  const b = createProgressStore(storage, 'child-b')
  a.recordResult('p1', result('2026-07-10T10:00:00Z'))
  b.recordResult('p1', result('2026-07-10T10:00:00Z'))
  a.reset()
  assert.equal(a.isCompleted('p1'), false)
  assert.equal(b.isCompleted('p1'), true)
})

// --- адаптери ActivityResult ---

test('fromSortingSummary: correct = total - mistakes, контекст переноситься', () => {
  const r = fromSortingSummary(
    { totalItems: 12, mistakes: 2, levels: 5, stars: 2, bestStreak: 6 },
    {
      activityId: 'path:g2-ct-sort:attributes',
      activityVersion: 1,
      grade: 2,
      curriculum: [{ track: 'computational-thinking', topic: 'classification' }],
      now: () => new Date('2026-07-10T10:00:00Z'),
    },
  )
  assert.equal(r.activityType, 'game')
  assert.equal(r.correct, 10)
  assert.equal(r.total, 12)
  assert.equal(r.stars, 2)
  assert.equal(r.curriculum[0].topic, 'classification')
  assert.equal(r.activityVersion, 1)
  assert.equal(r.trust, 'client-unverified')
  assert.equal(r.completedAt, '2026-07-10T10:00:00.000Z')
})

test('fromPuzzleSummary: межі correct/stars обрізаються', () => {
  const r = fromPuzzleSummary(
    { correct: 9, total: 5, stars: 7 },
    { activityId: 'puzzle:g2', activityVersion: 1, curriculum: [] },
  )
  assert.equal(r.correct, 5)
  assert.equal(r.stars, 3)
  assert.equal(r.grade, null)
})

test('fromMissionSummary: зірки за starRating від відсотка', () => {
  const r = fromMissionSummary(
    { correct: 9, total: 10, percent: 90 },
    { activityId: 'mission:demo', activityVersion: 1, curriculum: [] },
  )
  assert.equal(r.activityType, 'mission')
  assert.equal(r.stars, 3)
})

test('missionStars не дрейфує від mission-result.starRating', () => {
  for (let p = 0; p <= 100; p++) assert.equal(missionStars(p), starRating(p), `percent=${p}`)
})
