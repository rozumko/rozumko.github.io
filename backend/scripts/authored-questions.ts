// Shared loader/validator/shaper for authored question JSON (temp/authored).
// SINGLE source of truth for both validate-questions.ts and import-authored.ts,
// so the validator checks exactly what the importer writes. Uses the same server
// validation as the admin panel (validateQuestionShape + taxonomy.ts) — fail-closed.

import { readFileSync, readdirSync, statSync } from 'fs'
import { basename, join, resolve } from 'path'
import { validateQuestionShape, QUESTION_TYPES } from '../src/routes/question-input-validation.js'
import type { QuestionType } from '../src/routes/question-input-validation.js'
import {
  normalizeTopic,
  normalizeConceptKey,
  normalizeProgressionBand,
} from '../src/lib/taxonomy.js'
import type { NewQuestion, QuestionTrack, QuestionChannel } from '../src/db/schema.js'
import {
  getOlympiadDemoBlueprint,
  olympiadDemoBlueprintVersion,
} from '../src/lib/olympiad-demo-blueprints.js'

export const TRAINING_CHANNELS: QuestionChannel[] = ['class_game', 'path', 'olympiad_training']
export const OLYMPIAD_DEMO_CHANNELS: QuestionChannel[] = ['olympiad_training']
const TRACKS: QuestionTrack[] = ['informatics', 'computational-thinking', 'ai-basics']
const DIFFICULTIES = ['easy', 'medium', 'hard']

export interface AuthoredQuestion {
  type?: unknown; track?: unknown; topic?: unknown; conceptKey?: unknown
  grade?: unknown; difficulty?: unknown; progressionBand?: unknown
  q?: unknown; explanation?: unknown; img?: unknown; imageAlt?: unknown; code?: unknown
  options?: unknown; correct?: unknown
  given?: unknown; choices?: unknown; correctAnswers?: unknown
  items?: unknown; correctOrder?: unknown
  left?: unknown; right?: unknown; pairs?: unknown
  answer?: unknown; inputType?: unknown
  purpose?: unknown; slotId?: unknown; blueprintVersion?: unknown; templateId?: unknown
  variantLabel?: unknown; estimatedSeconds?: unknown; imageRole?: unknown
  imageSource?: unknown; imageLicense?: unknown; channels?: unknown; isOlympiad?: unknown
}

export interface LoadedQuestion { file: string; index: number; q: AuthoredQuestion }

/** Normalizes match options from either authoring form into the DB shape.
 *  Friendly form:  pairs: [{ left, right }, ...]  (aligned, no index juggling)
 *  Canonical form: left: [...], right: [...], pairs: [rightIndex, ...] */
function shapeMatch(m: AuthoredQuestion): unknown {
  const objectPairs = Array.isArray(m.pairs)
    && m.pairs.every(p => p && typeof p === 'object' && 'left' in p && 'right' in p)
  if (objectPairs) {
    const list = m.pairs as { left: unknown; right: unknown }[]
    return {
      left:  list.map(p => p.left),
      right: list.map(p => p.right),
      pairs: list.map((_, i) => i),
    }
  }
  return { left: m.left, right: m.right, pairs: m.pairs }
}

/** Builds the {options, correct} shape validateQuestionShape expects for a type. */
function shapeFor(m: AuthoredQuestion): { options: unknown; correct: number | null } {
  switch (m.type) {
    case 'choice':    return { options: m.options, correct: m.correct as number }
    case 'multi_select': return {
      options: { choices: m.choices ?? m.options, correctAnswers: m.correctAnswers },
      correct: null,
    }
    case 'truefalse': return { options: ['Так', 'Ні'], correct: m.correct as number }
    case 'sequence':  return { options: { given: m.given, choices: m.choices }, correct: m.correct as number }
    case 'sort':      return { options: { items: m.items, correctOrder: m.correctOrder }, correct: null }
    case 'match':     return { options: shapeMatch(m), correct: null }
    case 'input':     return { options: { answer: m.answer, inputType: m.inputType ?? 'text' }, correct: null }
    default:          return { options: undefined, correct: null }
  }
}

