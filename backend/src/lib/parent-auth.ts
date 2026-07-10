import { createRemoteJWKSet, jwtVerify } from 'jose'

// Верифікація Supabase-токена для батьківської зони. Свідомо ОКРЕМО від
// lib/auth.ts: requireAuth веде на app_users із teacher auto-provisioning —
// батьківська авторизація не має торкатися цього шляху (docs/security-model.md).
// JWT доводить лише ідентичність Supabase-користувача; статус акаунта і
// власність — завжди з БД у маршрутах (routes/parent.ts).

export interface ParentJwtPayload {
  sub?: string
  email?: string
  user_metadata?: { email_verified?: boolean }
}

export type ParentTokenVerifier = (authorizationHeader: string | undefined) => Promise<ParentJwtPayload | null>

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
  }
  return jwks
}

/** Повертає payload або null (401 вирішує маршрут). */
export const verifyParentToken: ParentTokenVerifier = async (header) => {
  if (!header?.startsWith('Bearer ')) return null
  try {
    const { payload } = await jwtVerify(header.slice(7), getJwks(), {
      issuer:     `${process.env.SUPABASE_URL}/auth/v1`,
      algorithms: ['ES256'],  // явно забороняємо alg:none та HMAC downgrade
    })
    return payload as ParentJwtPayload
  } catch {
    return null
  }
}
