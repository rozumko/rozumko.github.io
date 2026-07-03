import type { FastifyInstance } from 'fastify'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { questions, homeLeads, homeChildProfiles, homeDemoAttempts, homeDemoReports, homeEntitlements, homeMissionAttempts } from '../db/schema.js'
import { hasHomeAccess } from './home-entitlement.js'
import { scoreAttempt, type AnswerValue } from './attempt-validation.js'
import { stripOptionKeys } from './question-sanitize.js'
import {
  HOME_DEMO_TRACKS, DEMO_REPORT_VERSION,
  normalizeParentEmail, normalizeChildDisplayName, validateConsent,
  generateLeadToken, verifyLeadToken, validateDemoEvents, buildDemoReport,
  practiceFilterPlan,
  type DemoAttemptEvent, type HomeDemoTrack, type ScoredDemoItem,
} from './home-validation.js'

// Home Mode, зріз 1: parent lead + consent → приймання сирих подій демо-місії →
// СЕРВЕРНИЙ скоринг → батьківський звіт. Контракт: docs/home-demo-contract.md.
// Інваріанти: жодного запису дитячих даних без ліда (consent-gate); клієнтська
// "правильність" не приймається взагалі (additionalProperties: false); жодних
// шкільних сесій/токенів у цих роутах.

const uuidParam = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
} as const

const clubQuestionsQuery = {
  type: 'object',
  additionalProperties: false,
  required: ['grade', 'track'],
  properties: {
    grade:      { type: 'string', enum: ['1', '2', '3', '4'] },
    track:      { type: 'string', enum: [...HOME_DEMO_TRACKS] },
    difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
    count:      { type: 'string', pattern: '^(?:[1-9]|[1-4][0-9]|50)$' },
  },
} as const

const leadBody = {
  type: 'object',
  required: ['parentEmail', 'consent', 'childProfile'],
  additionalProperties: false,
  properties: {
    parentEmail: { type: 'string', minLength: 6, maxLength: 254 },
    consent: {
      type: 'object',
      required: ['policyVersion', 'acceptedAt'],
      additionalProperties: false,
      properties: {
        policyVersion: { type: 'string', minLength: 1, maxLength: 40 },
        acceptedAt:    { type: 'string', minLength: 1, maxLength: 40 },
      },
    },
    childProfile: {
      type: 'object',
      required: ['grade'],
      additionalProperties: false,
      properties: {
        displayName: { type: 'string', maxLength: 80 },
        grade:       { type: 'integer', minimum: 1, maximum: 4 },
      },
    },
  },
} as const

// Подія демо-спроби: сира відповідь + телеметрія. Поля на кшталт correct /
// isCorrect / score сюди НЕ входять — additionalProperties: false відхиляє їх.
const demoReportBody = {
  type: 'object',
  required: ['missionId', 'missionVersion', 'track', 'grade', 'startedAt', 'finishedAt', 'events'],
  additionalProperties: false,
  properties: {
    missionId:      { type: 'string', minLength: 1, maxLength: 80 },
    missionVersion: { type: 'integer', minimum: 1 },
    track:          { type: 'string', enum: [...HOME_DEMO_TRACKS] },
    grade:          { type: 'integer', minimum: 1, maximum: 4 },
    startedAt:      { type: 'string', minLength: 1, maxLength: 40 },
    finishedAt:     { type: 'string', minLength: 1, maxLength: 40 },
    events: {
      type: 'array',
      minItems: 1,
      maxItems: 20,
      items: {
        type: 'object',
        required: ['questionId', 'answer', 'timeToAnswerMs', 'answerChangeCount', 'position'],
        additionalProperties: false,
        properties: {
          questionId: { type: 'string', format: 'uuid' },
          answer: {
            anyOf: [
              { type: 'integer', minimum: 0, maximum: 99 },
              { type: 'string', minLength: 1, maxLength: 200 },
              { type: 'array', items: { type: 'integer', minimum: 0, maximum: 99 }, minItems: 1, maxItems: 20 },
            ],
          },
          timeToAnswerMs:    { type: 'integer', minimum: 0, maximum: 3_600_000 },
          answerChangeCount: { type: 'integer', minimum: 0, maximum: 100 },
          position:          { type: 'integer', minimum: 0, maximum: 19 },
        },
      },
    },
  },
} as const

