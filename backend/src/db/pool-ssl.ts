import type { PoolConfig } from 'pg'

/**
 * TLS options for every `pg.Pool` in the backend.
 *
 * Why this exists: `node-postgres` treats `sslmode=require` in the connection
 * string as "encrypt, but do not verify anyone". Without an explicit `ssl`
 * option it accepts ANY certificate, so the Supabase connection is encrypted
 * yet unauthenticated. The CI content exporter already pins the CA
 * (`SUPABASE_DB_CA_CERT` + `NODE_EXTRA_CA_CERTS` in deploy.yml); the runtime
 * did not, which left the two paths to the same cluster asymmetric.
 *
 * Fail-closed rule: the CA is required exactly when the connection string asks
 * for SSL. A plain local connection (docker-compose, `postgres://…@postgres`)
 * has no certificate to verify and stays untouched.
 */
export function resolvePoolSsl(env: NodeJS.ProcessEnv = process.env): PoolConfig['ssl'] {
  const mode = sslModeOf(env.DATABASE_URL ?? '')
  if (mode === 'off') return undefined

  // Explicit, documented opt-out — keeps `sslmode=no-verify` meaningful.
  if (mode === 'no-verify') return { rejectUnauthorized: false }

  const ca = env.SUPABASE_DB_CA_CERT?.trim()
  if (!ca) {
    throw new Error(
      'SUPABASE_DB_CA_CERT is required when DATABASE_URL requests SSL: without it '
      + 'node-postgres accepts any certificate. Set the Supabase CA certificate, or use '
      + 'sslmode=no-verify to opt out deliberately.',
    )
  }
  return { ca, rejectUnauthorized: true }
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
