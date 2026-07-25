import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { and, eq, isNull, inArray, desc } from 'drizzle-orm'
import { db, pool } from '../db/index.js'
import {
  homeParentAccounts, homeLeads, homeChildProfiles,
  homeDemoAttempts, homeDemoReports, homeMissionAttempts, homeEntitlements,
} from '../db/schema.js'
import { verifyParentToken, type ParentTokenVerifier, type ParentJwtPayload } from '../lib/parent-auth.js'
import { emailConfirmedInAuth } from '../lib/email-confirmation.js'
import { normalizeParentEmail, normalizeChildDisplayName, verifyLeadToken } from './home-validation.js'
import { hasHomeAccess } from './home-entitlement.js'
import {
  isUuid, parentMeView, decideClaim, validateProfileGrade, aggregateEntitlements,
  MAX_PROFILES_PER_ACCOUNT, type ParentAccountRow,
} from './parent-validation.js'
import {
  drizzlePathProgressStore, hasPathPrerequisites, validatePathCompletion,
  type PathCompletionBody, type PathProgressStore,
} from './parent-path-progress.js'
import {
  loadPathCatalog, loadPathCatalogCandidates,
  type PathCatalogCandidatesLoader, type PathCatalogLoader,
} from './path-catalog.js'

// Parent-zone trust boundaries (docs/security-model.md):
// - JWT proves only Supabase identity; the database owns status and ownership;
// - parent identity never uses teacher/admin app_users authorization;
// - lead claim requires parent auth, a valid lead token and verified email match;
// - every profile operation is scoped to the owning parent_account_id.

export interface ParentRoutesOptions {
  /** DI для тестів: підміна верифікації Supabase JWT без мережі. */
  verifyToken?: ParentTokenVerifier
  /** DI for path-progress flow tests; production uses the transactional Drizzle store. */
  pathProgressStore?: PathProgressStore
  /** DI for tests; production loads the catalog from path_maps (0033). */
  pathCatalogLoader?: PathCatalogLoader
  /** DI for legacy clients without pathVersion; production scans immutable revisions. */
  pathCatalogCandidatesLoader?: PathCatalogCandidatesLoader
  /**
   * DI для тестів: чи підтверджено email. Продакшн читає auth.users.email_confirmed_at
   * напряму з БД — JWT-claim user_metadata.email_verified user-writable і НЕ джерело правди.
   */
  emailConfirmedLoader?: (authUserId: string) => Promise<boolean>
}

