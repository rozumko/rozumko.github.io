import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { resolvePoolConfig } from './pool-ssl.js'
import 'dotenv/config'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function runMigrations() {
  const pool = new Pool(resolvePoolConfig())
  const db = drizzle(pool)
  await migrate(db, { migrationsFolder: join(__dirname, '../../drizzle') })
  await pool.end()
  console.log('Migrations applied.')
}

runMigrations().catch(err => {
  console.error(err)
  process.exit(1)
})
