import type { ScenarioItem } from './scenarios-data.js'
import type { SequenceSet } from './sequence-data.js'

const sequenceCache = new Map<string, SequenceSet[]>()
const scenarioCache = new Map<string, ScenarioItem[]>()
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function value(value: unknown, max: number): string {
  return typeof value === 'string' && value.trim().length <= max ? value.trim() : ''
}

export function normalizeSequencePack(raw: unknown, gameKey: string): SequenceSet[] | null {
  if (typeof raw !== 'object' || raw === null) return null
  const pack = raw as Record<string, unknown>
  if (pack.gameKey !== gameKey || !Number.isInteger(pack.version) || (pack.version as number) < 1
    || !Array.isArray(pack.sets) || pack.sets.length < 1 || pack.sets.length > 20) return null
  const ids = new Set<string>()
  const sets: SequenceSet[] = []
  for (const rawSet of pack.sets) {
    if (typeof rawSet !== 'object' || rawSet === null) return null
    const set = rawSet as Record<string, unknown>
    const id = value(set.id, 64); const title = value(set.title, 120)
    if (!SLUG_RE.test(id) || !title || ids.has(id) || !Array.isArray(set.steps) || set.steps.length < 3 || set.steps.length > 8) return null
    const steps = set.steps.map(step => value(step, 140))
    if (steps.some(step => !step) || new Set(steps.map(step => step.toLocaleLowerCase('uk-UA'))).size !== steps.length) return null
    ids.add(id); sets.push({ id, title, steps })
  }
  return sets
}

export function normalizeScenarioPack(raw: unknown, gameKey: string): ScenarioItem[] | null {
  if (typeof raw !== 'object' || raw === null) return null
  const pack = raw as Record<string, unknown>
  if (pack.gameKey !== gameKey || !Number.isInteger(pack.version) || (pack.version as number) < 1
    || !Array.isArray(pack.items) || pack.items.length < 1 || pack.items.length > 30) return null
  const ids = new Set<string>(); const items: ScenarioItem[] = []
  for (const rawItem of pack.items) {
    if (typeof rawItem !== 'object' || rawItem === null) return null
    const item = rawItem as Record<string, unknown>
    const id = value(item.id, 64); const emoji = value(item.emoji, 16); const text = value(item.text, 300)
    if (!SLUG_RE.test(id) || !emoji || !text || ids.has(id) || !Array.isArray(item.options)
      || item.options.length < 2 || item.options.length > 6) return null
    const options: ScenarioItem['options'] = []
    for (const rawOption of item.options) {
      if (typeof rawOption !== 'object' || rawOption === null) return null
      const option = rawOption as Record<string, unknown>
      const label = value(option.label, 180); const feedback = value(option.feedback, 240)
      if (!label || !feedback || typeof option.correct !== 'boolean') return null
      options.push({ label, feedback, correct: option.correct })
    }
    if (options.filter(option => option.correct).length !== 1) return null
    ids.add(id); items.push({ id, emoji, text, options })
  }
  return items
}

async function loadPack<T>(url: string, normalize: (raw: unknown) => T | null, fallback: T): Promise<T> {
  try {
    const response = await fetch(url)
    if (!response.ok) return fallback
    return normalize(await response.json()) ?? fallback
  } catch { return fallback }
}

export async function loadSequencePack(gameKey: string, fallback: SequenceSet[]): Promise<SequenceSet[]> {
  const cached = sequenceCache.get(gameKey)
  if (cached) return cached
  const sets = await loadPack(`/content-packs/sequence-${encodeURIComponent(gameKey)}.json`, raw => normalizeSequencePack(raw, gameKey), fallback)
  if (sets !== fallback) sequenceCache.set(gameKey, sets)
  return sets
}

export async function loadScenarioPack(gameKey: string, fallback: ScenarioItem[]): Promise<ScenarioItem[]> {
  const cached = scenarioCache.get(gameKey)
  if (cached) return cached
  const items = await loadPack(`/content-packs/scenario-${encodeURIComponent(gameKey)}.json`, raw => normalizeScenarioPack(raw, gameKey), fallback)
  if (items !== fallback) scenarioCache.set(gameKey, items)
  return items
}
