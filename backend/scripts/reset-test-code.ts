import { db } from '../src/db/index.js'
import { accessCodes } from '../src/db/schema.js'
import { eq } from 'drizzle-orm'

await db.update(accessCodes)
  .set({ usedCount: 0, maxUses: 99 })
  .where(eq(accessCodes.code, 'TEST01'))

console.log('TEST01 reset.')
