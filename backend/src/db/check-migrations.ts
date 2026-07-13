import { Pool } from 'pg'
import 'dotenv/config'
import { checkDatabaseMigrations } from './migration-status.js'

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the migration check')

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const required = await checkDatabaseMigrations(pool)
    console.log(`Migration check passed: ${required.tag}`)
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
