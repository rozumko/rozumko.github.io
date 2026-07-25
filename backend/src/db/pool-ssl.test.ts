import test from 'node:test'
import assert from 'node:assert/strict'
import { resolvePoolSsl } from './pool-ssl.js'

const CA = '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----'

// The point is that verification is stated explicitly rather than inherited
// from pg's sslmode mapping, which pg v9 will weaken for `require`.
test('sslmode=require verifies even without a CA', () => {
  assert.deepEqual(
    resolvePoolSsl({ DATABASE_URL: 'postgresql://u:p@db.supabase.co:5432/postgres?sslmode=require' }),
    { rejectUnauthorized: true },
  )
})

test('sslmode=require with a CA pins the certificate', () => {
  const ssl = resolvePoolSsl({
    DATABASE_URL: 'postgresql://u:p@db.supabase.co:5432/postgres?sslmode=require',
    SUPABASE_DB_CA_CERT: CA,
  })
  assert.deepEqual(ssl, { ca: CA, rejectUnauthorized: true })
})

test('a blank CA counts as missing but never disables verification', () => {
  assert.deepEqual(
    resolvePoolSsl({
      DATABASE_URL: 'postgresql://u:p@db.supabase.co:5432/postgres?sslmode=verify-full',
      SUPABASE_DB_CA_CERT: '   ',
    }),
    { rejectUnauthorized: true },
  )
})

test('plain local connections stay untouched — nothing to verify', () => {
  // docker-compose.example.yml uses exactly this shape (no sslmode).
  assert.equal(resolvePoolSsl({ DATABASE_URL: 'postgresql://rozumko:pw@postgres:5432/rozumko' }), undefined)
  assert.equal(resolvePoolSsl({ DATABASE_URL: 'postgresql://u:p@localhost:5432/rozumko?sslmode=disable' }), undefined)
  assert.equal(resolvePoolSsl({}), undefined)
})

test('sslmode=no-verify remains an explicit, deliberate opt-out', () => {
  assert.deepEqual(
    resolvePoolSsl({ DATABASE_URL: 'postgresql://u:p@db.supabase.co:5432/postgres?sslmode=no-verify' }),
    { rejectUnauthorized: false },
  )
})

test('ssl=true is treated like sslmode=require', () => {
  assert.deepEqual(
    resolvePoolSsl({ DATABASE_URL: 'postgresql://u:p@db.supabase.co:5432/postgres?ssl=true' }),
    { rejectUnauthorized: true },
  )
})
