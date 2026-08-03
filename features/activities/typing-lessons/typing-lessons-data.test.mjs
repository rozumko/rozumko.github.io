import assert from 'node:assert/strict'
import test from 'node:test'
import {
  HINT_MODES,
  LESSONS,
  LESSONS_LEVEL_IDS,
  SERIES,
  resolveLessonsLevel,
  seriesCharacterCount,
} from './typing-lessons-data.ts'
import { SCHOOL_ACTIVITIES } from '../../../backend/src/lib/school-activities.ts'
import { textWindow } from '../typing-core/text-window.ts'

// The run is measured in characters, so the server's ceiling for a level is the
// exact character count of that series. Editing a lesson text without editing
// the ceiling would either reject honest runs or leave room to inflate one.

test('every lesson of the course belongs to exactly one series', () => {
  const covered = SERIES.flatMap(s => LESSONS.filter(l => l.number >= s.range[0] && l.number <= s.range[1]))
  assert.equal(covered.length, LESSONS.length)
  assert.equal(new Set(covered.map(l => l.number)).size, LESSONS.length)
  assert.ok(LESSONS.every(lesson => lesson.text.length > 0 && lesson.focus.length > 0))
})

test('the server ceiling of each level is the character count of its series', () => {
  const server = SCHOOL_ACTIVITIES['typing-lessons']
  assert.equal(server.levels.length, LESSONS_LEVEL_IDS.length)

  for (const id of LESSONS_LEVEL_IDS) {
    const level = server.levels.find(l => l.id === id)
    assert.ok(level, `level ${id} is missing from the backend registry`)
    assert.equal(
      level.maxTotal,
      seriesCharacterCount(resolveLessonsLevel(id).series.id),
      `ceiling of ${id} no longer matches the lesson texts`,
    )
  }
})

test('the composite level id carries both the series and the help level', () => {
  const level = resolveLessonsLevel('expansion-finger')
  assert.equal(level.series.id, 'expansion')
  assert.equal(level.hints.id, 'finger')
  assert.equal(level.hints.keyboard, false)
  assert.equal(level.hints.finger, true)
  assert.equal(level.lessons[0].number, 11)
  assert.equal(level.lessons.at(-1).number, 20)
  assert.equal(level.totalCharacters, seriesCharacterCount('expansion'))
})

test('only the guided mode lights the keyboard, only independent hides both', () => {
  assert.deepEqual(
    HINT_MODES.map(h => [h.id, h.keyboard, h.finger]),
    [['guided', true, true], ['finger', false, true], ['independent', false, false]],
  )
})

test('an unknown level opens the first series with full help', () => {
  const level = resolveLessonsLevel('nonsense')
  assert.equal(level.series.id, 'foundation')
  assert.equal(level.hints.id, 'guided')
  assert.ok(level.lessons.length > 0)
})

test('the text window keeps the caret on the character being typed', () => {
  const text = LESSONS[0].text
  for (const position of [0, 1, 29, 30, 45, text.length - 1]) {
    const view = textWindow(text, position)
    assert.equal(view.current, text[position], `caret slipped at ${position}`)
    assert.ok(view.done.length + 1 + view.todo.length <= 86)
  }
  // Past the end there is nothing left to type, and nothing crashes.
  assert.equal(textWindow(text, text.length).current, '')
})
