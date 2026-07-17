import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

// Keep parent verification separate from teacher/admin authorization: parent
// identity resolves through home_parent_accounts and must never use app_users.
// JWT proves only Supabase identity; routes/parent.ts resolves account status
// and ownership from the database.

export interface ParentJwtPayload {
  sub?: string
  email?: string
  is_anonymous?: boolean
  /**
   * НЕ ДОВІРЯТИ: user_metadata — це user-writable raw_user_meta_data
   * (PUT /auth/v1/user міняє будь-який ключ, включно з email_verified).
   * Підтвердження email читається server-side з auth.users (routes/parent.ts).
   */
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

/** Builds a verifier that can use either production remote JWKS or test JWKS. */
export function createParentTokenVerifier(getKey: JWTVerifyGetKey): ParentTokenVerifier {
  return async (header) => {
    if (!header?.startsWith('Bearer ')) return null
    try {
      const { payload } = await jwtVerify(header.slice(7), getKey, {
        issuer:     `${process.env.SUPABASE_URL}/auth/v1`,
        audience:   'authenticated',
        algorithms: ['ES256'],
      })
      const parsed = payload as ParentJwtPayload
      if (!parsed.sub || parsed.is_anonymous === true) return null
      return parsed
    } catch {
      return null
    }
  }
}

let productionVerifier: ParentTokenVerifier | null = null

/** Returns a verified payload or null; the route decides the 401 response. */
export const verifyParentToken: ParentTokenVerifier = async (header) => {
  productionVerifier ??= createParentTokenVerifier(getJwks())
  return productionVerifier(header)
}
