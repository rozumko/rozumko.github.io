import type { QuestionTrack } from '../db/schema.js'
import { SIMULATOR_MECHANICS_CONTRACTS } from './simulator-contracts.js'

export const MISSION_EDITORIAL_STATUSES = ['draft', 'review', 'published', 'archived'] as const
export type MissionEditorialStatus = (typeof MISSION_EDITORIAL_STATUSES)[number]
export type MissionSetPurpose = 'practice' | 'apply' | 'confirm'
export type MissionSetVariant = 'a' | 'b' | 'default'

export interface MissionQuestionSet {
  id: string
  purpose: MissionSetPurpose
  variant: MissionSetVariant
  questionIds: string[]
}

export interface QuestionSetMissionConfig {
  topic?: string
  difficulty?: 'easy' | 'medium' | 'hard'
  questionSets: MissionQuestionSet[]
}

export interface NormalizedQuestionSetMissionInput {
  id: string
  title: string
  kind: 'question-set'
  track: QuestionTrack
  grade: number
  config: QuestionSetMissionConfig
}

export interface SortingContentBin { id: string; label: string }
export interface SortingContentItem { emoji: string; label?: string; bin: string }
export interface SortingContentLevel {
  instruction: string
  bins: SortingContentBin[]
  items: SortingContentItem[]
}
export interface SortingMissionConfig {
  gameKey: string
  topic?: string
  conceptKey?: string
  levels: SortingContentLevel[]
}
export interface NormalizedSortingMissionInput {
  id: string
  title: string
  kind: 'sorting-game'
  track: QuestionTrack
  grade: number
  config: SortingMissionConfig
}
export interface SequenceContentSet { id: string; title: string; steps: string[] }
export interface NormalizedSequenceMissionInput {
  id: string
  title: string
  kind: 'sequence-game'
  track: QuestionTrack
  grade: number
  config: { gameKey: string; topic?: string; sets: SequenceContentSet[] }
}
export interface ScenarioContentOption { label: string; correct: boolean; feedback: string }
export interface ScenarioContentItem { id: string; emoji: string; text: string; options: ScenarioContentOption[] }
export interface NormalizedScenarioMissionInput {
  id: string
  title: string
  kind: 'scenario-game'
  track: QuestionTrack
  grade: number
  config: { gameKey: string; topic?: string; items: ScenarioContentItem[] }
}
export interface SimulatorTextVariant { source: string; value: string }
export interface SimulatorTransitionContent { slot: string; labels: SimulatorTextVariant[]; target?: string }
export interface SimulatorNodeContent {
  id: string; icon: string; texts: SimulatorTextVariant[]; info?: string; transitions: SimulatorTransitionContent[]
}
export interface NormalizedSimulatorMissionInput {
  id: string
  title: string
  kind: 'simulator-game'
  track: QuestionTrack
  grade: number
  config: { scenarioKey: string; mechanicsVersion: number; topic?: string; nodes: SimulatorNodeContent[] }
}
export type NormalizedMissionInput = NormalizedQuestionSetMissionInput | NormalizedSortingMissionInput
  | NormalizedSequenceMissionInput | NormalizedScenarioMissionInput | NormalizedSimulatorMissionInput

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TRACKS = ['informatics', 'computational-thinking', 'ai-basics'] as const

