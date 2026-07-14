import type { GradePathMap, PathPoint } from './path-data.js'

// Завантаження карти шляху зі статичного бандла public/path/<pathId>.json
// (експорт з БД — npm run export:path; SW віддає network-first). Вбудована
// копія PATHS_BY_GRADE лишається фолбеком: перший офлайн-візит, битий бандл
// чи його відсутність не ламають карту. Бандл лише ОНОВЛЮЄ відомі класи;
// нові класи додаються кодом (фолбек мусить існувати).

function isValidPoint(raw: unknown): raw is PathPoint {
  if (typeof raw !== 'object' || raw === null) return false
  const point = raw as Record<string, unknown>
  return typeof point.id === 'string' && !!point.id
    && typeof point.title === 'string' && !!point.title
    && typeof point.icon === 'string'
    && (point.access === undefined || point.access === 'free' || point.access === 'club')
    && Array.isArray(point.curriculum) && point.curriculum.length > 0
    && Array.isArray(point.activities) && point.activities.length > 0
    && point.activities.every(step => {
      if (typeof step !== 'object' || step === null) return false
      const s = step as Record<string, unknown>
      return typeof s.id === 'string' && Number.isInteger(s.version)
        && typeof s.title === 'string' && typeof s.required === 'boolean'
        && typeof s.activity === 'object' && s.activity !== null
        && typeof (s.activity as Record<string, unknown>).kind === 'string'
    })
    && Array.isArray(point.unlockAfter) && point.unlockAfter.every(dep => typeof dep === 'string')
    && typeof point.x === 'number' && typeof point.y === 'number'
}

/** Pure-нормалізація бандла; null → карта непридатна, лишаємось на фолбеку. */
export function normalizeMapBundle(raw: unknown, grade: number): GradePathMap | null {
  if (typeof raw !== 'object' || raw === null) return null
  const bundle = raw as Record<string, unknown>
  if (bundle.grade !== grade) return null
  if (typeof bundle.title !== 'string' || !bundle.title) return null
  if (!Array.isArray(bundle.points) || !bundle.points.length) return null
  if (!bundle.points.every(isValidPoint)) return null

  const points = bundle.points as PathPoint[]
  const ids = new Set(points.map(point => point.id))
  if (ids.size !== points.length) return null
  if (!points.every(point => point.unlockAfter.every(dep => ids.has(dep)))) return null
  if (points.filter(point => point.unlockAfter.length === 0).length !== 1) return null
  if (!points.every(point => point.activities.some(step => step.required))) return null

  return { grade, title: bundle.title, points }
}

/**
 * Свіжа карта класу: бандл, якщо він валідний, інакше вбудований фолбек
 * (викликач передає PATHS_BY_GRADE[grade] — модуль лишається тестованим
 * листком без runtime-імпорту, див. коментар у activity-result.ts).
 * Ніколи не кидає — карта пригод не має падати через контент-конвеєр.
 */
export async function loadGradeMap(grade: number, fallback: GradePathMap | undefined): Promise<GradePathMap | undefined> {
  if (!fallback) return undefined
  try {
    const res = await fetch(`/path/grade-${grade}.json`)
    if (!res.ok) return fallback
    const fresh = normalizeMapBundle(await res.json(), grade)
    return fresh ?? fallback
  } catch {
    return fallback
  }
}
