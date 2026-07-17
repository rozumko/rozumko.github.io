import test from 'node:test'
import assert from 'node:assert/strict'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'

// Keep the issuer deterministic; tests inject a local JWKS and never use the network.
process.env.SUPABASE_URL = 'https://test.supabase.co'

import { checkRole, createSupabaseIdentityVerifier } from './auth.js'

const { publicKey, privateKey } = await generateKeyPair('ES256')
const publicJwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'ES256', use: 'sig' }
const localJwks = createLocalJWKSet({ keys: [publicJwk] })
const verifyIdentity = createSupabaseIdentityVerifier(localJwks)

async function signIdentityToken(overrides: Record<string, unknown> = {}): Promise<string> {
  const payload = {
    sub: '00000000-0000-4000-8000-000000000001',
    email: 'teacher@example.com',
    is_anonymous: false,
    ...overrides,
  }
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
    .setIssuer(`${process.env.SUPABASE_URL}/auth/v1`)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)
}

test('checkRole: дозволяє точний збіг ролі', () => {
  assert.equal(checkRole('teacher', 'teacher'), null)
})

test('checkRole: admin проходить будь-яку вимогу', () => {
  assert.equal(checkRole('admin', 'teacher'), null)
  assert.equal(checkRole('admin', 'admin'), null)
})

test('checkRole: повертає помилку якщо роль не підходить', () => {
  assert.equal(checkRole('teacher', 'admin'), 'Недостатньо прав')
})

test('checkRole: повертає помилку якщо роль undefined', () => {
  assert.equal(checkRole(undefined, 'teacher'), 'Потрібна авторизація')
})

test('checkRole: невідома роль відхиляється', () => {
  assert.equal(checkRole('student', 'teacher'), 'Недостатньо прав')
})

test('teacher JWT verifier accepts only the expected Supabase identity', async () => {
  const token = await signIdentityToken()
  assert.deepEqual(await verifyIdentity(`Bearer ${token}`), {
    authUserId: '00000000-0000-4000-8000-000000000001',
    email: 'teacher@example.com',
  })
})

test('teacher JWT verifier rejects wrong audience, issuer, anonymous and missing-sub tokens', async () => {
  const wrongAudience = await new SignJWT({ sub: 'user', email: 'teacher@example.com' })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
    .setIssuer(`${process.env.SUPABASE_URL}/auth/v1`)
    .setAudience('anon')
    .setExpirationTime('5m')
    .sign(privateKey)
  const wrongIssuer = await new SignJWT({ sub: 'user', email: 'teacher@example.com' })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
    .setIssuer('https://attacker.example/auth/v1')
    .setAudience('authenticated')
    .setExpirationTime('5m')
    .sign(privateKey)

  assert.equal(await verifyIdentity(`Bearer ${wrongAudience}`), null)
  assert.equal(await verifyIdentity(`Bearer ${wrongIssuer}`), null)
  assert.equal(await verifyIdentity(`Bearer ${await signIdentityToken({ is_anonymous: true })}`), null)
  assert.equal(await verifyIdentity(`Bearer ${await signIdentityToken({ sub: undefined })}`), null)
})
