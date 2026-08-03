import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRound } from './round.ts'
import { codesForTarget, comboHintForCharacter, requiresShift } from './keyboard-layout.ts'
import { isTargetAttempt, issue, matchesTarget } from './key-input.ts'
import { KEY_SETS, ROUND_LENGTH } from '../typing-keys/typing-keys-data.ts'

// The typing activities run on a physical keyboard the child may have set to
// the wrong layout, so the matching rules carry more weight than usual: a
// mismatch either scores a correct press as a mistake or lets a wrong one pass.

/** KeyboardEvent stand-in — the rules only read these fields. */
function press(key, code, flags = {}) {
  return { key, code, repeat: false, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...flags }
}

test('a round is exactly as long as the activity promises', () => {
  for (const [id, set] of Object.entries(KEY_SETS)) {
    assert.equal(buildRound(set, ROUND_LENGTH).length, ROUND_LENGTH, `set ${id} is short`)
  }
})

test('a round never shows the same target twice in a row', () => {
  // The controls set is the smallest (6), so it refills twice per round — the
  // seam between refills is exactly where a repeat could slip through.
  for (let attempt = 0; attempt < 200; attempt++) {
    const round = buildRound(KEY_SETS['controls'], ROUND_LENGTH)
    for (let i = 1; i < round.length; i++) {
      assert.notEqual(round[i].id, round[i - 1].id, 'two identical targets in a row')
    }
  }
})

test('the letter sets stay free of «ґ», which needs a key combination', () => {
  for (const id of ['starter', 'alphabet', 'everything']) {
    assert.ok(KEY_SETS[id].every(t => t.value !== 'ґ'), `set ${id} contains ґ`)
  }
})

test('a target maps to the physical key of the Ukrainian layout', () => {
  assert.deepEqual(codesForTarget({ value: 'а' }), ['KeyF'])
  assert.deepEqual(codesForTarget({ value: 'о' }), ['KeyJ'])
  // «ґ» is typed as Ctrl+Alt+Г, so the key to point at is Г, not Backslash.
  assert.deepEqual(codesForTarget({ value: 'ґ' }), ['KeyU'])
  assert.equal(comboHintForCharacter('ґ'), 'Утримуй Ctrl + Alt і натисни Г')
  assert.equal(requiresShift('А'), true)
  assert.equal(requiresShift('а'), false)
})

test('a letter counts only when the typed character matches', () => {
  const target = { id: 'letter-а', kind: 'letter', value: 'а', label: 'А' }
  const codes = codesForTarget(target)
  assert.equal(matchesTarget(target, press('а', 'KeyF'), codes), true)
  assert.equal(matchesTarget(target, press('А', 'KeyF'), codes), true)
  assert.equal(matchesTarget(target, press('в', 'KeyD'), codes), false)
  // Right key, wrong layout: still not a hit, and the child is told why.
  assert.equal(matchesTarget(target, press('f', 'KeyF'), codes), false)
  assert.equal(issue('а', press('f', 'KeyF')), 'layout')
  assert.equal(issue('а', press('в', 'KeyD')), 'wrong')
})

test('a control target accepts either side of the keyboard', () => {
  const shift = { id: 'control-shift', kind: 'control', value: 'Shift', label: 'Shift', codes: ['ShiftLeft', 'ShiftRight'] }
  const codes = codesForTarget(shift)
  assert.deepEqual(codes, ['ShiftLeft', 'ShiftRight'])
  assert.equal(matchesTarget(shift, press('Shift', 'ShiftRight'), codes), true)
  assert.equal(matchesTarget(shift, press('Shift', 'ShiftLeft'), codes), true)
  assert.equal(matchesTarget(shift, press('Control', 'ControlLeft'), codes), false)
})

test('modifiers are an attempt only when they are the target', () => {
  const letter = { id: 'letter-а', kind: 'letter', value: 'а', label: 'А' }
  const letterCodes = codesForTarget(letter)
  // Shift held before a capital letter must not be scored as a wrong press.
  assert.equal(isTargetAttempt(letter, press('Shift', 'ShiftLeft'), letterCodes), false)
  const shift = { id: 'control-shift', kind: 'control', value: 'Shift', label: 'Shift', codes: ['ShiftLeft', 'ShiftRight'] }
  assert.equal(isTargetAttempt(shift, press('Shift', 'ShiftLeft'), codesForTarget(shift)), true)
  // Ctrl+S is the browser's business, not an answer.
  assert.equal(isTargetAttempt(letter, press('s', 'KeyS', { ctrlKey: true }), letterCodes), false)
})
