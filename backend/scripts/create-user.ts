import { db } from '../src/db/index.js'
import { appUsers } from '../src/db/schema.js'

await db.insert(appUsers).values({
  authUserId: '82f4d12e-c46a-4069-b95e-cd8af0eb53fe',
  email:      'educatorartem@gmail.com',
  name:       'Адмін',
  role:       'admin',
  status:     'active',
}).onConflictDoNothing()

console.log('User created.')
process.exit(0)
