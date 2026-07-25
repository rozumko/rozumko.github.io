import test from 'node:test'
import assert from 'node:assert/strict'
import { resolvePoolSsl } from './pool-ssl.js'

const CA = '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----'

test('sslmode=require without a CA is refused instead of silently unverified', () => {
  assert.throws(
    () => resolvePoolSsl({ DATABASE_URL: 'postgresql://u:p@db.supabase.co:5432/postgres?sslmode=require' }),
    /SUPABASE_DB_CA_CERT is required/,
  )
})

test('sslmode=require with a CA pins the certificate', () => {
  const ssl = resolvePoolSsl({
    DATABASE_URL: 'postgresql://u:p@db.supabase.co:5432/postgres?sslmode=require',
    SUPABASE_DB_CA_CERT: CA,
  })
  assert.deepEqual(ssl, { ca: CA, rejectUnauthorized: true })
})

test('a blank CA counts as missing', () => {
  assert.throws(
    () => resolvePoolSsl({
      DATABASE_URL: 'postgresql://u:p@db.supabase.co:5432/postgres?sslmode=verify-full',
      SUPABASE_DB_CA_CERT: '   ',
    }),
    /SUPABASE_DB_CA_CERT is required/,
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
  assert.throws(
    () => resolvePoolSsl({ DATABASE_URL: 'postgresql://u:p@db.supabase.co:5432/postgres?ssl=true' }),
    /SUPABASE_DB_CA_CERT is required/,
  )
})
