import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableColumns } from 'drizzle-orm'

import { homePathEvents, homePathProgress, pathMapRevisions, pathMaps } from '../db/schema.js'
import {
  hasPathPrerequisites, validatePathCompletion,
  type ClientPathActivityResult,
} from './parent-path-progress.js'
import { catalogFromPoints, type CatalogPath } from './path-catalog.js'

// Каталоги для тестів будуються з того самого seed, що і міграція 0033 —
// один канонічний файл замість дубля структури в коді тестів.
const HERE = dirname(fileURLToPath(import.meta.url))
const SEED_MAPS = JSON.parse(readFileSync(join(HERE, '../db/seed/path-maps.json'), 'utf8')) as
  Array<{ pathId: string; grade: number; title: string; version?: number; points: unknown[] }>
const CATALOGS: Record<string, CatalogPath> = Object.fromEntries(SEED_MAPS.map(map => {
  const catalog = catalogFromPoints(map.grade, map.points, map.version)
  assert.ok(catalog, `Seed-карта ${map.pathId} не проходить catalogFromPoints`)
  return [map.pathId, catalog]
}))

const result = (activityId: string, activityVersion = 1, completedAt = '2026-07-10T10:00:00.000Z'): ClientPathActivityResult => ({
  activityId,
  activityVersion,
  ...(activityId.endsWith(':theory') ? { contentVersion: 1 } : {}),
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
    results: [result('path:g2-info-start:theory', 2), result('path:g2-info-start:infosort')],
  }
  const first = validatePathCompletion(CATALOGS['grade-2'], 2, body)
  const second = validatePathCompletion(CATALOGS['grade-2'], 2, body)
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  if (first.ok && second.ok) {
    assert.equal(first.eventKey, second.eventKey)
    assert.equal(first.sessionStars, 2)
    assert.equal(first.pathVersion, 2)
  }
})

test('path revision participates in event identity', () => {
  const body = {
    pathId: 'grade-2', pathVersion: 4, pointId: 'g2-info-start',
    results: [result('path:g2-info-start:theory', 2), result('path:g2-info-start:infosort')],
  }
  const v4 = catalogFromPoints(2, SEED_MAPS.find(map => map.pathId === 'grade-2')!.points, 4)!
  const v5 = catalogFromPoints(2, SEED_MAPS.find(map => map.pathId === 'grade-2')!.points, 5)!
  const first = validatePathCompletion(v4, 2, body)
  const second = validatePathCompletion(v5, 2, { ...body, pathVersion: 5 })
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  if (first.ok && second.ok) assert.notEqual(first.eventKey, second.eventKey)
})

test('grade-1 path accepts its own start and keeps the final behind all branches', () => {
  const start = validatePathCompletion(CATALOGS['grade-1'], 1, {
    pathId: 'grade-1', pointId: 'g1-sort-start', results: [result('path:g1-sort-start:attributes')],
  })
  assert.equal(start.ok, true)
  assert.equal(validatePathCompletion(CATALOGS['grade-2'], 2, {
    pathId: 'grade-1', pointId: 'g1-sort-start', results: [result('path:g1-sort-start:attributes')],
  }).ok, false)

  const final = CATALOGS['grade-1'].points['g1-final']
  assert.equal(hasPathPrerequisites(final, ['g1-logic-bridge', 'g1-ai-intro']), false)
  assert.equal(hasPathPrerequisites(final, ['g1-logic-bridge', 'g1-ai-intro', 'g1-digital-safety']), true)
})

for (const sample of [
  { grade: 3, pathId: 'grade-3', pointId: 'g3-algorithms-start', activityId: 'path:g3-algorithms-start:algorithms-mission' },
  { grade: 4, pathId: 'grade-4', pointId: 'g4-safety-start', activityId: 'path:g4-safety-start:digital-safety-mission' },
]) {
  test(`grade-${sample.grade} path accepts only its own catalog`, () => {
    assert.equal(validatePathCompletion(CATALOGS[sample.pathId], sample.grade, {
      pathId: sample.pathId, pointId: sample.pointId, results: [result(sample.activityId)],
    }).ok, true)
    assert.equal(validatePathCompletion(CATALOGS[sample.pathId], sample.grade === 3 ? 4 : 3, {
      pathId: sample.pathId, pointId: sample.pointId, results: [result(sample.activityId)],
    }).ok, false)
  })
}

