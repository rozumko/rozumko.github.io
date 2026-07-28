import assert from 'node:assert/strict'
import test from 'node:test'
import { generateMessageCodingSet } from './message-coding-data.ts'

test('message coding: grade 1 uses word-symbol tasks only', () => {
  const tasks = generateMessageCodingSet(1, 'hard')
  assert.equal(tasks.length, 5)
  assert.deepEqual([...new Set(tasks.map(task => task.type))], ['symbols'])
  assert.ok(tasks.every(task => task.legend.length >= 3))
})

test('message coding: grade 2 uses A=1 alphabet coding', () => {
  const tasks = generateMessageCodingSet(2, 'medium')
  assert.equal(tasks.length, 5)
  assert.deepEqual([...new Set(tasks.map(task => task.type))], ['alphabet'])
  assert.ok(tasks.some(task => task.display.kind === 'text' && task.display.value.includes('-')))
  assert.ok(tasks.some(task => task.mode === 'encode'))
})

test('message coding: grades 3 and 4 use binary, pixel and coordinate representations', () => {
  const grade3 = new Set(generateMessageCodingSet(3, 'hard').map(task => task.type))
  const grade4 = new Set(generateMessageCodingSet(4, 'medium').map(task => task.type))

  for (const type of ['binary', 'pixels', 'coordinates']) {
    assert.ok(grade3.has(type), `grade 3 hard is missing ${type}`)
    assert.ok(grade4.has(type), `grade 4 medium is missing ${type}`)
  }
})

test('message coding: unknown difficulty falls back to easy', () => {
  assert.deepEqual(
    generateMessageCodingSet(4, 'impossible').map(task => task.id),
    generateMessageCodingSet(4, 'easy').map(task => task.id),
  )
})
