import test from 'node:test'
import assert from 'node:assert/strict'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'

process.env.SUPABASE_URL = 'https://test.supabase.co'

import { createParentTokenVerifier } from './parent-auth.js'

const { publicKey, privateKey } = await generateKeyPair('ES256')
const publicJwk = { ...(await exportJWK(publicKey)), kid: 'parent-test-key', alg: 'ES256', use: 'sig' }
const verifyParent = createParentTokenVerifier(createLocalJWKSet({ keys: [publicJwk] }))

async function signParentToken(payload: Record<string, unknown>, audience = 'authenticated'): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', kid: 'parent-test-key' })
    .setIssuer(`${process.env.SUPABASE_URL}/auth/v1`)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)
}

test('parent JWT verifier behaviorally enforces identity, audience and anonymous rejection', async () => {
  const valid = await signParentToken({ sub: '00000000-0000-4000-8000-000000000002', email: 'parent@example.com' })
  const wrongAudience = await signParentToken({ sub: '00000000-0000-4000-8000-000000000002' }, 'anon')
  const anonymous = await signParentToken({ sub: '00000000-0000-4000-8000-000000000002', is_anonymous: true })
  const missingSub = await signParentToken({ email: 'parent@example.com' })

  assert.equal((await verifyParent(`Bearer ${valid}`))?.sub, '00000000-0000-4000-8000-000000000002')
  assert.equal(await verifyParent(`Bearer ${wrongAudience}`), null)
  assert.equal(await verifyParent(`Bearer ${anonymous}`), null)
  assert.equal(await verifyParent(`Bearer ${missingSub}`), null)
})
