import assert from 'node:assert/strict'
import test from 'node:test'
import {
  analyzeOfficialEvent,
  analyzeOlympiadSet,
  getOlympiadContentPolicy,
  olympiadQuestionFingerprint,
  responseElementCount,
  type OlympiadQuestionForPolicy,
} from './olympiad-content-policy.js'

function question(id: string, overrides: Partial<OlympiadQuestionForPolicy> = {}): OlympiadQuestionForPolicy {
  return {
    id,
    q: `Питання ${id}`,
    type: 'choice',
    options: ['A', 'Б', 'В', 'Г'],
    grade: 1,
    difficulty: 'medium',
    track: 'informatics',
    topic: 'information',
    conceptKey: 'logic',
    progressionBand: 'apply',
    img: null,
    imageAlt: null,
    meta: { estimatedSeconds: 60, templateId: `template-${id}` },
    isOlympiad: true,
    channels: [],
    editorialStatus: 'published',
    ...overrides,
  }
}

test('policy exposes the approved demo and official counts and time limits', () => {
  assert.equal(getOlympiadContentPolicy(1, 'official').questionCount, 16)
  assert.equal(getOlympiadContentPolicy(2, 'official').questionCount, 20)
  assert.equal(getOlympiadContentPolicy(3, 'official').questionCount, 24)
  assert.equal(getOlympiadContentPolicy(4, 'official').questionCount, 24)
  assert.equal(getOlympiadContentPolicy(4, 'official').timeMinutes, 45)
  assert.equal(getOlympiadContentPolicy(4, 'demo').questionCount, 12)
  assert.equal(getOlympiadContentPolicy(4, 'demo').timeMinutes, 20)
})

test('effort units count atomic sort and match responses', () => {
  assert.equal(responseElementCount(question('a')), 1)
  assert.equal(responseElementCount(question('b', {
    type: 'sort',
    options: { items: ['1', '2', '3', '4'], correctOrder: [0, 1, 2, 3] },
  })), 4)
  assert.equal(responseElementCount(question('c', {
    type: 'match',
    options: { left: ['a', 'b', 'c'], right: ['1', '2', '3'], pairs: [0, 1, 2] },
  })), 3)
})

test('desktop-fit content budgets are hard blockers', () => {
  const long = analyzeOlympiadSet(1, 'official', [
    question('long', {
      q: Array.from({ length: 41 }, (_, index) => `слово${index}`).join(' '),
    }),
  ])
  assert.equal(long.ready, false)
  assert.ok(long.issues.some(issue => issue.code === 'stem-too-long' && issue.severity === 'error'))

  const crowded = analyzeOlympiadSet(1, 'official', [
    question('crowded', {
      type: 'sort',
      options: { items: ['1', '2', '3', '4', '5', '6', '7'], correctOrder: [0, 1, 2, 3, 4, 5, 6] },
    }),
  ])
  assert.ok(crowded.issues.some(issue => issue.code === 'too-many-response-elements'))
})

test('official event readiness fails closed on event rules and missing grade sets', () => {
  const readiness = analyzeOfficialEvent({ timeMinutes: 40, questionsCount: 20 }, [])
  assert.equal(readiness.ready, false)
  assert.ok(readiness.issues.some(issue => issue.code === 'event-time'))
  assert.ok(readiness.issues.some(issue => issue.code === 'event-question-cap'))
  assert.ok(readiness.grades.every(grade => grade.issues.some(issue => issue.code === 'question-count')))
})

test('official questions cannot use public delivery channels', () => {
  const result = analyzeOlympiadSet(1, 'official', [
    question('public', { channels: ['olympiad_training'] }),
  ])
  assert.ok(result.issues.some(issue => issue.code === 'official-delivery-boundary' && issue.severity === 'error'))
})

test('readiness exposes missing variant metadata without silently blocking publication', () => {
  const result = analyzeOlympiadSet(1, 'official', [
    question('missing-meta', { meta: {} }),
  ])
  assert.ok(result.issues.some(issue => issue.code === 'missing-estimated-seconds' && issue.severity === 'warning'))
  assert.ok(result.issues.some(issue => issue.code === 'missing-template-id' && issue.severity === 'warning'))
})

test('exact duplicates block a set while same-stem stimulus variants only warn', () => {
  const exact = analyzeOlympiadSet(1, 'official', [
    question('exact-1', { q: 'Куди прийде Равлик?', code: 'forward(2)' }),
    question('exact-2', { q: 'Куди прийде Равлик?', code: 'forward(2)' }),
  ])
  assert.ok(exact.issues.some(issue => issue.code === 'duplicate-question' && issue.severity === 'error'))

  const variants = analyzeOlympiadSet(1, 'official', [
    question('variant-1', {
      q: 'Куди прийде Равлик?',
      code: 'forward(2)',
      meta: { estimatedSeconds: 60 },
    }),
    question('variant-2', {
      q: 'Куди прийде Равлик?',
      code: 'turnRight(); forward(2)',
      meta: { estimatedSeconds: 60 },
    }),
  ])
  assert.ok(!variants.issues.some(issue => issue.code === 'duplicate-question'))
  assert.ok(variants.issues.some(issue => issue.code === 'repeated-question-template' && issue.severity === 'warning'))
})

test('fingerprint preserves meaningful code operators', () => {
  const increment = question('increment', { q: 'What happens next?', code: 'x++' })
  const decrement = question('decrement', { q: 'What happens next?', code: 'x--' })

  assert.notEqual(
    olympiadQuestionFingerprint(increment),
    olympiadQuestionFingerprint(decrement),
  )
})

test('readiness reports missing grade-specific concept groups', () => {
  const result = analyzeOlympiadSet(4, 'official', [
    question('only-information', {
      grade: 4,
      topic: 'information',
      conceptKey: null,
    }),
  ])
  assert.ok(result.issues.some(issue => issue.code === 'required-concept-decomposition'))
  assert.ok(result.issues.some(issue => issue.code === 'required-concept-ai-judgment'))
})

test('official event detects cross-grade copies and shared templates', () => {
  const readiness = analyzeOfficialEvent({ timeMinutes: 45, questionsCount: 24 }, [
    question('grade-1', {
      q: 'Однакова умова',
      grade: 1,
      meta: { estimatedSeconds: 60, templateId: 'route-grid' },
    }),
    question('grade-2', {
      q: 'Однакова умова',
      grade: 2,
      meta: { estimatedSeconds: 60, templateId: 'route-grid' },
    }),
  ])
  assert.ok(readiness.issues.some(issue => issue.code === 'cross-grade-duplicate-stem' && issue.severity === 'error'))
  assert.ok(readiness.issues.some(issue => issue.code === 'cross-grade-template-repeat' && issue.severity === 'warning'))
})
