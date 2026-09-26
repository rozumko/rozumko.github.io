// Builder operations keep the existing lesson schema, editorial API and run engine.
import type { CanvasItem } from '../lesson-engine/types.js'
import {
  convertToCanvas, isRecord, newBlock, nextInstanceId,
  type EditableBlock, type EditableLesson, type PackInfo,
} from './curriculum-model.js'
import { youtubeId, learningAppsId } from './curriculum-text.js'
import { safeMediaUrl } from '../lesson-engine/canvas-view.js'

export const BUILDER_KINDS = ['text', 'image', 'video', 'learningapps', 'pdf', 'html', 'link', 'activity', 'lesson'] as const
export type BuilderKind = typeof BUILDER_KINDS[number]
export const KIND_LABELS: Record<BuilderKind, string> = {
  text: 'Текст', image: 'Зображення', video: 'Відео', learningapps: 'LearningApps',
  pdf: 'PDF', html: 'HTML-код', link: 'Посилання', activity: 'Тест / активність', lesson: 'Урок',
}

export function blockTitle(block: EditableBlock): string {
  for (const key of ['heading', 'title', 'question', 'prompt', 'text']) {
    const value = block.content[key]
    if (isRecord(value) && typeof value.uk === 'string') return value.uk
  }
  return KIND_LABELS[blockKind(block)]
}

export function canvasItems(block: EditableBlock): CanvasItem[] {
  if (block.type !== 'canvas') return []
  for (const surface of ['board', 'student', 'teacher']) {
    const items = block.content[surface]
    if (Array.isArray(items) && items.length) return items as CanvasItem[]
  }
  return []
}

export function blockKind(block: EditableBlock): BuilderKind {
  if (block.activity) return 'activity'
  if (block.type === 'visual') return 'image'
  const item = canvasItems(block).find(item => !['paragraph', 'heading', 'list', 'table'].includes(item.type))
  if (!item) return 'text'
  if (item.type === 'file') return item.mime === 'application/pdf' ? 'pdf' : 'image'
  return ['image', 'video', 'learningapps', 'pdf', 'html', 'link'].includes(item.type) ? item.type as BuilderKind : 'text'
}

export function resourceItem(raw: string, requested?: BuilderKind, label = 'Матеріал'): CanvasItem {
  const url = safeMediaUrl(raw.trim())
  if (!url) throw new Error('Потрібна https-адреса або шлях на нашому сайті.')
  if (url.length > 500) throw new Error('Адреса має містити не більше 500 символів.')
  const videoId = youtubeId(url)
  const appId = learningAppsId(url)
  if (requested === 'video' || (!requested && videoId)) {
    if (!videoId) throw new Error('Вставте посилання на відео YouTube.')
    return { type: 'video', videoId }
  }
  if (requested === 'learningapps' || (!requested && appId)) {
    if (!appId) throw new Error('Вставте посилання на вправу LearningApps.')
    return { type: 'learningapps', appId }
  }
  if (requested === 'image' || (!requested && /\.(png|jpe?g|webp|gif|svg)(\?|#|$)/i.test(url))) return { type: 'image', src: url, alt: { uk: label } }
  if (requested === 'pdf' || (!requested && /\.pdf(\?|#|$)/i.test(url))) return { type: 'pdf', url, label: { uk: label } }
  return { type: 'link', url, label: { uk: label } }
}

export function makeMaterial(lesson: EditableLesson, pack: PackInfo, title: string, items: CanvasItem[], reserved: Iterable<string> = []): EditableBlock {
  const block = newBlock('canvas', lesson, pack, reserved)
  block.content = { heading: { uk: title }, teacher: structuredClone(items), board: structuredClone(items), student: [] }
  block.views.presentation = true
  block.views.remote = false
  block.presentation = { layout: 'concept' }
  return block
}

/** Copies all dependencies and assigns fresh stable IDs, including scored activities. */
export function appendSourceBlocks(target: EditableLesson, source: EditableLesson, blocks: EditableBlock[], pack: PackInfo, reserved: Iterable<string> = []): string[] {
  if (target.subjectPackId !== source.subjectPackId) throw new Error('Оберіть матеріал із того самого предмета.')
  if (target.blocks.length + blocks.length > 60) throw new Error('В одному уроці може бути не більше 60 карток.')
  // Duplication can pass the target as its source; freeze dependencies before appending.
  source = structuredClone(source)
  const added: string[] = []
  for (const original of blocks) {
    const copy = structuredClone(original)
    if (['objectives', 'vocabulary'].includes(copy.type)) convertToCanvas(copy, source)
    const fresh = newBlock(copy.type, target, pack, reserved)
    copy.id = fresh.id
    if (copy.activity) copy.activity.instanceId = nextInstanceId(target)
    const assetMap = new Map<string, string>()
    const referenced = new Set([copy.content.assetId, ...(copy.presentation?.assetIds ?? [])])
    for (const asset of (source.assets ?? []).filter(asset => referenced.has(asset.id))) {
      target.assets ??= []
      let n = target.assets.length + 1
      while (target.assets.some(a => a.id === `asset-${n}`)) n++
      const id = `asset-${n}`
      assetMap.set(asset.id, id)
      target.assets.push({ ...structuredClone(asset), id })
    }
    if (typeof copy.content.assetId === 'string') copy.content.assetId = assetMap.get(copy.content.assetId) ?? copy.content.assetId
    if (copy.presentation?.assetIds) copy.presentation.assetIds = copy.presentation.assetIds.map(id => assetMap.get(id) ?? id)
    const outcomeIds = new Set([...(copy.outcomeIds ?? []), ...(copy.activity?.outcomes ?? []).map(o => o.outcomeId)])
    for (const id of outcomeIds) {
      if (!target.learningOutcomes.some(o => o.outcomeId === id)) {
        const outcome = source.learningOutcomes.find(o => o.outcomeId === id)
        if (outcome) target.learningOutcomes.push(structuredClone(outcome))
      }
    }
    target.blocks.push(copy)
    added.push(copy.id)
  }
  return added
}

export function lessonSize(lesson: EditableLesson): number {
  return new TextEncoder().encode(JSON.stringify(lesson)).byteLength
}
