// Teacher document view: the whole lesson as a methodical plan — content,
// timing, modality, teacher notes and speaker hints. Built from the same
// display-safe definition as the board; nothing here is a separate copy.

import { activityLabel, activityLevelLabel } from '../activities/registry.js'
import { appendRichText, richElement } from './rich-text.js'
import { renderPracticeContent } from './practice-view.js'
import { renderCanvasItems } from './canvas-view.js'
import {
  BLOCK_TYPE_LABELS,
  MECHANIC_LABELS,
  MODALITY_LABELS,
  TELEMETRY_LABELS,
  documentBlocks,
  findAsset,
  lessonMetaLine,
} from './projection.js'
import type { ActivityView, CanvasItem, LessonBlock, LessonDefinition, LocalizedText, StudentPracticeMaterial } from './types.js'

const OPTION_LETTERS = 'АБВГҐД'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function isLocalized(value: unknown): value is LocalizedText {
  return typeof value === 'object' && value !== null && typeof (value as LocalizedText).uk === 'string'
}

function localizedList(value: unknown): LocalizedText[] {
  return Array.isArray(value) ? value.filter(isLocalized) : []
}

function richList(items: LocalizedText[], className: string, ordered = false): HTMLElement {
  const list = el(ordered ? 'ol' : 'ul', className)
  for (const item of items) list.append(richElement('li', item.uk))
  return list
}

function bilingual(text: LocalizedText, className: string): HTMLElement {
  const wrap = el('span', className)
  appendRichText(wrap, text.uk)
  if (text.en && text.en !== text.uk) wrap.append(el('span', 'le-en', text.en))
  return wrap
}

/** Display-safe activity body: prompt and options, never answers. Shared with the board. */
export function renderActivityBody(activity: ActivityView, variant: 'document' | 'board'): HTMLElement {
  const body = el('div', `le-activity le-activity--${variant}`)
  const config = activity.config
  if (isLocalized(config.prompt)) body.append(richElement('p', config.prompt.uk, 'le-activity__prompt'))

  if (activity.mechanic === 'choice' && Array.isArray(config.options)) {
    // Ukrainian option letters (А, Б, В…), as in the printed lessons.
    const list = el('ol', 'le-activity__options')
    ;(config.options as { text?: unknown }[]).filter(option => isLocalized(option.text)).forEach((option, i) => {
      const item = el('li')
      item.append(el('span', 'le-activity__letter', `${OPTION_LETTERS[i] ?? i + 1})`), ' ')
      appendRichText(item, (option.text as LocalizedText).uk)
      list.append(item)
    })
    body.append(list)
  } else if (activity.mechanic === 'truefalse' && Array.isArray(config.statements)) {
    const list = el('ul', 'le-activity__statements')
    for (const statement of config.statements as { text?: unknown }[]) {
      if (isLocalized(statement.text)) list.append(richElement('li', statement.text.uk))
    }
    body.append(list)
  } else if (activity.mechanic === 'classify') {
    const groups = el('div', 'le-activity__groups')
    for (const category of (Array.isArray(config.categories) ? config.categories : []) as { label?: unknown }[]) {
      if (isLocalized(category.label)) groups.append(richElement('span', category.label.uk, 'le-chip le-chip--group'))
    }
    const items = el('div', 'le-activity__items')
    for (const item of (Array.isArray(config.items) ? config.items : []) as { label?: unknown }[]) {
      if (isLocalized(item.label)) items.append(richElement('span', item.label.uk, 'le-chip'))
    }
    body.append(groups, items)
  } else if (activity.mechanic === 'game') {
    const gameKey = String(config.gameKey ?? '')
    body.append(el('p', 'le-activity__meta', `${activityLabel(gameKey)} · ${activityLevelLabel(gameKey, String(config.level ?? ''))}`))
    if (isLocalized(config.instructions)) body.append(richElement('p', config.instructions.uk, 'le-activity__instructions'))
  } else if (activity.mechanic === 'external') {
    if (isLocalized(config.instructions)) body.append(richElement('p', config.instructions.uk, 'le-activity__instructions'))
    if (isLocalized(config.estimatedMinutesLabel)) body.append(el('p', 'le-activity__meta', config.estimatedMinutesLabel.uk))
  }
  return body
}

