import { pool } from '../db/index.js'

/**
 * Authoritative email confirmation: GoTrue's own auth.users table.
 *
 * NOT the JWT claim `user_metadata.email_verified` — that field is user-writable,
 * so a client could set it and self-confirm. Shared by the parent account routes
 * and teacher self-activation so the two cannot drift apart.
 */
export async function emailConfirmedInAuth(authUserId: string): Promise<boolean> {
  const res = await pool.query(
    'select email_confirmed_at from auth.users where id = $1::uuid',
    [authUserId],
  )
  return res.rows[0]?.email_confirmed_at != null
}
