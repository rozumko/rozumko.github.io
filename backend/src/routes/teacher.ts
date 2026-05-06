import type { FastifyInstance } from 'fastify'
import { eq, desc, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { accessCodes, attempts, appUsers } from '../db/schema.js'
import { requireAuth } from '../lib/auth.js'

const CODE_WORDS = [
  'КІТ','ПЕС','ЛИС','РАК','ВУЖ','ЖУК','БИК','ЛЕВ','КИТ','ВІЛ',
  'ВОВК','ОРЕЛ','КОЗА','КІНЬ','ГУСЬ','КРОТ','ТИГР','РИСЬ','ЛОСЬ','ЗУБР',
]

function generateCode(): string {
  const word = CODE_WORDS[Math.floor(Math.random() * CODE_WORDS.length)]
  const digits = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
  return `${word}${digits}`
}

export async function teacherRoutes(app: FastifyInstance) {
  // GET /api/me
  app.get('/me', { preHandler: requireAuth }, async (req, reply) => {
    return reply.send(req.user)
  })

  // POST /api/teacher/codes/generate
  // Body: { grade, count, maxUses, expiresAt? }
  app.post<{
    Body: { grade: number; count: number; maxUses: number; expiresAt?: string }
  }>('/codes/generate', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['grade', 'count', 'maxUses'],
        properties: {
          grade:     { type: 'integer', minimum: 1, maximum: 4 },
          count:     { type: 'integer', minimum: 1, maximum: 50 },
          maxUses:   { type: 'integer', minimum: 1, maximum: 100 },
          expiresAt: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { grade, count, maxUses, expiresAt } = req.body

    const codes = Array.from({ length: count }, () => ({
      code:      generateCode(),
      grade,
      maxUses,
      createdBy: req.user!.id,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    }))

    const inserted = await db
      .insert(accessCodes)
      .values(codes)
      .returning({ id: accessCodes.id, code: accessCodes.code })

    return reply.code(201).send({ codes: inserted })
  })

  // GET /api/teacher/codes
  // Повертає всі коди вчителя
  app.get('/codes', { preHandler: requireAuth }, async (req, reply) => {
    const list = await db
      .select()
      .from(accessCodes)
      .where(eq(accessCodes.createdBy, req.user!.id))
      .orderBy(desc(accessCodes.createdAt))

    return reply.send({ codes: list })
  })

  // GET /api/teacher/results
  // Повертає всі спроби по кодах вчителя
  app.get('/results', { preHandler: requireAuth }, async (req, reply) => {
    const teacherCodes = await db
      .select({ id: accessCodes.id, code: accessCodes.code, grade: accessCodes.grade })
      .from(accessCodes)
      .where(eq(accessCodes.createdBy, req.user!.id))

    if (teacherCodes.length === 0) {
      return reply.send({ results: [] })
    }

    const codeIds = teacherCodes.map(c => c.id)
    const codeMap = Object.fromEntries(teacherCodes.map(c => [c.id, c]))

    const allAttempts = await db
      .select()
      .from(attempts)
      .where(inArray(attempts.codeId, codeIds))
      .orderBy(desc(attempts.startedAt))

    // Приєднуємо інфо про код
    const results = allAttempts.map(a => ({
      ...a,
      accessCode: codeMap[a.codeId] ?? null,
    }))

    return reply.send({ results })
  })
}
