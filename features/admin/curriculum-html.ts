// Converts pasted HTML into the Lesson Engine's small, auditable content tree.
// No HTML, attributes, scripts or styles are stored in a lesson definition.

import type { CanvasItem, LocalizedText } from '../lesson-engine/types.js'

const uk = (value: string): LocalizedText => ({ uk: value.trim() })
const escapeHtml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function safeUrl(value: string): string | null {
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return value
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : null
  } catch { return null }
}

export function youtubeId(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null
    const host = url.hostname.toLowerCase()
    let id: string | null = null
    if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0] ?? null
    else if (['youtube.com', 'www.youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com', 'm.youtube.com'].includes(host)) {
      id = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] ?? null
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
  } catch { return null }
}

function inlineText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (!(node instanceof Element)) return ''
  const text = [...node.childNodes].map(inlineText).join('')
  if (node.localName === 'br') return '\n'
  if (node.localName === 'strong' || node.localName === 'b') return `**${text}**`
  if (node.localName === 'code') return `\`${text}\``
  return text
}

export interface HtmlImportResult { items: CanvasItem[]; warnings: string[] }

export function parseCanvasHtml(source: string): HtmlImportResult {
  const document = new DOMParser().parseFromString(source, 'text/html')
  const items: CanvasItem[] = []
  const warnings: string[] = []
  const add = (item: CanvasItem) => {
    if (items.length < 20) items.push(item)
    else if (!warnings.includes('Понад 20 елементів: решту пропущено.')) warnings.push('Понад 20 елементів: решту пропущено.')
  }
  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim()
      if (text) add({ type: 'paragraph', text: uk(text) })
      return
    }
    if (!(node instanceof Element)) return
    const tag = node.localName
    if (['script', 'style', 'form', 'input', 'select', 'button', 'svg', 'object', 'embed'].includes(tag)) {
      warnings.push(`Елемент <${tag}> пропущено.`)
      return
    }
    if (tag === 'p' || /^h[1-6]$/.test(tag)) {
      const embedded = node.querySelector('img, iframe, table')
      if (embedded) { node.childNodes.forEach(visit); return }
      const soleLink = node.children.length === 1 && node.firstElementChild?.localName === 'a' && ![...node.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim())
      if (soleLink) { visit(node.firstElementChild!); return }
      const text = inlineText(node).trim()
      if (text) add({ type: tag === 'p' ? 'paragraph' : 'heading', text: uk(text) })
      return
    }
    if (tag === 'ul' || tag === 'ol') {
      const lines = [...node.children].filter(child => child.localName === 'li').map(child => uk(inlineText(child))).filter(line => line.uk)
      if (lines.length) add({ type: 'list', items: lines })
      return
    }
    if (tag === 'table') {
      const rows = [...node.querySelectorAll('tr')].map(row => [...row.children].filter(cell => cell.localName === 'td' || cell.localName === 'th').map(cell => uk(inlineText(cell))))
        .filter(row => row.length)
      const headers = rows.shift()
      if (headers && rows.length && headers.length >= 2 && rows.every(row => row.length === headers.length)) add({ type: 'table', headers, rows })
      else warnings.push('Таблицю не перенесено: потрібен рядок заголовків і однакова кількість клітинок.')
      return
    }
    if (tag === 'img') {
      const src = safeUrl(node.getAttribute('src') ?? '')
      if (src) add({ type: 'image', src, alt: uk(node.getAttribute('alt') || 'Ілюстрація') })
      else warnings.push('Зображення з небезпечною або відносною адресою пропущено.')
      return
    }
    if (tag === 'iframe') {
      const id = youtubeId(node.getAttribute('src') ?? '')
      if (id) add({ type: 'video', videoId: id })
      else warnings.push('Вбудований ресурс пропущено: підтримується лише YouTube.')
      return
    }
    if (tag === 'a') {
      const url = safeUrl(node.getAttribute('href') ?? '')
      if (url) add({ type: 'link', url, label: uk(inlineText(node) || url) })
      else warnings.push('Посилання з небезпечною адресою пропущено.')
      return
    }
    node.childNodes.forEach(visit)
  }
  document.body.childNodes.forEach(visit)
  return { items, warnings }
}

export function canvasItemsToHtml(items: CanvasItem[]): string {
  return items.map(item => {
    switch (item.type) {
      case 'paragraph': return `<p>${escapeHtml(item.text.uk)}</p>`
      case 'heading': return `<h2>${escapeHtml(item.text.uk)}</h2>`
      case 'list': return `<ul>${item.items.map(line => `<li>${escapeHtml(line.uk)}</li>`).join('')}</ul>`
      case 'table': return `<table><thead><tr>${item.headers.map(cell => `<th>${escapeHtml(cell.uk)}</th>`).join('')}</tr></thead><tbody>${item.rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell.uk)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      case 'image': return `<img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.alt.uk)}">`
      case 'video': return `<iframe src="https://www.youtube-nocookie.com/embed/${item.videoId}" title="Відео до уроку"></iframe>`
      case 'link': return `<a href="${escapeHtml(item.url)}">${escapeHtml(item.label.uk)}</a>`
    }
  }).join('\n')
}
