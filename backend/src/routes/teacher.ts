import type { FastifyInstance } from 'fastify'
import { randomInt } from 'crypto'
import { and, count, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import { db } from '../db/index.js'
import { accessCodes, appUsers, attempts, classStudents, eventQuestions, eventRegistrations, olympiadEvents, teacherClasses } from '../db/schema.js'
import { requireAuth, verifySupabaseIdentity } from '../lib/auth.js'
import { assertEventCanAcceptRegistrations, assertRegistrationCanBeCancelled, normalizeRegistrationInput, normalizeTeacherClassInput } from './registration-validation.js'
import { assertEventCanIssueCodes, resolveCodeExpiry } from './teacher-events-validation.js'

// Прості, знайомі дітям українські слова (3–5 літер, лише кирилиця).
// Без англ. літер і спецсимволів — щоб дитині було легко прочитати і ввести.
const CODE_WORDS = [
  'КІТ','ПЕС','ЛИС','РАК','ВУЖ','ЖУК','БИК','ЛЕВ','КИТ','СОМ',
  'МАК','ДУБ','САД','ЛІС','СОВА','МИША','ЇЖАК','КРАБ','ВОВК','ОРЕЛ',
  'КОЗА','КІНЬ','ГУСЬ','КРОТ','ТИГР','РИСЬ','ЛОСЬ','ЗУБР','БОБЕР','БАРАН',
  'КАЧКА','ОСЛИК','СОНЦЕ','ХМАРА','ЗІРКА','ЛИСТ','ГРИБ','СНІГ','РІКА','ГОРА',
  'МОРЕ','ПОЛЕ','ОЗЕРО','КЛЕН','ВЕРБА','СОСНА','ТРАВА','СЛИВА','ГРУША','ВИШНЯ',
  'ДИНЯ','КАВУН','ЛИМОН','БАНАН',
]

function generateCode(exclude: Set<string> = new Set()): string {
  // 54 слова × 10 000 (4 цифри) ≈ 540 000 комбінацій. crypto.randomInt —
  // криптографічний RNG (не передбачуваний Math.random). При колізії — retry.
  for (let i = 0; i < 30; i++) {
    const word   = CODE_WORDS[randomInt(0, CODE_WORDS.length)]
    const digits = String(randomInt(0, 10000)).padStart(4, '0')
    const code   = `${word}${digits}`
    if (!exclude.has(code)) { exclude.add(code); return code }
  }
  throw new Error('Не вдалося згенерувати унікальний код. Спробуйте ще раз.')
}

export async function teacherRoutes(app: FastifyInstance) {

  // GET /api/me
  app.get('/me', { preHandler: requireAuth }, async (req, reply) => {
    return reply.send(req.user)
  })

  // POST /api/teacher/register-request
  // The ONLY place that creates a pending teacher row. Deliberately not behind
  // requireAuth (which requires an existing row); the JWT alone proves identity.
  // Idempotent: an existing row of any role/status is returned untouched.
  app.post('/register-request', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const identity = await verifySupabaseIdentity(req.headers.authorization)
    if (!identity) return reply.code(401).send({ error: 'Потрібна авторизація' })
    if (!identity.email) return reply.code(403).send({ error: 'Email не знайдено в токені' })

    const [existing] = await db
      .select({ status: appUsers.status })
      .from(appUsers)
      .where(eq(appUsers.authUserId, identity.authUserId))
      .limit(1)
    if (existing) return reply.send({ status: existing.status })

    await db.insert(appUsers).values({
      authUserId: identity.authUserId,
      email: identity.email,
      role: 'teacher',
      status: 'pending',
    })
    return reply.code(201).send({ status: 'pending' })
  })

  // GET /api/teacher/events
  // Повертає поточні активні події, для яких вчитель може генерувати коди.
  app.get('/events', { preHandler: requireAuth }, async (_req, reply) => {
    const now = new Date()
    const events = await db
      .select({
        id: olympiadEvents.id,
        title: olympiadEvents.title,
        startsAt: olympiadEvents.startsAt,
        endsAt: olympiadEvents.endsAt,
        status: olympiadEvents.status,
      })
      .from(olympiadEvents)
      .where(and(
        eq(olympiadEvents.status, 'active'),
        lte(olympiadEvents.startsAt, now),
        gte(olympiadEvents.endsAt, now),
      ))
      .orderBy(desc(olympiadEvents.startsAt))

    return reply.send({ events })
  })

  // GET /api/teacher/registration-events
  // Події, на які можна реєструвати класи до або під час проведення.
  app.get('/registration-events', { preHandler: requireAuth }, async (_req, reply) => {
    const now = new Date()
    const events = await db
      .select({
        id: olympiadEvents.id,
        title: olympiadEvents.title,
        startsAt: olympiadEvents.startsAt,
        endsAt: olympiadEvents.endsAt,
        status: olympiadEvents.status,
      })
      .from(olympiadEvents)
      .where(and(
        inArray(olympiadEvents.status, ['published', 'active']),
        gte(olympiadEvents.endsAt, now),
      ))
      .orderBy(desc(olympiadEvents.startsAt))

    return reply.send({ events })
  })

  // GET /api/teacher/classes
  app.get('/classes', { preHandler: requireAuth }, async (req, reply) => {
    const classes = await db
      .select()
      .from(teacherClasses)
      .where(eq(teacherClasses.teacherId, req.user!.id))
      .orderBy(desc(teacherClasses.createdAt))

    return reply.send({ classes })
  })

  // POST /api/teacher/classes
  app.post<{
    Body: { name: string; grade: number }
  }>('/classes', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['name', 'grade'],
        properties: {
          name:  { type: 'string', minLength: 1, maxLength: 80 },
          grade: { type: 'integer', minimum: 1, maximum: 4 },
        },
      },
    },
  }, async (req, reply) => {
    let classData
    try {
      classData = normalizeTeacherClassInput(req.body)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }

    const [created] = await db
      .insert(teacherClasses)
      .values({ ...classData, teacherId: req.user!.id })
      .returning()

    return reply.code(201).send({ class: created })
  })

  // GET /api/teacher/registrations
  app.get('/registrations', { preHandler: requireAuth }, async (req, reply) => {
    const registrations = await db
      .select({
        id: eventRegistrations.id,
        eventId: eventRegistrations.eventId,
        classId: eventRegistrations.classId,
        grade: eventRegistrations.grade,
        participantsCount: eventRegistrations.participantsCount,
        paymentStatus: eventRegistrations.paymentStatus,
        status: eventRegistrations.status,
        createdAt: eventRegistrations.createdAt,
        eventTitle: olympiadEvents.title,
        className: teacherClasses.name,
      })
      .from(eventRegistrations)
      .innerJoin(olympiadEvents, eq(eventRegistrations.eventId, olympiadEvents.id))
      .innerJoin(teacherClasses, eq(eventRegistrations.classId, teacherClasses.id))
      .where(eq(eventRegistrations.teacherId, req.user!.id))
      .orderBy(desc(eventRegistrations.createdAt))

    if (registrations.length === 0) {
      return reply.send({ registrations: [] })
    }

    const registrationIds = registrations.map(registration => registration.id)
    const codeRows = await db
      .select({
        registrationId: accessCodes.registrationId,
        codesCreatedCount: count(),
      })
      .from(accessCodes)
      .where(and(
        eq(accessCodes.createdBy, req.user!.id),
        inArray(accessCodes.registrationId, registrationIds),
      ))
      .groupBy(accessCodes.registrationId)

    const codesByRegistration = new Map(
      codeRows
        .filter(row => row.registrationId)
        .map(row => [row.registrationId!, row.codesCreatedCount]),
    )

    return reply.send({
      registrations: registrations.map(registration => ({
        ...registration,
        codesCreatedCount: codesByRegistration.get(registration.id) ?? 0,
      })),
    })
  })

  // POST /api/teacher/registrations
  // Реєстрація без ПІБ дітей: тільки клас, подія і кількість учасників.
  app.post<{
    Body: { eventId: string; classId: string; participantsCount: number }
  }>('/registrations', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['eventId', 'classId', 'participantsCount'],
        additionalProperties: false,
        properties: {
          eventId:           { type: 'string', format: 'uuid' },
          classId:           { type: 'string', format: 'uuid' },
          participantsCount: { type: 'integer', minimum: 1, maximum: 100 },
        },
      },
    },
  }, async (req, reply) => {
    let registrationData
    try {
      registrationData = normalizeRegistrationInput(req.body)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }

    const [ownedClass] = await db
      .select()
      .from(teacherClasses)
      .where(and(eq(teacherClasses.id, registrationData.classId), eq(teacherClasses.teacherId, req.user!.id)))
      .limit(1)

    if (!ownedClass) {
      return reply.code(404).send({ error: 'Клас не знайдено' })
    }

    const [event] = await db
      .select({ id: olympiadEvents.id, status: olympiadEvents.status, endsAt: olympiadEvents.endsAt })
      .from(olympiadEvents)
      .where(eq(olympiadEvents.id, registrationData.eventId))
      .limit(1)

    if (!event) {
      return reply.code(404).send({ error: 'Олімпіаду не знайдено' })
    }

    try {
      assertEventCanAcceptRegistrations(event)
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message })
    }

    const [created] = await db
      .insert(eventRegistrations)
      .values({
        eventId: registrationData.eventId,
        classId: registrationData.classId,
        teacherId: req.user!.id,
        grade: ownedClass.grade,
        participantsCount: registrationData.participantsCount,
        paymentStatus: registrationData.paymentStatus,
      })
      .returning()

    return reply.code(201).send({ registration: created })
  })

  // DELETE /api/teacher/registrations/:id
  // Скасовує реєстрацію до початку події. Видаляє невикористані коди.
  app.delete<{ Params: { id: string } }>('/registrations/:id', {
    preHandler: requireAuth,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params

    // 1. Знайти реєстрацію вчителя
    const [reg] = await db
      .select({
        id:     eventRegistrations.id,
        status: eventRegistrations.status,
        eventId: eventRegistrations.eventId,
      })
      .from(eventRegistrations)
      .where(and(
        eq(eventRegistrations.id, id),
        eq(eventRegistrations.teacherId, req.user!.id),
      ))
      .limit(1)

    if (!reg) return reply.code(404).send({ error: 'Реєстрацію не знайдено' })
    if (reg.status === 'cancelled') return reply.code(409).send({ error: 'Реєстрацію вже скасовано' })

    // 2. Знайти подію
    const [event] = await db
      .select({ status: olympiadEvents.status, startsAt: olympiadEvents.startsAt })
      .from(olympiadEvents)
      .where(eq(olympiadEvents.id, reg.eventId))
      .limit(1)

    if (!event) return reply.code(404).send({ error: 'Подію не знайдено' })

    // 3. Перевірити кількість використаних кодів для цієї реєстрації
    const [{ usedTotal }] = await db
      .select({ usedTotal: count() })
      .from(accessCodes)
      .innerJoin(attempts, eq(attempts.codeId, accessCodes.id))
      .where(eq(accessCodes.registrationId, id))

    // 4. Перевірити правила скасування
    try {
      assertRegistrationCanBeCancelled(event, usedTotal)
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message })
    }

    // 5 + 6. Видалити коди і позначити скасованою — атомарно
    const cancelled = await db.transaction(async (tx) => {
      await tx
        .delete(accessCodes)
        .where(eq(accessCodes.registrationId, id))

      const [updated] = await tx
        .update(eventRegistrations)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(eventRegistrations.id, id))
        .returning()

      return updated
    })

    return reply.send({ registration: cancelled })
  })

  // POST /api/teacher/codes/generate
  // Body: { registrationId, maxUses, expiresAt? }
  app.post<{
    Body: { registrationId: string; maxUses: number; expiresAt?: string }
  }>('/codes/generate', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['registrationId', 'maxUses'],
        properties: {
          registrationId: { type: 'string', format: 'uuid' },
          maxUses:        { type: 'integer', minimum: 1, maximum: 100 },
          expiresAt:      { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { registrationId, maxUses, expiresAt } = req.body

    const [registration] = await db
      .select({
        id: eventRegistrations.id,
        eventId: eventRegistrations.eventId,
        grade: eventRegistrations.grade,
        participantsCount: eventRegistrations.participantsCount,
        paymentStatus: eventRegistrations.paymentStatus,
        status: eventRegistrations.status,
      })
      .from(eventRegistrations)
      .where(and(eq(eventRegistrations.id, registrationId), eq(eventRegistrations.teacherId, req.user!.id)))
      .limit(1)

    if (!registration) {
      return reply.code(404).send({ error: 'Реєстрацію не знайдено' })
    }
    if (registration.status !== 'registered') {
      return reply.code(409).send({ error: 'Реєстрація не активна' })
    }
    if (!['not_required', 'paid'].includes(registration.paymentStatus)) {
      return reply.code(402).send({ error: 'Коди можна створити після оплати рахунку' })
    }

    const [event] = await db
      .select({
        id: olympiadEvents.id,
        status: olympiadEvents.status,
        startsAt: olympiadEvents.startsAt,
        endsAt: olympiadEvents.endsAt,
      })
      .from(olympiadEvents)
      .where(eq(olympiadEvents.id, registration.eventId))
      .limit(1)

    if (!event) {
      return reply.code(404).send({ error: 'Олімпіаду не знайдено' })
    }

    try {
      assertEventCanIssueCodes(event)
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message })
    }

    const [[{ questionsCount }]] = await Promise.all([
      db
        .select({ questionsCount: count() })
        .from(eventQuestions)
        .where(and(eq(eventQuestions.eventId, registration.eventId), eq(eventQuestions.grade, registration.grade))),
    ])

    if (questionsCount === 0) {
      return reply.code(409).send({ error: 'Для цього класу ще не обрано питання в події' })
    }

    const existingCodes = await db
      .select({ id: accessCodes.id, code: accessCodes.code })
      .from(accessCodes)
      .where(and(
        eq(accessCodes.createdBy, req.user!.id),
        eq(accessCodes.registrationId, registration.id),
      ))

    if (existingCodes.length >= registration.participantsCount) {
      return reply.code(409).send({ error: 'Коди для цієї реєстрації вже створено' })
    }

    const codesToCreate = registration.participantsCount - existingCodes.length

    const usedCodes = new Set(existingCodes.map(c => c.code))
    const codes = Array.from({ length: codesToCreate }, () => ({
      eventId: registration.eventId,
      registrationId: registration.id,
      code:      generateCode(usedCodes),
      grade:     registration.grade,
      maxUses,
      createdBy: req.user!.id,
      // TTL: за замовчуванням код живе до кінця події; заданий термін не пізніше endsAt.
      expiresAt: resolveCodeExpiry(expiresAt, event.endsAt),
    }))

    const inserted = await db
      .insert(accessCodes)
      .values(codes)
      .returning({ id: accessCodes.id, code: accessCodes.code })

    return reply.code(201).send({ codes: inserted })
  })

  // GET /api/teacher/codes[?registrationId=<uuid>]
  // Повертає коди вчителя. Опційний фільтр за registrationId.
  app.get<{ Querystring: { registrationId?: string } }>('/codes', {
    preHandler: requireAuth,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          registrationId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (req, reply) => {
    const { registrationId } = req.query

    const conditions = [eq(accessCodes.createdBy, req.user!.id)]

    if (registrationId) {
      // Перевірити, що реєстрація належить цьому вчителю
      const [reg] = await db
        .select({ id: eventRegistrations.id })
        .from(eventRegistrations)
        .where(and(
          eq(eventRegistrations.id, registrationId),
          eq(eventRegistrations.teacherId, req.user!.id),
        ))
        .limit(1)

      if (!reg) return reply.code(404).send({ error: 'Реєстрацію не знайдено' })

      conditions.push(eq(accessCodes.registrationId, registrationId))
    }

    const list = await db
      .select({
        id: accessCodes.id,
        eventId: accessCodes.eventId,
        registrationId: accessCodes.registrationId,
        code: accessCodes.code,
        grade: accessCodes.grade,
        maxUses: accessCodes.maxUses,
        usedCount: accessCodes.usedCount,
        expiresAt: accessCodes.expiresAt,
        createdAt: accessCodes.createdAt,
        eventTitle: olympiadEvents.title,
      })
      .from(accessCodes)
      .leftJoin(olympiadEvents, eq(accessCodes.eventId, olympiadEvents.id))
      .where(and(...conditions))
      .orderBy(desc(accessCodes.createdAt))

    return reply.send({ codes: list })
  })

  // GET /api/teacher/results
  // Повертає всі спроби по кодах вчителя
  app.get('/results', { preHandler: requireAuth }, async (req, reply) => {
    const teacherCodes = await db
      .select({ id: accessCodes.id, code: accessCodes.code, grade: accessCodes.grade, eventTitle: olympiadEvents.title })
      .from(accessCodes)
      .leftJoin(olympiadEvents, eq(accessCodes.eventId, olympiadEvents.id))
      .where(eq(accessCodes.createdBy, req.user!.id))

    if (teacherCodes.length === 0) {
      return reply.send({ results: [] })
    }

    const codeIds = teacherCodes.map(c => c.id)
    const codeMap = Object.fromEntries(teacherCodes.map(c => [c.id, c]))

    const allAttempts = await db
      .select({
        id:         attempts.id,
        codeId:     attempts.codeId,
        grade:      attempts.grade,
        status:     attempts.status,
        score:      attempts.score,
        totalQ:     attempts.totalQ,
        startedAt:  attempts.startedAt,
        finishedAt: attempts.finishedAt,
        // answers (JSONB відповідей учня) свідомо не повертається:
        // вчителю достатньо балу; сирі вибори учня — зайва деталь
      })
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

  // ─── Class students ───────────────────────────────────────────────────────

  // GET /api/teacher/classes/:id/students
  app.get<{ Params: { id: string } }>(
    '/classes/:id/students',
    {
      preHandler: requireAuth,
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (req, reply) => {
      // Перевіряємо що клас належить вчителю
      const [cls] = await db
        .select({ id: teacherClasses.id })
        .from(teacherClasses)
        .where(and(eq(teacherClasses.id, req.params.id), eq(teacherClasses.teacherId, req.user!.id)))
        .limit(1)
      if (!cls) return reply.code(404).send({ error: 'Клас не знайдено' })

      const students = await db
        .select({ id: classStudents.id, label: classStudents.label, createdAt: classStudents.createdAt })
        .from(classStudents)
        .where(eq(classStudents.classId, req.params.id))
        .orderBy(classStudents.createdAt)

      return reply.send({ students })
    }
  )

  // POST /api/teacher/classes/:id/students
  app.post<{
    Params: { id: string }
    Body: { label: string }
  }>(
    '/classes/:id/students',
    {
      preHandler: requireAuth,
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['label'],
          properties: { label: { type: 'string', minLength: 1, maxLength: 60 } },
        },
      },
    },
    async (req, reply) => {
      const label = req.body.label.trim()
      if (!label) return reply.code(400).send({ error: 'Мітка не може бути порожньою' })

      const [cls] = await db
        .select({ id: teacherClasses.id })
        .from(teacherClasses)
        .where(and(eq(teacherClasses.id, req.params.id), eq(teacherClasses.teacherId, req.user!.id)))
        .limit(1)
      if (!cls) return reply.code(404).send({ error: 'Клас не знайдено' })

      const [inserted] = await db
        .insert(classStudents)
        .values({ classId: req.params.id, teacherId: req.user!.id, label })
        .returning({ id: classStudents.id, label: classStudents.label, createdAt: classStudents.createdAt })

      return reply.code(201).send({ student: inserted })
    }
  )

  // PUT /api/teacher/students/:id
  app.put<{
    Params: { id: string }
    Body: { label: string }
  }>(
    '/students/:id',
    {
      preHandler: requireAuth,
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['label'],
          properties: { label: { type: 'string', minLength: 1, maxLength: 60 } },
        },
      },
    },
    async (req, reply) => {
      const label = req.body.label.trim()
      if (!label) return reply.code(400).send({ error: 'Мітка не може бути порожньою' })

      const [updated] = await db
        .update(classStudents)
        .set({ label, updatedAt: new Date() })
        .where(and(eq(classStudents.id, req.params.id), eq(classStudents.teacherId, req.user!.id)))
        .returning({ id: classStudents.id, label: classStudents.label })

      if (!updated) return reply.code(404).send({ error: 'Учня не знайдено' })
      return reply.send({ student: updated })
    }
  )

  // DELETE /api/teacher/students/:id
  app.delete<{ Params: { id: string } }>(
    '/students/:id',
    {
      preHandler: requireAuth,
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (req, reply) => {
      const [deleted] = await db
        .delete(classStudents)
        .where(and(eq(classStudents.id, req.params.id), eq(classStudents.teacherId, req.user!.id)))
        .returning({ id: classStudents.id })

      if (!deleted) return reply.code(404).send({ error: 'Учня не знайдено' })
      return reply.code(204).send()
    }
  )
}
