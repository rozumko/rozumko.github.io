import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import { db } from '../db/index.js'
import { questionsRoutes } from './questions.js'
import { OLYMPIAD_DEMO_TOKEN_TTL_MS } from './olympiad-demo-validation.js'

const ORIGINAL_SECRET = process.env.ATTEMPT_SECRET
process.env.ATTEMPT_SECRET = 'test-only-demo-route-secret'

test.after(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.ATTEMPT_SECRET
  else process.env.ATTEMPT_SECRET = ORIGINAL_SECRET
})

function uuid(index: number): string {
  return `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

test('olympiad demo issues sanitized questions and scores only on the server', async () => {
  const slots = [
    ['informatics', 'easy'],
    ['computational-thinking', 'easy'],
    ['ai-basics', 'easy'],
    ['computational-thinking', 'medium'],
    ['informatics', 'medium'],
    ['computational-thinking', 'medium'],
    ['ai-basics', 'medium'],
    ['informatics', 'hard'],
    ['computational-thinking', 'medium'],
    ['informatics', 'hard'],
    ['computational-thinking', 'medium'],
    ['informatics', 'hard'],
  ] as const

  const rows = slots.map(([track, difficulty], index) => ({
    id: uuid(index + 1),
    q: `Question ${index + 1}`,
    code: null,
    type: 'choice' as const,
    options: ['Wrong', 'Correct'],
    correct: 1,
    explanation: 'Secret explanation',
    img: index === 0 ? '/questions/demo-grid.webp' : null,
    imageAlt: index === 0 ? 'A labelled route grid' : null,
    difficulty,
    track,
    topic: `${track}-${difficulty}-${index}`,
    conceptKey: null,
    progressionBand: 'apply' as const,
    grade: 2,
    meta: index === 0
      ? { imageRole: 'essential', estimatedSeconds: 60, templateId: 'demo-grid' }
      : null,
    isOlympiad: false,
    channels: ['olympiad_training'] as const,
    editorialStatus: 'published' as const,
  }))

  const originalSelect = db.select
  db.select = (() => ({
    from: () => ({
      where: async () => rows,
    }),
  })) as unknown as typeof db.select

  const app = Fastify()
  try {
    await app.register(questionsRoutes, { prefix: '/api/questions' })
    await app.ready()

    const started = await app.inject({
      method: 'POST',
      url: '/api/questions/demo/start',
      payload: { grade: 2 },
    })
    assert.equal(started.statusCode, 200)

    const startBody = started.json()
    assert.equal(startBody.questions.length, 12)
    assert.equal(startBody.questionsCount, 12)
    assert.equal(startBody.timeMinutes, 20)
    assert.equal(typeof startBody.tokenExpiresAt, 'number')
    assert.ok(startBody.tokenExpiresAt > Date.now())
    assert.equal(startBody.tokenTtlMs, OLYMPIAD_DEMO_TOKEN_TTL_MS)
    for (const question of startBody.questions) {
      assert.equal('correct' in question, false)
      assert.equal('explanation' in question, false)
      assert.equal('meta' in question, false)
    }
    const visualQuestion = startBody.questions.find((question: { img?: string }) => question.img)
    assert.equal(visualQuestion?.imageAlt, 'A labelled route grid')
    assert.equal(visualQuestion?.imageRole, 'essential')

    const finished = await app.inject({
      method: 'POST',
      url: '/api/questions/demo/finish',
      payload: {
        demoToken: startBody.demoToken,
        answers: startBody.questions.map((question: { id: string }) => ({
          questionId: question.id,
          answer: 1,
        })),
      },
    })
    assert.equal(finished.statusCode, 200)
    assert.deepEqual(finished.json(), { score: 12, total: 12 })

    const tampered = await app.inject({
      method: 'POST',
      url: '/api/questions/demo/finish',
      payload: {
        demoToken: `${startBody.demoToken.slice(0, -1)}x`,
        answers: [],
      },
    })
    assert.equal(tampered.statusCode, 403)
  } finally {
    db.select = originalSelect
    await app.close()
  }
})