function requiredString(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} — обовʼязкове поле`)
  const out = value.trim()
  if (out.length > max) throw new Error(`${field}: не більше ${max} символів`)
  return out
}

export function normalizeMissionStatus(raw: unknown): MissionEditorialStatus {
  if (typeof raw === 'string' && (MISSION_EDITORIAL_STATUSES as readonly string[]).includes(raw)) return raw as MissionEditorialStatus
  throw new Error('Невідомий статус місії')
}

export function normalizeMissionSlug(raw: unknown): string {
  const id = requiredString(raw, 'id місії', 80)
  if (!SLUG_RE.test(id)) throw new Error('id місії: лише малі латинські літери, цифри та дефіси')
  return id
}

export function normalizeQuestionSetConfig(raw: unknown): QuestionSetMissionConfig {
  if (typeof raw !== 'object' || raw === null) throw new Error('config має бути обʼєктом')
  const config = raw as Record<string, unknown>
  if (!Array.isArray(config.questionSets) || config.questionSets.length < 1 || config.questionSets.length > 8) {
    throw new Error('Місія має містити від 1 до 8 наборів питань')
  }
  const setIds = new Set<string>()
  const allQuestionIds = new Set<string>()
  const questionSets = config.questionSets.map((rawSet, index): MissionQuestionSet => {
    if (typeof rawSet !== 'object' || rawSet === null) throw new Error(`Набір ${index + 1}: невалідний формат`)
    const set = rawSet as Record<string, unknown>
    const id = requiredString(set.id, `Набір ${index + 1}: id`, 64)
    if (!SLUG_RE.test(id)) throw new Error(`Набір ${index + 1}: id має містити лише малі латинські літери, цифри й дефіси`)
    if (setIds.has(id)) throw new Error(`Набір «${id}» дублюється`)
    setIds.add(id)
    if (!['practice', 'apply', 'confirm'].includes(String(set.purpose))) throw new Error(`Набір «${id}»: невідома роль`)
    if (!['a', 'b', 'default'].includes(String(set.variant))) throw new Error(`Набір «${id}»: невідомий варіант`)
    const purpose = set.purpose as MissionSetPurpose
    const variant = set.variant as MissionSetVariant
    if (purpose !== 'practice' && variant === 'default') throw new Error(`Набір «${id}»: apply/confirm потребує варіант A або B`)
    if (!Array.isArray(set.questionIds) || set.questionIds.length < 1 || set.questionIds.length > 50) {
      throw new Error(`Набір «${id}» має містити від 1 до 50 питань`)
    }
    const questionIds = set.questionIds.map(value => {
      if (typeof value !== 'string' || !UUID_RE.test(value)) throw new Error(`Набір «${id}»: невалідний questionId`)
      if (allQuestionIds.has(value)) throw new Error(`Питання ${value} використане у кількох наборах`)
      allQuestionIds.add(value)
      return value
    })
    return { id, purpose, variant, questionIds }
  })

  const staged = questionSets.filter(set => set.purpose !== 'practice')
  for (const variant of ['a', 'b'] as const) {
    const apply = staged.filter(set => set.variant === variant && set.purpose === 'apply')
    const confirm = staged.filter(set => set.variant === variant && set.purpose === 'confirm')
    if (apply.length !== confirm.length) throw new Error(`Варіант ${variant.toUpperCase()} потребує парні apply і confirm набори`)
    if (apply.length > 1) throw new Error(`Варіант ${variant.toUpperCase()} може мати лише одну apply/confirm пару`)
    if (apply.length === 1 && apply[0].questionIds.length !== confirm[0].questionIds.length) {
      throw new Error(`Apply і confirm набори варіанта ${variant.toUpperCase()} мають містити однакову кількість питань`)
    }
  }

  const out: QuestionSetMissionConfig = { questionSets }
  if (config.topic !== undefined && config.topic !== null && config.topic !== '') out.topic = requiredString(config.topic, 'topic', 80)
  if (config.difficulty !== undefined && config.difficulty !== null && config.difficulty !== '') {
    if (!['easy', 'medium', 'hard'].includes(String(config.difficulty))) throw new Error('Невідома складність місії')
    out.difficulty = config.difficulty as QuestionSetMissionConfig['difficulty']
  }
  return out
}

export function normalizeSortingConfig(raw: unknown): SortingMissionConfig {
  if (typeof raw !== 'object' || raw === null) throw new Error('config має бути обʼєктом')
  const config = raw as Record<string, unknown>
  const gameKey = requiredString(config.gameKey, 'gameKey', 64)
  if (!SLUG_RE.test(gameKey)) throw new Error('gameKey: лише малі латинські літери, цифри та дефіси')
  if (!Array.isArray(config.levels) || config.levels.length < 1 || config.levels.length > 12) {
    throw new Error('Гра має містити від 1 до 12 рівнів')
  }
  const levels = config.levels.map((rawLevel, levelIndex): SortingContentLevel => {
    if (typeof rawLevel !== 'object' || rawLevel === null) throw new Error(`Рівень ${levelIndex + 1}: невалідний формат`)
    const level = rawLevel as Record<string, unknown>
    const instruction = requiredString(level.instruction, `Рівень ${levelIndex + 1}: інструкція`, 200)
    if (!Array.isArray(level.bins) || level.bins.length < 2 || level.bins.length > 6) {
      throw new Error(`Рівень ${levelIndex + 1}: потрібно від 2 до 6 кошиків`)
    }
    const binIds = new Set<string>()
    const bins = level.bins.map((rawBin, binIndex): SortingContentBin => {
      if (typeof rawBin !== 'object' || rawBin === null) throw new Error(`Рівень ${levelIndex + 1}, кошик ${binIndex + 1}: невалідний формат`)
      const bin = rawBin as Record<string, unknown>
      const id = requiredString(bin.id, `Рівень ${levelIndex + 1}, кошик ${binIndex + 1}: id`, 40)
      if (!SLUG_RE.test(id)) throw new Error(`Кошик «${id}»: невалідний id`)
      if (binIds.has(id)) throw new Error(`Рівень ${levelIndex + 1}: кошик «${id}» дублюється`)
      binIds.add(id)
      return { id, label: requiredString(bin.label, `Кошик «${id}»: назва`, 80) }
    })
    if (!Array.isArray(level.items) || level.items.length < 2 || level.items.length > 30) {
      throw new Error(`Рівень ${levelIndex + 1}: потрібно від 2 до 30 предметів`)
    }
    const usedBins = new Set<string>()
    const items = level.items.map((rawItem, itemIndex): SortingContentItem => {
      if (typeof rawItem !== 'object' || rawItem === null) throw new Error(`Рівень ${levelIndex + 1}, предмет ${itemIndex + 1}: невалідний формат`)
      const item = rawItem as Record<string, unknown>
      const emoji = requiredString(item.emoji, `Рівень ${levelIndex + 1}, предмет ${itemIndex + 1}: символ`, 16)
      const bin = requiredString(item.bin, `Рівень ${levelIndex + 1}, предмет ${itemIndex + 1}: кошик`, 40)
      if (!binIds.has(bin)) throw new Error(`Рівень ${levelIndex + 1}: предмет посилається на невідомий кошик «${bin}»`)
      usedBins.add(bin)
      const normalized: SortingContentItem = { emoji, bin }
      if (item.label !== undefined && item.label !== null && item.label !== '') {
        normalized.label = requiredString(item.label, `Рівень ${levelIndex + 1}, предмет ${itemIndex + 1}: підпис`, 80)
      }
      return normalized
    })
    if (usedBins.size !== binIds.size) throw new Error(`Рівень ${levelIndex + 1}: кожен кошик має отримати хоча б один предмет`)
    return { instruction, bins, items }
  })
  const out: SortingMissionConfig = { gameKey, levels }
  if (config.topic !== undefined && config.topic !== null && config.topic !== '') out.topic = requiredString(config.topic, 'topic', 80)
  if (config.conceptKey !== undefined && config.conceptKey !== null && config.conceptKey !== '') out.conceptKey = requiredString(config.conceptKey, 'conceptKey', 80)
  return out
}

function normalizeGameKey(value: unknown): string {
  const gameKey = requiredString(value, 'gameKey', 64)
  if (!SLUG_RE.test(gameKey)) throw new Error('gameKey: лише малі латинські літери, цифри та дефіси')
  return gameKey
}

export function normalizeSequenceConfig(raw: unknown): NormalizedSequenceMissionInput['config'] {
  if (typeof raw !== 'object' || raw === null) throw new Error('config має бути обʼєктом')
  const config = raw as Record<string, unknown>
  if (!Array.isArray(config.sets) || config.sets.length < 1 || config.sets.length > 20) throw new Error('Потрібно від 1 до 20 наборів кроків')
  const ids = new Set<string>()
  const sets = config.sets.map((rawSet, index): SequenceContentSet => {
    if (typeof rawSet !== 'object' || rawSet === null) throw new Error(`Набір ${index + 1}: невалідний формат`)
    const set = rawSet as Record<string, unknown>
    const id = requiredString(set.id, `Набір ${index + 1}: id`, 64)
    if (!SLUG_RE.test(id) || ids.has(id)) throw new Error(`Набір ${index + 1}: невалідний або повторний id`)
    ids.add(id)
    if (!Array.isArray(set.steps) || set.steps.length < 3 || set.steps.length > 8) throw new Error(`Набір «${id}» має містити від 3 до 8 кроків`)
    const steps = set.steps.map((step, stepIndex) => requiredString(step, `Набір «${id}», крок ${stepIndex + 1}`, 140))
    if (new Set(steps.map(step => step.toLocaleLowerCase('uk-UA'))).size !== steps.length) throw new Error(`Набір «${id}» містить повторні кроки`)
    return { id, title: requiredString(set.title, `Набір «${id}»: назва`, 120), steps }
  })
  const out: NormalizedSequenceMissionInput['config'] = { gameKey: normalizeGameKey(config.gameKey), sets }
  if (config.topic !== undefined && config.topic !== null && config.topic !== '') out.topic = requiredString(config.topic, 'topic', 80)
  return out
}

export function normalizeScenarioConfig(raw: unknown): NormalizedScenarioMissionInput['config'] {
  if (typeof raw !== 'object' || raw === null) throw new Error('config має бути обʼєктом')
  const config = raw as Record<string, unknown>
  if (!Array.isArray(config.items) || config.items.length < 1 || config.items.length > 30) throw new Error('Потрібно від 1 до 30 ситуацій')
  const ids = new Set<string>()
  const items = config.items.map((rawItem, index): ScenarioContentItem => {
    if (typeof rawItem !== 'object' || rawItem === null) throw new Error(`Ситуація ${index + 1}: невалідний формат`)
    const item = rawItem as Record<string, unknown>
    const id = requiredString(item.id, `Ситуація ${index + 1}: id`, 64)
    if (!SLUG_RE.test(id) || ids.has(id)) throw new Error(`Ситуація ${index + 1}: невалідний або повторний id`)
    ids.add(id)
    if (!Array.isArray(item.options) || item.options.length < 2 || item.options.length > 6) throw new Error(`Ситуація «${id}» має містити від 2 до 6 варіантів`)
    const options = item.options.map((rawOption, optionIndex): ScenarioContentOption => {
      if (typeof rawOption !== 'object' || rawOption === null) throw new Error(`Ситуація «${id}», варіант ${optionIndex + 1}: невалідний формат`)
      const option = rawOption as Record<string, unknown>
      if (typeof option.correct !== 'boolean') throw new Error(`Ситуація «${id}», варіант ${optionIndex + 1}: correct має бути boolean`)
      return {
        label: requiredString(option.label, `Ситуація «${id}», варіант ${optionIndex + 1}`, 180),
        correct: option.correct,
        feedback: requiredString(option.feedback, `Ситуація «${id}», фідбек ${optionIndex + 1}`, 240),
      }
    })
    if (options.filter(option => option.correct).length !== 1) throw new Error(`Ситуація «${id}» повинна мати рівно одну правильну відповідь`)
    return {
      id,
      emoji: requiredString(item.emoji, `Ситуація «${id}»: символ`, 16),
      text: requiredString(item.text, `Ситуація «${id}»: текст`, 300),
      options,
    }
  })
  const out: NormalizedScenarioMissionInput['config'] = { gameKey: normalizeGameKey(config.gameKey), items }
  if (config.topic !== undefined && config.topic !== null && config.topic !== '') out.topic = requiredString(config.topic, 'topic', 80)
  return out
}

function normalizeTextVariants(raw: unknown, field: string): SimulatorTextVariant[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 24) throw new Error(`${field}: потрібно від 1 до 24 текстових варіантів`)
  const sources = new Set<string>()
  return raw.map((rawVariant, index) => {
    if (typeof rawVariant !== 'object' || rawVariant === null) throw new Error(`${field}, варіант ${index + 1}: невалідний формат`)
    const variant = rawVariant as Record<string, unknown>
    const source = requiredString(variant.source, `${field}, source ${index + 1}`, 600)
    if (sources.has(source)) throw new Error(`${field}: повторний source`)
    sources.add(source)
    return { source, value: requiredString(variant.value, `${field}, текст ${index + 1}`, 600) }
  })
}

export function normalizeSimulatorConfig(raw: unknown): NormalizedSimulatorMissionInput['config'] {
  if (typeof raw !== 'object' || raw === null) throw new Error('config має бути обʼєктом')
  const config = raw as Record<string, unknown>
  const scenarioKey = requiredString(config.scenarioKey, 'scenarioKey', 80)
  const contract = SIMULATOR_MECHANICS_CONTRACTS[scenarioKey]
  if (!contract) throw new Error('Невідомий code-owned сценарій симулятора')
  if (config.mechanicsVersion !== contract.mechanicsVersion) throw new Error('Версія механіки симулятора не підтримується')
  if (!Array.isArray(config.nodes) || config.nodes.length !== Object.keys(contract.nodes).length) {
    throw new Error('Пакет має містити точний набір вузлів code-owned механіки')
  }
  const seenNodes = new Set<string>()
  const nodes = config.nodes.map((rawNode, index): SimulatorNodeContent => {
    if (typeof rawNode !== 'object' || rawNode === null) throw new Error(`Вузол ${index + 1}: невалідний формат`)
    const node = rawNode as Record<string, unknown>
    const id = requiredString(node.id, `Вузол ${index + 1}: id`, 80)
    const slots = contract.nodes[id]
    if (!slots || seenNodes.has(id)) throw new Error(`Невідомий або повторний вузол «${id}»`)
    seenNodes.add(id)
    if (!Array.isArray(node.transitions) || node.transitions.length !== Object.keys(slots).length) {
      throw new Error(`Вузол «${id}»: потрібен точний набір переходів механіки`)
    }
    const seenSlots = new Set<string>()
    const transitions = node.transitions.map((rawTransition, transitionIndex): SimulatorTransitionContent => {
      if (typeof rawTransition !== 'object' || rawTransition === null) throw new Error(`Вузол «${id}», перехід ${transitionIndex + 1}: невалідний формат`)
      const transition = rawTransition as Record<string, unknown>
      const slot = requiredString(transition.slot, `Вузол «${id}», slot`, 80)
      if (!(slot in slots) || seenSlots.has(slot)) throw new Error(`Вузол «${id}»: невідомий або повторний slot «${slot}»`)
      seenSlots.add(slot)
      const out: SimulatorTransitionContent = { slot, labels: normalizeTextVariants(transition.labels, `Вузол «${id}», перехід «${slot}»`) }
      if (transition.target !== undefined && transition.target !== null && transition.target !== '') {
        const target = requiredString(transition.target, `Вузол «${id}», target «${slot}»`, 80)
        if (!slots[slot].includes(target)) throw new Error(`Перехід «${id}.${slot}» не дозволяє target «${target}»`)
        out.target = target
      }
      return out
    })
    const out: SimulatorNodeContent = {
      id,
      icon: requiredString(node.icon, `Вузол «${id}»: символ`, 16),
      texts: normalizeTextVariants(node.texts, `Вузол «${id}», тексти`),
      transitions,
    }
    if (node.info !== undefined && node.info !== null && node.info !== '') out.info = requiredString(node.info, `Вузол «${id}»: довідка`, 600)
    return out
  })
  const out: NormalizedSimulatorMissionInput['config'] = { scenarioKey, mechanicsVersion: contract.mechanicsVersion, nodes }
  if (config.topic !== undefined && config.topic !== null && config.topic !== '') out.topic = requiredString(config.topic, 'topic', 80)
  return out
}

export function normalizeQuestionSetMission(raw: unknown): NormalizedQuestionSetMissionInput {
  if (typeof raw !== 'object' || raw === null) throw new Error('Невалідне тіло місії')
  const body = raw as Record<string, unknown>
  const id = normalizeMissionSlug(body.id)
  if (body.kind !== 'question-set') throw new Error('Цей редактор підтримує лише question-set місії')
  if (typeof body.track !== 'string' || !(TRACKS as readonly string[]).includes(body.track)) throw new Error('Невідомий напрям місії')
  if (!Number.isInteger(body.grade) || (body.grade as number) < 1 || (body.grade as number) > 4) throw new Error('Клас місії має бути від 1 до 4')
  return {
    id,
    title: requiredString(body.title, 'Назва місії', 200),
    kind: 'question-set',
    track: body.track as QuestionTrack,
    grade: body.grade as number,
    config: normalizeQuestionSetConfig(body.config),
  }
}

export function normalizeEditableMission(raw: unknown): NormalizedMissionInput {
  if (typeof raw !== 'object' || raw === null) throw new Error('Невалідне тіло місії')
  const body = raw as Record<string, unknown>
  if (body.kind === 'question-set') return normalizeQuestionSetMission(raw)
  if (!['sorting-game', 'sequence-game', 'scenario-game', 'simulator-game'].includes(String(body.kind))) {
    throw new Error('Цей редактор не підтримує цей тип місії')
  }
  const id = normalizeMissionSlug(body.id)
  if (typeof body.track !== 'string' || !(TRACKS as readonly string[]).includes(body.track)) throw new Error('Невідомий напрям місії')
  if (!Number.isInteger(body.grade) || (body.grade as number) < 1 || (body.grade as number) > 4) throw new Error('Клас місії має бути від 1 до 4')
  const common = {
    id,
    title: requiredString(body.title, 'Назва місії', 200),
    track: body.track as QuestionTrack,
    grade: body.grade as number,
  }
  if (body.kind === 'sorting-game') return { ...common, kind: 'sorting-game', config: normalizeSortingConfig(body.config) }
  if (body.kind === 'sequence-game') return { ...common, kind: 'sequence-game', config: normalizeSequenceConfig(body.config) }
  if (body.kind === 'scenario-game') return { ...common, kind: 'scenario-game', config: normalizeScenarioConfig(body.config) }
  return { ...common, kind: 'simulator-game', config: normalizeSimulatorConfig(body.config) }
}

export function missionSnapshot(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]))
}

export function missionPublishedSnapshot(input: NormalizedMissionInput, version: number): Record<string, unknown> {
  return { ...input, version }
}
