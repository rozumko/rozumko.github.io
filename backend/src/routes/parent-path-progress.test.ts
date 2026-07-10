import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableColumns } from 'drizzle-orm'

import { homePathEvents, homePathProgress } from '../db/schema.js'
import {
  HOME_PATH_CATALOG, hasPathPrerequisites, validatePathCompletion,
  type ClientPathActivityResult,
} from './parent-path-progress.js'

const result = (activityId: string, activityVersion = 1, completedAt = '2026-07-10T10:00:00.000Z'): ClientPathActivityResult => ({
  activityId,
  activityVersion,
  trust: 'client-unverified',
  stars: 2,
  correct: 4,
  total: 5,
  completedAt,
})

test('valid completion uses the backend catalog and produces a stable event key', () => {
  const body = {
    pathId: 'grade-2',
    pointId: 'g2-info-start',
    results: [result('path:g2-info-start:infosort')],
  }
  const first = validatePathCompletion(2, body)
  const second = validatePathCompletion(2, body)
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  if (first.ok && second.ok) {
    assert.equal(first.eventKey, second.eventKey)
    assert.equal(first.sessionStars, 2)
  }
})

test('multi-activity point requires the exact activity set and immutable versions', () => {
  const mission = result('path:g2-ct-algorithms:algorithms-mission')
  const puzzles = result('path:g2-ct-algorithms:algorithms-puzzles', 1, '2026-07-10T10:02:00.000Z')
  const valid = validatePathCompletion(2, {
    pathId: 'grade-2', pointId: 'g2-ct-algorithms', results: [puzzles, mission],
  })
  assert.equal(valid.ok, true)

  const missing = validatePathCompletion(2, {
    pathId: 'grade-2', pointId: 'g2-ct-algorithms', results: [mission],
  })
  assert.deepEqual(missing, { ok: false, error: 'Не всі обовʼязкові активності завершено' })

  const stale = validatePathCompletion(2, {
    pathId: 'grade-2', pointId: 'g2-ct-algorithms', results: [mission, { ...puzzles, activityVersion: 2 }],
  })
  assert.deepEqual(stale, { ok: false, error: 'Невідома активність або версія' })
})

test('grade, trust, score shape and client time fail closed', () => {
  const base = result('path:g2-info-start:infosort')
  assert.equal(validatePathCompletion(3, { pathId: 'grade-2', pointId: 'g2-info-start', results: [base] }).ok, false)
  assert.equal(validatePathCompletion(2, {
    pathId: 'grade-2', pointId: 'g2-info-start', results: [{ ...base, trust: 'server-verified' as never }],
  }).ok, false)
  assert.equal(validatePathCompletion(2, {
    pathId: 'grade-2', pointId: 'g2-info-start', results: [{ ...base, correct: 6 }],
  }).ok, false)
  assert.equal(validatePathCompletion(2, {
    pathId: 'grade-2', pointId: 'g2-info-start', results: [{ ...base, completedAt: '2099-01-01T00:00:00.000Z' }],
  }, new Date('2026-07-10T10:00:00.000Z')).ok, false)
})

test('unlock prerequisites require every predecessor', () => {
  const final = HOME_PATH_CATALOG['grade-2'].points['g2-final']
  assert.equal(hasPathPrerequisites(final, ['g2-ct-algorithms', 'g2-ai-perception']), false)
  assert.equal(hasPathPrerequisites(final, ['g2-ct-algorithms', 'g2-ai-perception', 'g2-digital-safety']), true)
})

test('0031 schema is idempotent, constrained, RLS-protected and journaled', () => {
  const progress = getTableColumns(homePathProgress)
  const events = getTableColumns(homePathEvents)
  assert.equal(progress.childProfileId.notNull, true)
  assert.equal(progress.bestStars.notNull, true)
  assert.equal(progress.attempts.notNull, true)
  assert.equal(events.eventKey.notNull, true)
  assert.equal(events.trust.notNull, true)

  const here = dirname(fileURLToPath(import.meta.url))
  const sql = readFileSync(join(here, '../../drizzle/0031_add_home_path_progress.sql'), 'utf8')
  const journal = readFileSync(join(here, '../../drizzle/meta/_journal.json'), 'utf8')
  assert.match(sql, /UNIQUE \(child_profile_id, path_id, point_id\)/)
  assert.match(sql, /UNIQUE \(child_profile_id, event_key\)/)
  assert.match(sql, /CHECK \(best_stars BETWEEN 0 AND 3\)/)
  assert.match(sql, /CHECK \(trust = 'client-unverified'\)/)
  assert.match(sql, /ALTER TABLE public\.home_path_progress ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /ALTER TABLE public\.home_path_events ENABLE ROW LEVEL SECURITY/)
  assert.match(journal, /"tag": "0031_add_home_path_progress"/)
})

test('backend path catalog stays aligned with the frontend point/activity ids', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const frontend = readFileSync(join(here, '../../../features/path/path-data.ts'), 'utf8')
  for (const path of Object.values(HOME_PATH_CATALOG)) {
    for (const [pointId, point] of Object.entries(path.points)) {
      assert.match(frontend, new RegExp(`id: '${pointId}'`), pointId)
      for (const [activityId, version] of Object.entries(point.requiredActivities)) {
        const stepId = activityId.slice(`path:${pointId}:`.length)
        assert.match(frontend, new RegExp(`id:\\s*'${stepId}',\\s*version:\\s*${version}`), activityId)
      }
    }
  }
})
