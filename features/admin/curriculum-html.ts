// Converts pasted HTML into the Lesson Engine's small, auditable content tree.
// No HTML, attributes, scripts or styles are stored in a lesson definition.

import type { CanvasItem, LocalizedText } from '../lesson-engine/types.js'
import { safeMediaUrl } from '../lesson-engine/canvas-view.js'
import { parseRichText } from '../lesson-engine/rich-text.js'
import { youtubeId, learningAppsId } from './curriculum-text.js'

// Mirrors the limits in backend/src/lib/curriculum-lesson-schema.ts, so an
// import that looks successful also saves.
const MAX_ITEMS = 20
const MAX_SHORT = 200
const MAX_TEXT = 2000
const MAX_COLUMNS = 10
const MAX_ROWS = 20

const SKIPPED = new Set(['script', 'style', 'template', 'noscript', 'form', 'input', 'select', 'textarea', 'button', 'svg', 'canvas', 'object', 'embed', 'audio', 'video'])
const INLINE = new Set(['a', 'abbr', 'b', 'br', 'cite', 'code', 'em', 'font', 'i', 'kbd', 'mark', 'q', 's', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var'])
const BLOCK_INSIDE = 'address, article, aside, blockquote, div, dl, figure, footer, h1, h2, h3, h4, h5, h6, header, hr, iframe, img, li, main, nav, ol, p, pre, section, table, ul'

const escapeHtml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
// Lesson markup (**bold**, `code`, line breaks) as real HTML, so the visual
// editor shows formatting and the parser turns it back into the same markup.
const richHtml = (value: string): string => parseRichText(value).map(token => {
  const text = escapeHtml(token.text).replace(/\n/g, '<br>')
  return token.kind === 'strong' ? `<strong>${text}</strong>` : token.kind === 'code' ? `<code>${text}</code>` : text
}).join('')

export { youtubeId }

/** Wraps the trimmed text in a marker, keeping the surrounding spaces outside it. */
function mark(text: string, marker: string): string {
  const inner = text.trim()
  if (!inner) return text
  const lead = text.slice(0, text.indexOf(inner))
  const trail = text.slice(lead.length + inner.length)
  return `${lead}${marker}${inner}${marker}${trail}`
}

function inlineText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/\s+/g, ' ')
  if (!(node instanceof Element)) return ''
  if (node.localName === 'br') return '\n'
  if (SKIPPED.has(node.localName)) return ''
  const text = [...node.childNodes].map(inlineText).join('')
  if (node.localName === 'strong' || node.localName === 'b') return mark(text, '**')
  if (node.localName === 'code') return mark(text, '`')
  return text
}

const cleanText = (value: string): string => value.replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim()

/** Inline content: text, or a phrasing element without block content inside. */
function isInline(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) return true
  return node instanceof Element && INLINE.has(node.localName) && !node.querySelector(BLOCK_INSIDE)
}

export interface HtmlImportResult { items: CanvasItem[]; warnings: string[] }