test('multi-activity point requires the exact activity set and immutable versions', () => {
  const theory = result('path:g2-ct-algorithms:theory', 2, '2026-07-10T09:58:00.000Z')
  const sequence = result('path:g2-ct-algorithms:algorithms-sequence', 1, '2026-07-10T10:02:00.000Z')
  const mission = result('path:g2-ct-algorithms:algorithms-mission')
  const valid = validatePathCompletion(CATALOGS['grade-2'], 2, {
    pathId: 'grade-2', pointId: 'g2-ct-algorithms', results: [sequence, theory, mission],
  })
  assert.equal(valid.ok, true)

  const missing = validatePathCompletion(CATALOGS['grade-2'], 2, {
    pathId: 'grade-2', pointId: 'g2-ct-algorithms', results: [theory, mission],
  })
  assert.deepEqual(missing, { ok: false, error: 'Не всі обовʼязкові активності завершено' })

  const stale = validatePathCompletion(CATALOGS['grade-2'], 2, {
    pathId: 'grade-2', pointId: 'g2-ct-algorithms', results: [theory, mission, { ...sequence, activityVersion: 2 }],
  })
  assert.deepEqual(stale, { ok: false, error: 'Невідома активність або версія' })
})

test('lesson completion records an explicit positive content version', () => {
  const theory = result('path:g2-info-start:theory', 2)
  const practice = result('path:g2-info-start:infosort')
  assert.equal(validatePathCompletion(CATALOGS['grade-2'], 2, {
    pathId: 'grade-2', pointId: 'g2-info-start', results: [theory, practice],
  }).ok, true)
  assert.deepEqual(validatePathCompletion(CATALOGS['grade-2'], 2, {
    pathId: 'grade-2', pointId: 'g2-info-start',
    results: [{ ...theory, contentVersion: undefined }, practice],
  }), { ok: false, error: 'Для уроку потрібна версія контенту' })
})

test('grade, trust, score shape and client time fail closed', () => {
  // Повний required-набір точки, щоб кожен кейс падав саме через свою мутацію.
  const theory = result('path:g2-info-start:theory', 2)
  const base = result('path:g2-info-start:infosort')
  assert.equal(validatePathCompletion(CATALOGS['grade-2'], 3, { pathId: 'grade-2', pointId: 'g2-info-start', results: [theory, base] }).ok, false)
  assert.equal(validatePathCompletion(CATALOGS['grade-2'], 2, {
    pathId: 'grade-2', pointId: 'g2-info-start', results: [theory, { ...base, trust: 'server-verified' as never }],
  }).ok, false)
  assert.equal(validatePathCompletion(CATALOGS['grade-2'], 2, {
    pathId: 'grade-2', pointId: 'g2-info-start', results: [theory, { ...base, correct: 6 }],
  }).ok, false)
  assert.equal(validatePathCompletion(CATALOGS['grade-2'], 2, {
    pathId: 'grade-2', pointId: 'g2-info-start', results: [theory, { ...base, completedAt: '2099-01-01T00:00:00.000Z' }],
  }, new Date('2026-07-10T10:00:00.000Z')).ok, false)
})

test('бонусні кроки: приймається підмножина, зірки — лише з required', () => {
  // Каталог з бонусним кроком будуємо з seed-точок + required:false крок.
  const map = SEED_MAPS.find(seedMap => seedMap.pathId === 'grade-2')!
  const points = JSON.parse(JSON.stringify(map.points)) as Array<Record<string, unknown>>
  const start = points.find(point => point.id === 'g2-info-start')!
  ;(start.activities as unknown[]).push({
    id: 'bonus-puzzles', version: 2, title: 'Бонус',
    activity: { kind: 'puzzles', count: 2 }, required: false,
  })
  const catalog = catalogFromPoints(2, points, map.version)
  assert.ok(catalog)
  assert.deepEqual(catalog.points['g2-info-start'].optionalActivities,
    { 'path:g2-info-start:bonus-puzzles': 2 })

  const theory = result('path:g2-info-start:theory', 2)
  const infosort = result('path:g2-info-start:infosort')
  const requiredOnly = validatePathCompletion(catalog, 2, {
    pathId: 'grade-2', pointId: 'g2-info-start', results: [theory, infosort],
  })
  assert.equal(requiredOnly.ok, true, 'без бонусу точка приймається')

  const withBonus = validatePathCompletion(catalog, 2, {
    pathId: 'grade-2', pointId: 'g2-info-start',
    results: [theory, infosort, { ...result('path:g2-info-start:bonus-puzzles', 2), stars: 0 }],
  })
  assert.equal(withBonus.ok, true, 'бонус у батчі приймається')
  // theory + infosort мають stars 2; бонус з 0 зірок НЕ знижує підсумок.
  if (withBonus.ok) assert.equal(withBonus.sessionStars, 2)

  const wrongVersion = validatePathCompletion(catalog, 2, {
    pathId: 'grade-2', pointId: 'g2-info-start',
    results: [theory, infosort, result('path:g2-info-start:bonus-puzzles', 1)],
  })
  assert.deepEqual(wrongVersion, { ok: false, error: 'Невідома активність або версія' })

  const unknownExtra = validatePathCompletion(catalog, 2, {
    pathId: 'grade-2', pointId: 'g2-info-start',
    results: [theory, infosort, result('path:g2-info-start:vygadka')],
  })
  assert.deepEqual(unknownExtra, { ok: false, error: 'Невідома активність або версія' })

  const bonusWithoutRequired = validatePathCompletion(catalog, 2, {
    pathId: 'grade-2', pointId: 'g2-info-start',
    results: [theory, result('path:g2-info-start:bonus-puzzles', 2)],
  })
  assert.deepEqual(bonusWithoutRequired, { ok: false, error: 'Не всі обовʼязкові активності завершено' })
})

