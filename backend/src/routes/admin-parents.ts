import { count, desc, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { homeChildProfiles, homeParentAccounts } from '../db/schema.js'

export interface AdminParentSummary {
  email: string
  status: string
  emailVerified: boolean
  profileCount: number
  createdAt: Date | null
}

/** Returns the minimum parent-account directory needed for operations. */
export async function listAdminParents(): Promise<AdminParentSummary[]> {
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
    .orderBy(desc(homeParentAccounts.createdAt))

  return rows.map(row => ({
    email: row.email,
    status: row.status,
    emailVerified: row.emailVerifiedAt != null,
    profileCount: row.profileCount,
    createdAt: row.createdAt,
  }))
}
