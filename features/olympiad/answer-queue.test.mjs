import test from 'node:test'
import assert from 'node:assert/strict'

import { createAnswerQueue } from './answer-queue.ts'

const tick = () => new Promise(r => setTimeout(r, 0))

function fakeStorage() {
  const m = new Map()
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, v) },
    removeItem: k => { m.delete(k) },
  }
}

function makeSender() {
  let online = true
  const sent = []
  const send = async (qId, ans) => {
    if (!online) throw new Error('offline')
    sent.push({ qId, ans })
  }
  return { send, sent, setOnline: v => { online = v } }
}

// autoFlushMs:0 + sleep-миттєвий → жодних реальних таймерів у тестах.
const deps = (send, storage) => ({ send, storage, sleep: async () => {}, autoFlushMs: 0 })

test('answer-queue: онлайн — enqueue одразу надсилає й спорожняє чергу', async () => {
  const s = makeSender()
  const q = createAnswerQueue('a1', deps(s.send, fakeStorage()))
  q.enqueue('q1', 2)
  await tick()
  assert.equal(q.pendingCount(), 0)
  assert.deepEqual(s.sent, [{ qId: 'q1', ans: 2 }])
})

test('answer-queue: офлайн лишає в черзі, online дошилає', async () => {
  const s = makeSender(); s.setOnline(false)
  const q = createAnswerQueue('a1', deps(s.send, fakeStorage()))
  q.enqueue('q1', 'квадрат')
  await tick()
  assert.equal(q.pendingCount(), 1)     // блекаут — не втрачено
  s.setOnline(true)
  await q.flushOnce()
  assert.equal(q.pendingCount(), 0)
  assert.deepEqual(s.sent, [{ qId: 'q1', ans: 'квадрат' }])
})

test('answer-queue: flushAll повертає кількість недоставлених при стійкому офлайні', async () => {
  const s = makeSender(); s.setOnline(false)
  const q = createAnswerQueue('a1', deps(s.send, fakeStorage()))
  q.enqueue('q1', 1)
  q.enqueue('q2', [0, 1])
  await tick()
  const remaining = await q.flushAll(2, 0)
  assert.equal(remaining, 2)
})

test('answer-queue: повторна відповідь на те саме питання перекриває попередню', async () => {
  const s = makeSender(); s.setOnline(false)
  const q = createAnswerQueue('a1', deps(s.send, fakeStorage()))
  q.enqueue('q1', 1)
  q.enqueue('q1', 3)                     // перевибір
  await tick()
  assert.equal(q.pendingCount(), 1)
  s.setOnline(true)
  await q.flushOnce()
  assert.deepEqual(s.sent, [{ qId: 'q1', ans: 3 }])
})

test('answer-queue: черга переживає reload (той самий attemptId + storage)', async () => {
  const st = fakeStorage()
  const s1 = makeSender(); s1.setOnline(false)
  const q1 = createAnswerQueue('a1', deps(s1.send, st))
  q1.enqueue('q1', 2)
  await tick()
  assert.equal(q1.pendingCount(), 1)

  const s2 = makeSender()               // новий інстанс = після перезавантаження
  const q2 = createAnswerQueue('a1', deps(s2.send, st))
  assert.equal(q2.pendingCount(), 1)    // підхопив збережене
  await q2.flushOnce()
  assert.deepEqual(s2.sent, [{ qId: 'q1', ans: 2 }])
})

test('answer-queue: черга від іншої спроби ігнорується', async () => {
  const st = fakeStorage()
  const s1 = makeSender(); s1.setOnline(false)
  const q1 = createAnswerQueue('a1', deps(s1.send, st))
  q1.enqueue('q1', 2)
  await tick()

  const q2 = createAnswerQueue('DIFFERENT-ATTEMPT', deps(makeSender().send, st))
  assert.equal(q2.pendingCount(), 0)
})

test('answer-queue: clear спорожняє чергу і storage', async () => {
  const st = fakeStorage()
  const s = makeSender(); s.setOnline(false)
  const q = createAnswerQueue('a1', deps(s.send, st))
  q.enqueue('q1', 2)
  await tick()
  q.clear()
  assert.equal(q.pendingCount(), 0)
  assert.equal(st.getItem('rozumko_answer_queue'), null)
})
