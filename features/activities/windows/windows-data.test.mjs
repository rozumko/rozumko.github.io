import assert from 'node:assert/strict'
import test from 'node:test'
import { WINDOW_APPS, WINDOW_TASKS, WINDOWS_LEVELS, windowsLevel } from './windows-data.ts'

// WCAG relative luminance and contrast ratio.
const channel = value => {
  const v = value / 255
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

const luminance = hex => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

const contrast = (a, b) => {
  const x = luminance(a)
  const y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

// Each app colour is used twice against near-white: white text on the title
// bar, and the task instruction rendered in that colour on the pale body. Both
// are normal-size text for WCAG purposes, so 4.5:1 is the bar. Three colours
// once sat at 3.3–3.7, which made the sentence telling the child what to do the
// least readable thing on the screen.
test('every app colour is readable against white in both directions', () => {
  for (const app of WINDOW_APPS) {
    assert.match(app.color, /^#[0-9a-f]{6}$/, `${app.name}: colour must be a six-digit hex`)
    const ratio = contrast('#ffffff', app.color)
    assert.ok(
      ratio >= 4.5,
      `${app.name} (${app.color}) has ${ratio.toFixed(2)}:1 against white, below the 4.5:1 minimum`,
    )
  }
})

test('apps and tasks are distinct and fully labelled', () => {
  assert.equal(new Set(WINDOW_APPS.map(a => a.name)).size, WINDOW_APPS.length)
  assert.equal(new Set(WINDOW_APPS.map(a => a.color)).size, WINDOW_APPS.length)
  for (const app of WINDOW_APPS) {
    assert.ok(app.name.length > 0)
    assert.ok(app.icon.length > 0)
  }
  // Every task needs a prompt for the child and a label for the control it maps
  // onto, or the activity cannot be completed by reading alone.
  assert.equal(new Set(WINDOW_TASKS.map(t => t.id)).size, WINDOW_TASKS.length)
  for (const task of WINDOW_TASKS) {
    assert.ok(task.prompt.length > 0, `${task.id} has no prompt`)
    assert.ok(task.control.length > 0, `${task.id} has no control label`)
    assert.ok(task.icon.length > 0, `${task.id} has no icon`)
  }
})

test('levels get harder and windowsLevel is fail-closed', () => {
  const order = ['easy', 'medium', 'hard'].map(id => WINDOWS_LEVELS[id])
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(order[i].taskCount > order[i - 1].taskCount, 'later levels must ask for more windows')
    assert.ok(order[i].timeLimitMs < order[i - 1].timeLimitMs, 'later levels must allow less time')
  }
  assert.equal(windowsLevel('easy')?.taskCount, 10)
  assert.equal(windowsLevel('nope'), null)
  assert.equal(windowsLevel('constructor'), null)
})
