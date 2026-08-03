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
  assert.deepEqual([...new Set(tasks.map(task => task.type))], ['alphabet', 'key'])
  assert.ok(tasks.some(task => task.display.kind === 'text' && task.display.value.includes('-')))
  assert.ok(tasks.some(task => task.mode === 'encode'))
})

test('message coding: grades 3 and 4 use binary, pixel and cipher representations', () => {
  const grade3 = new Set(generateMessageCodingSet(3, 'hard').map(task => task.type))
  const grade4 = new Set(generateMessageCodingSet(4, 'medium').map(task => task.type))

  for (const type of ['binary', 'pixels', 'cipher']) {
    assert.ok(grade3.has(type), `grade 3 hard is missing ${type}`)
    assert.ok(grade4.has(type), `grade 4 medium is missing ${type}`)
  }
  assert.ok(!grade3.has('coordinates'))
  assert.ok(!grade4.has('coordinates'))
})

test('message coding: unknown difficulty falls back to easy', () => {
  assert.deepEqual(
    generateMessageCodingSet(4, 'impossible').map(task => task.id),
    generateMessageCodingSet(4, 'easy').map(task => task.id),
  )
})

test('message coding: cipher tasks never expose placeholder symbols', () => {
  for (const grade of [3, 4]) {
    for (const difficulty of ['easy', 'medium', 'hard']) {
      for (const task of generateMessageCodingSet(grade, difficulty)) {
        if (task.display.kind !== 'cipher') continue
        assert.ok(task.display.tokens.every(token => token !== '?'), `${task.id}: missing cipher token`)
        assert.ok(task.legend.every(item => item.code !== '?'), `${task.id}: missing legend token`)
      }
    }
  }
})

test('message coding: key tasks can be solved from examples without a full legend', () => {
  for (const grade of [2, 3, 4]) {
    for (const difficulty of ['medium', 'hard']) {
      // Every key task, not just the first one: a second broken task in the
      // same set used to slip through unchecked.
      const tasks = generateMessageCodingSet(grade, difficulty).filter(item => item.display.kind === 'key')
      assert.ok(tasks.length > 0, `grade ${grade} ${difficulty} is missing a key task`)

      for (const task of tasks) {
      const exampleTokens = new Set(task.display.examples.flatMap(example => example.tokens))
      assert.ok(task.display.challenge.every(token => exampleTokens.has(token)), `${task.id}: key cannot be inferred`)
      assert.ok(task.display.challenge.every(token => token !== '?'), `${task.id}: missing cipher token`)
      assert.ok(task.display.examples.flatMap(example => example.tokens).every(token => token !== '?'), `${task.id}: invalid example token`)
      assert.ok(task.display.examples.every(example => example.plain !== task.options[task.answerIndex]), `${task.id}: answer is shown as an example`)
      assert.equal(task.legend.length, 1)
      }
    }
  }
})

// The legend is the child's tool, not a second copy of the answer. Two ways it
// used to give the word away: its order followed the hidden message (so the
// labels literally spelled it), and it listed only that word's letters (so the
// other options could be ruled out without decoding anything).
test('message coding: a cipher legend does not give the answer away', () => {
  for (const grade of [3, 4]) {
    for (const difficulty of ['easy', 'medium', 'hard']) {
      for (const task of generateMessageCodingSet(grade, difficulty)) {
        if (task.type !== 'cipher') continue
        const labels = task.legend.map(item => item.label)
        const answer = task.options[task.answerIndex]

        assert.notEqual(labels.join(''), [...new Set(answer)].join(''), `${task.id}: the legend spells the answer`)
        assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b, 'uk-UA')),
          `${task.id}: legend order depends on the message`)
        assert.ok(labels.some(label => !answer.includes(label)),
          `${task.id}: the legend covers the answer and nothing else`)
        // The hidden word still has to be fully readable from the legend.
        for (const letter of answer.replace(/\s+/g, '')) {
          assert.ok(labels.includes(letter), `${task.id}: ${letter} is missing from the legend`)
        }
      }
    }
  }
})

test('message coding: an alphabet legend covers every number the task shows', () => {
  for (const difficulty of ['easy', 'medium', 'hard']) {
    for (const task of generateMessageCodingSet(2, difficulty)) {
      if (task.type !== 'alphabet') continue
      const shown = new Set(task.legend.map(item => item.label))

      // Both what is on screen and every option the child has to compare.
      const codes = [
        ...(task.display.kind === 'text' && task.mode === 'decode' ? [task.display.value] : []),
        ...task.options.filter(option => /^[\d-]+$/.test(option)),
      ]
      for (const number of codes.flatMap(code => code.split('-'))) {
        assert.ok(shown.has(number), `${task.id}: ${number} is missing from the legend`)
      }
    }
  }
})
