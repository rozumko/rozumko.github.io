import type { GradePathMap, PathPoint } from './path-data.js'

// Завантаження карти шляху зі статичного бандла public/path/<pathId>.json
// (експорт з БД — npm run export:path; SW віддає network-first). Вбудована
// копія PATHS_BY_GRADE лишається фолбеком: перший офлайн-візит, битий бандл
// чи його відсутність не ламають карту. Бандл лише ОНОВЛЮЄ відомі класи;
// нові класи додаються кодом (фолбек мусить існувати).

const TRACKS = new Set(['informatics', 'computational-thinking', 'ai-basics'])
const POINT_ID_RE = /^g[1-4]-[a-z0-9-]+$/
const STEP_ID_RE = /^[a-z0-9-]+$/

function validCount(value: unknown): boolean {
  return value === undefined || (Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 12)
}

function isValidActivity(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false
  const activity = raw as Record<string, unknown>
  switch (activity.kind) {
    case 'lesson':
      return typeof activity.lessonId === 'string' && activity.lessonId.length <= 80
        && /^[a-z0-9-]+$/.test(activity.lessonId)
        && (activity.lessonVersion === undefined
          || (Number.isInteger(activity.lessonVersion) && (activity.lessonVersion as number) >= 1))
    case 'sequence':
    case 'scenarios':
    case 'puzzles':
      return validCount(activity.count)
    case 'sorting':
      return ['attributes', 'infosort', 'multisort'].includes(activity.game as string)
    case 'fact-opinion':
      return activity.level === 1 || activity.level === 2
    case 'simulator':
      return activity.scenario === 'hardware' || activity.scenario === 'software'
    case 'mission':
      return validCount(activity.count)
        && (activity.track === undefined || TRACKS.has(activity.track as string))
        && (activity.tracks === undefined || (Array.isArray(activity.tracks)
          && activity.tracks.length > 0 && activity.tracks.every(track => TRACKS.has(track as string))))
        && (activity.topic === undefined || (typeof activity.topic === 'string' && !!activity.topic))
    default:
      return false
  }
}

function isValidPoint(raw: unknown, grade: number): raw is PathPoint {
  if (typeof raw !== 'object' || raw === null) return false
  const point = raw as Record<string, unknown>
  if (!(typeof point.id === 'string' && POINT_ID_RE.test(point.id) && point.id.startsWith(`g${grade}-`)
    && typeof point.title === 'string' && point.title.length > 0 && point.title.length <= 120
    && typeof point.icon === 'string' && point.icon.length > 0 && point.icon.length <= 8
    && (point.access === undefined || point.access === 'free' || point.access === 'club')
    && Array.isArray(point.curriculum) && point.curriculum.length > 0 && point.curriculum.every(tag => {
      if (typeof tag !== 'object' || tag === null) return false
      const value = tag as Record<string, unknown>
      return TRACKS.has(value.track as string) && typeof value.topic === 'string'
        && value.topic.length > 0 && value.topic.length <= 120
    })
    && Array.isArray(point.activities) && point.activities.length > 0 && point.activities.length <= 6
    && point.activities.every(step => {
      if (typeof step !== 'object' || step === null) return false
      const s = step as Record<string, unknown>
      return typeof s.id === 'string' && s.id.length <= 80 && STEP_ID_RE.test(s.id)
        && Number.isInteger(s.version) && (s.version as number) >= 1
        && typeof s.title === 'string' && s.title.length > 0 && s.title.length <= 100
        && typeof s.required === 'boolean'
        && isValidActivity(s.activity)
    })
    && Array.isArray(point.unlockAfter) && point.unlockAfter.every(dep => typeof dep === 'string')
    && typeof point.x === 'number' && point.x >= 0 && point.x <= 100
    && typeof point.y === 'number' && point.y >= 0 && point.y <= 100)) return false

  const activities = point.activities as Array<Record<string, unknown>>
  return new Set(activities.map(step => step.id)).size === activities.length
    && activities.some(step => step.required === true)
}

/** Pure-нормалізація бандла; null → карта непридатна, лишаємось на фолбеку. */
export function normalizeMapBundle(raw: unknown, grade: number): GradePathMap | null {
  if (typeof raw !== 'object' || raw === null) return null
  const bundle = raw as Record<string, unknown>
  if (bundle.grade !== grade) return null
  if (!Number.isInteger(bundle.version) || (bundle.version as number) < 1) return null
  if (typeof bundle.title !== 'string' || !bundle.title || bundle.title.length > 160) return null
  if (!Array.isArray(bundle.points) || !bundle.points.length || bundle.points.length > 20) return null
  if (!bundle.points.every(point => isValidPoint(point, grade))) return null

  const points = bundle.points as PathPoint[]
  const ids = new Set(points.map(point => point.id))
  if (ids.size !== points.length) return null
  if (!points.every(point => point.unlockAfter.every(dep => ids.has(dep)))) return null
  if (points.filter(point => point.unlockAfter.length === 0).length !== 1) return null
  const inDegree = new Map(points.map(point => [point.id, point.unlockAfter.length]))
  const dependants = new Map(points.map(point => [point.id, [] as string[]]))
  for (const point of points) {
    for (const dependency of point.unlockAfter) dependants.get(dependency)!.push(point.id)
  }
  const queue = points.filter(point => point.unlockAfter.length === 0).map(point => point.id)
  let visited = 0
  while (queue.length) {
    const id = queue.pop()!
    visited++
    for (const next of dependants.get(id)!) {
      const remaining = inDegree.get(next)! - 1
      inDegree.set(next, remaining)
      if (remaining === 0) queue.push(next)
    }
  }
  if (visited !== points.length) return null

  return { grade, version: bundle.version as number, title: bundle.title, points }
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