/** Returns a list of human-readable errors for one question (empty = valid). */
export function validateAuthored(file: string, index: number, q: AuthoredQuestion): string[] {
  const errs: string[] = []
  const at = `${basename(file)} [#${index}]`
  const push = (m: string) => errs.push(`${at}: ${m}`)

  const track = q.track as QuestionTrack
  if (!TRACKS.includes(track)) { push(`track має бути одним із ${TRACKS.join(' | ')}`); return errs }
  if (!QUESTION_TYPES.includes(q.type as QuestionType)) { push(`невідомий type «${String(q.type)}»`); return errs }
  if (q.type === 'choice' && (!Array.isArray(q.options) || q.options.length !== 4))
    push('choice must have exactly 4 answer options')
  if (q.type === 'multi_select') {
    const choices = Array.isArray(q.choices) ? q.choices : q.options
    if (!Array.isArray(choices) || choices.length !== 4)
      push('multi_select must have exactly 4 answer options')
  }
  if (typeof q.q !== 'string' || q.q.trim() === '') push('q обовʼязкове, непорожній рядок')
  if (typeof q.explanation !== 'string' || q.explanation.trim() === '') push('explanation обовʼязкове')
  if (!Number.isInteger(q.grade) || (q.grade as number) < 1 || (q.grade as number) > 4)
    push('grade має бути цілим 1..4')
  if (!DIFFICULTIES.includes(q.difficulty as string)) push(`difficulty має бути ${DIFFICULTIES.join(' | ')}`)
  for (const f of ['img', 'imageAlt', 'code'] as const)
    if (q[f] != null && typeof q[f] !== 'string') push(`${f} має бути рядком або null`)

  try { normalizeProgressionBand(q.progressionBand) } catch (e) { push((e as Error).message) }
  try { normalizeTopic(q.topic, track) } catch (e) { push((e as Error).message) }
  try {
    const ck = normalizeConceptKey(q.conceptKey)
    if (track === 'computational-thinking' && !ck)
      push('для computational-thinking conceptKey обовʼязковий і має дорівнювати topic')
    if (track === 'computational-thinking' && ck && ck !== q.topic)
      push('для computational-thinking conceptKey має дорівнювати topic')
  } catch (e) { push((e as Error).message) }

  try {
    const { options, correct } = shapeFor(q)
    validateQuestionShape(q.type as QuestionType, options, correct)
  } catch (e) { push((e as Error).message) }

  if (q.purpose === 'olympiad-demo') {
    const grade = q.grade as number
    const slot = Number.isInteger(grade)
      ? getOlympiadDemoBlueprint(grade).find(candidate => candidate.id === q.slotId)
      : undefined
    if (!slot) push(`slotId must identify one of the 12 slots for grade ${grade}`)
    if (q.blueprintVersion !== olympiadDemoBlueprintVersion(grade))
      push(`blueprintVersion must equal ${olympiadDemoBlueprintVersion(grade)}`)
    if (typeof q.templateId !== 'string' || !q.templateId.trim()) push('templateId is required for olympiad demo')
    if (!['A', 'B', 'C', 'D'].includes(String(q.variantLabel))) push('variantLabel must be A, B, C or D')
    if (!Number.isInteger(q.estimatedSeconds) || (q.estimatedSeconds as number) < 15 || (q.estimatedSeconds as number) > 300)
      push('estimatedSeconds must be an integer from 15 to 300')
    if (q.isOlympiad !== false) push('olympiad demo must set isOlympiad=false')
    if (!Array.isArray(q.channels) || q.channels.length !== 1 || q.channels[0] !== 'olympiad_training')
      push('olympiad demo channels must equal ["olympiad_training"]')
    if (q.imageRole != null && !['essential', 'supportive', 'decorative'].includes(String(q.imageRole)))
      push('imageRole must be essential, supportive or decorative')
    if (q.img && (!q.imageRole || !q.imageSource || !q.imageLicense))
      push('img requires imageRole, imageSource and imageLicense')
    if (!q.img && q.imageRole != null) push('imageRole requires img')
    if (slot && (
      slot.type !== q.type
      || slot.track !== q.track
      || slot.topic !== q.topic
      || slot.difficulty !== q.difficulty
      || slot.progressionBand !== q.progressionBand
    )) push(`question metadata does not match blueprint slot ${slot.id}`)
  } else if (q.purpose != null) {
    push(`unknown purpose "${String(q.purpose)}"`)
  }

  return errs
}

