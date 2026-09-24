import test from 'node:test'
import assert from 'node:assert/strict'

import {
  OUTBOX_MAX_AGE_MS, QueuedAttemptError, RETRYABLE_REFUSAL_CODES,
  classifySubmitFailure, createAttemptOutbox, memoryOutboxStore,
} from './attempt-outbox.ts'
import { RETRYABLE_ATTEMPT_REFUSALS } from '../../backend/src/lib/lesson-attempt-refusals.ts'

const offline = () => Object.assign(new Error('Немає з\'єднання з сервером.'))
const refused = (code, message = 'Відмовлено') => Object.assign(new Error(message), { status: 409, code })

/** A fake server with the backend's idempotency: one attempt per clientAttemptId. */
function fakeServer() {
  const attempts = new Map()
  const server = {
    online: true,
    /** The request lands but its response is lost on the way back. */
    loseNextResponse: false,
    refuseNext: null,
    requests: 0,
    attempts,
    async send(item) {
      server.requests += 1
      if (!server.online) throw offline()
      if (server.refuseNext) {
        const err = server.refuseNext
        server.refuseNext = null
        throw err
      }
      if (!attempts.has(item.clientAttemptId)) attempts.set(item.clientAttemptId, { attemptNo: attempts.size + 1, item })
      if (server.loseNextResponse) {
        server.loseNextResponse = false
        throw offline()
      }
      return { attemptNo: attempts.get(item.clientAttemptId).attemptNo }
    },
  }
  return server
}

function setup({ store = memoryOutboxStore(), now = () => 1_000_000 } = {}) {
  const server = fakeServer()
  const delivered = []
  const rejected = []
  const outbox = createAttemptOutbox({
    store,
    now,
    send: item => server.send(item),
    onDelivered: (item, response) => delivered.push({ id: item.clientAttemptId, response }),
    onRejected: (item, message) => rejected.push({ id: item.clientAttemptId, message }),
  })
  return { server, outbox, store, delivered, rejected }
}

const answer = (id, dispatchId = 'd1') => ({ clientAttemptId: id, deviceId: 'dev1', dispatchId, payload: { answer: { optionId: 'a' } } })

test('the frontend retryable refusals mirror the backend list', () => {
  assert.deepEqual([...RETRYABLE_REFUSAL_CODES], [...RETRYABLE_ATTEMPT_REFUSALS])
})

test('network, server and transient refusals are retried; a closed task or used attempts are final', () => {
  assert.equal(classifySubmitFailure(offline()), 'retry')
  assert.equal(classifySubmitFailure({ status: 503 }), 'retry')
  assert.equal(classifySubmitFailure({ status: 429 }), 'retry')
  assert.equal(classifySubmitFailure(refused('RUN_NOT_ACTIVE')), 'retry')
  assert.equal(classifySubmitFailure(refused('NOT_MAPPED')), 'retry')
  assert.equal(classifySubmitFailure(refused('RETRY')), 'retry')
  assert.equal(classifySubmitFailure(refused('DISPATCH_CLOSED')), 'reject')
  assert.equal(classifySubmitFailure(refused('NO_ATTEMPTS_LEFT')), 'reject')
  assert.equal(classifySubmitFailure({ status: 409 }), 'reject')
  assert.equal(classifySubmitFailure({ status: 400 }), 'reject')
  assert.equal(classifySubmitFailure({ status: 401 }), 'reject')
})

test('online, an answer is saved, sent and removed at once', async () => {
  const { server, outbox, store } = setup()
  const response = await outbox.submit(answer('a1'))
  assert.deepEqual(response, { attemptNo: 1 })
  assert.equal(store.items.size, 0)
  assert.equal(outbox.pendingCount(), 0)
  assert.equal(server.attempts.size, 1)
})

test('offline submit, then reconnect: exactly one server attempt, delivered in the background', async () => {
  const { server, outbox, store, delivered } = setup()
  server.online = false
  await assert.rejects(outbox.submit(answer('a1')), QueuedAttemptError)
  assert.ok(store.items.has('a1'), 'saved on the device')
  assert.ok(outbox.hasPending('dev1', 'd1'))

  await outbox.flush() // still offline: stays queued
  assert.equal(outbox.pendingCount(), 1)

  server.online = true
  await outbox.flush()
  await outbox.flush() // a second flush has nothing left to send
  assert.equal(server.attempts.size, 1)
  assert.deepEqual(delivered, [{ id: 'a1', response: { attemptNo: 1 } }])
  assert.equal(store.items.size, 0)
})

