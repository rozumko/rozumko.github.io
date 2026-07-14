import { catalogFromPoints } from './path-catalog.js'

// Валідація карти шляху для адмін-редагування (fail-closed: автор бачить
// помилку в редакторі, дитина не бачить биту карту). Доповнює
// catalogFromPoints перевірками, які потрібні редактору, але не рантайму:
// ациклічність, рівно один старт, межі координат, шейпи активностей.

export interface PathActivityStepInput {
  id: string
  version: number
  title: string
  activity: Record<string, unknown> & { kind: string }
  required: boolean
}

export interface PathPointInput {
  id: string
  title: string
  icon: string
  access: 'free' | 'club'
  curriculum: Array<{ track: string; topic: string }>
  activities: PathActivityStepInput[]
  unlockAfter: string[]
  x: number
  y: number
}

const TRACKS = ['informatics', 'computational-thinking', 'ai-basics'] as const
const POINT_ID_RE = /^g[1-4]-[a-z0-9-]+$/
const STEP_ID_RE = /^[a-z0-9-]+$/
const MAX_POINTS = 20
const MAX_STEPS = 6

// Шейпи активностей: kind → обовʼязкові/опційні поля. Синхронно з
// PathActivity у features/path/path-data.ts (guard-тест звіряє kinds).
const ACTIVITY_KINDS: Record<string, (a: Record<string, unknown>) => string | null> = {
  lesson: a => {
    if (typeof a.lessonId !== 'string' || a.lessonId.length > 80 || !/^[a-z0-9-]+$/.test(a.lessonId)) {
      return 'lesson: невалідний lessonId'
    }
    if (a.lessonVersion !== undefined
      && (!Number.isInteger(a.lessonVersion) || (a.lessonVersion as number) < 1)) return 'lesson: невалідний lessonVersion'
    return null
  },
  sequence: a => optionalCount(a.count),
  scenarios: a => optionalCount(a.count),
  puzzles: a => optionalCount(a.count),
  sorting: a => ['attributes', 'infosort', 'multisort'].includes(a.game as string)
    ? null : 'sorting: невідома гра',
  'fact-opinion': a => a.level === 1 || a.level === 2 ? null : 'fact-opinion: level має бути 1 або 2',
  simulator: a => a.scenario === 'hardware' || a.scenario === 'software'
    ? null : 'simulator: невідомий сценарій',
  mission: a => {
    if (a.track !== undefined && !TRACKS.includes(a.track as never)) return 'mission: невідомий track'
    if (a.tracks !== undefined && (!Array.isArray(a.tracks) || !a.tracks.length
      || !a.tracks.every(track => TRACKS.includes(track as never)))) return 'mission: невідомі tracks'
    if (a.topic !== undefined && (typeof a.topic !== 'string' || !a.topic || a.topic.length > 120)) {
      return 'mission: невалідний topic'
    }
    return optionalCount(a.count)
  },
}

function optionalCount(value: unknown): string | null {
  if (value === undefined) return null
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 12
    ? null : 'count має бути цілим 1–12'
}

function fail(message: string): never {
  throw new Error(message)
}

function validateStep(raw: unknown, pointId: string, index: number): PathActivityStepInput {
  if (typeof raw !== 'object' || raw === null) fail(`${pointId}: крок ${index + 1} — невалідний формат`)
  const step = raw as Record<string, unknown>
  const id = typeof step.id === 'string' && step.id.length <= 80 && STEP_ID_RE.test(step.id) ? step.id : ''
  if (!id) fail(`${pointId}: крок ${index + 1} — невалідний id`)
  if (!Number.isInteger(step.version) || (step.version as number) < 1) {
    fail(`${pointId}/${id}: version має бути цілим ≥1`)
  }
  const title = typeof step.title === 'string' ? step.title.trim() : ''
  if (!title || title.length > 100) fail(`${pointId}/${id}: назва кроку обовʼязкова (≤100)`)
  if (typeof step.required !== 'boolean') fail(`${pointId}/${id}: required має бути boolean`)

  if (typeof step.activity !== 'object' || step.activity === null) fail(`${pointId}/${id}: немає activity`)
  const activity = step.activity as Record<string, unknown> & { kind: string }
  const checker = ACTIVITY_KINDS[activity.kind as string]
  if (!checker) fail(`${pointId}/${id}: невідомий kind активності «${String(activity.kind)}»`)
  const activityError = checker(activity)
  if (activityError) fail(`${pointId}/${id}: ${activityError}`)

  return { id, version: step.version as number, title, activity, required: step.required }
}