export function parseCanvasHtml(source: string): HtmlImportResult {
  const document = new DOMParser().parseFromString(source, 'text/html')
  const items: CanvasItem[] = []
  const warnings: string[] = []
  const warn = (message: string) => { if (!warnings.includes(message)) warnings.push(message) }
  const add = (item: CanvasItem) => {
    if (items.length < MAX_ITEMS) items.push(item)
    else warn(`Понад ${MAX_ITEMS} елементів: решту пропущено.`)
  }
  const clip = (value: string, max: number): LocalizedText => {
    const text = cleanText(value)
    if (text.length <= max) return { uk: text }
    warn(`Задовгий текст скорочено до ${max} символів.`)
    return { uk: `${text.slice(0, max - 1).trimEnd()}…` }
  }

  const addLink = (anchor: Element, label: string) => {
    const appId = learningAppsId(anchor.getAttribute('href') ?? '')
    if (appId) { add({ type: 'learningapps', appId }); return }
    const url = safeMediaUrl(anchor.getAttribute('href') ?? '')
    if (url) add({ type: 'link', url, label: clip(label || url, MAX_SHORT) })
    else warn('Посилання з небезпечною адресою пропущено.')
  }

  // A run of inline nodes becomes one paragraph or heading. Links inside the
  // text keep their words in place and are listed after it as link items.
  const emitRun = (nodes: Node[], kind: 'paragraph' | 'heading') => {
    const text = cleanText(nodes.map(inlineText).join(''))
    if (!text) return
    const anchors = nodes.flatMap(node => node instanceof Element
      ? (node.localName === 'a' ? [node] : [...node.querySelectorAll('a')])
      : [])
    if (anchors.length === 1 && cleanText(inlineText(anchors[0]!)) === text) {
      addLink(anchors[0]!, text)
      return
    }
    add({ type: kind, text: clip(text, kind === 'heading' ? MAX_SHORT : MAX_TEXT) })
    for (const anchor of anchors) addLink(anchor, cleanText(inlineText(anchor)))
  }

  const listItems = (list: Element, depth: number, out: LocalizedText[]) => {
    for (const li of list.children) {
      if (li.localName !== 'li') continue
      const own = [...li.childNodes].filter(child => !(child instanceof Element && (child.localName === 'ul' || child.localName === 'ol')))
      const text = cleanText(own.map(inlineText).join(''))
      if (text) out.push(clip(`${'— '.repeat(depth)}${text}`, MAX_TEXT))
      for (const nested of li.children) {
        if (nested.localName === 'ul' || nested.localName === 'ol') listItems(nested, depth + 1, out)
      }
    }
  }

  const visitTable = (table: HTMLTableElement) => {
    // table.rows skips rows of nested tables.
    const rows = [...table.rows].map(row => [...row.cells].map(cell => clip(inlineText(cell), MAX_SHORT))).filter(row => row.length)
    const headers = rows.shift()
    if (!headers || !rows.length) return warn('Таблицю не перенесено: потрібні рядок заголовків і хоча б один рядок даних.')
    if (headers.length < 2 || headers.length > MAX_COLUMNS) return warn(`Таблицю не перенесено: потрібно від 2 до ${MAX_COLUMNS} стовпців.`)
    if (!rows.every(row => row.length === headers.length)) return warn('Таблицю не перенесено: у кожному рядку має бути однакова кількість клітинок (об’єднані клітинки не підтримуються).')
    if (rows.length > MAX_ROWS) warn(`У таблиці понад ${MAX_ROWS} рядків даних: решту пропущено.`)
    add({ type: 'table', headers, rows: rows.slice(0, MAX_ROWS) })
  }

  const visitBlock = (node: Element): void => {
    const tag = node.localName
    const appId = node.getAttribute('data-learningapps-id')
    if (appId !== null) {
      if (/^[1-9][0-9]{0,19}$/.test(appId)) add({ type: 'learningapps', appId })
      return
    }
    // The visual editor shows videos as a preview card carrying the ID.
    const videoId = node.getAttribute('data-video-id')
    if (videoId !== null) {
      if (/^[A-Za-z0-9_-]{11}$/.test(videoId)) add({ type: 'video', videoId })
      return
    }
    if (SKIPPED.has(tag)) return warn(`Елемент <${tag}> пропущено.`)
    if (tag === 'p' || /^h[1-6]$/.test(tag)) {
      if (node.querySelector('img, iframe, table, ul, ol')) return visitContainer(node)
      return emitRun([...node.childNodes], tag === 'p' ? 'paragraph' : 'heading')
    }
    if (tag === 'ul' || tag === 'ol') {
      const lines: LocalizedText[] = []
      listItems(node, 0, lines)
      if (lines.length > MAX_ROWS) warn(`У списку понад ${MAX_ROWS} пунктів: решту пропущено.`)
      if (lines.length) add(tag === 'ol' ? { type: 'list', ordered: true, items: lines.slice(0, MAX_ROWS) } : { type: 'list', items: lines.slice(0, MAX_ROWS) })
      return
    }
    if (tag === 'table') return visitTable(node as HTMLTableElement)
    if (tag === 'img') {
      const src = safeMediaUrl(node.getAttribute('src') ?? '')
      if (src) add({ type: 'image', src, alt: clip(node.getAttribute('alt') || 'Ілюстрація', MAX_SHORT) })
      else warn('Зображення без https-адреси пропущено.')
      return
    }
    if (tag === 'iframe') {
      const appId = learningAppsId(node.getAttribute('src') ?? '')
      if (appId) { add({ type: 'learningapps', appId }); return }
      const id = youtubeId(node.getAttribute('src') ?? '')
      if (id) add({ type: 'video', videoId: id })
      else warn('Вбудований ресурс пропущено: підтримуються YouTube та LearningApps.')
      return
    }
    if (tag === 'hr') return
    visitContainer(node)
  }

  const visitContainer = (node: ParentNode): void => {
    let run: Node[] = []
    const flush = () => {
      emitRun(run, 'paragraph')
      run = []
    }
    for (const child of node.childNodes) {
      if (isInline(child)) run.push(child)
      else if (child instanceof Element) {
        flush()
        visitBlock(child)
      }
    }
    flush()
  }

  visitContainer(document.body)
  return { items, warnings }
}

export function canvasItemsToHtml(items: CanvasItem[]): string {
  return items.map(item => {
    switch (item.type) {
      case 'paragraph': return `<p>${richHtml(item.text.uk)}</p>`
      case 'heading': return `<h2>${richHtml(item.text.uk)}</h2>`
      case 'list': {
        const tag = item.ordered ? 'ol' : 'ul'
        return `<${tag}>${item.items.map(line => `<li>${richHtml(line.uk)}</li>`).join('')}</${tag}>`
      }
      case 'table': return `<table><thead><tr>${item.headers.map(cell => `<th>${richHtml(cell.uk)}</th>`).join('')}</tr></thead><tbody>${item.rows.map(row => `<tr>${row.map(cell => `<td>${richHtml(cell.uk)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      case 'image': return `<img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.alt.uk)}">`
      case 'video': return `<iframe src="https://www.youtube-nocookie.com/embed/${item.videoId}" title="Відео до уроку"></iframe>`
      case 'learningapps': return `<div data-learningapps-id="${escapeHtml(item.appId)}">LearningApps · ${escapeHtml(item.appId)}</div>`
      // A link is its own line; the marker lets the visual editor keep it as one.
      case 'link': return `<p data-canvas-link><a href="${escapeHtml(item.url)}">${escapeHtml(item.label.uk)}</a></p>`
    }
  }).join('\n')
}
