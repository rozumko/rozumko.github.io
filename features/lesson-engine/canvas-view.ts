import { richElement } from './rich-text.js'
import type { CanvasItem, StudentCanvasMaterial } from './types.js'
import { renderHtmlCard } from './html-card.js'
import { lessonAssetUrl } from '../api/client.js'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  return node
}

/** Images and links: a site path or any https URL (mirrors the server's checkMediaSrc). */
export function safeMediaUrl(value: string): string | null {
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
      case 'html': root.append(renderHtmlCard(item.html)); break
      case 'file': {
        if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(item.mime) || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.data) || item.data.length > 699_052) break
        // Fixed MIME types cannot become HTML or SVG on the application's origin.
        const src = `data:${item.mime};base64,${item.data}`
        if (item.mime === 'application/pdf') root.append(pdfCard(src, item.name.uk))
        else {
          const image = el('img', 'le-canvas__image')
          image.src = src
          image.alt = item.name.uk
          root.append(image)
        }
        break
      }
      case 'asset': {
        // Served by the API with this fixed type and nosniff; never HTML or SVG.
        const src = lessonAssetUrl(item.sha256)
        if (!src) break
        if (item.mime === 'application/pdf') root.append(pdfCard(src, item.name.uk, true))
        else {
          const image = el('img', 'le-canvas__image')
          image.src = src
          image.alt = item.name.uk
          image.referrerPolicy = 'no-referrer'
          root.append(image)
        }
        break
      }
      case 'pdf': {
        const url = safeMediaUrl(item.url)
        if (url) root.append(pdfCard(url, item.label.uk))
        break
      }
      case 'paragraph': root.append(richElement('p', item.text.uk)); break
      case 'heading': root.append(richElement(variant === 'board' ? 'h3' : 'h4', item.text.uk)); break
      case 'list': {
        const list = el(item.ordered ? 'ol' : 'ul')
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
        const src = safeMediaUrl(item.src)
        if (!src) break
        const image = el('img', 'le-canvas__image')
        image.src = src
        image.alt = item.alt.uk
        image.loading = 'lazy'
        // Third-party image hosts learn nothing about which lesson page asked.
        image.referrerPolicy = 'no-referrer'
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
      case 'learningapps': {
        if (!/^[1-9][0-9]{0,19}$/.test(item.appId)) break
        const section = el('section', 'le-canvas__learningapps')
        const iframe = el('iframe', 'le-canvas__exercise')
        iframe.src = `https://learningapps.org/watch?app=${item.appId}&disableanalytics=1`
        iframe.title = 'Вправа LearningApps'
        iframe.loading = 'lazy'
        iframe.referrerPolicy = 'no-referrer'
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms')
        iframe.allowFullscreen = true
        const link = el('a', 'le-canvas__link')
        link.href = `https://learningapps.org/view${item.appId}`
        link.textContent = 'Відкрити на LearningApps ↗'
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        const full = el('button', 'btn btn--secondary')
        full.type = 'button'
        full.textContent = 'На весь екран'
        full.addEventListener('click', () => { void iframe.requestFullscreen?.().catch(() => {}) })
        section.append(iframe, full, link)
        root.append(section)
        break
      }
      case 'link': {
        const href = safeMediaUrl(item.url)
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

/** `stored`: a lesson file from the API, served only as application/pdf. */
function pdfCard(url: string, label: string, stored = false): HTMLElement {
  const section = el('section', 'le-canvas__pdf')
  if (stored || url.startsWith('data:application/pdf;base64,')) {
    const frame = el('iframe', 'le-canvas__document')
    frame.title = label
    frame.referrerPolicy = 'no-referrer'
    // Data documents have an opaque origin and a fixed PDF MIME; stored files
    // come from the API origin with a fixed PDF type and nosniff. Browser PDF
    // viewers need an unsandboxed frame; no authored HTML can enter this path.
    frame.src = url
    section.append(frame)
  } else {
    const note = el('p')
    note.textContent = 'PDF за посиланням відкривається окремо. Завантажений файл показується всередині уроку.'
    section.append(note)
  }
  const link = el('a', 'le-canvas__link')
  link.href = url
  link.textContent = `Відкрити PDF: ${label} ↗`
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  if (url.startsWith('data:')) link.download = /\.pdf$/i.test(label) ? label : `${label}.pdf`
  section.append(link)
  return section
}

export function renderStudentCanvas(host: HTMLElement, material: StudentCanvasMaterial): void {
  const card = el('section', 'lj-task')
  card.setAttribute('aria-labelledby', 'lj-task-title')
  const title = richElement('h2', material.heading.uk, 'lj-task__title')
  title.id = 'lj-task-title'
  card.append(title, renderCanvasItems(material.items, 'student'))
  host.replaceChildren(card)
}
