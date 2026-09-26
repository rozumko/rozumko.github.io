import test from 'node:test'
import assert from 'node:assert/strict'
import { createProgressSaver } from './progress-saver.ts'
import { wordsRecovery } from '../activities/typing-words/typing-words-recovery.ts'

test('a changed answer during an in-flight close checkpoint is also delivered', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const calls = []
  let stored = null
  const saver = createProgressSaver(0, null, {
    read: () => stored, write: value => { stored = value }, refused: () => assert.fail('unexpected refusal'),
    send: async (revision, progress) => { calls.push({ revision, progress }); if (calls.length === 1) await gate; return { revision: revision + 1 } },
  })
  saver.save({ selection: { a: 'input' } })
  const flush = saver.flush()
  saver.save({ selection: { a: 'output' } })
  release()
  await flush
  assert.deepEqual(calls.map(call => call.revision), [0, 1])
  assert.equal(calls[1].progress.selection.a, 'output')
  assert.equal(stored, null)
})

test('offline work survives a reload, but cannot replace a newer server revision', async () => {
  let stored = null
  const deps = { read: () => stored, write: value => { stored = value }, refused() {}, send: async () => { throw new Error('offline') } }
  const saver = createProgressSaver(2, null, deps)
  saver.save({ selection: { a: 'input' } })
  await saver.flush()
  assert.equal(createProgressSaver(2, null, deps).initial.selection.a, 'input')
  assert.equal(createProgressSaver(4, { selection: { a: 'output' } }, deps).initial.selection.a, 'output')
  assert.equal(stored, null)
})

test('a lost checkpoint response restores later edits against the acknowledged revision', async () => {
  let stored = null
  const sent = { selection: { a: 'input', b: 'output' } }
  const saver = createProgressSaver(0, null, {
    read: () => stored, write: value => { stored = value }, refused() {},
    send: async () => { throw new Error('response lost') },
  })
  saver.save(sent)
  await saver.flush()
  saver.save({ selection: { a: 'output' } })
  let receivedRevision
  const restored = createProgressSaver(1, { selection: { b: 'output', a: 'input' } }, {
    read: () => stored, write: value => { stored = value }, refused() {},
    send: async revision => { receivedRevision = revision; return { revision: revision + 1 } },
  })
  assert.equal(restored.initial.selection.a, 'output')
  await restored.flush()
  assert.equal(receivedRevision, 1)
})

test('a running former laptop stops saving permanently after its assignment changes', async () => {
  let calls = 0
  const refused = []
  const saver = createProgressSaver(0, null, {
    read: () => null, write() {}, refused: code => refused.push(code),
    send: async () => { calls++; throw Object.assign(new Error('assignment changed'), { status: 409, code: 'ASSIGNMENT_CHANGED' }) },
  })
  saver.save({ selection: { a: 'input' } })
  await saver.flush()
  saver.save({ selection: { a: 'output' } })
  await saver.flush()
  assert.equal(calls, 1)
  assert.deepEqual(refused, ['ASSIGNMENT_CHANGED'])
})

test('word recovery preserves shuffled texts and the current letter, and rejects another level or invalid cursor', () => {
  const state = { version: 1, level: 'easy', tasks: ['кіт', 'дім'], taskIndex: 1, charIndex: 2, mistakes: 3, durationSec: 25 }
  assert.deepEqual(wordsRecovery(state, 'easy', ['кіт', 'дім'], 2), state)
  assert.equal(wordsRecovery(state, 'hard', ['кіт', 'дім'], 2), null)
  assert.equal(wordsRecovery({ ...state, charIndex: 4 }, 'easy', ['кіт', 'дім'], 2), null)
  assert.equal(wordsRecovery({ ...state, tasks: ['невідоме', 'дім'] }, 'easy', ['кіт', 'дім'], 2), null)
})
