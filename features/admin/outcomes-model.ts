// Pure helpers for the admin "Результати навчання" tab (Lesson Engine outcome
// directory). DOM code lives in outcomes-tab.ts.

import type {
  AdminCurriculumOutcome,
  AdminFrameworkRef,
  CurriculumMappingStrength,
  CurriculumOutcomeInput,
  CurriculumOutcomeMapping,
  CurriculumOutcomeSource,
} from '../api/client.js'

export const OUTCOME_SOURCE_LABELS: Readonly<Record<CurriculumOutcomeSource, string>> = {
  'national-standard': 'Державний стандарт (НУШ)',
  program: 'Навчальна програма',
  international: 'Міжнародний (Cambridge тощо)',
  internal: 'Внутрішній',
}

/** Framework keys offered for mappings; any other short key is allowed too. */
export const OUTCOME_FRAMEWORK_SUGGESTIONS: readonly { framework: string; label: string }[] = [
  { framework: 'nush-ifo-2018', label: 'Держстандарт НУШ, чинна редакція — ІФО' },
  { framework: 'nush-ifo-2028', label: 'Держстандарт НУШ, нова редакція (з 2028) — ІФО' },
  { framework: 'cambridge-0059', label: 'Cambridge Primary Computing 0059' },
  { framework: 'cambridge-0072', label: 'Cambridge Primary Digital Literacy 0072' },
  { framework: 'program', label: 'Навчальна програма' },
]

export const MAPPING_STRENGTH_LABELS: Readonly<Record<CurriculumMappingStrength, string>> = {
  direct: 'пряма',
  partial: 'часткова',
  supporting: 'допоміжна',
}

export interface OutcomeFilter {
  packId: string
  status: '' | 'active' | 'archived'
  query: string
}