test('a lost response is resent with the same id and still counts once', async () => {
  const { server, outbox, delivered } = setup()
  server.loseNextResponse = true
  await assert.rejects(outbox.submit(answer('a1')), QueuedAttemptError)
  assert.equal(server.attempts.size, 1, 'the first request reached the server')
  await outbox.flush()
  assert.equal(server.attempts.size, 1)
  assert.equal(server.requests, 2)
  assert.deepEqual(delivered, [{ id: 'a1', response: { attemptNo: 1 } }])
})

test('answers are sent in order and a transient failure keeps later ones waiting', async () => {
  const { server, outbox, delivered } = setup({ now: (() => { let t = 0; return () => ++t })() })
  server.online = false
  await assert.rejects(outbox.submit(answer('a1', 'd1')), QueuedAttemptError)
  await assert.rejects(outbox.submit(answer('a2', 'd2')), QueuedAttemptError)
  server.online = true
  server.refuseNext = refused('RUN_NOT_ACTIVE', 'Пауза')
  await outbox.flush()
  assert.equal(outbox.pendingCount(), 2, 'paused: nothing sent, order kept')
  await outbox.flush()
  assert.deepEqual(delivered.map(d => d.id), ['a1', 'a2'])
  assert.deepEqual([...server.attempts.values()].map(a => a.attemptNo), [1, 2])
})

test('a final refusal drops the answer: to the submitter now, or as a notice later', async () => {
  const { server, outbox, rejected, store } = setup()
  server.refuseNext = refused('NO_ATTEMPTS_LEFT', 'Спроби вже використано.')
  await assert.rejects(outbox.submit(answer('a1')), { message: 'Спроби вже використано.' })
  assert.equal(store.items.size, 0)

  server.online = false
  await assert.rejects(outbox.submit(answer('a2')), QueuedAttemptError)
  server.online = true
  server.refuseNext = refused('DISPATCH_CLOSED', 'Це завдання вже закрите.')
  await outbox.flush()
  assert.deepEqual(rejected, [{ id: 'a2', message: 'Це завдання вже закрите.' }])
  assert.equal(outbox.pendingCount(), 0)
})

test('a reload restores waiting answers from storage and drops expired ones', async () => {
  const now = 50 * OUTBOX_MAX_AGE_MS
  const store = memoryOutboxStore([
    { ...answer('fresh'), queuedAt: now - 1000 },
    { ...answer('stale', 'd0'), queuedAt: now - OUTBOX_MAX_AGE_MS - 1 },
  ])
  const { outbox, server, delivered } = setup({ store, now: () => now })
  await outbox.ready
  assert.ok(outbox.hasPending('dev1', 'd1'))
  assert.ok(!outbox.hasPending('dev1', 'd0'))
  assert.ok(!store.items.has('stale'))
  await outbox.flush()
  assert.deepEqual(delivered.map(d => d.id), ['fresh'])
  assert.equal(server.attempts.size, 1)
})

test('storage failures never lose the answer for this page', async () => {
  const broken = {
    load: async () => { throw new Error('blocked') },
    put: async () => { throw new Error('quota') },
    remove: async () => { throw new Error('blocked') },
  }
  const { server, outbox, delivered } = setup({ store: broken })
  server.online = false
  await assert.rejects(outbox.submit(answer('a1')), QueuedAttemptError)
  server.online = true
  await outbox.flush()
  assert.deepEqual(delivered.map(d => d.id), ['a1'])
})

test('concurrent flushes never send the same answer twice at once', async () => {
  const { server, outbox } = setup()
  server.online = false
  await assert.rejects(outbox.submit(answer('a1')), QueuedAttemptError)
  server.online = true
  await Promise.all([outbox.flush(), outbox.flush(), outbox.flush()])
  assert.equal(server.requests, 2, 'one failed send while offline, then exactly one delivery')
  assert.equal(server.attempts.size, 1)
})

test('forgetting a device drops its answers (its lesson is over)', async () => {
  const { server, outbox, store } = setup()
  server.online = false
  await assert.rejects(outbox.submit(answer('a1')), QueuedAttemptError)
  assert.equal(await outbox.dropDevice('dev1'), 1)
  assert.equal(store.items.size, 0)
  server.online = true
  await outbox.flush()
  assert.equal(server.attempts.size, 0)
})
