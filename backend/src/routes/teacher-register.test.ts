import assert from 'node:assert/strict'
import test from 'node:test'
import Fastify from 'fastify'
import { teacherRoutes, type TeacherRegistrationStore } from './teacher.js'

test('concurrent teacher registration requests create one pending account', async () => {
  const app = Fastify()
  const accounts = new Map<string, string>()
  const registrationStore: TeacherRegistrationStore = {
    async registerPending(identity) {
      const existing = accounts.get(identity.authUserId)
      if (existing) return { status: existing, created: false }
      accounts.set(identity.authUserId, 'pending')
      await Promise.resolve()
      return { status: 'pending', created: true }
    },
  }

  await app.register(teacherRoutes, {
    prefix: '/api/teacher',
    verifyIdentity: async () => ({ authUserId: 'teacher-auth-id', email: 'teacher@example.com' }),
    registrationStore,
  })

  const responses = await Promise.all([
    app.inject({ method: 'POST', url: '/api/teacher/register-request', headers: { authorization: 'Bearer first' } }),
    app.inject({ method: 'POST', url: '/api/teacher/register-request', headers: { authorization: 'Bearer second' } }),
  ])

  assert.deepEqual(responses.map(response => response.statusCode).sort(), [200, 201])
  assert.deepEqual(responses.map(response => response.json()), [{ status: 'pending' }, { status: 'pending' }])
  assert.equal(accounts.size, 1)
  await app.close()
})