function renderBlockContent(lesson: LessonDefinition, block: LessonBlock): HTMLElement {
  const content = block.content
  const body = el('div', 'le-block__body')
  const heading = isLocalized(content.heading) ? content.heading : null
  if (heading) body.append(richElement('h3', heading.uk, 'le-block__heading'))

  switch (block.type) {
    case 'hero':
      if (isLocalized(content.kicker)) body.append(el('p', 'le-hero__kicker', content.kicker.uk))
      if (isLocalized(content.title)) body.append(richElement('p', content.title.uk, 'le-hero__title'))
      if (isLocalized(content.subtitle)) body.append(el('p', 'le-hero__subtitle', content.subtitle.uk))
      break
    case 'essential-question':
      if (isLocalized(content.question)) body.append(richElement('p', content.question.uk, 'le-question'))
      break
    case 'objectives':
      body.append(richList(lesson.objectives.map(objective => objective.text), 'le-list'))
      break
    case 'explanation':
      for (const paragraph of localizedList(content.paragraphs)) body.append(richElement('p', paragraph.uk))
      if (typeof content.callout === 'object' && content.callout !== null) {
        const callout = content.callout as { title?: unknown; text?: unknown }
        const box = el('div', 'le-callout')
        if (isLocalized(callout.title)) box.append(richElement('p', callout.title.uk, 'le-callout__title'))
        if (isLocalized(callout.text)) box.append(richElement('p', callout.text.uk))
        body.append(box)
      }
      break
    case 'visual': {
      const asset = findAsset(lesson, content.assetId)
      if (asset) body.append(renderFigure(asset.src, asset.alt.uk, asset.caption?.uk))
      break
    }
    case 'discussion':
    case 'reflection':
    case 'extension':
      if (isLocalized(content.prompt)) body.append(richElement('p', content.prompt.uk, 'le-prompt'))
      if (isLocalized(content.example)) body.append(richElement('p', content.example.uk, 'le-example'))
      if (isLocalized(content.expectedResponse)) {
        const hint = el('p', 'le-teacher-hint')
        hint.append(el('span', 'le-teacher-hint__label', 'Очікувана відповідь: '))
        appendRichText(hint, content.expectedResponse.uk)
        body.append(hint)
      }
      break
    case 'practice':
      body.append(renderPracticeContent({
        intro: isLocalized(content.intro) ? content.intro : null,
        table: (content.table ?? null) as StudentPracticeMaterial['table'],
        steps: (Array.isArray(content.steps) ? content.steps : []) as StudentPracticeMaterial['steps'],
      }))
      break
    case 'canvas':
      body.append(renderCanvasItems((Array.isArray(content.teacher) ? content.teacher : []) as CanvasItem[], 'teacher'))
      break
    case 'support':
      body.append(richList(localizedList(content.items), 'le-list'))
      break
    case 'success-criteria':
      body.append(richList(localizedList(content.items), 'le-list le-list--check'))
      if (isLocalized(content.evidenceHint)) body.append(richElement('p', content.evidenceHint.uk, 'le-evidence-hint'))
      break
    case 'vocabulary': {
      const terms = el('ul', 'le-vocab')
      for (const item of lesson.vocabulary ?? []) {
        const entry = el('li')
        entry.append(el('span', 'le-vocab__term', item.term.en ? `${item.term.en} — ${item.term.uk}` : item.term.uk))
        if (item.definition) {
          entry.append(document.createTextNode(': '))
          appendRichText(entry, item.definition.uk)
        }
        terms.append(entry)
      }
      body.append(terms)
      const frames = localizedList(content.sentenceFrames)
      if (frames.length) body.append(richList(frames, 'le-list le-list--frames'))
      break
    }
    case 'teacher-note':
      if (isLocalized(content.text)) body.append(richElement('p', content.text.uk))
      break
    case 'break':
      if (isLocalized(content.prompt)) body.append(richElement('p', content.prompt.uk))
      break
    case 'activity':
      if (block.activity) body.append(renderActivityBody(block.activity, 'document'))
      break
  }
  return body
}

export function renderFigure(src: string, alt: string, caption?: string): HTMLElement {
  const figure = el('figure', 'le-figure')
  const img = el('img')
  img.src = src
  img.alt = alt
  img.loading = 'lazy'
  // A broken asset must not break the lesson: fall back to the description.
  img.addEventListener('error', () => {
    img.replaceWith(el('p', 'le-figure__fallback', alt))
  }, { once: true })
  figure.append(img)
  if (caption) figure.append(el('figcaption', undefined, caption))
  return figure
}

function renderBlockMeta(block: LessonBlock): HTMLElement {
  const meta = el('p', 'le-block__meta')
  const parts = [MODALITY_LABELS[block.modality]]
  if (block.estimatedMinutes) parts.push(`${block.estimatedMinutes} хв`)
  if (block.activity) {
    parts.push(MECHANIC_LABELS[block.activity.mechanic], TELEMETRY_LABELS[block.activity.telemetry])
  }
  meta.textContent = parts.join(' · ')
  return meta
}

export interface DocumentViewOptions {
  /** Called when the teacher wants to present starting from a block. */
  onPresentFrom?: (blockId: string) => void
}

/** One block as a document card: type, timing, content and speaker hint. */
export function renderLessonBlock(
  lesson: LessonDefinition,
  block: LessonBlock,
  options: DocumentViewOptions = {},
  tag: 'li' | 'section' = 'li',
): HTMLElement {
  const item = el(tag, `le-block le-block--${block.type}`)
  item.id = block.id
  if (!block.audience.student) item.classList.add('le-block--teacher-only')

  const top = el('div', 'le-block__top')
  top.append(el('span', 'le-block__type', BLOCK_TYPE_LABELS[block.type]))
  if (block.views.presentation && block.presentation && block.audience.student && options.onPresentFrom) {
    const present = el('button', 'btn btn--secondary le-block__present', 'Показати з цього місця')
    present.type = 'button'
    present.addEventListener('click', () => options.onPresentFrom?.(block.id))
    top.append(present)
  }
  item.append(top, renderBlockMeta(block), renderBlockContent(lesson, block))

  const notes = block.presentation?.speakerNotes
  if (notes) {
    const hint = el('p', 'le-teacher-hint')
    hint.append(el('span', 'le-teacher-hint__label', 'Підказка вчителю: '))
    appendRichText(hint, notes.uk)
    item.append(hint)
  }
  return item
}

export function renderLessonDocument(lesson: LessonDefinition, options: DocumentViewOptions = {}): HTMLElement {
  const root = el('article', 'le-document')
  root.setAttribute('aria-labelledby', 'le-document-title')

  const header = el('header', 'le-document__header')
  header.append(el('p', 'le-document__meta', lessonMetaLine(lesson)))
  const title = bilingual(lesson.title, 'le-document__title-text')
  const h1 = el('h1', 'le-document__title')
  h1.id = 'le-document-title'
  h1.append(title)
  header.append(h1)
  if (lesson.essentialQuestion) header.append(richElement('p', lesson.essentialQuestion.uk, 'le-question'))
  root.append(header)

  const list = el('ol', 'le-blocks')
  for (const block of documentBlocks(lesson)) list.append(renderLessonBlock(lesson, block, options))
  root.append(list)
  return root
}