test('unlock prerequisites require every predecessor', () => {
  const final = CATALOGS['grade-2'].points['g2-final']
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

test('0033 path_maps schema is constrained, RLS-protected, seeded and journaled', () => {
  const columns = getTableColumns(pathMaps)
  assert.equal(columns.grade.notNull, true)
  assert.equal(columns.points.notNull, true)
  assert.equal(columns.status.notNull, true)

  const here = dirname(fileURLToPath(import.meta.url))
  const sql = readFileSync(join(here, '../../drizzle/0033_add_path_maps.sql'), 'utf8')
  const journal = readFileSync(join(here, '../../drizzle/meta/_journal.json'), 'utf8')
  assert.match(sql, /CHECK \(status IN \('draft', 'published'\)\)/)
  assert.match(sql, /CHECK \(path_id ~ '\^grade-\[1-4\]\$'\)/)
  assert.match(sql, /ALTER TABLE public\.path_maps ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /INSERT INTO public\.path_maps \(path_id, grade, title, version, points\) VALUES/)
  assert.match(journal, /"tag": "0033_add_path_maps"/)
  // Seed ідемпотентний і містить всі чотири карти з канонічного файлу.
  assert.equal((sql.match(/ON CONFLICT \(path_id\) DO NOTHING/g) ?? []).length, 4)
  for (const map of SEED_MAPS) {
    assert.ok(sql.includes(`'${map.pathId}', ${map.grade}, `), `Seed не містить карту ${map.pathId}`)
    // INSERT у міграції — байт-у-байт JSON з seed-файлу (з екрануванням лапок).
    assert.ok(sql.includes(JSON.stringify(map.points).replace(/'/g, "''")),
      `points у міграції розійшлися з seed для ${map.pathId}`)
  }
})

test('0034 keeps immutable path revisions and records event path_version', () => {
  const revisions = getTableColumns(pathMapRevisions)
  const events = getTableColumns(homePathEvents)
  assert.equal(revisions.pathId.notNull, true)
  assert.equal(revisions.version.notNull, true)
  assert.equal(events.pathVersion.notNull, true)

  const here = dirname(fileURLToPath(import.meta.url))
  const sql = readFileSync(join(here, '../../drizzle/0034_add_path_map_revisions.sql'), 'utf8')
  const journal = readFileSync(join(here, '../../drizzle/meta/_journal.json'), 'utf8')
  assert.match(sql, /UNIQUE \(path_id, version\)/)
  assert.match(sql, /ALTER TABLE public\.path_map_revisions ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /ADD COLUMN path_version integer NOT NULL DEFAULT 1/)
  assert.match(journal, /"tag": "0034_add_path_map_revisions"/)
})

test('0035 seeds every canonical published lesson referenced by Grade 2', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const sql = readFileSync(join(here, '../../drizzle/0035_seed_micro_lessons.sql'), 'utf8')
  const journal = readFileSync(join(here, '../../drizzle/meta/_journal.json'), 'utf8')
  const grade2 = SEED_MAPS.find(map => map.pathId === 'grade-2')!
  const lessonIds = new Set<string>()
  for (const point of grade2.points as Array<{ activities?: Array<{ activity?: { kind?: string; lessonId?: string } }> }>) {
    for (const step of point.activities ?? []) {
      if (step.activity?.kind === 'lesson' && step.activity.lessonId) lessonIds.add(step.activity.lessonId)
    }
  }
  for (const lessonId of lessonIds) {
    assert.match(sql, new RegExp(`'${lessonId}'`))
  }
  assert.match(sql, /'published'/)
  assert.match(sql, /ON CONFLICT \(id\) DO NOTHING/)
  assert.match(journal, /"tag": "0035_seed_micro_lessons"/)
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

  for (const [pathId, path] of Object.entries(CATALOGS)) {
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
