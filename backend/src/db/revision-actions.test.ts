import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// Regression: the bulk channels route wrote action 'channels' into
// question_revisions, but the editorial check constraint (0036) predated that
// route and never allowed it. Every add/remove died on the constraint, rolled
// the batch back and surfaced as a 500 in the admin. Constraint and code must
// be checked against each other, not assumed to agree.

const drizzleDir = fileURLToPath(new URL('../../drizzle/', import.meta.url))
const routesDir  = fileURLToPath(new URL('../routes/', import.meta.url))
const seedSource = readFileSync(new URL('./seed.ts', import.meta.url), 'utf8')

/** The action values the newest migration to define this constraint allows. */
function allowedActions(constraint: string): Set<string> {
  const migrations = readdirSync(drizzleDir).filter(name => name.endsWith('.sql')).sort()
  let allowed: Set<string> | null = null
  for (const name of migrations) {
    const sql = readFileSync(drizzleDir + name, 'utf8')
    const match = sql.match(new RegExp(`${constraint}[\\s\\S]{0,200}?CHECK \\(action IN \\(([^)]*)\\)\\)`))
    if (match) allowed = new Set([...match[1]!.matchAll(/'([a-z]+)'/g)].map(m => m[1]!))
  }
  assert.ok(allowed, `no migration defines ${constraint}`)
  return allowed
}

/** Every action string the code writes into the given revisions table. */
function writtenActions(table: string): Set<string> {
  const sources = readdirSync(routesDir)
    .filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map(name => readFileSync(routesDir + name, 'utf8'))
    .concat(seedSource)

  const written = new Set<string>()
  for (const source of sources) {
    for (const insert of source.matchAll(new RegExp(`insert\\(${table}\\)[\\s\\S]{0,400}?action: '([a-z]+)'`, 'g'))) {
      written.add(insert[1]!)
    }
  }
  return written
}

for (const [table, constraint] of Object.entries({
  questionRevisions:   'question_revisions_action_check',
  microLessonRevisions: 'micro_lesson_revisions_action_check',
  missionRevisions:    'mission_revisions_action_check',
})) {
  test(`${table}: every action the code writes is allowed by the constraint`, () => {
    const allowed = allowedActions(constraint)
    const written = writtenActions(table)
    assert.ok(written.size > 0, `no inserts found for ${table} — the scan is broken, not the code`)
    for (const action of written) {
      assert.ok(allowed.has(action), `action '${action}' is written but not allowed by ${constraint}`)
    }
  })
}

test('a bulk delivery change is audited under its own action', () => {
  const admin = readFileSync(new URL('../routes/admin.ts', import.meta.url), 'utf8')
  assert.match(admin, /action: 'channels'/)
  assert.ok(allowedActions('question_revisions_action_check').has('channels'))
})
