import type { PoolConfig } from 'pg'

/**
 * TLS options for every `pg.Pool` in the backend.
 *
 * Why this exists: `pg` derives TLS behaviour from `sslmode` in the connection
 * string, and that mapping is about to change under us. In pg 8.22
 * (pg-connection-string index.js:143) `prefer`, `require` and `verify-ca` are
 * all treated as `verify-full` — Node's TLS defaults apply, so certificate and
 * hostname ARE verified against the system trust store. The library emits a
 * startup warning that pg v9 will switch these modes to libpq semantics, which
 * are weaker: `require` would then encrypt without verifying anything.
 *
 * Rather than depend on that mapping, state the intent explicitly: always
 * verify, and pin the Supabase CA when one is supplied. This preserves today's
 * behaviour, survives the v9 change with no code edit, and narrows trust from
 * the entire system store to a single CA whenever `SUPABASE_DB_CA_CERT` is set
 * — the same value deploy.yml already hands the CI exporter through
 * NODE_EXTRA_CA_CERTS.
 *
 * A plain local connection (docker-compose, `postgres://…@postgres`) requests
 * no SSL and is left alone: there is no certificate to verify.
 */
export function resolvePoolSsl(env: NodeJS.ProcessEnv = process.env): PoolConfig['ssl'] {
  const mode = sslModeOf(env.DATABASE_URL ?? '')
  if (mode === 'off') return undefined

  // Explicit, documented opt-out — keeps `sslmode=no-verify` meaningful.
  if (mode === 'no-verify') return { rejectUnauthorized: false }

  // Verification is never optional; the CA only narrows who we trust.
  const ca = env.SUPABASE_DB_CA_CERT?.trim()
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: true }
}

function sslModeOf(connectionString: string): 'off' | 'verify' | 'no-verify' {
  let params: URLSearchParams
  try {
    params = new URL(connectionString).searchParams
  } catch {
    return 'off'
  }

  const sslmode = params.get('sslmode')?.toLowerCase()
  if (sslmode === 'no-verify') return 'no-verify'
  if (sslmode && sslmode !== 'disable') return 'verify'
  if (params.get('ssl')?.toLowerCase() === 'true') return 'verify'
  return 'off'
}
