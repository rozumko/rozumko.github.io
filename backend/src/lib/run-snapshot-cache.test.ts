import test from 'node:test'
import assert from 'node:assert/strict'
import { createRunSnapshotCache } from './run-snapshot-cache.js'

test('a run snapshot is loaded once, shared by concurrent polls and then served from memory', async () => {
  const cache = createRunSnapshotCache()
  let loads = 0
  const load = async () => { loads++; await new Promise(resolve => setTimeout(resolve, 5)); return { id: 'lesson' } }
  const [a, b] = await Promise.all([cache.get('run-1', load), cache.get('run-1', load)])
  assert.equal(a, b)
  assert.equal(await cache.get('run-1', load), a)
  assert.equal(loads, 1)
})

test('the cache is bounded and evicts the least recently used run', async () => {
  const cache = createRunSnapshotCache(2)
  let loads = 0
  const load = async () => { loads++; return {} }
  await cache.get('a', load)
  await cache.get('b', load)
  await cache.get('a', load)
  await cache.get('c', load)
  assert.equal(cache.size(), 2)
  await cache.get('a', load)
  assert.equal(loads, 3)
  await cache.get('b', load)
  assert.equal(loads, 4)
})

test('a missing snapshot or failed load is not cached', async () => {
  const cache = createRunSnapshotCache()
  await assert.rejects(cache.get('run', async () => undefined))
  await assert.rejects(cache.get('run', async () => { throw new Error('db down') }))
  assert.equal(cache.size(), 0)
  assert.deepEqual(await cache.get('run', async () => ({ ok: true })), { ok: true })
})
