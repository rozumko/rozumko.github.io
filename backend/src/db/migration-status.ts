import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_JOURNAL_PATH = join(__dirname, '../../drizzle/meta/_journal.json')

type MigrationJournal = {
  entries?: Array<{
    when?: unknown
    tag?: unknown
  }>
}

export type RequiredMigration = {
  timestamp: number
  tag: string
}

type MigrationQueryClient = {
  query(query: string): Promise<{ rows: Array<{ created_at: string | number | null }> }>
}

export class MigrationDriftError extends Error {
  constructor(required: RequiredMigration, appliedTimestamp: number) {
    super(`Database migrations are behind: required ${required.tag}, applied timestamp ${appliedTimestamp}`)
    this.name = 'MigrationDriftError'
  }
}

export function parseRequiredMigration(journal: unknown): RequiredMigration {
  const entries = (journal as MigrationJournal | null)?.entries
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Migration journal has no entries')
  }

  const latest = entries.reduce<RequiredMigration | null>((current, entry) => {
    const timestamp = Number(entry.when)
    const tag = typeof entry.tag === 'string' ? entry.tag : ''
    if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || !tag) {
      throw new Error('Migration journal contains an invalid entry')
    }
    return !current || timestamp > current.timestamp ? { timestamp, tag } : current
  }, null)

  if (!latest) throw new Error('Migration journal has no valid entries')
  return latest
}

export async function readRequiredMigration(journalPath = DEFAULT_JOURNAL_PATH): Promise<RequiredMigration> {
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as unknown
  return parseRequiredMigration(journal)
}

export function assertMigrationCurrent(required: RequiredMigration, appliedTimestamp: number): void {
  if (!Number.isSafeInteger(appliedTimestamp) || appliedTimestamp < required.timestamp) {
    throw new MigrationDriftError(required, appliedTimestamp)
  }
}

export async function checkDatabaseMigrations(
  client: MigrationQueryClient,
  required?: RequiredMigration,
): Promise<RequiredMigration> {
  const expected = required ?? await readRequiredMigration()
  const result = await client.query(
    'SELECT MAX(created_at) AS created_at FROM drizzle.__drizzle_migrations',
  )
  const appliedTimestamp = Number(result.rows[0]?.created_at ?? 0)
  assertMigrationCurrent(expected, appliedTimestamp)
  return expected
}
