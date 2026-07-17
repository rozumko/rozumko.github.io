import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { db, pool } from '../db/index.js'
import { listAdminParents } from './admin-parents.js'

after(() => pool.end())

test('admin parent directory returns only privacy-safe account summaries', async () => {
  const mutableDb = db as unknown as { select: typeof db.select }
  const originalSelect = mutableDb.select
  const createdAt = new Date('2026-07-17T12:00:00.000Z')

  class Query {
    from() { return this }
    leftJoin() { return this }
    groupBy() { return this }
    async orderBy() {
      return [{
        email: 'parent@example.com',
        status: 'active',
        emailVerifiedAt: createdAt,
        profileCount: 2,
        createdAt,
        authUserId: 'must-not-leak',
        displayName: 'must-not-leak',
      }]
    }
  }

  mutableDb.select = (() => new Query()) as unknown as typeof db.select
  try {
    const parents = await listAdminParents()
    assert.deepEqual(parents, [{
      email: 'parent@example.com',
      status: 'active',
      emailVerified: true,
      profileCount: 2,
      createdAt,
    }])
    assert.equal('authUserId' in parents[0]!, false)
    assert.equal('displayName' in parents[0]!, false)
  } finally {
    mutableDb.select = originalSelect
  }
})
