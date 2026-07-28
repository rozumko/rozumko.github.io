import type { ActivityHandle, ActivityMount, ActivityRunResult } from '../activity-contract.js'
import { mountPuzzles, type PuzzleSessionSummary } from '../../games/puzzle-engine.js'

const TOTAL = 3

function normalizeGrade(grade: number): number {
  return Number.isInteger(grade) && grade >= 1 && grade <= 4 ? grade : 1
}

export const mount: ActivityMount = (container, options): ActivityHandle => {
  const startedAt = Date.now()
  let summary: PuzzleSessionSummary = { correct: 0, total: TOTAL, stars: 0 }
  let completed = false

  container.classList.add('school-puzzle-activity')
  options.onProgress?.(0, TOTAL)

  const handle = mountPuzzles(container, normalizeGrade(options.grade), TOTAL, {
    type: 'magic',
    difficulty: options.level === 'medium' || options.level === 'hard' ? options.level : 'easy',
    allowRestart: false,
    onComplete: s => {
      completed = true
      summary = s
      options.onProgress?.(s.total, s.total)
      options.onFinish(result())
    },
  })

  // One attempt per square, so every square not solved is a mistake — but only
  // once the run is over. Reading `summary` rather than the handle when the run
  // completed also keeps this safe if the engine ever finishes synchronously,
  // before `handle` is assigned.
  function result(): ActivityRunResult {
    const source = completed ? summary : handle.snapshot()
    const total = source.total || TOTAL
    return {
      correct: source.correct,
      total,
      mistakes: completed ? Math.max(0, total - source.correct) : 0,
      durationSec: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
    }
  }

  return {
    snapshot: result,
    destroy() {
      handle.destroy()
      container.classList.remove('school-puzzle-activity')
    },
  }
}
