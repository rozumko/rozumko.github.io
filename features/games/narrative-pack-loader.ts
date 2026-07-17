import type { ClickTrainerRound } from './click-trainer-data.js'
import type { FoCategory, FoStatement } from './fact-opinion-game.js'
import type { ScenarioItem } from './scenarios-data.js'
import type { SequenceSet } from './sequence-data.js'

const sequenceCache = new Map<string, SequenceSet[]>()
const scenarioCache = new Map<string, ScenarioItem[]>()
const factOpinionCache = new Map<string, FoStatement[]>()
const clickTrainerCache = new Map<string, ClickTrainerRound[]>()
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const FO_CATEGORIES: readonly FoCategory[] = ['fact', 'opinion', 'myth']

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

export function normalizeFactOpinionPack(raw: unknown, gameKey: string): FoStatement[] | null {
  if (typeof raw !== 'object' || raw === null) return null
  const pack = raw as Record<string, unknown>
  if (pack.gameKey !== gameKey || !Number.isInteger(pack.version) || (pack.version as number) < 1
    || !Array.isArray(pack.statements) || pack.statements.length < 10 || pack.statements.length > 120) return null
  const ids = new Set<string>()
  const byCategory = new Map<FoCategory, number>()
  const statements: FoStatement[] = []
  for (const rawStatement of pack.statements) {
    if (typeof rawStatement !== 'object' || rawStatement === null) return null
    const statement = rawStatement as Record<string, unknown>
    const id = value(statement.id, 64)
    const text = value(statement.text, 300)
    const explanation = value(statement.explanation, 400)
    if (!SLUG_RE.test(id) || ids.has(id) || !text || !explanation
      || !FO_CATEGORIES.includes(statement.category as FoCategory)) return null
    const category = statement.category as FoCategory
    ids.add(id)
    byCategory.set(category, (byCategory.get(category) ?? 0) + 1)
    const out: FoStatement = { id, category, text, explanation }
    const sourceTitle = value(statement.sourceTitle, 160)
    if (sourceTitle) out.sourceTitle = sourceTitle
    const sourceUrl = value(statement.sourceUrl, 500)
    if (sourceUrl) {
      let parsed: URL
      try { parsed = new URL(sourceUrl) } catch { return null }
      if (parsed.protocol !== 'https:' || !sourceTitle) return null
      out.sourceUrl = sourceUrl
    }
    if (statement.sourceLanguage === 'uk' || statement.sourceLanguage === 'en') out.sourceLanguage = statement.sourceLanguage
    statements.push(out)
  }
  if (byCategory.size < 2) return null
  for (const count of byCategory.values()) if (count < 3) return null
  return statements
}

export function normalizeClickTrainerPack(raw: unknown, gameKey: string): ClickTrainerRound[] | null {
  if (typeof raw !== 'object' || raw === null) return null
  const pack = raw as Record<string, unknown>
  if (pack.gameKey !== gameKey || !Number.isInteger(pack.version) || (pack.version as number) < 1
    || !Array.isArray(pack.rounds) || pack.rounds.length < 2 || pack.rounds.length > 12) return null
  const rounds: ClickTrainerRound[] = []
  for (const rawRound of pack.rounds) {
    if (typeof rawRound !== 'object' || rawRound === null) return null
    const round = rawRound as Record<string, unknown>
    const target = round.target as Record<string, unknown> | null
    const lead = value(round.lead, 200)
    if (!lead || typeof target !== 'object' || target === null) return null
    const targetLabel = value(target.label, 80)
    const targetEmoji = value(target.emoji, 16)
    if (!targetLabel || !targetEmoji || !Array.isArray(round.options)
      || round.options.length < 2 || round.options.length > 6) return null
    const options: ClickTrainerRound['options'] = []
    for (const rawOption of round.options) {
      if (typeof rawOption !== 'object' || rawOption === null) return null
      const option = rawOption as Record<string, unknown>
      const label = value(option.label, 80)
      const emoji = value(option.emoji, 16)
      const feedback = value(option.feedback, 240)
      if (!label || !emoji || !feedback || typeof option.correct !== 'boolean') return null
      options.push({ label, emoji, correct: option.correct, feedback })
    }
    if (options.filter(option => option.correct).length !== 1) return null
    rounds.push({ lead, target: { label: targetLabel, emoji: targetEmoji }, options })
  }
  return rounds
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

export async function loadFactOpinionPack(gameKey: string, fallback: FoStatement[]): Promise<FoStatement[]> {
  const cached = factOpinionCache.get(gameKey)
  if (cached) return cached
  const statements = await loadPack(`/content-packs/fact-opinion-${encodeURIComponent(gameKey)}.json`, raw => normalizeFactOpinionPack(raw, gameKey), fallback)
  if (statements !== fallback) factOpinionCache.set(gameKey, statements)
  return statements
}

export async function loadClickTrainerPack(gameKey: string, fallback: ClickTrainerRound[]): Promise<ClickTrainerRound[]> {
  const cached = clickTrainerCache.get(gameKey)
  if (cached) return cached
  const rounds = await loadPack(`/content-packs/click-trainer-${encodeURIComponent(gameKey)}.json`, raw => normalizeClickTrainerPack(raw, gameKey), fallback)
  if (rounds !== fallback) clickTrainerCache.set(gameKey, rounds)
  return rounds
}
