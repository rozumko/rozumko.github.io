// Pure helpers for the admin "Результати навчання" tab (Lesson Engine outcome
// directory). DOM code lives in outcomes-tab.ts.

import type { AdminCurriculumOutcome, CurriculumOutcomeInput, CurriculumOutcomeSource } from '../api/client.js'

export const OUTCOME_SOURCE_LABELS: Readonly<Record<CurriculumOutcomeSource, string>> = {
  'national-standard': 'Державний стандарт (НУШ)',
  program: 'Навчальна програма',
  international: 'Міжнародний (Cambridge тощо)',
  internal: 'Внутрішній',
}

/** Framework keys offered for mappings; any other short key is allowed too. */
export const OUTCOME_FRAMEWORK_SUGGESTIONS: readonly { key: string; label: string }[] = [
  { key: 'nush', label: 'НУШ — очікуваний результат' },
  { key: 'cambridge', label: 'Cambridge — success criteria / learning objective' },
  { key: 'program', label: 'Навчальна програма' },
]

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
  mappings: { framework: string; ref: string }[]
}): CurriculumOutcomeInput {
  const input: CurriculumOutcomeInput = {
    code: form.code.trim(),
    title: { uk: form.titleUk.trim() },
    source: form.source,
    mappings: form.mappings
      .map(m => ({ framework: m.framework.trim(), ref: m.ref.trim() }))
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
  const mapping = /^mappings\[(\d+)\]\.(framework|ref)$/.exec(issue.path)
  const field = mapping
    ? `Відповідність ${Number(mapping[1]) + 1} → ${mapping[2] === 'framework' ? 'рамка' : 'код'}`
    : FIELD_LABELS[issue.path] ?? issue.path
  const message = MESSAGE_LABELS[issue.message]
    ?? (/HTML|markup/i.test(issue.message) ? 'без HTML-розмітки' : issue.message)
  return `${field}: ${message}`
}

export function mappingSummary(outcome: Pick<AdminCurriculumOutcome, 'mappings'>): string {
  return outcome.mappings.map(m => `${m.framework} ${m.ref}`).join(' · ')
}
