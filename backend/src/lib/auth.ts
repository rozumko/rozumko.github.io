import { createRemoteJWKSet, jwtVerify } from 'jose'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { appUsers } from '../db/schema.js'
import type { FastifyRequest, FastifyReply } from 'fastify'

// JWT payload shape from Supabase
interface SupabaseJwtPayload {
  sub?: string
  email?: string
  user_metadata?: { school?: string; name?: string }
}

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
)

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Потрібна авторизація' })
  }

  const token = header.slice(7)

  let payload: SupabaseJwtPayload
  try {
    const result = await jwtVerify(token, JWKS, {
      issuer:     `${process.env.SUPABASE_URL}/auth/v1`,
      algorithms: ['ES256'],  // явно забороняємо alg:none та HMAC downgrade
    })
    payload = result.payload as SupabaseJwtPayload
  } catch {
    return reply.code(401).send({ error: 'Недійсний токен' })
  }

  const authUserId = payload.sub
  if (!authUserId) {
    return reply.code(401).send({ error: 'Недійсний токен' })
  }

  // Роль береться з БД, не з JWT
  let [user] = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.authUserId, authUserId))
    .limit(1)

  // Auto-provision: новий вчитель зареєструвався через Supabase Auth,
  // але запис у appUsers ще не існує — створюємо з роллю 'teacher', status 'pending'.
  // Адміністратор має вручну підтвердити акаунт через панель адміна.
  if (!user) {
    const email = payload.email ?? ''
    if (!email) return reply.code(403).send({ error: 'Email не знайдено в токені' })
    await db
      .insert(appUsers)
      .values({ authUserId, email, role: 'teacher', status: 'pending' })
    return reply.code(403).send({
      error: 'Акаунт очікує підтвердження адміністратора. Зверніться до організатора олімпіади.',
      code: 'ACCOUNT_PENDING',
    })
  }

  if (user.status === 'pending') {
    return reply.code(403).send({
      error: 'Акаунт ще не підтверджено адміністратором. Зверніться до організатора олімпіади.',
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
