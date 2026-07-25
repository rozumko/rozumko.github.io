import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { appUsers } from '../db/schema.js'
import type { FastifyRequest, FastifyReply } from 'fastify'

// JWT payload shape from Supabase
interface SupabaseJwtPayload {
  sub?: string
  email?: string
  is_anonymous?: boolean
  user_metadata?: { school?: string; name?: string }
}

export interface SupabaseIdentity {
  authUserId: string
  email: string
}

/**
 * Verifies the Supabase JWT and returns the identity, or null.
 * Shared by requireAuth and the explicit teacher register-request route.
 */
export function createSupabaseIdentityVerifier(getKey: JWTVerifyGetKey) {
  return async (header: string | undefined): Promise<SupabaseIdentity | null> => {
    if (!header?.startsWith('Bearer ')) return null
    try {
      const { payload: raw } = await jwtVerify(header.slice(7), getKey, {
        issuer:     `${process.env.SUPABASE_URL}/auth/v1`,
        audience:   'authenticated',
        algorithms: ['ES256'],
      })
      const payload = raw as SupabaseJwtPayload
      if (!payload.sub || payload.is_anonymous === true) return null
      return { authUserId: payload.sub, email: payload.email ?? '' }
    } catch {
      return null
    }
  }
}

let productionIdentityVerifier: ((header: string | undefined) => Promise<SupabaseIdentity | null>) | null = null

export async function verifySupabaseIdentity(header: string | undefined): Promise<SupabaseIdentity | null> {
  productionIdentityVerifier ??= createSupabaseIdentityVerifier(createRemoteJWKSet(
    new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
  ))
  return productionIdentityVerifier(header)
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const identity = await verifySupabaseIdentity(req.headers.authorization)
  if (!identity) {
    return reply.code(401).send({ error: 'Потрібна авторизація' })
  }
  const { authUserId } = identity

  // Роль береться з БД, не з JWT
  const [user] = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.authUserId, authUserId))
    .limit(1)

  // NO auto-provisioning here: requireAuth is read-only. A valid Supabase user
  // without an app_users row (e.g. a parent opening teacher.html) gets a
  // refusal; the teacher row is created only by the explicit
  // POST /api/teacher/register-request.
  if (!user) {
    return reply.code(403).send({
      error: 'Кабінет вчителя ще не створено для цього акаунта.',
      code: 'ACCOUNT_UNKNOWN',
    })
  }

  // `pending` now means "email not confirmed yet" in the normal flow: a
  // confirmed email activates the account via POST /api/teacher/register-request.
  // The old copy pointed teachers at an olympiad organiser, which was both a
  // dead end and wrong positioning for School Mode.
  if (user.status === 'pending') {
    return reply.code(403).send({
      error: 'Підтвердьте email за посиланням у листі, який ми надіслали, — після цього кабінет відкриється.',
      code: 'ACCOUNT_PENDING',
    })
  }

  if (user.status === 'blocked') {
    return reply.code(403).send({ error: 'Акаунт заблоковано' })
  }

  req.user = { id: user.id, authUserId, role: user.role, name: user.name, email: user.email }
}

/** Pure role check — no I/O. Returns error string or null. */
export function checkRole(userRole: string | undefined, required: string): string | null {
  if (!userRole) return 'Потрібна авторизація'
  if (userRole !== required && userRole !== 'admin') return 'Недостатньо прав'
  return null
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  await requireAuth(req, reply)
  if (reply.sent) return
  if (req.user?.role !== 'admin') {
    return reply.code(403).send({ error: 'Потрібні права адміна' })
  }
}

export async function requireRole(role: 'teacher' | 'admin') {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(req, reply)
    if (reply.sent) return
    const err = checkRole(req.user?.role, role)
    if (err) return reply.code(403).send({ error: err })
  }
}
