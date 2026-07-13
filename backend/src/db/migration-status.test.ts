import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MigrationDriftError,
  assertMigrationCurrent,
  checkDatabaseMigrations,
  parseRequiredMigration,
} from './migration-status.js'

test('migration journal selects the entry with the newest timestamp', () => {
  assert.deepEqual(parseRequiredMigration({
    entries: [
      { when: 100, tag: '0001_first' },
      { when: 300, tag: '0003_latest' },
      { when: 200, tag: '0002_middle' },
    ],
  }), { timestamp: 300, tag: '0003_latest' })
})

test('migration journal rejects empty and malformed entries', () => {
  assert.throws(() => parseRequiredMigration({ entries: [] }), /no entries/)
  assert.throws(
    () => parseRequiredMigration({ entries: [{ when: 'not-a-timestamp', tag: '0001_bad' }] }),
    /invalid entry/,
  )
})

test('migration status accepts the required or a newer database timestamp', () => {
  const required = { timestamp: 300, tag: '0003_latest' }
  assert.doesNotThrow(() => assertMigrationCurrent(required, 300))
  assert.doesNotThrow(() => assertMigrationCurrent(required, 400))
})

test('migration status fails closed when the database is behind', () => {
  const required = { timestamp: 300, tag: '0003_latest' }
  assert.throws(
    () => assertMigrationCurrent(required, 299),
    (error: unknown) => error instanceof MigrationDriftError && error.message.includes('0003_latest'),
  )
})

test('database migration check reads the Drizzle migration timestamp', async () => {
  const queries: string[] = []
  const client = {
    async query(query: string) {
      queries.push(query)
      return { rows: [{ created_at: '300' }] }
    },
  }

  const required = await checkDatabaseMigrations(client, { timestamp: 300, tag: '0003_latest' })

  assert.equal(required.tag, '0003_latest')
  assert.deepEqual(queries, ['SELECT MAX(created_at) AS created_at FROM drizzle.__drizzle_migrations'])
})
