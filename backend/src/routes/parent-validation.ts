import { normalizeParentEmail } from './home-validation.js'

// Батьківська зона — чисті рішення без I/O (unit-testable).
// Контракти: docs/security-model.md «Parent Accounts And Child Profiles»,
// docs/architecture.md «Parent account target model».

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(raw: unknown): raw is string {
  return typeof raw === 'string' && UUID_RE.test(raw)
}

export interface ParentAccountRow {
  id: string
  authUserId: string
  email: string
  emailVerifiedAt: Date | null
  status: string
}

/** Відповідь GET /api/parent/me: статус читається з БД, не з JWT. */
export function parentMeView(account: ParentAccountRow | null) {
  if (!account) return { status: 'none' as const }
  return {
    status: account.status === 'active' ? ('active' as const) : ('disabled' as const),
    email: account.email,
    emailVerified: account.emailVerifiedAt != null,
  }
}

// ── Профілі дітей ─────────────────────────────────────────────
// Максимум профілів на акаунт — анти-абʼюз (перший односімейний продукт).
export const MAX_PROFILES_PER_ACCOUNT = 6

export function validateProfileGrade(raw: unknown): number {
  const grade = typeof raw === 'number' ? raw : NaN
  if (!Number.isInteger(grade) || grade < 1 || grade > 4) {
    throw new Error('Клас має бути від 1 до 4')
  }
  return grade
}

// ── Entitlement акаунта ───────────────────────────────────────
// Підписка ще живе на рівні ліда (webhook не чіпаємо); акаунт бачить
// агрегат по своїх заклеймлених лідах: активний доступ виграє, інакше —
// найінформативніший статус. Рішення про доступ — hasHomeAccess (як у Club).
export interface EntitlementRow {
  status: string
  currentPeriodEnd: Date | null
  hasAccess: boolean
}

export function aggregateEntitlements(rows: EntitlementRow[]): { status: string; hasAccess: boolean; currentPeriodEnd: Date | null } {
  const active = rows.filter(r => r.hasAccess)
  if (active.length) {
    // Найпізніший період серед активних (null = безстроково — виграє).
    const best = active.reduce((a, b) => {
      if (a.currentPeriodEnd === null) return a
      if (b.currentPeriodEnd === null) return b
      return a.currentPeriodEnd >= b.currentPeriodEnd ? a : b
    })
    return { status: best.status, hasAccess: true, currentPeriodEnd: best.currentPeriodEnd }
  }
  if (!rows.length) return { status: 'none', hasAccess: false, currentPeriodEnd: null }
  const latest = rows.reduce((a, b) => {
    const at = a.currentPeriodEnd?.getTime() ?? 0
    const bt = b.currentPeriodEnd?.getTime() ?? 0
    return at >= bt ? a : b
  })
  return { status: latest.status, hasAccess: false, currentPeriodEnd: latest.currentPeriodEnd }
}

export type ClaimDecision =
  | { ok: true; alreadyClaimed: boolean }
  | { ok: false; code: 403 | 404 | 409; error: string }

/**
 * Потрійна перевірка claim (усі одночасно): parent auth (account),
 * чинний lead-token (tokenValid) і збіг ПІДТВЕРДЖЕНОГО email.
 * Порядок відмов не розкриває існування чужого ліда: невалідний токен →
 * уніфікований 403 незалежно від того, чи існує лід.
 */
export function decideClaim(input: {
  account: ParentAccountRow
  tokenValid: boolean
  lead: { id: string; parentEmail: string; parentAccountId: string | null } | null
}): ClaimDecision {
  const { account, tokenValid, lead } = input

  if (!tokenValid) {
    return { ok: false, code: 403, error: 'Невірні дані для привʼязки' }
  }
  if (!lead) {
    // Токен валідний лише для наявного UUID, тож сюди потрапляє тільки
    // видалений лід — існування не розкривається.
    return { ok: false, code: 404, error: 'Демо-запис не знайдено' }
  }
  if (account.status !== 'active') {
    return { ok: false, code: 403, error: 'Акаунт неактивний' }
  }
  if (!account.emailVerifiedAt) {
    return { ok: false, code: 403, error: 'Спершу підтвердіть email акаунта' }
  }
  if (normalizeParentEmail(account.email) !== normalizeParentEmail(lead.parentEmail)) {
    return { ok: false, code: 403, error: 'Невірні дані для привʼязки' }
  }
  if (lead.parentAccountId && lead.parentAccountId !== account.id) {
    // Fail-closed: лід уже належить іншому акаунту — нічого не переносимо.
    return { ok: false, code: 409, error: 'Цей демо-запис уже привʼязано до іншого акаунта' }
  }
  return { ok: true, alreadyClaimed: lead.parentAccountId === account.id }
}
