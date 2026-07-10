import test from 'node:test'
import assert from 'node:assert/strict'

import {
  decideClaim, isUuid, parentMeView, validateProfileGrade, aggregateEntitlements,
  type ParentAccountRow,
} from './parent-validation.js'

// Чиста claim-логіка: потрійна перевірка (auth + токен + підтверджений email),
// fail-closed для чужого ліда, ідемпотентність для свого.

const account: ParentAccountRow = {
  id: 'acc-1',
  authUserId: 'auth-1',
  email: 'mama@example.com',
  emailVerifiedAt: new Date('2026-07-01T00:00:00Z'),
  status: 'active',
}

const lead = { id: 'lead-1', parentEmail: 'Mama@Example.com', parentAccountId: null }

test('успішний claim: токен чинний, email підтверджений і збігається (нормалізовано)', () => {
  const d = decideClaim({ account, tokenValid: true, lead })
  assert.deepEqual(d, { ok: true, alreadyClaimed: false })
})

test('невалідний токен → уніфікований 403 незалежно від існування ліда', () => {
  const withLead = decideClaim({ account, tokenValid: false, lead })
  const withoutLead = decideClaim({ account, tokenValid: false, lead: null })
  assert.equal(withLead.ok, false)
  assert.equal(withoutLead.ok, false)
  if (!withLead.ok && !withoutLead.ok) {
    assert.equal(withLead.code, 403)
    assert.equal(withoutLead.code, 403)
    assert.equal(withLead.error, withoutLead.error, 'повідомлення не має розкривати існування ліда')
  }
})

test('чинний токен, але лід видалено → 404', () => {
  const d = decideClaim({ account, tokenValid: true, lead: null })
  assert.equal(d.ok, false)
  if (!d.ok) assert.equal(d.code, 404)
})

test('непідтверджений email → 403, навіть якщо email збігається', () => {
  const d = decideClaim({ account: { ...account, emailVerifiedAt: null }, tokenValid: true, lead })
  assert.equal(d.ok, false)
  if (!d.ok) assert.equal(d.code, 403)
})

test('інший email → 403 без деталей', () => {
  const d = decideClaim({ account: { ...account, email: 'tato@example.com' }, tokenValid: true, lead })
  assert.equal(d.ok, false)
  if (!d.ok) {
    assert.equal(d.code, 403)
    assert.ok(!d.error.includes('email'), 'повідомлення не має підказувати, що саме не збіглося')
  }
})

test('неактивний акаунт → 403', () => {
  const d = decideClaim({ account: { ...account, status: 'disabled' }, tokenValid: true, lead })
  assert.equal(d.ok, false)
  if (!d.ok) assert.equal(d.code, 403)
})

test('лід уже належить іншому акаунту → 409 fail-closed', () => {
  const d = decideClaim({ account, tokenValid: true, lead: { ...lead, parentAccountId: 'acc-2' } })
  assert.equal(d.ok, false)
  if (!d.ok) assert.equal(d.code, 409)
})

test('повторний claim власного ліда — ідемпотентний', () => {
  const d = decideClaim({ account, tokenValid: true, lead: { ...lead, parentAccountId: 'acc-1' } })
  assert.deepEqual(d, { ok: true, alreadyClaimed: true })
})

test('isUuid: приймає v4, відкидає сміття до звернення в БД', () => {
  assert.equal(isUuid('00000000-0000-4000-8000-0000000000b1'), true)
  assert.equal(isUuid('not-a-uuid'), false)
  assert.equal(isUuid("'; DROP TABLE home_leads; --"), false)
  assert.equal(isUuid(42), false)
})

test('parentMeView: без акаунта — none; статус із БД', () => {
  assert.deepEqual(parentMeView(null), { status: 'none' })
  assert.deepEqual(parentMeView(account), { status: 'active', email: 'mama@example.com', emailVerified: true })
  assert.equal(parentMeView({ ...account, status: 'blocked' }).status, 'disabled')
})

test('validateProfileGrade: лише цілі 1..4', () => {
  assert.equal(validateProfileGrade(3), 3)
  for (const bad of [0, 5, 2.5, '2', null, undefined, NaN]) {
    assert.throws(() => validateProfileGrade(bad), /Клас має бути від 1 до 4/)
  }
})

test('aggregateEntitlements: активний доступ виграє, безстроковий — найкращий', () => {
  assert.deepEqual(aggregateEntitlements([]), { status: 'none', hasAccess: false, currentPeriodEnd: null })

  const active = { status: 'active', currentPeriodEnd: new Date('2026-08-01'), hasAccess: true }
  const expired = { status: 'expired', currentPeriodEnd: new Date('2026-06-01'), hasAccess: false }
  assert.equal(aggregateEntitlements([expired, active]).hasAccess, true)
  assert.equal(aggregateEntitlements([expired, active]).status, 'active')

  const unlimited = { status: 'active', currentPeriodEnd: null, hasAccess: true }
  assert.equal(aggregateEntitlements([active, unlimited]).currentPeriodEnd, null, 'null-період (безстроково) виграє')

  // Без активних — найпізніший статус, доступу немає
  const canceled = { status: 'canceled', currentPeriodEnd: new Date('2026-07-01'), hasAccess: false }
  const agg = aggregateEntitlements([expired, canceled])
  assert.equal(agg.hasAccess, false)
  assert.equal(agg.status, 'canceled')
})
