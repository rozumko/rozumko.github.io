import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from 'pg'
import { readFileSync } from 'node:fs'
import { X509Certificate } from 'node:crypto'
import { resolvePoolConfig, resolvePoolSsl, stripTlsParams, sslModeOf, poolTlsIsPinned } from './pool-ssl.js'

const CA = '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----'
const REMOTE = 'postgresql://u:p@db.supabase.co:5432/postgres'

// ─────────────────────────────────────────────────────────────────────────────
// The regression this file exists for.
//
// The previous version of this suite asserted only what resolvePoolSsl RETURNS,
// and it was green while production talked to the database in plaintext. The
// reason: pg rebuilds `ssl` from the connection string whenever the string
// carries a TLS parameter, and that rebuild wins over the explicit option. An
// intent-only test cannot see that. The tests below assert what pg actually
// ends up using — no network required, ConnectionParameters is computed in the
// Client constructor.
// ─────────────────────────────────────────────────────────────────────────────

type EffectiveSsl = { ca?: unknown; rejectUnauthorized?: boolean } | boolean | undefined

/** What pg will really use, without connecting: computed in the Client ctor. */
function effectiveSsl(config: { connectionString?: string | undefined; ssl?: unknown }): EffectiveSsl {
  const client = new Client(config as never) as unknown as { connectionParameters: { ssl: EffectiveSsl } }
  return client.connectionParameters.ssl
}

function pinnedCaOf(ssl: EffectiveSsl): unknown {
  return ssl && typeof ssl === 'object' ? ssl.ca : undefined
}

test('pg discards an explicit CA when the connection string carries TLS params', () => {
  // Not our behaviour — pg's. Pinned here so the day it changes, we find out.
  for (const params of ['sslmode=verify-full', 'sslmode=require', 'ssl=true']) {
    const ssl = effectiveSsl({ connectionString: `${REMOTE}?${params}`, ssl: { ca: CA, rejectUnauthorized: true } })
    assert.equal(pinnedCaOf(ssl), undefined, `${params}: pg зберіг наш CA — поведінка змінилася`)
  }
})

test('resolvePoolConfig survives that: the CA reaches pg intact', () => {
  for (const suffix of ['', '?sslmode=verify-full', '?sslmode=require', '?ssl=true']) {
    const config = resolvePoolConfig({ DATABASE_URL: REMOTE + suffix, SUPABASE_DB_CA_CERT: CA })
    const ssl = effectiveSsl(config)
    assert.equal(pinnedCaOf(ssl), CA, `«${suffix || 'без параметрів'}»: CA не доїхав до pg`)
    assert.equal((ssl as { rejectUnauthorized?: boolean }).rejectUnauthorized, true, `«${suffix || 'без параметрів'}»: верифікацію вимкнено`)
    assert.ok(poolTlsIsPinned(config))
  }
})

test('TLS parameters are stripped and every other parameter is preserved', () => {
  const stripped = stripTlsParams(`${REMOTE}?sslmode=require&application_name=rozumko&connect_timeout=10&sslrootcert=/x.crt`)
  assert.doesNotMatch(stripped!, /sslmode|sslrootcert|[?&]ssl=/)
  assert.match(stripped!, /application_name=rozumko/)
  assert.match(stripped!, /connect_timeout=10/)
  assert.equal(stripTlsParams(undefined), undefined)
  assert.equal(stripTlsParams('not a url'), 'not a url')
})

test('TLS is on unless the connection string opts out explicitly', () => {
  // A URL that simply forgets sslmode used to mean plaintext. That default is
  // how a production database ended up unencrypted; it is now fail-closed.
  assert.equal(sslModeOf(REMOTE), 'verify')
  assert.equal(sslModeOf(''), 'verify')
  assert.equal(sslModeOf(`${REMOTE}?sslmode=require`), 'verify')
  assert.equal(sslModeOf(`${REMOTE}?sslmode=verify-full`), 'verify')

  assert.equal(sslModeOf('postgresql://rozumko:pw@postgres:5432/rozumko?sslmode=disable'), 'off')
  assert.equal(sslModeOf(`${REMOTE}?ssl=false`), 'off')
  assert.equal(sslModeOf(`${REMOTE}?sslmode=no-verify`), 'no-verify')
})

test('a plain local server still works, but only when it says so', () => {
  const local = 'postgresql://rozumko:pw@postgres:5432/rozumko?sslmode=disable'
  assert.equal(resolvePoolSsl({ DATABASE_URL: local }), undefined)
  // docker-compose.example.yml must carry that opt-out, or local dev breaks.
  const compose = readFileSync(new URL('../../../docker-compose.example.yml', import.meta.url), 'utf8')
  assert.match(compose, /sslmode=disable/)
})

test('sslmode=no-verify remains an explicit, deliberate opt-out', () => {
  assert.deepEqual(resolvePoolSsl({ DATABASE_URL: `${REMOTE}?sslmode=no-verify` }), { rejectUnauthorized: false })
})

test('an env CA overrides the bundled one, and a blank one never disables verification', () => {
  assert.deepEqual(resolvePoolSsl({ DATABASE_URL: REMOTE, SUPABASE_DB_CA_CERT: CA }), { ca: CA, rejectUnauthorized: true })

  const blank = resolvePoolSsl({ DATABASE_URL: REMOTE, SUPABASE_DB_CA_CERT: '   ' }) as { ca?: string; rejectUnauthorized: boolean }
  assert.equal(blank.rejectUnauthorized, true)
  assert.notEqual(blank.ca, '   ')
})

test('the bundled Supabase CA ships with the code and is the real root', () => {
  // Without a bundled CA a verified connection would depend on an env var, and
  // an unset env var is exactly what left production on plaintext.
  const ssl = resolvePoolSsl({ DATABASE_URL: REMOTE }) as { ca?: string; rejectUnauthorized: boolean }
  assert.ok(ssl.ca, 'вбудований CA не знайдено — перевірене зʼєднання стало опційним')
  assert.match(ssl.ca!, /BEGIN CERTIFICATE/)

  const pem = readFileSync(new URL('../../certs/supabase-prod-ca-2021.crt', import.meta.url), 'utf8')
  const cert = new X509Certificate(pem)
  assert.match(cert.subject, /Supabase Root 2021 CA/)
  assert.equal(cert.subject, cert.issuer, 'очікували самопідписаний корінь')
  assert.equal(cert.ca, true)
  assert.ok(new Date(cert.validTo) > new Date(), 'вбудований CA протермінований')
})
