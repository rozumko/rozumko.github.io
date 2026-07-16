import type { SortingLevel } from './sorting-data.js'

const cache = new Map<string, SortingLevel[]>()
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function text(value: unknown, max: number): string {
  return typeof value === 'string' && value.trim().length <= max ? value.trim() : ''
}

/** Fail-closed normalization for administrator-published sorting packs. */
export function normalizeSortingPack(raw: unknown, gameKey: string): SortingLevel[] | null {
  if (typeof raw !== 'object' || raw === null) return null
  const pack = raw as Record<string, unknown>
  if (pack.gameKey !== gameKey || !Number.isInteger(pack.version) || (pack.version as number) < 1) return null
  if (!Array.isArray(pack.levels) || pack.levels.length < 1 || pack.levels.length > 12) return null
  const levels: SortingLevel[] = []
  for (const rawLevel of pack.levels) {
    if (typeof rawLevel !== 'object' || rawLevel === null) return null
    const level = rawLevel as Record<string, unknown>
    const instruction = text(level.instruction, 200)
    if (!instruction || !Array.isArray(level.bins) || level.bins.length < 2 || level.bins.length > 6) return null
    const ids = new Set<string>()
    const bins = [] as SortingLevel['bins']
    for (const rawBin of level.bins) {
      if (typeof rawBin !== 'object' || rawBin === null) return null
      const bin = rawBin as Record<string, unknown>
      const id = text(bin.id, 40)
      const label = text(bin.label, 80)
      if (!SLUG_RE.test(id) || !label || ids.has(id)) return null
      ids.add(id); bins.push({ id, label })
    }
    if (!Array.isArray(level.items) || level.items.length < 2 || level.items.length > 30) return null
    const used = new Set<string>()
    const items = [] as SortingLevel['items']
    for (const rawItem of level.items) {
      if (typeof rawItem !== 'object' || rawItem === null) return null
      const item = rawItem as Record<string, unknown>
      const emoji = text(item.emoji, 16)
      const bin = text(item.bin, 40)
      const label = text(item.label, 80)
      if (!emoji || !ids.has(bin)) return null
      used.add(bin); items.push({ emoji, bin, ...(label ? { label } : {}) })
    }
    if (used.size !== ids.size) return null
    levels.push({ instruction, bins, items })
  }
  return levels
}

export async function loadSortingPack(gameKey: string, fallback: SortingLevel[]): Promise<SortingLevel[]> {
  const cached = cache.get(gameKey)
  if (cached) return cached
  try {
    const response = await fetch(`/content-packs/sorting-${encodeURIComponent(gameKey)}.json`)
    if (!response.ok) return fallback
    const levels = normalizeSortingPack(await response.json(), gameKey)
    if (!levels) return fallback
    cache.set(gameKey, levels)
    return levels
  } catch {
    return fallback
  }
}