/** Maps a (pre-validated) authored question to a DB row. */
export function toNewQuestion(q: AuthoredQuestion, file: string): NewQuestion {
  const { options, correct } = shapeFor(q)
  const shape = validateQuestionShape(q.type as QuestionType, options, correct)
  const isDemo = q.purpose === 'olympiad-demo'
  return {
    q:               q.q as string,
    type:            q.type as QuestionType,
    options:         shape.options as NewQuestion['options'],
    correct:         shape.correct,
    explanation:     (q.explanation as string) ?? null,
    img:             (q.img as string | null) ?? null,
    imageAlt:        (q.imageAlt as string | null) ?? null,
    code:            (q.code as string | null) ?? null,
    difficulty:      q.difficulty as string,
    track:           q.track as QuestionTrack,
    topic:           (q.topic as string | null) ?? null,
    conceptKey:      (q.conceptKey as string | null) ?? null,
    progressionBand: q.progressionBand as NewQuestion['progressionBand'],
    grade:           q.grade as number,
    isOlympiad:      false,
    channels:        isDemo ? OLYMPIAD_DEMO_CHANNELS : TRAINING_CHANNELS,
    meta:            {
      source: 'authored',
      file: basename(file),
      ...(isDemo ? {
        purpose: q.purpose,
        slotId: q.slotId,
        blueprintVersion: q.blueprintVersion,
        templateId: q.templateId,
        variantLabel: q.variantLabel,
        estimatedSeconds: q.estimatedSeconds,
        ...(q.imageRole ? { imageRole: q.imageRole } : {}),
        ...(q.imageSource ? { imageSource: q.imageSource } : {}),
        ...(q.imageLicense ? { imageLicense: q.imageLicense } : {}),
      } : {}),
    },
  }
}

export function validateAuthoredDemoPackage(loaded: LoadedQuestion[]): string[] {
  const demo = loaded.filter(item => item.q.purpose === 'olympiad-demo')
  if (!demo.length) return []
  const errors: string[] = []
  const byGradeVariant = new Map<string, LoadedQuestion[]>()
  for (const item of demo) {
    const key = `${item.q.grade}:${item.q.variantLabel}`
    byGradeVariant.set(key, [...(byGradeVariant.get(key) ?? []), item])
  }
  for (const grade of [1, 2, 3, 4]) {
    const blueprint = getOlympiadDemoBlueprint(grade)
    for (const variant of ['A', 'B', 'C', 'D']) {
      const items = byGradeVariant.get(`${grade}:${variant}`) ?? []
      if (items.length !== blueprint.length) {
        errors.push(`grade ${grade}, variant ${variant}: expected 12 questions, found ${items.length}`)
        continue
      }
      const ids = items.map(item => item.q.slotId)
      if (new Set(ids).size !== blueprint.length || blueprint.some(slot => !ids.includes(slot.id))) {
        errors.push(`grade ${grade}, variant ${variant}: every blueprint slot must appear exactly once`)
      }
    }
  }
  const templateVariants = new Map<string, Set<unknown>>()
  for (const { q } of demo) {
    const key = `${q.grade}:${q.slotId}:${q.templateId}`
    const variants = templateVariants.get(key) ?? new Set()
    variants.add(q.variantLabel)
    templateVariants.set(key, variants)
  }
  for (const [key, variants] of templateVariants) {
    if (variants.size !== 4) errors.push(`${key}: expected four variants A-D, found ${variants.size}`)
  }
  return errors
}

/** Resolves a dir (all *.json except *.example.json) or a single file to paths.
 *  Directory scans skip templates; an explicit file path is always processed. */
export function collectFiles(arg: string): string[] {
  const p = resolve(process.cwd(), arg)
  const st = statSync(p)
  if (st.isDirectory()) {
    return readdirSync(p)
      .filter(f => f.endsWith('.json') && !f.endsWith('.example.json'))
      .sort()
      .map(f => join(p, f))
  }
  return [p]
}

/** Reads and parses files; returns questions plus any structural (parse) errors. */
export function loadFiles(targets: string[]): { loaded: LoadedQuestion[]; errors: string[] } {
  const loaded: LoadedQuestion[] = []
  const errors: string[] = []
  for (const file of targets.flatMap(collectFiles)) {
    let parsed: { questions?: unknown }
    try { parsed = JSON.parse(readFileSync(file, 'utf8')) }
    catch (e) { errors.push(`${basename(file)}: невалідний JSON: ${(e as Error).message}`); continue }
    if (!Array.isArray(parsed.questions)) { errors.push(`${basename(file)}: очікується { "questions": [...] }`); continue }
    parsed.questions.forEach((q, index) => loaded.push({ file, index, q: q as AuthoredQuestion }))
  }
  return { loaded, errors }
}