interface DemoReportBody {
  missionId: string
  missionVersion: number
  track: HomeDemoTrack
  grade: number
  startedAt: string
  finishedAt: string
  events: DemoAttemptEvent[]
}

function requireLeadToken(leadId: string, header: unknown): boolean {
  return typeof header === 'string' && verifyLeadToken(leadId, header)
}

async function getEntitlementAccess(leadId: string): Promise<{ status: string; currentPeriodEnd: Date | null; hasAccess: boolean }> {
  const [ent] = await db
    .select({ status: homeEntitlements.status, currentPeriodEnd: homeEntitlements.currentPeriodEnd })
    .from(homeEntitlements)
    .where(eq(homeEntitlements.leadId, leadId))
    .limit(1)

  return {
    status: ent?.status ?? 'none',
    currentPeriodEnd: ent?.currentPeriodEnd ?? null,
    hasAccess: ent ? hasHomeAccess(ent.status, ent.currentPeriodEnd) : false,
  }
}

async function loadSanitizedPracticeQuestions(options: {
  grade: number
  count: number
  track?: HomeDemoTrack
  difficulty?: string
}) {
  // Уся умовна логіка фільтрів — у practiceFilterPlan (чиста, покрита тестами).
  // Маршрут лише механічно перекладає план у Drizzle-умови, без власних if.
  const practiceColumns = {
    isOlympiad: questions.isOlympiad,
    grade:      questions.grade,
    track:      questions.track,
    difficulty: questions.difficulty,
  } as const
  const filters = practiceFilterPlan(options).map(f => eq(practiceColumns[f.column], f.value))

  const rows = await db
    .select({
      id:          questions.id,
      q:           questions.q,
      code:        questions.code,
      type:        questions.type,
      options:     questions.options,
      correct:     questions.correct,
      explanation: questions.explanation,
      difficulty:  questions.difficulty,
      track:       questions.track,
      grade:       questions.grade,
    })
    .from(questions)
    .where(and(...filters))
    .orderBy(sql`random()`)
    .limit(options.count)

  return rows.map(({ correct: _c, explanation: _e, options, ...rest }) => ({
    ...rest,
    options: stripOptionKeys(options),
  }))
}

/**
 * Довірений скоринг сирих подій: перерахунок із ключів БД, лише тренувальний
 * пул (isOlympiad=false). Спільний для демо і Club practice. null — у подіях
 * є питання поза пулом (або неіснуюче), маршрут відповідає 400.
 */
async function scoreEventsFromPracticePool(events: DemoAttemptEvent[]): Promise<ScoredDemoItem[] | null> {
  const questionIds = events.map(e => e.questionId)
  const pool = await db
    .select({ id: questions.id, type: questions.type, correct: questions.correct, explanation: questions.explanation, options: questions.options })
    .from(questions)
    .where(and(eq(questions.isOlympiad, false), inArray(questions.id, questionIds)))
  const byId = new Map(pool.map(q => [q.id, q]))
  if (questionIds.some(id => !byId.has(id))) return null

  const answers: Record<string, AnswerValue> = {}
  for (const e of events) answers[e.questionId] = e.answer
  const { results } = scoreAttempt(
    questionIds.map(id => {
      const q = byId.get(id)!
      return { id: q.id, type: q.type ?? 'choice', correct: q.correct, explanation: q.explanation, options: q.options }
    }),
    answers,
  )

  return events.map(e => ({
    questionId:        e.questionId,
    position:          e.position,
    isCorrect:         results[e.questionId]?.isCorrect ?? false,
    timeToAnswerMs:    e.timeToAnswerMs,
    answerChangeCount: e.answerChangeCount,
  }))
}

