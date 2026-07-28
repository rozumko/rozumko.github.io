import assert from 'node:assert/strict'
import test from 'node:test'
import { MAZE_CELL, MAZE_COLS, MAZE_MODES, MAZE_ROWS, mazeMode } from './maze-data.ts'

// The level rows are hand-authored strings, and four of them were trimmed
// during the port. A malformed or unwinnable level would only show up as a
// child stuck in the middle of a lesson, so the invariants are pinned here.

const MODES = Object.values(MAZE_MODES)

function cells(level) {
  const found = { start: null, end: null }
  for (let r = 0; r < MAZE_ROWS; r++) {
    for (let c = 0; c < MAZE_COLS; c++) {
      if (level[r][c] === 'S') found.start = { r, c }
      if (level[r][c] === 'E') found.end = { r, c }
    }
  }
  return found
}

/** Open cells reachable from the start — mirrors the engine's BFS. */
function reachable(level, start) {
  const seen = Array.from({ length: MAZE_ROWS }, () => Array(MAZE_COLS).fill(false))
  const queue = [start]
  const out = [start]
  seen[start.r][start.c] = true
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = cur.r + dr, nc = cur.c + dc
      if (nr < 0 || nr >= MAZE_ROWS || nc < 0 || nc >= MAZE_COLS) continue
      if (seen[nr][nc] || level[nr][nc] === '1') continue
      seen[nr][nc] = true
      queue.push({ r: nr, c: nc })
      out.push({ r: nr, c: nc })
    }
  }
  return out
}

test('every level is a well-formed 15x10 grid', () => {
  for (const mode of MODES) {
    mode.levels.forEach((level, i) => {
      assert.equal(level.length, MAZE_ROWS, `${mode.key} level ${i}: wrong row count`)
      level.forEach((row, r) => {
        assert.equal(row.length, MAZE_COLS, `${mode.key} level ${i} row ${r}: wrong width`)
        assert.match(row, /^[01SE]+$/, `${mode.key} level ${i} row ${r}: unexpected character`)
      })
    })
  }
})

test('every level has exactly one start and one cup', () => {
  for (const mode of MODES) {
    mode.levels.forEach((level, i) => {
      const joined = level.join('')
      assert.equal((joined.match(/S/g) ?? []).length, 1, `${mode.key} level ${i}: not exactly one S`)
      assert.equal((joined.match(/E/g) ?? []).length, 1, `${mode.key} level ${i}: not exactly one E`)
    })
  }
})

test('the cup is reachable from the start in every level', () => {
  for (const mode of MODES) {
    mode.levels.forEach((level, i) => {
      const { start, end } = cells(level)
      const open = reachable(level, start)
      assert.ok(
        open.some(cell => cell.r === end.r && cell.c === end.c),
        `${mode.key} level ${i}: the cup cannot be reached from the start`,
      )
    })
  }
})

test('every level has room for its stars away from the start and the cup', () => {
  for (const mode of MODES) {
    mode.levels.forEach((level, i) => {
      const { start, end } = cells(level)
      const center = cell => ({ x: cell.c * MAZE_CELL + MAZE_CELL / 2, y: cell.r * MAZE_CELL + MAZE_CELL / 2 })
      const sp = center(start)
      const ep = center(end)
      const candidates = reachable(level, start)
        .filter(cell => !(cell.r === start.r && cell.c === start.c))
        .filter(cell => !(cell.r === end.r && cell.c === end.c))
        .map(center)
        .filter(p => Math.hypot(p.x - sp.x, p.y - sp.y) >= MAZE_CELL * 2)
        .filter(p => Math.hypot(p.x - ep.x, p.y - ep.y) >= MAZE_CELL * 1.6)
      assert.ok(
        candidates.length >= mode.starsPerLevel,
        `${mode.key} level ${i}: only ${candidates.length} star spots for ${mode.starsPerLevel} stars`,
      )
    })
  }
})

test('mazeMode is fail-closed', () => {
  assert.equal(mazeMode('beginner')?.levels.length, 5)
  assert.equal(mazeMode('master')?.levels.length, 10)
  assert.equal(mazeMode('nope'), null)
  assert.equal(mazeMode('constructor'), null)
  assert.equal(mazeMode('toString'), null)
})
