import { db } from '../src/db/index.js'
import { accessCodes } from '../src/db/schema.js'

await db.insert(accessCodes)
  .values({ code: 'TEST01', grade: 4, maxUses: 5, createdBy: 'test' })
  .onConflictDoNothing()

console.log('Test code TEST01 inserted.')
process.exit(0)
