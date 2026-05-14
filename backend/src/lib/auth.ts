import { createRemoteJWKSet, jwtVerify } from 'jose'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { appUsers } from '../db/schema.js'
import type { FastifyRequest, FastifyReply } from 'fastify'

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
)

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Потрібна авторизація' })
  }

  const token = header.slice(7)

  let payload: { sub?: string }
  try {
    const result = await jwtVerify(token, JWKS, {
      issuer:     `${process.env.SUPABASE_URL}/auth/v1`,
      algorithms: ['ES256'],  // явно забороняємо alg:none та HMAC downgrade
    })
    payload = result.payload as { sub?: string }
  } catch {
    return reply.code(401).send({ error: 'Недійсний токен' })
  }

  const authUserId = payload.sub
  if (!authUserId) {
    return reply.code(401).send({ error: 'Недійсний токен' })
  }

  // Роль береться з БД, не з JWT
  const [user] = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.authUserId, authUserId))
    .limit(1)

  if (!user) {
    return reply.code(403).send({ error: 'Користувача не знайдено' })
  }
  if (user.status === 'blocked') {
    return reply.code(403).send({ error: 'Акаунт заблоковано' })
  }

  req.user = { id: user.id, authUserId, role: user.role, name: user.name }
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
