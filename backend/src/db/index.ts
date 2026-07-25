import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema.js'
import { resolvePoolConfig } from './pool-ssl.js'
import 'dotenv/config'

// resolvePoolConfig, не сирий DATABASE_URL: TLS-параметри в рядку змусили б pg
// зібрати власний ssl і викинути припнутий CA (див. pool-ssl.ts).
export const pool = new Pool(resolvePoolConfig())

export const db = drizzle(pool, { schema })
