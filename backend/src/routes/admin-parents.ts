import { asc, count, desc, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { homeChildProfiles, homeParentAccounts } from '../db/schema.js'

export interface AdminParentSummary {
  email: string
  status: string
  emailVerified: boolean
  profileCount: number
  createdAt: Date | null
}

/** Returns one page of the parent-account directory plus the size of the whole
 *  directory, so the caller can draw a pager without a second round trip. */
export async function listAdminParents(
  range: { limit: number; offset: number },
): Promise<{ parents: AdminParentSummary[]; total: number }> {
  const rows = await db
    .select({
      email: homeParentAccounts.email,
      status: homeParentAccounts.status,
      emailVerifiedAt: homeParentAccounts.emailVerifiedAt,
      profileCount: count(homeChildProfiles.id),
      createdAt: homeParentAccounts.createdAt,
    })
    .from(homeParentAccounts)
    .leftJoin(homeChildProfiles, eq(homeChildProfiles.parentAccountId, homeParentAccounts.id))
    .groupBy(
      homeParentAccounts.id,
      homeParentAccounts.email,
      homeParentAccounts.status,
      homeParentAccounts.emailVerifiedAt,
      homeParentAccounts.createdAt,
    )
    .orderBy(desc(homeParentAccounts.createdAt), asc(homeParentAccounts.id))
    .limit(range.limit)
    .offset(range.offset)

  const [totals] = await db.select({ total: count() }).from(homeParentAccounts)

  return {
    parents: rows.map(row => ({
      email: row.email,
      status: row.status,
      emailVerified: row.emailVerifiedAt != null,
      profileCount: row.profileCount,
      createdAt: row.createdAt,
    })),
    total: totals?.total ?? 0,
  }
}
