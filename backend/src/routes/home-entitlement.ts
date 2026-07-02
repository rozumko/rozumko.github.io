import { eq } from 'drizzle-orm'
import type { db as DbType } from '../db/index.js'
import { homeEntitlements, homeEntitlementEvents } from '../db/schema.js'

// Home entitlement (зріз 5, без платіжного провайдера). Бекенд — єдине
// джерело рішення про доступ. Entitlement відкриває контент, але НІКОЛИ не
// впливає на ключі, скоринг чи збережені відповіді (docs/security-model.md).
// Webhook-и провайдера підключаються окремим зрізом поверх цієї моделі.

export const ENTITLEMENT_STATUSES = ['active', 'past_due', 'canceled', 'expired', 'revoked'] as const
export type EntitlementStatus = typeof ENTITLEMENT_STATUSES[number]

/** Пільговий період для past_due: платіж не пройшов, але доступ ще діє. */
export const PAST_DUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000

export function normalizeEntitlementStatus(raw: unknown): EntitlementStatus {
  if (typeof raw === 'string' && (ENTITLEMENT_STATUSES as readonly string[]).includes(raw)) {
    return raw as EntitlementStatus
  }
  throw new Error('Невідомий статус доступу')
}

/** Статуси, для яких межа періоду обовʼязкова — без неї доступ не рахується. */
export function requiresPeriodEnd(status: EntitlementStatus): boolean {
  return status === 'active' || status === 'past_due' || status === 'canceled'
}

/**
 * Єдина точка рішення про доступ. Fail closed: без дати кінця періоду
 * доступу немає навіть для active.
 *   active   — до кінця оплаченого періоду;
 *   past_due — платіж не пройшов, доступ до кінця періоду + grace;
 *   canceled — автопродовження вимкнено, доступ до кінця періоду;
 *   expired  — період минув, доступу немає;
 *   revoked  — відкликано (фрод/повернення), доступу немає одразу.
 */
export function hasHomeAccess(
  status: EntitlementStatus,
  currentPeriodEnd: Date | null,
  now: Date = new Date(),
): boolean {
  if (status === 'expired' || status === 'revoked') return false
  if (!currentPeriodEnd) return false
  const end = currentPeriodEnd.getTime()
  if (status === 'active' || status === 'canceled') return now.getTime() < end
  if (status === 'past_due') return now.getTime() < end + PAST_DUE_GRACE_MS
  return false
}

export interface EntitlementChange {
  status: EntitlementStatus
  currentPeriodEnd: Date | null
  reason: string | null
}

/**
 * Upsert entitlement-у ліда + audit-подія. Actor фіксується в події:
 * 'admin' (ручне керування) сьогодні, 'provider' — коли зʼявляться webhook-и.
 * Логіка винесена з роуту, щоб тестуватись без мокання requireAdmin.
 */
export async function applyEntitlementChange(
  db: typeof DbType,
  leadId: string,
  change: EntitlementChange,
  actor: 'admin' | 'provider',
): Promise<{ id: string; status: EntitlementStatus; currentPeriodEnd: Date | null }> {
  if (requiresPeriodEnd(change.status) && !change.currentPeriodEnd) {
    throw new Error(`Статус ${change.status} потребує дати кінця періоду`)
  }

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: homeEntitlements.id, status: homeEntitlements.status })
      .from(homeEntitlements)
      .where(eq(homeEntitlements.leadId, leadId))
      .limit(1)

    let row: { id: string }
    if (existing) {
      const [updated] = await tx.update(homeEntitlements)
        .set({ status: change.status, currentPeriodEnd: change.currentPeriodEnd, updatedAt: new Date() })
        .where(eq(homeEntitlements.id, existing.id))
        .returning({ id: homeEntitlements.id })
      row = updated
    } else {
      const [inserted] = await tx.insert(homeEntitlements)
        .values({ leadId, status: change.status, currentPeriodEnd: change.currentPeriodEnd })
        .returning({ id: homeEntitlements.id })
      row = inserted
    }

    await tx.insert(homeEntitlementEvents).values({
      entitlementId: row.id,
      actor,
      fromStatus: existing?.status ?? null,
      toStatus: change.status,
      reason: change.reason,
    })

    return { id: row.id, status: change.status, currentPeriodEnd: change.currentPeriodEnd }
  })
}