export async function homeRoutes(app: FastifyInstance) {
  // ── Батько: створити лід (email + згода + профіль дитини) ─────────────────
  app.post<{ Body: { parentEmail: string; consent: { policyVersion: string; acceptedAt: string }; childProfile: { displayName?: string; grade: number } } }>('/leads', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: { body: leadBody },
  }, async (req, reply) => {
    let parentEmail: string
    let displayName: string | null
    try {
      parentEmail = normalizeParentEmail(req.body.parentEmail)
      validateConsent(req.body.consent)
      displayName = normalizeChildDisplayName(req.body.childProfile.displayName)
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message })
    }

    const [lead] = await db.insert(homeLeads).values({
      parentEmail,
      consentPolicyVersion: req.body.consent.policyVersion,
      consentAcceptedAt:    new Date(req.body.consent.acceptedAt),
    }).returning({ id: homeLeads.id })

    const [profile] = await db.insert(homeChildProfiles).values({
      leadId: lead.id,
      displayName,
      grade: req.body.childProfile.grade,
    }).returning({ id: homeChildProfiles.id })

    return reply.code(201).send({
      leadId:         lead.id,
      leadToken:      generateLeadToken(lead.id),
      childProfileId: profile.id,
    })
  })

  // ── Батько: подати сирі події демо → серверний скоринг → звіт ─────────────
  app.post<{ Params: { id: string }; Body: DemoReportBody }>('/leads/:id/demo-report', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: { params: uuidParam, body: demoReportBody },
  }, async (req, reply) => {
    if (!requireLeadToken(req.params.id, req.headers['x-lead-token'])) {
      return reply.code(403).send({ error: 'Невірний токен' })
    }

    // Consent-gate: без збереженого ліда (= згоди) нічого не пишемо.
    const [lead] = await db.select({ id: homeLeads.id }).from(homeLeads)
      .where(eq(homeLeads.id, req.params.id)).limit(1)
    if (!lead) return reply.code(404).send({ error: 'Лід не знайдено' })

    const [profile] = await db.select({ id: homeChildProfiles.id }).from(homeChildProfiles)
      .where(eq(homeChildProfiles.leadId, lead.id)).limit(1)
    if (!profile) return reply.code(404).send({ error: 'Профіль дитини не знайдено' })

    try { validateDemoEvents(req.body.events) } catch (e) {
      return reply.code(400).send({ error: (e as Error).message })
    }

    // Idempotent per lead+mission: повторна подача повертає збережений звіт.
    const [existing] = await db.select({ id: homeDemoAttempts.id }).from(homeDemoAttempts)
      .where(and(eq(homeDemoAttempts.childProfileId, profile.id), eq(homeDemoAttempts.missionId, req.body.missionId)))
      .limit(1)
    if (existing) {
      const [stored] = await db.select({ report: homeDemoReports.report }).from(homeDemoReports)
        .where(eq(homeDemoReports.attemptId, existing.id)).limit(1)
      if (stored) return reply.send({ report: stored.report })
      return reply.code(409).send({ error: 'Звіт для цієї місії вже формується' })
    }

    const scoredItems = await scoreEventsFromPracticePool(req.body.events)
    if (!scoredItems) {
      return reply.code(400).send({ error: 'Питання не з тренувального пулу' })
    }
    const report = buildDemoReport(scoredItems, {
      missionId: req.body.missionId,
      missionVersion: req.body.missionVersion,
      track: req.body.track,
    })

    const attempt = await db.transaction(async (tx) => {
      const [created] = await tx.insert(homeDemoAttempts).values({
        childProfileId:   profile.id,
        missionId:        req.body.missionId,
        missionVersion:   req.body.missionVersion,
        track:            req.body.track,
        grade:            req.body.grade,
        events:           req.body.events,
        clientStartedAt:  Number.isNaN(Date.parse(req.body.startedAt)) ? null : new Date(req.body.startedAt),
        clientFinishedAt: Number.isNaN(Date.parse(req.body.finishedAt)) ? null : new Date(req.body.finishedAt),
      }).onConflictDoNothing().returning({ id: homeDemoAttempts.id })

      if (!created) return null

      await tx.insert(homeDemoReports).values({
        attemptId:     created.id,
        report,
        reportVersion: DEMO_REPORT_VERSION,
      })

      return created
    })
    // Гонка двох одночасних подач: UNIQUE переміг інший запит → його звіт уже є/буде.
    if (!attempt) return reply.code(409).send({ error: 'Звіт для цієї місії вже формується' })

    return reply.code(201).send({ report })
  })

  // ── Батько: перечитати збережений звіт ────────────────────────────────────
  app.get<{ Params: { id: string } }>('/leads/:id/demo-report', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: { params: uuidParam },
  }, async (req, reply) => {
    if (!requireLeadToken(req.params.id, req.headers['x-lead-token'])) {
      return reply.code(403).send({ error: 'Невірний токен' })
    }

    const [profile] = await db.select({ id: homeChildProfiles.id }).from(homeChildProfiles)
      .where(eq(homeChildProfiles.leadId, req.params.id)).limit(1)
    if (!profile) return reply.code(404).send({ error: 'Профіль дитини не знайдено' })

    const [attempt] = await db.select({ id: homeDemoAttempts.id }).from(homeDemoAttempts)
      .where(eq(homeDemoAttempts.childProfileId, profile.id)).limit(1)
    if (!attempt) return reply.code(404).send({ error: 'Звіт не знайдено' })

    const [stored] = await db.select({ report: homeDemoReports.report }).from(homeDemoReports)
      .where(eq(homeDemoReports.attemptId, attempt.id)).limit(1)
    if (!stored) return reply.code(404).send({ error: 'Звіт не знайдено' })

    return reply.send({ report: stored.report })
  })

  // ── Батько: стан платного доступу (Rozumko Club) ──────────────────────────
  // Рішення про доступ — лише тут, на бекенді (hasHomeAccess). Entitlement
  // відкриває контент, але не впливає на скоринг (docs/security-model.md).
  app.get<{ Params: { id: string } }>('/leads/:id/entitlement', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: { params: uuidParam },
  }, async (req, reply) => {
    if (!requireLeadToken(req.params.id, req.headers['x-lead-token'])) {
      return reply.code(403).send({ error: 'Невірний токен' })
    }

    const [ent] = await db
      .select({ status: homeEntitlements.status, currentPeriodEnd: homeEntitlements.currentPeriodEnd })
      .from(homeEntitlements)
      .where(eq(homeEntitlements.leadId, req.params.id))
      .limit(1)

    if (!ent) return reply.send({ status: 'none', hasAccess: false, currentPeriodEnd: null })

    return reply.send({
      status: ent.status,
      hasAccess: hasHomeAccess(ent.status, ent.currentPeriodEnd),
      currentPeriodEnd: ent.currentPeriodEnd,
    })
  })

  // ── Club: стан доступу + доступні напрями ─────────────────────────────────
  app.get<{ Params: { id: string } }>('/leads/:id/club', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: { params: uuidParam },
  }, async (req, reply) => {
    if (!requireLeadToken(req.params.id, req.headers['x-lead-token'])) {
      return reply.code(403).send({ error: 'Невірний токен' })
    }

    const access = await getEntitlementAccess(req.params.id)

    return reply.send({
      status: access.status,
      hasAccess: access.hasAccess,
      currentPeriodEnd: access.currentPeriodEnd,
      tracks: access.hasAccess ? [...HOME_DEMO_TRACKS] : [],
    })
  })

  // ── Club: видати платну місію. Питання віддаються тільки після entitlement gate,
  // без ключів; скоринг усе одно перераховується на POST /mission-report.
  app.get<{ Params: { id: string }; Querystring: { grade: string; track: HomeDemoTrack; difficulty?: string; count?: string } }>('/leads/:id/club/questions', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: { params: uuidParam, querystring: clubQuestionsQuery },
  }, async (req, reply) => {
    if (!requireLeadToken(req.params.id, req.headers['x-lead-token'])) {
      return reply.code(403).send({ error: 'Невірний токен' })
    }

    const access = await getEntitlementAccess(req.params.id)
    if (!access.hasAccess) {
      return reply.code(403).send({ error: 'Потрібна активна підписка Rozumko Club' })
    }

    const grade = Number(req.query.grade)
    const count = req.query.count ? Number(req.query.count) : 6
    const qs = await loadSanitizedPracticeQuestions({
      grade,
      count,
      track: req.query.track,
      difficulty: req.query.difficulty,
    })

    return reply.send({ questions: qs })
  })

  // ── Club: практична місія (ПЛАТНИЙ контент, гейт entitlement) ─────────────
  // Повторювана, на відміну від демо. Гейт вирішує hasHomeAccess ДО будь-якого
  // запису; entitlement не впливає на сам скоринг (docs/security-model.md).
  app.post<{ Params: { id: string }; Body: DemoReportBody }>('/leads/:id/mission-report', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    schema: { params: uuidParam, body: demoReportBody },
  }, async (req, reply) => {
    if (!requireLeadToken(req.params.id, req.headers['x-lead-token'])) {
      return reply.code(403).send({ error: 'Невірний токен' })
    }

    const access = await getEntitlementAccess(req.params.id)
    if (!access.hasAccess) {
      return reply.code(403).send({ error: 'Потрібна активна підписка Rozumko Club' })
    }

    const [profile] = await db.select({ id: homeChildProfiles.id }).from(homeChildProfiles)
      .where(eq(homeChildProfiles.leadId, req.params.id)).limit(1)
    if (!profile) return reply.code(404).send({ error: 'Профіль дитини не знайдено' })

    try { validateDemoEvents(req.body.events) } catch (e) {
      return reply.code(400).send({ error: (e as Error).message })
    }

    const scoredItems = await scoreEventsFromPracticePool(req.body.events)
    if (!scoredItems) {
      return reply.code(400).send({ error: 'Питання не з тренувального пулу' })
    }
    const report = buildDemoReport(scoredItems, {
      missionId: req.body.missionId,
      missionVersion: req.body.missionVersion,
      track: req.body.track,
    })

    await db.insert(homeMissionAttempts).values({
      childProfileId:   profile.id,
      missionId:        req.body.missionId,
      missionVersion:   req.body.missionVersion,
      track:            req.body.track,
      grade:            req.body.grade,
      events:           req.body.events,
      report,
      reportVersion:    DEMO_REPORT_VERSION,
      correct:          report.correct,
      total:            report.total,
      clientStartedAt:  Number.isNaN(Date.parse(req.body.startedAt)) ? null : new Date(req.body.startedAt),
      clientFinishedAt: Number.isNaN(Date.parse(req.body.finishedAt)) ? null : new Date(req.body.finishedAt),
    }).returning({ id: homeMissionAttempts.id })

    return reply.code(201).send({ report })
  })

  // ── Club: прогрес — список спроб (без сирих подій у відповіді) ────────────
  app.get<{ Params: { id: string } }>('/leads/:id/mission-reports', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: { params: uuidParam },
  }, async (req, reply) => {
    if (!requireLeadToken(req.params.id, req.headers['x-lead-token'])) {
      return reply.code(403).send({ error: 'Невірний токен' })
    }

    const access = await getEntitlementAccess(req.params.id)
    if (!access.hasAccess) {
      return reply.code(403).send({ error: 'Потрібна активна підписка Rozumko Club' })
    }

    const [profile] = await db.select({ id: homeChildProfiles.id }).from(homeChildProfiles)
      .where(eq(homeChildProfiles.leadId, req.params.id)).limit(1)
    if (!profile) return reply.code(404).send({ error: 'Профіль дитини не знайдено' })

    const attempts = await db
      .select({
        missionId:      homeMissionAttempts.missionId,
        missionVersion: homeMissionAttempts.missionVersion,
        track:          homeMissionAttempts.track,
        grade:          homeMissionAttempts.grade,
        correct:        homeMissionAttempts.correct,
        total:          homeMissionAttempts.total,
        report:         homeMissionAttempts.report,
        createdAt:      homeMissionAttempts.createdAt,
      })
      .from(homeMissionAttempts)
      .where(eq(homeMissionAttempts.childProfileId, profile.id))
      .orderBy(desc(homeMissionAttempts.createdAt))
      .limit(20)

    return reply.send({ attempts })
  })
}
