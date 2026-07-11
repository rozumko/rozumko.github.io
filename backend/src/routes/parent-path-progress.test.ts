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
    results: [result('path:g2-info-start:theory'), result('path:g2-info-start:infosort')],
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

test('grade-1 path accepts its own start and keeps the final behind all branches', () => {
  const start = validatePathCompletion(1, {
    pathId: 'grade-1', pointId: 'g1-sort-start', results: [result('path:g1-sort-start:attributes')],
  })
  assert.equal(start.ok, true)
  assert.equal(validatePathCompletion(2, {
    pathId: 'grade-1', pointId: 'g1-sort-start', results: [result('path:g1-sort-start:attributes')],
  }).ok, false)

  const final = HOME_PATH_CATALOG['grade-1'].points['g1-final']
  assert.equal(hasPathPrerequisites(final, ['g1-logic-bridge', 'g1-ai-intro']), false)
  assert.equal(hasPathPrerequisites(final, ['g1-logic-bridge', 'g1-ai-intro', 'g1-digital-safety']), true)
})

for (const sample of [
  { grade: 3, pathId: 'grade-3', pointId: 'g3-algorithms-start', activityId: 'path:g3-algorithms-start:algorithms-mission' },
  { grade: 4, pathId: 'grade-4', pointId: 'g4-safety-start', activityId: 'path:g4-safety-start:digital-safety-mission' },
]) {
  test(`grade-${sample.grade} path accepts only its own catalog`, () => {
    assert.equal(validatePathCompletion(sample.grade, {
      pathId: sample.pathId, pointId: sample.pointId, results: [result(sample.activityId)],
    }).ok, true)
    assert.equal(validatePathCompletion(sample.grade === 3 ? 4 : 3, {
      pathId: sample.pathId, pointId: sample.pointId, results: [result(sample.activityId)],
    }).ok, false)
  })
}

test('multi-activity point requires the exact activity set and immutable versions', () => {
  const theory = result('path:g2-ct-algorithms:theory', 1, '2026-07-10T09:58:00.000Z')
  const mission = result('path:g2-ct-algorithms:algorithms-mission')
  const puzzles = result('path:g2-ct-algorithms:algorithms-puzzles', 1, '2026-07-10T10:02:00.000Z')
  const valid = validatePathCompletion(2, {
    pathId: 'grade-2', pointId: 'g2-ct-algorithms', results: [puzzles, theory, mission],
  })
  assert.equal(valid.ok, true)

  const missing = validatePathCompletion(2, {
    pathId: 'grade-2', pointId: 'g2-ct-algorithms', results: [theory, mission],
  })
  assert.deepEqual(missing, { ok: false, error: 'Не всі обовʼязкові активності завершено' })

  const stale = validatePathCompletion(2, {
    pathId: 'grade-2', pointId: 'g2-ct-algorithms', results: [theory, mission, { ...puzzles, activityVersion: 2 }],
  })
  assert.deepEqual(stale, { ok: false, error: 'Невідома активність або версія' })
})

test('grade, trust, score shape and client time fail closed', () => {
  // Повний required-набір точки, щоб кожен кейс падав саме через свою мутацію.
  const theory = result('path:g2-info-start:theory')
  const base = result('path:g2-info-start:infosort')
  assert.equal(validatePathCompletion(3, { pathId: 'grade-2', pointId: 'g2-info-start', results: [theory, base] }).ok, false)
  assert.equal(validatePathCompletion(2, {
    pathId: 'grade-2', pointId: 'g2-info-start', results: [theory, { ...base, trust: 'server-verified' as never }],
  }).ok, false)
  assert.equal(validatePathCompletion(2, {
    pathId: 'grade-2', pointId: 'g2-info-start', results: [theory, { ...base, correct: 6 }],
  }).ok, false)
  assert.equal(validatePathCompletion(2, {
    pathId: 'grade-2', pointId: 'g2-info-start', results: [theory, { ...base, completedAt: '2099-01-01T00:00:00.000Z' }],
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

test('backend catalog structurally matches frontend points, activities and graph edges', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const frontend = readFileSync(join(here, '../../../features/path/path-data.ts'), 'utf8')

  function extractUnlockAfterForPoint(pointId: string): string[] {
    const idIdx = frontend.indexOf(`id: '${pointId}'`)
    if (idIdx === -1) return []
    const block = frontend.slice(idIdx, idIdx + 1400)
    const match = block.match(/unlockAfter:\s*\[([^\]]*)\]/)
    if (!match) return []
    const content = match[1].trim()
    if (!content) return []
    return content.split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean)
  }

  function extractActivitiesForPoint(pointId: string): Record<string, number> {
    const idIdx = frontend.indexOf(`id: '${pointId}'`)
    assert.notEqual(idIdx, -1, `Frontend point '${pointId}' is missing`)
    const unlockIdx = frontend.indexOf('unlockAfter:', idIdx)
    assert.notEqual(unlockIdx, -1, `Frontend point '${pointId}' has no unlockAfter`)
    const pointBlock = frontend.slice(idIdx, unlockIdx)
    return Object.fromEntries(
      [...pointBlock.matchAll(/id:\s*'([^']+)',\s*version:\s*(\d+)/g)]
        .map(match => [`path:${pointId}:${match[1]}`, Number(match[2])]),
    )
  }

  for (const [pathId, path] of Object.entries(HOME_PATH_CATALOG)) {
    for (const [pointId, point] of Object.entries(path.points)) {
      const frontendDeps = extractUnlockAfterForPoint(pointId)
      const backendDeps = [...point.unlockAfter].sort()
      const frontendDepsSorted = [...frontendDeps].sort()
      assert.deepEqual(
        frontendDepsSorted,
        backendDeps,
        `${pathId}/${pointId}: backend unlockAfter ${JSON.stringify(backendDeps)} ≠ frontend ${JSON.stringify(frontendDepsSorted)}`,
      )
      assert.deepEqual(
        extractActivitiesForPoint(pointId),
        point.requiredActivities,
        `${pathId}/${pointId}: required activity ids or versions differ`,
      )
    }
    const gradeNum = path.grade
    const pathBlockMatch = frontend.match(new RegExp(`grade: ${gradeNum},[\\s\\S]*?(?=export const (?:GRADE|PATHS_BY_GRADE)|$)`))
    assert.ok(pathBlockMatch, `Frontend grade-${gradeNum} path block is missing`)
    const frontendPointIds = [...pathBlockMatch[0].matchAll(/id: '(g\d+-[^']+)'/g)].map(match => match[1]).sort()
    assert.deepEqual(
      frontendPointIds,
      Object.keys(path.points).sort(),
      `${pathId}: frontend and backend point ids differ`,
    )
  }
})
