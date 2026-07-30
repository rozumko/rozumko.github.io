import test from 'node:test'
import assert from 'node:assert/strict'
import {
  analyzeDemoCoverage,
  createDemoToken,
  OLYMPIAD_DEMO_QUESTION_COUNT,
  pickDemoQuestionSet,
  verifyDemoToken,
  type DemoQuestionCandidate,
} from './olympiad-demo-validation.js'

const ORIGINAL_SECRET = process.env.ATTEMPT_SECRET
process.env.ATTEMPT_SECRET = 'test-only-demo-token-secret'

test.after(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.ATTEMPT_SECRET
  else process.env.ATTEMPT_SECRET = ORIGINAL_SECRET
})

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

test('demo picker produces the required grade 2 composition', () => {
  const cells: Array<[DemoQuestionCandidate['track'], string]> = [
    ['informatics', 'easy'],
    ['computational-thinking', 'easy'],
    ['ai-basics', 'easy'],
    ['computational-thinking', 'medium'],
    ['informatics', 'medium'],
    ['ai-basics', 'medium'],
    ['informatics', 'hard'],
  ]
  const candidates: DemoQuestionCandidate[] = []
  let index = 1

  for (const [track, difficulty] of cells) {
    for (let variant = 0; variant < 6; variant++) {
      candidates.push({
        id: uuid(index++),
        type: variant === 0 ? 'sort' : 'choice',
        track,
        difficulty,
        topic: `${track}-${difficulty}-${variant % 3}`,
      })
    }
  }

  const selectedIds = pickDemoQuestionSet(2, candidates, () => 0.5)
  const selected = selectedIds.map(id => candidates.find(question => question.id === id)!)

  assert.equal(selected.length, OLYMPIAD_DEMO_QUESTION_COUNT)
  assert.equal(new Set(selectedIds).size, OLYMPIAD_DEMO_QUESTION_COUNT)
  assert.deepEqual(
    selected.reduce<Record<string, number>>((counts, question) => {
      counts[question.track!] = (counts[question.track!] ?? 0) + 1
      return counts
    }, {}),
    { informatics: 5, 'computational-thinking': 5, 'ai-basics': 2 },
  )
  assert.deepEqual(
    selected.reduce<Record<string, number>>((counts, question) => {
      counts[question.difficulty!] = (counts[question.difficulty!] ?? 0) + 1
      return counts
    }, {}),
    { easy: 3, medium: 6, hard: 3 },
  )
})

test('demo token is signed, expires, and rejects tampering', () => {
  const now = 1_800_000_000_000
  const ids = Array.from({ length: OLYMPIAD_DEMO_QUESTION_COUNT }, (_, index) => uuid(index + 1))
  const token = createDemoToken(3, ids, now)

  assert.deepEqual(verifyDemoToken(token, now + 1_000), {
    v: 1,
    grade: 3,
    questionIds: ids,
    expiresAt: now + 2 * 60 * 60 * 1000,
  })
  assert.equal(verifyDemoToken(`${token.slice(0, -1)}x`, now + 1_000), null)
  assert.equal(verifyDemoToken(token, now + 2 * 60 * 60 * 1000), null)
})

test('demo picker fails closed when a required content cell is missing', () => {
  assert.throws(
    () => pickDemoQuestionSet(1, []),
    /Demo pool is incomplete/,
  )
})

test('demo coverage reports actionable variant and mechanic gaps', () => {
  const requiredCells: Array<[DemoQuestionCandidate['track'], string, number]> = [
    ['ai-basics', 'easy', 2],
    ['computational-thinking', 'easy', 1],
    ['informatics', 'medium', 2],
    ['computational-thinking', 'medium', 4],
    ['informatics', 'hard', 3],
  ]
  const candidates: DemoQuestionCandidate[] = []
  let index = 1
  for (const [track, difficulty, count] of requiredCells) {
    for (let variant = 0; variant < count; variant++) {
      candidates.push({
        id: uuid(index++),
        type: 'choice',
        track,
        difficulty,
        topic: `${track}-${difficulty}-${variant}`,
        progressionBand: 'apply',
        img: null,
      })
    }
  }

  const coverage = analyzeDemoCoverage(1, candidates)
  const mediumCt = coverage.cells.find(cell =>
    cell.track === 'computational-thinking' && cell.difficulty === 'medium')

  assert.equal(coverage.canCompose, true)
  assert.equal(coverage.ready, false)
  assert.deepEqual(
    {
      requiredSlots: mediumCt?.requiredSlots,
      candidates: mediumCt?.candidates,
      targetCandidates: mediumCt?.targetCandidates,
      missingCandidates: mediumCt?.missingCandidates,
    },
    { requiredSlots: 4, candidates: 4, targetCandidates: 12, missingCandidates: 8 },
  )
  assert.ok(coverage.issues.some(issue => issue.code === 'variant-gap'))
  assert.ok(coverage.issues.some(issue => issue.code === 'mechanic-gap'))
  assert.ok(coverage.issues.some(issue => issue.code === 'image-gap'))
})