export async function parentRoutes(app: FastifyInstance, opts: ParentRoutesOptions = {}) {
  const verifyToken = opts.verifyToken ?? verifyParentToken
  const pathProgressStore = opts.pathProgressStore ?? drizzlePathProgressStore
  const pathCatalogLoader = opts.pathCatalogLoader ?? loadPathCatalog
  const emailConfirmed = opts.emailConfirmedLoader ?? emailConfirmedInAuth
  const pathCatalogCandidatesLoader = opts.pathCatalogCandidatesLoader
    ?? (opts.pathCatalogLoader
      ? async (pathId: string) => {
        const catalog = await pathCatalogLoader(pathId)
        return catalog ? [catalog] : []
      }
      : loadPathCatalogCandidates)

  async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<ParentJwtPayload | null> {
    const payload = await verifyToken(req.headers.authorization)
    if (!payload?.sub) {
      reply.code(401).send({ error: 'Потрібна авторизація' })
      return null
    }
    return payload
  }

  async function loadAccount(authUserId: string): Promise<ParentAccountRow | null> {
    const [account] = await db.select({
      id:              homeParentAccounts.id,
      authUserId:      homeParentAccounts.authUserId,
      email:           homeParentAccounts.email,
      emailVerifiedAt: homeParentAccounts.emailVerifiedAt,
      status:          homeParentAccounts.status,
    }).from(homeParentAccounts).where(eq(homeParentAccounts.authUserId, authUserId)).limit(1)
    return account ?? null
  }

  /** Автентифікація + активний акаунт; інакше відповідь уже надіслано. */
  async function requireParentAccount(req: FastifyRequest, reply: FastifyReply): Promise<ParentAccountRow | null> {
    const payload = await authenticate(req, reply)
    if (!payload) return null
    const account = await loadAccount(payload.sub!)
    if (!account) {
      reply.code(403).send({ error: 'Батьківський акаунт не створено', code: 'PARENT_ACCOUNT_MISSING' })
      return null
    }
    if (account.status !== 'active') {
      reply.code(403).send({ error: 'Акаунт неактивний' })
      return null
    }
    return account
  }

  // ── Створити акаунт (ідемпотентно) ─────────────────────────────────────────
  app.post('/register', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const payload = await authenticate(req, reply)
    if (!payload) return

    let email: string
    try {
      email = normalizeParentEmail(payload.email)
    } catch {
      return reply.code(403).send({ error: 'У токені немає коректного email' })
    }
    // Server-side source of truth; the JWT's user_metadata.email_verified is
    // user-writable and must never gate the claim flow.
    const verifiedNow = await emailConfirmed(payload.sub!)

    const existing = await loadAccount(payload.sub!)
    if (existing) {
      // Ідемпотентний повтор; фіксуємо підтвердження email, якщо воно зʼявилося.
      if (verifiedNow && !existing.emailVerifiedAt) {
        await db.update(homeParentAccounts)
          .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
          .where(eq(homeParentAccounts.id, existing.id))
      }
      return reply.send(parentMeView(await loadAccount(payload.sub!)))
    }

    await db.insert(homeParentAccounts).values({
      authUserId: payload.sub!,
      email,
      emailVerifiedAt: verifiedNow ? new Date() : null,
    })
    return reply.code(201).send(parentMeView(await loadAccount(payload.sub!)))
  })

  // ── Статус акаунта (роль/статус — із БД, не з JWT) ─────────────────────────
  app.get('/me', async (req, reply) => {
    const payload = await authenticate(req, reply)
    if (!payload) return
    return reply.send(parentMeView(await loadAccount(payload.sub!)))
  })

  // ── Привʼязати наявний demo-лід (транзакційно, ідемпотентно) ───────────────
  app.post<{ Body: { leadId: string; leadToken: string } }>('/claim-lead', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['leadId', 'leadToken'],
        additionalProperties: false,
        properties: {
          leadId:    { type: 'string', maxLength: 36 },
          leadToken: { type: 'string', maxLength: 128 },
        },
      },
    },
  }, async (req, reply) => {
    const account = await requireParentAccount(req, reply)
    if (!account) return

    // UUID-валідація до будь-якого звернення в БД.
    if (!isUuid(req.body.leadId)) {
      return reply.code(400).send({ error: 'Некоректний id' })
    }

    const tokenValid = verifyLeadToken(req.body.leadId, req.body.leadToken)
    const [lead] = tokenValid
      ? await db.select({
          id:              homeLeads.id,
          parentEmail:     homeLeads.parentEmail,
          parentAccountId: homeLeads.parentAccountId,
        }).from(homeLeads).where(eq(homeLeads.id, req.body.leadId)).limit(1)
      : [null]

    const decision = decideClaim({ account, tokenValid, lead: lead ?? null })
    if (!decision.ok) {
      return reply.code(decision.code).send({ error: decision.error })
    }

    if (!decision.alreadyClaimed) {
      await db.transaction(async (tx) => {
        // Guard від гонки: беремо лід лише якщо він досі нічий.
        const updated = await tx.update(homeLeads)
          .set({ parentAccountId: account.id, claimedAt: new Date() })
          .where(and(eq(homeLeads.id, req.body.leadId), isNull(homeLeads.parentAccountId)))
          .returning({ id: homeLeads.id })
        if (!updated.length) throw Object.assign(new Error('Цей демо-запис уже привʼязано до іншого акаунта'), { statusCode: 409 })
        await tx.update(homeChildProfiles)
          .set({ parentAccountId: account.id })
          .where(eq(homeChildProfiles.leadId, req.body.leadId))
      })
    }

    return reply.send({ claimed: true, alreadyClaimed: decision.alreadyClaimed })
  })

  // ── Профілі дітей акаунта (тільки власні) ──────────────────────────────────
  app.get('/profiles', async (req, reply) => {
    const account = await requireParentAccount(req, reply)
    if (!account) return
    const profiles = await db.select({
      id:          homeChildProfiles.id,
      displayName: homeChildProfiles.displayName,
      grade:       homeChildProfiles.grade,
    }).from(homeChildProfiles).where(eq(homeChildProfiles.parentAccountId, account.id))
    return reply.send({ profiles })
  })

  /**
   * Ownership-гейт профілю: валідний UUID без власності → 404 (існування
   * чужого профілю не розкривається; security-model.md).
   */
  async function requireOwnedProfile(req: FastifyRequest, reply: FastifyReply, account: ParentAccountRow, rawId: string) {
    if (!isUuid(rawId)) {
      reply.code(400).send({ error: 'Некоректний id' })
      return null
    }
    const [profile] = await db.select({
      id:              homeChildProfiles.id,
      displayName:     homeChildProfiles.displayName,
      grade:           homeChildProfiles.grade,
      parentAccountId: homeChildProfiles.parentAccountId,
    }).from(homeChildProfiles).where(eq(homeChildProfiles.id, rawId)).limit(1)
    if (!profile || profile.parentAccountId !== account.id) {
      reply.code(404).send({ error: 'Профіль не знайдено' })
      return null
    }
    return profile
  }

  // ── Створити профіль дитини (без ліда; лише імʼя + клас) ───────────────────
  app.post<{ Body: { displayName?: string; grade: number } }>('/profiles', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['grade'],
        additionalProperties: false,
        properties: {
          displayName: { type: 'string', maxLength: 60 },
          grade:       { type: 'integer' },
        },
      },
    },
  }, async (req, reply) => {
    const account = await requireParentAccount(req, reply)
    if (!account) return

    let displayName: string | null
    let grade: number
    try {
      displayName = normalizeChildDisplayName(req.body.displayName)
      grade = validateProfileGrade(req.body.grade)
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message })
    }

    const existing = await db.select({ id: homeChildProfiles.id })
      .from(homeChildProfiles).where(eq(homeChildProfiles.parentAccountId, account.id))
    if (existing.length >= MAX_PROFILES_PER_ACCOUNT) {
      return reply.code(409).send({ error: `Максимум ${MAX_PROFILES_PER_ACCOUNT} профілів на акаунт` })
    }

    const [profile] = await db.insert(homeChildProfiles).values({
      parentAccountId: account.id,
      leadId: null,
      displayName,
      grade,
    }).returning({ id: homeChildProfiles.id })
    return reply.code(201).send({ id: profile.id, displayName, grade })
  })

  // ── Оновити профіль (імʼя/клас) ────────────────────────────────────────────
  app.patch<{ Params: { childProfileId: string }; Body: { displayName?: string; grade?: number } }>('/profiles/:childProfileId', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          displayName: { type: 'string', maxLength: 60 },
          grade:       { type: 'integer' },
        },
      },
    },
  }, async (req, reply) => {
    const account = await requireParentAccount(req, reply)
    if (!account) return
    const profile = await requireOwnedProfile(req, reply, account, req.params.childProfileId)
    if (!profile) return

    const updates: { displayName?: string | null; grade?: number } = {}
    try {
      if ('displayName' in req.body) updates.displayName = normalizeChildDisplayName(req.body.displayName)
      if ('grade' in req.body) updates.grade = validateProfileGrade(req.body.grade)
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message })
    }
    if (!Object.keys(updates).length) {
      return reply.code(400).send({ error: 'Немає що оновлювати' })
    }

    await db.update(homeChildProfiles).set(updates).where(eq(homeChildProfiles.id, profile.id))
    return reply.send({
      id: profile.id,
      displayName: 'displayName' in updates ? updates.displayName : profile.displayName,
      grade: updates.grade ?? profile.grade,
    })
    // DELETE свідомо відсутній: видалення дитячих даних чекає документованої
    // політики retention/анонімізації (docs/security-model.md) — fail-closed.
  })

  // ── Learning-path progress (client-unverified practice only) ──────────────
  app.get<{ Params: { childProfileId: string }; Querystring: { pathId?: string } }>(
    '/profiles/:childProfileId/path-progress',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { pathId: { type: 'string', minLength: 1, maxLength: 40 } },
        },
      },
    },
    async (req, reply) => {
      const account = await requireParentAccount(req, reply)
      if (!account) return
      const profile = await requireOwnedProfile(req, reply, account, req.params.childProfileId)
      if (!profile) return

      const pathId = req.query.pathId ?? `grade-${profile.grade}`
      const path = await pathCatalogLoader(pathId)
      if (!path || path.grade !== profile.grade) {
        return reply.code(400).send({ error: 'Невідомий навчальний шлях для цього профілю' })
      }
      const progress = await pathProgressStore.list(profile.id, pathId)
      return reply.send({ childProfileId: profile.id, pathId, progress })
    },
  )

  app.post<{ Params: { childProfileId: string }; Body: PathCompletionBody }>(
    '/profiles/:childProfileId/path-progress',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        body: {
          type: 'object',
          required: ['pathId', 'pointId', 'results'],
          additionalProperties: false,
          properties: {
            pathId: { type: 'string', minLength: 1, maxLength: 40 },
            pathVersion: { type: 'integer', minimum: 1, maximum: 1_000_000 },
            pointId: { type: 'string', minLength: 1, maxLength: 80 },
            results: {
              type: 'array', minItems: 1, maxItems: 8,
              items: {
                type: 'object',
                required: ['activityId', 'activityVersion', 'trust', 'stars', 'correct', 'total', 'completedAt'],
                additionalProperties: false,
                properties: {
                  activityId: { type: 'string', minLength: 1, maxLength: 140 },
                  activityVersion: { type: 'integer', minimum: 1, maximum: 1_000_000 },
                  contentVersion: { type: 'integer', minimum: 1, maximum: 1_000_000 },
                  trust: { type: 'string', enum: ['client-unverified'] },
                  stars: { type: 'integer', minimum: 0, maximum: 3 },
                  correct: { type: 'integer', minimum: 0, maximum: 10_000 },
                  total: { type: 'integer', minimum: 0, maximum: 10_000 },
                  completedAt: { type: 'string', minLength: 20, maxLength: 40 },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const account = await requireParentAccount(req, reply)
      if (!account) return
      const profile = await requireOwnedProfile(req, reply, account, req.params.childProfileId)
      if (!profile) return

      const catalogs = req.body.pathVersion !== undefined
        ? [await pathCatalogLoader(req.body.pathId, req.body.pathVersion)].filter((value) => value !== null)
        : await pathCatalogCandidatesLoader(req.body.pathId)
      let validation = validatePathCompletion(catalogs[0] ?? null, profile.grade, req.body)
      if (!validation.ok && req.body.pathVersion === undefined) {
        for (const candidate of catalogs.slice(1)) {
          const attempt = validatePathCompletion(candidate, profile.grade, req.body)
          if (attempt.ok) {
            validation = attempt
            break
          }
        }
      }
      if (!validation.ok) return reply.code(400).send({ error: validation.error })

      const existing = await pathProgressStore.list(profile.id, req.body.pathId)
      if (!hasPathPrerequisites(validation.point, existing.map(point => point.pointId))) {
        return reply.code(409).send({ error: 'Спершу пройдіть попередні точки шляху' })
      }

      const saved = await pathProgressStore.save({
        childProfileId: profile.id,
        pathId: req.body.pathId,
        pathVersion: validation.pathVersion,
        pointId: req.body.pointId,
        eventKey: validation.eventKey,
        sessionStars: validation.sessionStars,
        clientCompletedAt: validation.clientCompletedAt,
        results: validation.results,
      })
      return reply.code(saved.duplicate ? 200 : 201).send({
        ...saved.progress,
        trust: 'client-unverified',
        duplicate: saved.duplicate,
      })
    },
  )

  // ── Звіти конкретної дитини (demo + club) ──────────────────────────────────
  app.get<{ Params: { childProfileId: string } }>('/profiles/:childProfileId/reports', async (req, reply) => {
    const account = await requireParentAccount(req, reply)
    if (!account) return
    const profile = await requireOwnedProfile(req, reply, account, req.params.childProfileId)
    if (!profile) return

    const demo = await db.select({
      missionId: homeDemoAttempts.missionId,
      track:     homeDemoAttempts.track,
      grade:     homeDemoAttempts.grade,
      report:    homeDemoReports.report,
      createdAt: homeDemoReports.createdAt,
    }).from(homeDemoReports)
      .innerJoin(homeDemoAttempts, eq(homeDemoReports.attemptId, homeDemoAttempts.id))
      .where(eq(homeDemoAttempts.childProfileId, profile.id))

    const club = await db.select({
      missionId: homeMissionAttempts.missionId,
      track:     homeMissionAttempts.track,
      grade:     homeMissionAttempts.grade,
      report:    homeMissionAttempts.report,
      createdAt: homeMissionAttempts.createdAt,
    }).from(homeMissionAttempts)
      .where(eq(homeMissionAttempts.childProfileId, profile.id))
      .orderBy(desc(homeMissionAttempts.createdAt))

    const reports = [
      ...demo.map(r => ({ ...r, kind: 'demo' as const })),
      ...club.map(r => ({ ...r, kind: 'practice' as const })),
    ].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))

    return reply.send({ childProfileId: profile.id, reports })
  })

  // ── Entitlement акаунта: агрегат по заклеймлених лідах ─────────────────────
  // Підписка поки живе на рівні ліда (webhook незмінний); акаунт бачить
  // єдиний агрегований стан. Повний переїзд на account-level — окремий зріз.
  app.get('/entitlement', async (req, reply) => {
    const account = await requireParentAccount(req, reply)
    if (!account) return

    const leads = await db.select({ id: homeLeads.id })
      .from(homeLeads).where(eq(homeLeads.parentAccountId, account.id))
    if (!leads.length) {
      return reply.send({ status: 'none', hasAccess: false, currentPeriodEnd: null })
    }

    const ents = await db.select({
      status:           homeEntitlements.status,
      currentPeriodEnd: homeEntitlements.currentPeriodEnd,
    }).from(homeEntitlements).where(inArray(homeEntitlements.leadId, leads.map(l => l.id)))

    const aggregated = aggregateEntitlements(ents.map(e => ({
      status: e.status,
      currentPeriodEnd: e.currentPeriodEnd,
      hasAccess: hasHomeAccess(e.status, e.currentPeriodEnd),
    })))
    return reply.send(aggregated)
  })
}