function validatePoint(raw: unknown, index: number): PathPointInput {
  if (typeof raw !== 'object' || raw === null) fail(`Точка ${index + 1}: невалідний формат`)
  const point = raw as Record<string, unknown>
  const id = typeof point.id === 'string' && point.id.length <= 80 && POINT_ID_RE.test(point.id) ? point.id : ''
  if (!id) fail(`Точка ${index + 1}: id має бути виду g2-slug`)
  const title = typeof point.title === 'string' ? point.title.trim() : ''
  if (!title || title.length > 120) fail(`${id}: назва обовʼязкова (≤120)`)
  const icon = typeof point.icon === 'string' ? point.icon.trim() : ''
  if (!icon || icon.length > 8) fail(`${id}: іконка обовʼязкова (емодзі)`)
  const access = point.access === undefined ? 'free' : point.access
  if (access !== 'free' && access !== 'club') fail(`${id}: access має бути free або club`)

  if (!Array.isArray(point.curriculum) || !point.curriculum.length) fail(`${id}: порожній curriculum`)
  const curriculum = point.curriculum.map((tag, tagIndex) => {
    if (typeof tag !== 'object' || tag === null) fail(`${id}: curriculum[${tagIndex}] невалідний`)
    const { track, topic } = tag as Record<string, unknown>
    if (!TRACKS.includes(track as never)) fail(`${id}: невідомий track «${String(track)}»`)
    if (typeof topic !== 'string' || !topic || topic.length > 120) fail(`${id}: порожній або задовгий topic`)
    return { track: track as string, topic }
  })

  if (!Array.isArray(point.activities) || !point.activities.length || point.activities.length > MAX_STEPS) {
    fail(`${id}: від 1 до ${MAX_STEPS} кроків`)
  }
  const activities = point.activities.map((step, stepIndex) => validateStep(step, id, stepIndex))
  if (new Set(activities.map(step => step.id)).size !== activities.length) {
    fail(`${id}: id кроків повторюються`)
  }
  if (!activities.some(step => step.required)) fail(`${id}: потрібен хоча б один обовʼязковий крок`)

  if (!Array.isArray(point.unlockAfter) || !point.unlockAfter.every(dep => typeof dep === 'string')) {
    fail(`${id}: невалідний unlockAfter`)
  }
  const x = point.x
  const y = point.y
  if (typeof x !== 'number' || typeof y !== 'number' || x < 0 || x > 100 || y < 0 || y > 100) {
    fail(`${id}: координати x/y мають бути в межах 0–100`)
  }

  return { id, title, icon, access, curriculum, activities, unlockAfter: point.unlockAfter as string[], x, y }
}

/** Повна валідація масиву точок карти; кидає Error з людським текстом. */
export function validatePathMapPoints(rawPoints: unknown): PathPointInput[] {
  if (!Array.isArray(rawPoints) || !rawPoints.length || rawPoints.length > MAX_POINTS) {
    fail(`Карта має містити від 1 до ${MAX_POINTS} точок`)
  }
  const points = rawPoints.map(validatePoint)

  const ids = new Set(points.map(point => point.id))
  if (ids.size !== points.length) fail('id точок повторюються')
  for (const point of points) {
    for (const dep of point.unlockAfter) {
      if (!ids.has(dep)) fail(`${point.id}: unlockAfter «${dep}» не існує на цій карті`)
    }
  }

  const starts = points.filter(point => point.unlockAfter.length === 0)
  if (starts.length !== 1) fail(`Карта мусить мати рівно одну стартову точку (зараз ${starts.length})`)

  // Ациклічність (алгоритм Кана).
  const inDegree = new Map(points.map(point => [point.id, point.unlockAfter.length]))
  const dependants = new Map<string, string[]>(points.map(point => [point.id, []]))
  for (const point of points) {
    for (const dep of point.unlockAfter) dependants.get(dep)!.push(point.id)
  }
  const queue = points.filter(point => point.unlockAfter.length === 0).map(point => point.id)
  let visited = 0
  while (queue.length) {
    const id = queue.pop()!
    visited++
    for (const next of dependants.get(id)!) {
      const degree = inDegree.get(next)! - 1
      inDegree.set(next, degree)
      if (degree === 0) queue.push(next)
    }
  }
  if (visited !== points.length) fail('Граф unlockAfter містить цикл')

  // Санітарна перевірка тим самим конвертером, що й рантайм-валідація.
  if (!catalogFromPoints(1, points)) fail('Карта не проходить рантайм-конвертацію каталогу')
  return points
}

/** Stable lesson references used by admin-save and export integrity checks. */
export function pathMapLessonIds(points: PathPointInput[]): string[] {
  const ids = new Set<string>()
  for (const point of points) {
    for (const step of point.activities) {
      if (step.activity.kind === 'lesson') ids.add(step.activity.lessonId as string)
    }
  }
  return [...ids].sort()
}

/**
 * Автопідняття version кроку при зміні його активності або required —
 * щоб дитячі результати інтерпретувались проти правильної редакції.
 * Порівняння за (pointId, stepId) з попередньою версією карти.
 */
export function bumpChangedStepVersions(
  prev: PathPointInput[],
  next: PathPointInput[],
  historicalVersions: ReadonlyMap<string, number> = new Map(),
): { points: PathPointInput[]; bumped: string[] } {
  const prevSteps = new Map<string, PathActivityStepInput>()
  for (const point of prev) {
    for (const step of point.activities) prevSteps.set(`${point.id}:${step.id}`, step)
  }

  const bumped: string[] = []
  const points = next.map(point => ({
    ...point,
    activities: point.activities.map(step => {
      const key = `${point.id}:${step.id}`
      const before = prevSteps.get(key)
      const historicalMax = historicalVersions.get(key) ?? 0
      if (!before) {
        const version = historicalMax > 0 ? historicalMax + 1 : 1
        if (historicalMax > 0) bumped.push(key)
        return { ...step, version }
      }
      const changed = JSON.stringify({ a: before.activity, r: before.required, t: before.title })
        !== JSON.stringify({ a: step.activity, r: step.required, t: step.title })
      if (!changed) return { ...step, version: before.version }
      bumped.push(key)
      return { ...step, version: Math.max(before.version, historicalMax) + 1 }
    }),
  }))
  return { points, bumped }
}
