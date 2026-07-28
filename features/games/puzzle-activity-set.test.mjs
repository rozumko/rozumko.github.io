import assert from 'node:assert/strict'
import test from 'node:test'
import { generatePuzzleActivitySet } from './puzzle-data.ts'

test('school magic activity generates exactly three grade-aware square puzzles', () => {
  const grade1 = generatePuzzleActivitySet('magic', 1, 'hard', 3)
  assert.equal(grade1.length, 3)
  assert.ok(grade1.every(p => p.type === 'latin'))
  assert.ok(grade1.every(p => p.grid?.size === 3))

  const grade2Easy = generatePuzzleActivitySet('magic', 2, 'easy', 3)
  assert.ok(grade2Easy.every(p => p.type === 'magic'))
  assert.ok(grade2Easy.every(p => p.grid?.size === 3))

  const grade2Medium = generatePuzzleActivitySet('magic', 2, 'medium', 3)
  assert.ok(grade2Medium.every(p => p.type === 'latin'))
  assert.ok(grade2Medium.every(p => p.grid?.size === 4))

  const grade4Hard = generatePuzzleActivitySet('magic', 4, 'hard', 3)
  assert.ok(grade4Hard.every(p => p.type === 'magic'))
  assert.ok(grade4Hard.every(p => p.grid?.size === 4))
})

/** Every way the blanks of a grid puzzle can be filled into a valid Latin square. */
function countLatinSolutions(puzzle) {
  const size = puzzle.grid.size
  const grid = Array.from({ length: size }, () => Array(size).fill(null))
  const blanks = []
  puzzle.grid.cells.forEach((cell, index) => {
    const r = Math.floor(index / size)
    const c = index % size
    if (cell.t === 'val') grid[r][c] = cell.text
    else blanks.push({ r, c, options: cell.options })
  })
  const fits = (r, c, v) => {
    for (let i = 0; i < size; i += 1) {
      if (i !== c && grid[r][i] === v) return false
      if (i !== r && grid[i][c] === v) return false
    }
    return true
  }
  let found = 0
  const fill = index => {
    if (found > 1) return
    if (index === blanks.length) { found += 1; return }
    const b = blanks[index]
    for (const v of b.options) {
      if (!fits(b.r, b.c, v)) continue
      grid[b.r][b.c] = v
      fill(index + 1)
      grid[b.r][b.c] = null
    }
  }
  fill(0)
  return found
}

// A 4×4 Latin square contains intercalates — 2×2 blocks whose two symbols can
// be swapped for another valid square. If all four are blanked the child has
// two correct answers but the checker accepts only one, and a child who
// reasons correctly is told they are wrong.
test('picture squares have exactly one correct completion', () => {
  for (const [grade, difficulty] of [[1, 'easy'], [1, 'medium'], [1, 'hard'], [2, 'medium'], [2, 'hard']]) {
    for (let run = 0; run < 60; run += 1) {
      for (const puzzle of generatePuzzleActivitySet('magic', grade, difficulty, 3)) {
        if (puzzle.type !== 'latin') continue
        assert.equal(
          countLatinSolutions(puzzle), 1,
          `grade ${grade} ${difficulty}: latin square with more than one valid answer`,
        )
      }
    }
  }
})

test('number squares are magic: equal line sums, distinct positive numbers', () => {
  for (const [grade, difficulty] of [[2, 'easy'], [3, 'medium'], [3, 'hard'], [4, 'medium'], [4, 'hard']]) {
    for (let run = 0; run < 40; run += 1) {
      for (const puzzle of generatePuzzleActivitySet('magic', grade, difficulty, 3)) {
        if (puzzle.type !== 'magic') continue
        const size = puzzle.grid.size
        const grid = Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => {
          const cell = puzzle.grid.cells[r * size + c]
          return Number(cell.t === 'val' ? cell.text : puzzle.answers[cell.id])
        }))
        const lines = []
        for (let i = 0; i < size; i += 1) {
          lines.push(grid[i])
          lines.push(grid.map(row => row[i]))
        }
        lines.push(grid.map((row, i) => row[i]))
        lines.push(grid.map((row, i) => row[size - 1 - i]))
        const sums = new Set(lines.map(line => line.reduce((a, b) => a + b, 0)))
        assert.equal(sums.size, 1, `grade ${grade} ${difficulty}: rows, columns and diagonals must share one sum`)
        const values = grid.flat()
        assert.ok(values.every(v => Number.isInteger(v) && v > 0), 'numbers must be positive integers')
        assert.equal(new Set(values).size, values.length, 'numbers must not repeat')
      }
    }
  }
})

test('school symbol activity generates exactly five symbol-logic puzzles', () => {
  const puzzles = generatePuzzleActivitySet('symbols', 4, 'hard', 5)
  assert.equal(puzzles.length, 5)
  assert.ok(puzzles.every(p => p.type === 'symbols'))
  assert.ok(puzzles.every(p => Object.keys(p.answers).length === 1))
})
