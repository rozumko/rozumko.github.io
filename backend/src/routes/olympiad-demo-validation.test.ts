import test from 'node:test'
import assert from 'node:assert/strict'
import {
  analyzeDemoCoverage,
  createDemoToken,
  createSeededDemoRandom,
  DemoCompositionBudgetExceededError,
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

function gradeOneCandidates(variantsPerCell = 8): DemoQuestionCandidate[] {
  const cells: Array<[DemoQuestionCandidate['track'], string]> = [
    ['ai-basics', 'easy'],
    ['computational-thinking', 'easy'],
    ['informatics', 'medium'],
    ['computational-thinking', 'medium'],
    ['informatics', 'hard'],
  ]
  let index = 100
  return cells.flatMap(([track, difficulty]) =>
    Array.from({ length: variantsPerCell }, (_, variant) => ({
      id: uuid(index++),
      q: `Question ${track}-${difficulty}-${variant}`,
      type: variant % 2 ? 'choice' : 'sort',
      options: [],
      track,
      difficulty,
      topic: `${track}-${difficulty}-${variant}`,
      progressionBand: (['recognize', 'apply', 'reason'] as const)[variant % 3],
    })),
  )
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
        q: track === 'informatics' && difficulty === 'hard' && variant < 2
          ? 'Скільки кроків пройде Равлик?'
          : `Питання ${track}-${difficulty}-${variant}`,
        code: variant < 2 ? `repeat(${variant + 1})` : null,
        type: variant === 0 ? 'sort' : 'choice',
        track,
        difficulty,
        topic: `${track}-${difficulty}-${variant % 3}`,
        progressionBand: 'apply',
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
  assert.ok(
    selected.filter(question => question.q === 'Скільки кроків пройде Равлик?').length <= 1,
    'one demo set must not contain two variants of the same stem',
  )
})

test('demo picker is deterministic per seed and still returns distinct policy variants', () => {
  const candidates: DemoQuestionCandidate[] = []
  let index = 1
  const cells: Array<[DemoQuestionCandidate['track'], string]> = [
    ['informatics', 'easy'],
    ['computational-thinking', 'easy'],
    ['ai-basics', 'easy'],
    ['computational-thinking', 'medium'],
    ['informatics', 'medium'],
    ['ai-basics', 'medium'],
    ['informatics', 'hard'],
  ]
  for (const [track, difficulty] of cells) {
    for (let variant = 0; variant < 8; variant++) {
      candidates.push({
        id: uuid(index++),
        q: `Питання ${track}-${difficulty}-${variant}`,
        type: variant % 2 ? 'choice' : 'sort',
        track,
        difficulty,
        topic: `${track}-${difficulty}-${variant % 4}`,
        progressionBand: 'apply',
      })
    }
  }

  assert.deepEqual(
    pickDemoQuestionSet(2, candidates, createSeededDemoRandom(42)),
    pickDemoQuestionSet(2, candidates, createSeededDemoRandom(42)),
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

test('demo picker rejects an intrinsically invalid sole required candidate before search', () => {
  const candidates = gradeOneCandidates().filter(question =>
    question.track !== 'computational-thinking'
    || question.difficulty !== 'easy'
    || question.id === uuid(108),
  )
  const invalid = candidates.find(question =>
    question.track === 'computational-thinking' && question.difficulty === 'easy')!
  invalid.progressionBand = null
  let acceptCalls = 0

  assert.throws(
    () => pickDemoQuestionSet(1, candidates, () => 0.5, () => {
      acceptCalls++
      return false
    }),
    /Demo pool is incomplete/,
  )
  assert.equal(acceptCalls, 0)
})

test('demo picker stops impossible policy search at the configured budget', () => {
  let now = 0
  assert.throws(
    () => pickDemoQuestionSet(
      1,
      gradeOneCandidates(),
      () => 0.5,
      () => false,
      {
        maxVisitedNodes: 20,
        maxDurationMs: 1_000,
        now: () => now++,
      },
    ),
    DemoCompositionBudgetExceededError,
  )
  assert.ok(now <= 22, `search visited too many nodes: ${now}`)
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
        q: `Coverage question ${track}-${difficulty}-${variant}`,
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
