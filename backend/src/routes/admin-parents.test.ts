import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { db, pool } from '../db/index.js'
import { listAdminParents } from './admin-parents.js'

after(() => pool.end())

test('admin parent directory returns only privacy-safe account summaries', async () => {
  const mutableDb = db as unknown as { select: typeof db.select }
  const originalSelect = mutableDb.select
  const createdAt = new Date('2026-07-17T12:00:00.000Z')

  // Two queries now: the page itself and the total behind it. The stub resolves
  // whenever it is awaited, so it fits either chain.
  class Query {
    constructor(private readonly result: unknown[]) {}
    from() { return this }
    leftJoin() { return this }
    groupBy() { return this }
    orderBy() { return this }
    limit() { return this }
    offset() { return this }
    then(resolve: (value: unknown[]) => void) { resolve(this.result) }
  }

  let call = 0
  mutableDb.select = (() => {
    call += 1
    return new Query(call === 1
      ? [{
        email: 'parent@example.com',
        status: 'active',
        emailVerifiedAt: createdAt,
        profileCount: 2,
        createdAt,
        authUserId: 'must-not-leak',
        displayName: 'must-not-leak',
      }]
      : [{ total: 1 }])
  }) as unknown as typeof db.select
  try {
    const { parents, total } = await listAdminParents({ limit: 50, offset: 0 })
    assert.equal(total, 1)
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
