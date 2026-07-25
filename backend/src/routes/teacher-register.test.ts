import assert from 'node:assert/strict'
import test from 'node:test'
import Fastify from 'fastify'
import { teacherRoutes, type TeacherRegistrationStore } from './teacher.js'

const IDENTITY = { authUserId: 'teacher-auth-id', email: 'teacher@example.com' }

/**
 * In-memory stand-in for the drizzle store. Mirrors its rules: insert once,
 * then promote only a teacher row that is still pending.
 */
function fakeStore(seed: { role: string; status: string } | null = null) {
  const rows = new Map<string, { role: string; status: string }>()
  if (seed) rows.set(IDENTITY.authUserId, seed)

  const store: TeacherRegistrationStore = {
    async register(identity, emailConfirmed) {
      const existing = rows.get(identity.authUserId)
      if (!existing) {
        rows.set(identity.authUserId, { role: 'teacher', status: emailConfirmed ? 'active' : 'pending' })
        await Promise.resolve()
        return { status: rows.get(identity.authUserId)!.status, created: true }
      }
      if (emailConfirmed && existing.role === 'teacher' && existing.status === 'pending') {
        existing.status = 'active'
      }
      return { status: existing.status, created: false }
    },
  }
  return { store, rows }
}

async function buildApp(store: TeacherRegistrationStore, emailConfirmed: boolean) {
  const app = Fastify()
  await app.register(teacherRoutes, {
    prefix: '/api/teacher',
    verifyIdentity: async () => IDENTITY,
    registrationStore: store,
    emailConfirmedLoader: async () => emailConfirmed,
  })
  return app
}

function post(app: Awaited<ReturnType<typeof buildApp>>) {
  return app.inject({
    method: 'POST',
    url: '/api/teacher/register-request',
    headers: { authorization: 'Bearer token' },
  })
}

test('concurrent teacher registration requests create one account', async () => {
  const { store, rows } = fakeStore()
  const app = await buildApp(store, false)

  const responses = await Promise.all([post(app), post(app)])

  assert.deepEqual(responses.map(r => r.statusCode).sort(), [200, 201])
  assert.deepEqual(responses.map(r => r.json()), [{ status: 'pending' }, { status: 'pending' }])
  assert.equal(rows.size, 1)
  await app.close()
})

// The activation gate: a confirmed email is what opens the cabinet. Before this,
// every organic signup landed on `pending` and waited for a human, so teacher
// traffic converted to zero no matter what the marketing said.
test('a confirmed email yields an active account straight away', async () => {
  const { store } = fakeStore()
  const app = await buildApp(store, true)

  const response = await post(app)

  assert.equal(response.statusCode, 201)
  assert.deepEqual(response.json(), { status: 'active' })
  await app.close()
})

test('an unconfirmed email still yields pending', async () => {
  const { store } = fakeStore()
  const app = await buildApp(store, false)

  const response = await post(app)

  assert.equal(response.statusCode, 201)
  assert.deepEqual(response.json(), { status: 'pending' })
  await app.close()
})

// requireAuth refuses a pending row, so this route is the only path forward for
// an account filed before its email was confirmed. Without promotion it would
// stay stuck permanently.
test('a pending teacher row is promoted once the email is confirmed', async () => {
  const { store, rows } = fakeStore({ role: 'teacher', status: 'pending' })
  const app = await buildApp(store, true)

  const response = await post(app)

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { status: 'active' })
  assert.equal(rows.get(IDENTITY.authUserId)?.status, 'active')
  await app.close()
})

test('a blocked account is NEVER promoted by confirming an email', async () => {
  const { store, rows } = fakeStore({ role: 'teacher', status: 'blocked' })
  const app = await buildApp(store, true)

  const response = await post(app)

  assert.deepEqual(response.json(), { status: 'blocked' })
  assert.equal(rows.get(IDENTITY.authUserId)?.status, 'blocked')
  await app.close()
})

// An admin row's status is the admin's business. Promotion must not become a
// way for a user action to hand itself admin access.
test('an admin row is left untouched even with a confirmed email', async () => {
  const { store, rows } = fakeStore({ role: 'admin', status: 'pending' })
  const app = await buildApp(store, true)

  const response = await post(app)

  assert.deepEqual(response.json(), { status: 'pending' })
  assert.equal(rows.get(IDENTITY.authUserId)?.status, 'pending')
  assert.equal(rows.get(IDENTITY.authUserId)?.role, 'admin')
  await app.close()
})

test('an already active account is returned untouched', async () => {
  const { store } = fakeStore({ role: 'teacher', status: 'active' })
  const app = await buildApp(store, true)

  const response = await post(app)

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { status: 'active' })
  await app.close()
})
