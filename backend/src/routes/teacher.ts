import type { FastifyInstance } from 'fastify'
import { and, count, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import { db } from '../db/index.js'
import { accessCodes, attempts, classStudents, eventQuestions, eventRegistrations, olympiadEvents, teacherClasses } from '../db/schema.js'
import { requireAuth } from '../lib/auth.js'
import { assertEventCanAcceptRegistrations, normalizeRegistrationInput, normalizeTeacherClassInput } from './registration-validation.js'
import { assertEventCanIssueCodes } from './teacher-events-validation.js'

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
    Body: { eventId: string; classId: string; participantsCount: number; paymentStatus?: string }
  }>('/registrations', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['eventId', 'classId', 'participantsCount'],
        properties: {
          eventId:           { type: 'string', format: 'uuid' },
          classId:           { type: 'string', format: 'uuid' },
          participantsCount: { type: 'integer', minimum: 1, maximum: 100 },
          paymentStatus:     { type: 'string' },
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
      .select({ id: accessCodes.id })
      .from(accessCodes)
      .where(and(
        eq(accessCodes.createdBy, req.user!.id),
        eq(accessCodes.registrationId, registration.id),
      ))

    if (existingCodes.length >= registration.participantsCount) {
      return reply.code(409).send({ error: 'Коди для цієї реєстрації вже створено' })
    }

    const codesToCreate = registration.participantsCount - existingCodes.length

    const codes = Array.from({ length: codesToCreate }, () => ({
      eventId: registration.eventId,
      registrationId: registration.id,
      code:      generateCode(),
      grade:     registration.grade,
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
      .where(eq(accessCodes.createdBy, req.user!.id))
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

  // ─── Class students ───────────────────────────────────────────────────────

  // GET /api/teacher/classes/:id/students
  app.get<{ Params: { id: string } }>(
    '/classes/:id/students',
    { preHandler: requireAuth },
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
    { preHandler: requireAuth },
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