function normalize(text: string): string {
  return text.toLocaleLowerCase('uk').replace(/[’'`]/g, '’').trim()
}

/** Search matches the code, id, either title, the source reference and every mapping. */
export function filterOutcomes(outcomes: AdminCurriculumOutcome[], filter: OutcomeFilter): AdminCurriculumOutcome[] {
  const words = normalize(filter.query).split(/\s+/).filter(Boolean)
  return outcomes.filter(outcome => {
    if (filter.packId && outcome.subjectPackId !== filter.packId) return false
    if (filter.status && outcome.status !== filter.status) return false
    if (words.length === 0) return true
    const haystack = normalize([
      outcome.code, outcome.id, outcome.titleUk, outcome.titleEn ?? '', outcome.sourceRef ?? '',
      ...outcome.mappings.flatMap(m => [m.framework, m.ref]),
    ].join(' '))
    return words.every(word => haystack.includes(word))
  })
}

/** Editor form → API payload. Empty optional fields are left out. */
export function outcomeInputFromForm(form: {
  code: string
  titleUk: string
  titleEn: string
  source: CurriculumOutcomeSource
  sourceRef: string
  gradeBand: string
  mappings: { framework: string; ref: string; strength: CurriculumMappingStrength | '' }[]
}): CurriculumOutcomeInput {
  const input: CurriculumOutcomeInput = {
    code: form.code.trim(),
    title: { uk: form.titleUk.trim() },
    source: form.source,
    mappings: form.mappings
      .map(m => {
        const mapping: CurriculumOutcomeMapping = { framework: m.framework.trim(), ref: m.ref.trim() }
        if (m.strength) mapping.strength = m.strength
        return mapping
      })
      .filter(m => m.framework || m.ref),
  }
  if (form.titleEn.trim()) input.title.en = form.titleEn.trim()
  if (form.sourceRef.trim()) input.sourceRef = form.sourceRef.trim()
  if (form.gradeBand.trim()) input.gradeBand = form.gradeBand.trim()
  return input
}

const FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'Код',
  'title.uk': 'Формулювання',
  'title.en': 'Формулювання англійською',
  source: 'Джерело',
  sourceRef: 'Посилання на документ',
  gradeBand: 'Класи',
  mappings: 'Відповідності',
  subjectPackId: 'Предмет',
}

const MESSAGE_LABELS: Readonly<Record<string, string>> = {
  'must be a non-empty string': 'не може бути порожнім',
  'unknown field': 'невідоме поле',
  'is not a registered subject pack': 'такого предмета немає',
}

/** One readable line per server validation issue, e.g. «Відповідність 2 → код: не може бути порожнім». */
export function describeOutcomeIssue(issue: { path: string; message: string }): string {
  const mapping = /^mappings\[(\d+)\]\.(framework|ref|strength)$/.exec(issue.path)
  const part = mapping?.[2] === 'framework' ? 'рамка' : mapping?.[2] === 'ref' ? 'код' : 'сила'
  const field = mapping
    ? `Відповідність ${Number(mapping[1]) + 1} → ${part}`
    : FIELD_LABELS[issue.path] ?? issue.path
  const message = MESSAGE_LABELS[issue.message]
    ?? (/HTML|markup/i.test(issue.message) ? 'без HTML-розмітки' : issue.message)
  return `${field}: ${message}`
}

export function mappingSummary(outcome: Pick<AdminCurriculumOutcome, 'mappings'>): string {
  return outcome.mappings
    .map(m => `${m.framework} ${m.ref}${m.strength ? ` (${MAPPING_STRENGTH_LABELS[m.strength]})` : ''}`)
    .join(' · ')
}

// ── Framework catalogue (NUSH and Cambridge entries skills map to) ──────────

export const FRAMEWORK_TITLES: Readonly<Record<string, string>> = {
  'nush-ifo-2018': 'ІФО (НУШ, чинна редакція)',
  'cambridge-0059': 'Cambridge Computing 0059',
  'cambridge-0072': 'Cambridge Digital Literacy 0072',
}

export function frameworkTitle(framework: string): string {
  return FRAMEWORK_TITLES[framework] ?? framework
}

/** «1–2 класи» for a NUSH cycle, «Stage 2» for Cambridge. */
export function levelLabel(ref: Pick<AdminFrameworkRef, 'framework' | 'level'>): string {
  return ref.framework.startsWith('cambridge-') ? `Stage ${ref.level}` : `${ref.level.replace('-', '–')} класи`
}

export function refKey(framework: string, code: string): string {
  return `${framework}|${code}`
}

export interface RefCover {
  outcomeId: string
  code: string
  strength?: CurriculumMappingStrength
}

/** catalogue entry → the active skills that map to it (archived skills cover nothing). */
export function refCoverage(outcomes: readonly AdminCurriculumOutcome[]): Map<string, RefCover[]> {
  const coverage = new Map<string, RefCover[]>()
  for (const outcome of outcomes) {
    if (outcome.status !== 'active') continue
    for (const mapping of outcome.mappings) {
      const key = refKey(mapping.framework, mapping.ref)
      const list = coverage.get(key) ?? []
      list.push({ outcomeId: outcome.id, code: outcome.code, ...(mapping.strength ? { strength: mapping.strength } : {}) })
      coverage.set(key, list)
    }
  }
  return coverage
}

export interface RefFilter {
  framework: string
  level: string
  query: string
  uncoveredOnly: boolean
}

/** Search matches the code, the wording, the strand or group, and MON task examples. */
export function filterRefs(refs: readonly AdminFrameworkRef[], filter: RefFilter, coverage: Map<string, RefCover[]>): AdminFrameworkRef[] {
  const words = normalize(filter.query).split(/\s+/).filter(Boolean)
  return refs.filter(ref => {
    if (filter.framework && ref.framework !== filter.framework) return false
    if (filter.level && ref.level !== filter.level) return false
    if (filter.uncoveredOnly && coverage.has(refKey(ref.framework, ref.code))) return false
    if (words.length === 0) return true
    const haystack = normalize([ref.code, ref.title, ref.groupCode ?? '', ref.groupTitle ?? '', ...ref.examples].join(' '))
    return words.every(word => haystack.includes(word))
  })
}

/** Levels present in one framework, in catalogue order. */
export function refLevels(refs: readonly AdminFrameworkRef[], framework: string): string[] {
  return [...new Set(refs.filter(ref => ref.framework === framework).map(ref => ref.level))]
}

/** A new Rozumko skill drafted from a catalogue entry: the entry becomes a direct mapping. */
export function skillDraftFromRef(ref: Pick<AdminFrameworkRef, 'framework' | 'code' | 'level'>): { gradeBand: string; mappings: CurriculumOutcomeMapping[] } {
  return { gradeBand: ref.level, mappings: [{ framework: ref.framework, ref: ref.code, strength: 'direct' }] }
}
