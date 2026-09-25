import { richElement } from './rich-text.js'
import type { CanvasItem, StudentCanvasMaterial } from './types.js'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  return node
}

function safeUrl(value: string): string | null {
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return value
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' ? parsed.href : null
  } catch { return null }
}

/** Renders the validated content tree without interpreting authored HTML. */
export function renderCanvasItems(items: CanvasItem[], variant: 'teacher' | 'board' | 'student'): HTMLElement {
  const root = el('div', `le-canvas le-canvas--${variant}`)
  for (const item of items) {
    switch (item.type) {
      case 'paragraph': root.append(richElement('p', item.text.uk)); break
      case 'heading': root.append(richElement(variant === 'board' ? 'h3' : 'h4', item.text.uk)); break
      case 'list': {
        const list = el('ul')
        for (const line of item.items) list.append(richElement('li', line.uk))
        root.append(list)
        break
      }
      case 'table': {
        const scroll = el('div', 'le-practice__table-scroll')
        const table = el('table', 'le-practice__table')
        table.setAttribute('aria-label', 'Таблиця уроку')
        const head = el('thead')
        const headingRow = el('tr')
        for (const cell of item.headers) {
          const th = richElement('th', cell.uk)
          th.scope = 'col'
          headingRow.append(th)
        }
        head.append(headingRow)
        const body = el('tbody')
        for (const row of item.rows) {
          const tr = el('tr')
          for (const cell of row) tr.append(richElement('td', cell.uk))
          body.append(tr)
        }
        table.append(head, body)
        scroll.append(table)
        root.append(scroll)
        break
      }
      case 'image': {
        const src = safeUrl(item.src)
        if (!src) break
        const image = el('img', 'le-canvas__image')
        image.src = src
        image.alt = item.alt.uk
        image.loading = 'lazy'
        root.append(image)
        break
      }
      case 'video': {
        if (!/^[A-Za-z0-9_-]{11}$/.test(item.videoId)) break
        const iframe = el('iframe', 'le-canvas__video')
        iframe.src = `https://www.youtube-nocookie.com/embed/${item.videoId}`
        iframe.title = 'Відео до уроку'
        iframe.loading = 'lazy'
        iframe.referrerPolicy = 'strict-origin-when-cross-origin'
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
        iframe.allowFullscreen = true
        root.append(iframe)
        break
      }
      case 'link': {
        const href = safeUrl(item.url)
        if (!href) break
        const link = el('a', 'le-canvas__link')
        link.href = href
        link.textContent = item.label.uk
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        root.append(link)
        break
      }
    }
  }
  return root
}

export function renderStudentCanvas(host: HTMLElement, material: StudentCanvasMaterial): void {
  const card = el('section', 'lj-task')
  card.setAttribute('aria-labelledby', 'lj-task-title')
  const title = richElement('h2', material.heading.uk, 'lj-task__title')
  title.id = 'lj-task-title'
  card.append(title, renderCanvasItems(material.items, 'student'))
  host.replaceChildren(card)
}
