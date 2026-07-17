import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableColumns } from 'drizzle-orm'

import { homeParentAccounts, homeLeads, homeChildProfiles } from './schema.js'

// Test-first guard для зрізу «батьківські акаунти: лише схема» (міграція 0029).
// Runtime-авторизація НЕ вмикається цим зрізом: тест фіксує форму даних і
// fail-closed властивості, щоб наступні зрізи не могли непомітно їх послабити.
// Дизайн: docs/architecture.md «Parent account target model»,
// docs/security-model.md «Parent Accounts And Child Profiles».

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATION = '0029_add_home_parent_accounts'
const sqlPath = join(__dirname, `../../drizzle/${MIGRATION}.sql`)

test('home_parent_accounts: окрема ідентичність 1:1 із Supabase-користувачем', () => {
  const cols = getTableColumns(homeParentAccounts)
  assert.equal(cols.authUserId.notNull, true, 'auth_user_id має бути NOT NULL')
  assert.equal(cols.authUserId.isUnique, true, 'auth_user_id має бути UNIQUE (1:1 з auth-користувачем)')
  assert.equal(cols.email.notNull, true, 'email має бути NOT NULL')
  assert.equal(cols.email.isUnique, true, 'email має бути UNIQUE (нормалізується застосунком)')
  assert.equal(cols.emailVerifiedAt.notNull, false, 'email_verified_at — nullable до підтвердження')
  assert.equal(cols.status.notNull, true)
  assert.equal(cols.status.hasDefault, true, 'status має default (active)')
})

test('ownership-поля nullable: лід/профіль існують і без батьківського акаунта', () => {
  const leadCols = getTableColumns(homeLeads)
  const profileCols = getTableColumns(homeChildProfiles)
  assert.ok(leadCols.parentAccountId, 'home_leads.parent_account_id відсутній у схемі')
  assert.equal(leadCols.parentAccountId.notNull, false, 'home_leads.parent_account_id має бути nullable')
  assert.ok(leadCols.claimedAt, 'home_leads.claimed_at відсутній у схемі')
  assert.equal(leadCols.claimedAt.notNull, false)
  assert.ok(profileCols.parentAccountId, 'home_child_profiles.parent_account_id відсутній у схемі')
  assert.equal(profileCols.parentAccountId.notNull, false, 'home_child_profiles.parent_account_id має бути nullable')
  // 0030: lead_id став nullable (профіль може створити батько без ліда),
  // але fail-closed CHECK гарантує, що власник завжди є.
  assert.equal(profileCols.leadId.notNull, false, 'home_child_profiles.lead_id має бути nullable (0030)')
  const sql0030 = readFileSync(join(__dirname, '../../drizzle/0030_child_profiles_parent_owned.sql'), 'utf8')
  assert.match(sql0030, /ALTER COLUMN lead_id DROP NOT NULL/)
  assert.match(sql0030, /CHECK \(lead_id IS NOT NULL OR parent_account_id IS NOT NULL\)/,
    '0030 мусить мати ownership-CHECK: профіль без жодного власника заборонений')
})

test('міграція 0029: RLS увімкнено, FK fail-closed (ON DELETE RESTRICT)', () => {
  const sql = readFileSync(sqlPath, 'utf8')
  assert.match(sql, /CREATE TABLE public\.home_parent_accounts/, 'немає CREATE TABLE home_parent_accounts')
  assert.match(sql, /ALTER TABLE public\.home_parent_accounts ENABLE ROW LEVEL SECURITY/,
    'нова таблиця мусить мати RLS (політика deny-by-default, як у 0028)')
  assert.match(sql, /auth_user_id uuid NOT NULL UNIQUE/, 'auth_user_id має бути NOT NULL UNIQUE у SQL')
  // Nullable ownership: рядки ADD COLUMN не повинні містити NOT NULL.
  const addColumnLines = sql.split('\n').filter(l => l.includes('parent_account_id'))
  assert.ok(addColumnLines.length >= 2, 'мають бути parent_account_id для home_leads і home_child_profiles')
  for (const line of addColumnLines) {
    if (!line.trim().startsWith('ADD COLUMN') && !line.includes('ADD COLUMN')) continue
    assert.ok(!/NOT NULL/.test(line), `ownership-колонка мусить бути nullable: ${line.trim()}`)
    assert.match(line, /ON DELETE RESTRICT/,
      'видалення акаунта з профілями має падати fail-closed, поки немає документованої політики видалення')
  }
})

test('міграція 0029 зареєстрована в журналі після 0028', () => {
  const journal = JSON.parse(readFileSync(join(__dirname, '../../drizzle/meta/_journal.json'), 'utf8')) as {
    entries: Array<{ idx: number; when: number; tag: string }>
  }
  const prev = journal.entries.find(e => e.tag.startsWith('0028'))
  const entry = journal.entries.find(e => e.tag === MIGRATION)
  assert.ok(entry, 'журнал не містить 0029 — мігратор її не побачить')
  assert.ok(prev && entry!.when > prev.when, 'when 0029 має бути більшим за 0028 (мігратор порівнює за created_at)')
  assert.equal(entry!.idx, 29)
})

test('parent authorization stays isolated from teacher/admin app_users', () => {
  // Parent routes must not import app_users or the teacher/admin auth module;
  // crossing this boundary would mix separate identity domains.
  for (const file of ['../routes/parent.ts', '../lib/parent-auth.ts']) {
    const src = readFileSync(join(__dirname, file), 'utf8')
    assert.ok(!/appUsers/.test(src), `${file} не має торкатися app_users`)
    assert.ok(!/lib\/auth\.js/.test(src), `${file} не має використовувати teacher requireAuth`)
  }
})

test('lead-token не керує батьківською зоною: home.ts не пише в home_parent_accounts', () => {
  const src = readFileSync(join(__dirname, '../routes/home.ts'), 'utf8')
  assert.ok(!/homeParentAccounts/.test(src),
    'lead-token маршрути (home.ts) не мають читати чи писати батьківські акаунти')
})
