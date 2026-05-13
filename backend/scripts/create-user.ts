/**
 * Одноразовий скрипт для створення адмін-користувача в app_users.
 *
 * Використання:
 *   SUPABASE_AUTH_USER_ID=<uuid-з-supabase-auth>
 *   ADMIN_EMAIL=<email>
 *   cd backend && npx tsx scripts/create-user.ts
 *
 * Після виконання скрипт більше не потрібен — адмін зберігається в БД.
 */
import 'dotenv/config'
import { db } from '../src/db/index.js'
import { appUsers } from '../src/db/schema.js'

const authUserId = process.env.SUPABASE_AUTH_USER_ID
const email      = process.env.ADMIN_EMAIL

if (!authUserId || !email) {
  console.error('Потрібні змінні: SUPABASE_AUTH_USER_ID, ADMIN_EMAIL')
  process.exit(1)
}

await db.insert(appUsers).values({
  authUserId,
  email,
  name:   'Адмін',
  role:   'admin',
  status: 'active',
}).onConflictDoNothing()

console.log(`Користувача ${email} створено (або вже існує).`)
process.exit(0)
