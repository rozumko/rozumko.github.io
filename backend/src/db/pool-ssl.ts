import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PoolConfig } from 'pg'

/**
 * TLS options for every `pg.Pool` in the backend.
 *
 * Why this exists: `pg` derives TLS behaviour from `sslmode` in the connection
 * string, and that mapping is about to change under us. In pg 8.22
 * (pg-connection-string index.js:143) `prefer`, `require` and `verify-ca` are
 * all treated as `verify-full`; pg v9 will switch them to weaker libpq
 * semantics. Rather than depend on that mapping, we state the intent
 * explicitly: always verify, pinned to the Supabase CA.
 *
 * The trap this module now guards against (measured against the production
 * database on 2026-07-25): when the connection string carries ANY TLS
 * parameter, `pg` builds its own ssl config from the string and that config
 * WINS over the explicit `ssl` option — the pinned CA is silently discarded
 * and verification falls back to the system trust store, which does not
 * contain `Supabase Root 2021 CA`. The observed result was:
 *
 *   no ssl params      -> connected UNENCRYPTED
 *   ?sslmode=require   -> refused: self-signed certificate in certificate chain
 *   ?ssl=true          -> refused: same
 *
 * So intent must never travel inside the connection string. `resolvePoolConfig`
 * reads the intent, STRIPS the TLS parameters, and hands pg a clean string plus
 * an explicit ssl object. `poolTlsIsPinned` proves the result offline.
 */

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Supabase's root CA is public — it is presented in every TLS handshake — so it
 * ships with the code rather than as a secret. Bundling it means a correct,
 * verified connection needs no environment configuration at all, which is what
 * kept production on plaintext before: TLS was opt-in through an env var
 * nobody had set. `SUPABASE_DB_CA_CERT` still wins when present, so a CA
 * rotation can be handled without waiting for a release.
 */
const BUNDLED_CA_PATH = join(__dirname, '../../certs/supabase-prod-ca-2021.crt')

let bundledCa: string | null | undefined

function readBundledCa(): string | null {
  if (bundledCa === undefined) {
    try {
      const pem = readFileSync(BUNDLED_CA_PATH, 'utf8').trim()
      bundledCa = pem.includes('BEGIN CERTIFICATE') ? pem : null
    } catch {
      bundledCa = null
    }
  }
  return bundledCa
}

export type PoolTlsMode = 'off' | 'verify' | 'no-verify'

export interface PoolConnectionConfig {
  connectionString: string | undefined
  ssl: PoolConfig['ssl']
}

/**
 * Full config for `new Pool(...)`. Always use this instead of passing
 * `process.env.DATABASE_URL` straight through: the returned connection string
 * has TLS parameters removed so the explicit `ssl` below cannot be overridden.
 */
export function resolvePoolConfig(env: NodeJS.ProcessEnv = process.env): PoolConnectionConfig {
  const raw = env.DATABASE_URL
  return {
    connectionString: stripTlsParams(raw),
    ssl: resolvePoolSsl(env),
  }
}

/** TLS options alone. Exported for tests and for callers that build their own pool. */
export function resolvePoolSsl(env: NodeJS.ProcessEnv = process.env): PoolConfig['ssl'] {
  const mode = sslModeOf(env.DATABASE_URL ?? '')
  if (mode === 'off') return undefined

  // Explicit, documented opt-out — keeps `sslmode=no-verify` meaningful.
  if (mode === 'no-verify') return { rejectUnauthorized: false }

  // Verification is never optional; the CA only narrows who we trust.
  const ca = env.SUPABASE_DB_CA_CERT?.trim() || readBundledCa()
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: true }
}

/**
 * Removes every TLS parameter from a connection string. Other parameters
 * (application_name, connect_timeout, …) are preserved untouched.
 */
export function stripTlsParams(connectionString: string | undefined): string | undefined {
  if (!connectionString) return connectionString
  let url: URL
  try {
    url = new URL(connectionString)
  } catch {
    return connectionString
  }
  for (const key of ['sslmode', 'ssl', 'sslrootcert', 'sslcert', 'sslkey']) url.searchParams.delete(key)
  return url.toString()
}

/**
 * TLS is ON unless the connection string explicitly opts out. This is the
 * fail-closed direction: a URL that simply forgets `sslmode` used to mean
 * "plaintext", which is how a production database ended up unencrypted.
 * A local server without TLS must now say so with `?sslmode=disable`.
 */
export function sslModeOf(connectionString: string): PoolTlsMode {
  let params: URLSearchParams
  try {
    params = new URL(connectionString).searchParams
  } catch {
    // No usable URL means no connection either; nothing to weaken.
    return 'verify'
  }

  const sslmode = params.get('sslmode')?.toLowerCase()
  if (sslmode === 'disable') return 'off'
  if (sslmode === 'no-verify') return 'no-verify'
  if (params.get('ssl')?.toLowerCase() === 'false') return 'off'
  return 'verify'
}

/**
 * A one-line startup notice when the database connection is weaker than
 * verified TLS. An opt-out that nobody can see is an opt-out that outlives its
 * reason: `sslmode=no-verify` sat in production for weeks because nothing ever
 * said so out loud. Returns null when the connection is fully verified.
 */
export function poolTlsNotice(env: NodeJS.ProcessEnv = process.env): string | null {
  const mode = sslModeOf(env.DATABASE_URL ?? '')
  if (mode === 'verify') return null
  if (mode === 'no-verify') {
    return 'db-tls: sslmode=no-verify — encrypted but UNVERIFIED. Remove it from DATABASE_URL to verify against the bundled Supabase CA.'
  }
  return 'db-tls: sslmode=disable — the database connection is PLAINTEXT. Only a local server on a private network may run this way.'
}

/**
 * True when the config pg will actually use keeps our pinned CA. Guards the
 * exact failure this module exists for: an ssl object that looks right in our
 * code but is thrown away by pg's connection-string parsing.
 */
export function poolTlsIsPinned(config: PoolConnectionConfig): boolean {
  const ssl = config.ssl
  if (!ssl || typeof ssl !== 'object') return false
  if (!('ca' in ssl) || !ssl.ca) return false
  const stripped = stripTlsParams(config.connectionString) ?? ''
  return stripped === (config.connectionString ?? '')
}
