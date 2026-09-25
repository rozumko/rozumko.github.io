// Visual editor for canvas blocks: one rich-text field per surface (teacher,
// board, student) with a toolbar, as in Moodle. The editor is only a view:
// its schema allows exactly what CanvasItem can hold, and every change is
// converted back through parseCanvasHtml, the same converter the HTML source
// action uses. No authored HTML is ever stored.

import { Editor, Node, type Extensions } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { ListItem } from '@tiptap/extension-list'
import { TableCell, TableHeader, TableKit } from '@tiptap/extension-table'
import { Placeholder } from '@tiptap/extensions'
import type { CanvasItem } from '../lesson-engine/types.js'
import { safeMediaUrl } from '../lesson-engine/canvas-view.js'
import { canvasItemsToHtml, parseCanvasHtml, youtubeId } from './curriculum-html.js'
import type { EditableBlock } from './curriculum-model.js'

type Surface = 'teacher' | 'board' | 'student'
const SURFACES: { key: Surface; label: string; hint: string }[] = [
  { key: 'teacher', label: 'Учитель', hint: 'План і пояснення для вчителя.' },
  { key: 'board', label: 'Презентація', hint: 'Те, що видно класу на великому екрані.' },
  { key: 'student', label: 'Учень', hint: 'З’явиться на пристроях під час цього кроку.' },
]
const MAX_ITEMS = 20
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function button(label: string, onClick: () => void, className = 'btn-adm-ghost btn--sm'): HTMLButtonElement {
  const node = el('button', className, label)
  node.type = 'button'
  node.addEventListener('click', onClick)
  return node
}

function input(label: string, value: string): { wrap: HTMLElement; control: HTMLInputElement } {
  const wrap = el('label', 'cl-canvas__field')
  wrap.append(el('span', 'adm-label', label))
  const control = el('input', 'adm-input adm-input--sm')
  control.type = 'text'
  control.value = value
  wrap.append(control)
  return { wrap, control }
}

function itemsOf(block: EditableBlock, surface: Surface): CanvasItem[] {
  const value = block.content[surface]
  if (Array.isArray(value)) return value as CanvasItem[]
  const items: CanvasItem[] = []
  block.content[surface] = items
  return items
}

/** An empty surface hides the block there; views and audience follow the content. */
function syncViews(block: EditableBlock): void {
  const teacher = itemsOf(block, 'teacher')
  const board = itemsOf(block, 'board')
  const student = itemsOf(block, 'student')
  block.views.document = teacher.length > 0
  block.views.presentation = board.length > 0
  block.views.remote = student.length > 0
  block.audience.student = board.length > 0 || student.length > 0
  if (board.length) block.presentation ??= { layout: 'concept' }
  else delete block.presentation
  if (student.length) block.runtime = { step: true }
}

const viewsKey = (block: EditableBlock) => `${block.views.document}${block.views.presentation}${block.views.remote}`

// ── Schema: atom nodes for the non-text items ────────────────────────────────

const CanvasImage = Node.create({
  name: 'canvasImage',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({ src: { default: '', rendered: false }, alt: { default: '', rendered: false } }),
  parseHTML: () => [{
    tag: 'img[src]',
    getAttrs: node => {
      const src = safeMediaUrl(node.getAttribute('src') ?? '')
      return src ? { src, alt: node.getAttribute('alt') ?? '' } : false
    },
  }],
  renderHTML: ({ node }) => ['img', { src: node.attrs.src, alt: node.attrs.alt, class: 'cl-rte__image', referrerpolicy: 'no-referrer' }],
})

const CanvasVideo = Node.create({
  name: 'canvasVideo',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({ videoId: { default: '', rendered: false } }),
  parseHTML: () => [
    { tag: 'div[data-video-id]', getAttrs: node => VIDEO_ID_RE.test(node.getAttribute('data-video-id') ?? '') ? { videoId: node.getAttribute('data-video-id') } : false },
    { tag: 'iframe[src]', getAttrs: node => { const videoId = youtubeId(node.getAttribute('src') ?? ''); return videoId ? { videoId } : false } },
  ],
  // A preview card, not a live player: clicks select the node instead of playing.
  renderHTML: ({ node }) => ['div', { 'data-video-id': node.attrs.videoId, class: 'cl-rte__video' },
    ['img', { src: `https://i.ytimg.com/vi/${node.attrs.videoId}/hqdefault.jpg`, alt: '', referrerpolicy: 'no-referrer' }],
    ['span', { class: 'cl-rte__video-label' }, `▶ YouTube · ${node.attrs.videoId}`]],
})

const CanvasLink = Node.create({
  name: 'canvasLink',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({ url: { default: '', rendered: false }, label: { default: '', rendered: false } }),
  parseHTML: () => [{
    tag: 'p[data-canvas-link]',
    priority: 60,
    getAttrs: node => {
      const anchor = node.querySelector('a')
      const url = safeMediaUrl(anchor?.getAttribute('href') ?? '')
      return url ? { url, label: anchor?.textContent?.trim() || url } : false
    },
  }],
  renderHTML: ({ node }) => ['p', { 'data-canvas-link': '', class: 'cl-rte__link' },
    ['a', { href: node.attrs.url, target: '_blank', rel: 'noopener noreferrer' }, node.attrs.label]],
})

function extensions(placeholder: string): Extensions {
  return [
    StarterKit.configure({
      blockquote: false, codeBlock: false, horizontalRule: false, italic: false, strike: false,
      underline: false, link: false, listItem: false, heading: { levels: [2] },
    }),
    // One paragraph per list item and table cell: the model has no nesting.
    ListItem.extend({ content: 'paragraph' }),
    TableKit.configure({ table: { resizable: false }, tableCell: false, tableHeader: false }),
    TableCell.extend({ content: 'paragraph' }),
    TableHeader.extend({ content: 'paragraph' }),
    CanvasImage, CanvasVideo, CanvasLink,
    Placeholder.configure({ placeholder }),
  ]
}

let pendingTabFocus: string | null = null

// Re-renders replace the DOM; editors whose DOM left the page are released.
const liveEditors = new Set<Editor>()
function releaseDetachedEditors(): void {
  for (const editor of liveEditors) {
    if (editor.isDestroyed || !editor.view.dom.isConnected) {
      editor.destroy()
      liveEditors.delete(editor)
    }
  }
}

// ── Insert/edit dialog for links, images and videos ─────────────────────────

type MediaKind = 'canvasLink' | 'canvasImage' | 'canvasVideo'
const MEDIA_TITLES: Record<MediaKind, string> = { canvasLink: 'Посилання', canvasImage: 'Зображення', canvasVideo: 'Відео YouTube' }

function mediaDialog(editor: Editor, host: HTMLElement, kind: MediaKind): void {
  const selection = editor.state.selection
  const editing = selection instanceof NodeSelection && selection.node.type.name === kind ? selection.node.attrs : null
  const form = el('form', 'cl-rte__dialog')
  form.setAttribute('aria-label', MEDIA_TITLES[kind])
  form.append(el('strong', undefined, `${editing ? 'Змінити' : 'Додати'}: ${MEDIA_TITLES[kind].toLowerCase()}`))
  const error = el('p', 'cl-rte__dialog-error')
  error.setAttribute('role', 'alert')
  let read: () => Record<string, string> | string
  if (kind === 'canvasLink') {
    const url = input('Адреса (https://… або /шлях на сайті)', String(editing?.url ?? ''))
    const label = input('Текст посилання', String(editing?.label ?? ''))
    form.append(url.wrap, label.wrap)
    read = () => {
      const safe = safeMediaUrl(url.control.value.trim())
      if (!safe) return 'Потрібна адреса, що починається з https:// або /.'
      return { url: safe, label: label.control.value.trim() || safe }
    }
  } else if (kind === 'canvasImage') {
    const src = input('Адреса зображення (https://…)', String(editing?.src ?? ''))
    const alt = input('Опис зображення для незрячих', String(editing?.alt ?? ''))
    form.append(src.wrap, alt.wrap)
    read = () => {
      const safe = safeMediaUrl(src.control.value.trim())
      if (!safe) return 'Потрібна адреса, що починається з https:// або /.'
      if (!alt.control.value.trim()) return 'Додайте короткий опис зображення.'
      return { src: safe, alt: alt.control.value.trim() }
    }
  } else {
    const url = input('Посилання на відео YouTube', editing?.videoId ? `https://www.youtube.com/watch?v=${editing.videoId}` : '')
    form.append(url.wrap)
    read = () => {
      const videoId = youtubeId(url.control.value.trim())
      return videoId ? { videoId } : 'Потрібне посилання на YouTube, наприклад https://youtu.be/…'
    }
  }
  const actions = el('div', 'cl-rte__dialog-actions')
  const submit = el('button', 'btn-adm btn--sm', editing ? 'Зберегти' : 'Вставити')
  submit.type = 'submit'
  actions.append(submit, button('Скасувати', () => { form.remove(); editor.commands.focus() }))
  form.append(error, actions)
  form.addEventListener('submit', event => {
    event.preventDefault()
    const attrs = read()
    if (typeof attrs === 'string') {
      error.textContent = attrs
      return
    }
    const current = editor.state.selection
    if (editing) editor.chain().focus().updateAttributes(kind, attrs).run()
    // A selected image or video stays: the new node goes after it, not over it.
    else if (current instanceof NodeSelection) editor.chain().focus().insertContentAt(current.to, { type: kind, attrs }).run()
    else editor.chain().focus().insertContent({ type: kind, attrs }).run()
    form.remove()
  })
  host.querySelector('.cl-rte__dialog')?.remove()
  host.append(form)
  form.querySelector('input')?.focus()
}

// ── Toolbar ─────────────────────────────────────────────────────────────────

interface ToolButton { node: HTMLButtonElement; refresh?: () => void }

function toolbar(editor: Editor, dialogHost: HTMLElement, toggleSource: () => void): { root: HTMLElement; refresh: () => void } {
  const root = el('div', 'cl-rte__toolbar')
  root.setAttribute('role', 'toolbar')
  root.setAttribute('aria-label', 'Форматування')
  const tools: ToolButton[] = []
  const group = (...items: ToolButton[]) => {
    const wrap = el('span', 'cl-rte__group')
    for (const item of items) {
      wrap.append(item.node)
      tools.push(item)
    }
    root.append(wrap)
    return wrap
  }
  const tool = (label: string, name: string, run: () => void, state?: { active?: () => boolean; enabled?: () => boolean }): ToolButton => {
    const node = button(label, run, 'cl-rte__button')
    // A mouse press keeps focus and the text selection in the editor.
    node.addEventListener('mousedown', event => event.preventDefault())
    node.title = name
    node.setAttribute('aria-label', name)
    if (state?.active) node.setAttribute('aria-pressed', 'false')
    return {
      node,
      refresh: () => {
        if (state?.active) node.setAttribute('aria-pressed', String(state.active()))
        if (state?.enabled) node.disabled = !state.enabled()
      },
    }
  }
  const chain = () => editor.chain().focus()

  group(
    tool('↶', 'Скасувати', () => chain().undo().run(), { enabled: () => editor.can().undo() }),
    tool('↷', 'Повторити', () => chain().redo().run(), { enabled: () => editor.can().redo() }),
  )
  group(
    tool('Ж', 'Жирний', () => chain().toggleBold().run(), { active: () => editor.isActive('bold'), enabled: () => editor.can().toggleBold() }),
    tool('{ }', 'Код', () => chain().toggleCode().run(), { active: () => editor.isActive('code'), enabled: () => editor.can().toggleCode() }),
  )
  group(
    tool('Заголовок', 'Заголовок', () => chain().toggleHeading({ level: 2 }).run(), { active: () => editor.isActive('heading') }),
    tool('• Список', 'Маркований список', () => chain().toggleBulletList().run(), { active: () => editor.isActive('bulletList') }),
    tool('1. Список', 'Нумерований список', () => chain().toggleOrderedList().run(), { active: () => editor.isActive('orderedList') }),
  )
  group(
    tool('Таблиця', 'Вставити таблицю', () => chain().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run(), { enabled: () => !editor.isActive('table') }),
    tool('🔗 Посилання', 'Вставити посилання', () => mediaDialog(editor, dialogHost, 'canvasLink')),
    tool('🖼 Зображення', 'Вставити зображення', () => mediaDialog(editor, dialogHost, 'canvasImage')),
    tool('▶ YouTube', 'Вставити відео YouTube', () => mediaDialog(editor, dialogHost, 'canvasVideo')),
  )
  const tableTools = group(
    tool('+ рядок', 'Додати рядок нижче', () => chain().addRowAfter().run(), { enabled: () => editor.can().addRowAfter() }),
    tool('+ стовпець', 'Додати стовпець праворуч', () => chain().addColumnAfter().run(), { enabled: () => editor.can().addColumnAfter() }),
    tool('− рядок', 'Видалити рядок', () => chain().deleteRow().run(), { enabled: () => editor.can().deleteRow() }),
    tool('− стовпець', 'Видалити стовпець', () => chain().deleteColumn().run(), { enabled: () => editor.can().deleteColumn() }),
    tool('Прибрати таблицю', 'Видалити таблицю', () => chain().deleteTable().run()),
  )
  group(tool('</> HTML', 'Початковий код HTML', toggleSource))

  const refresh = () => {
    for (const item of tools) item.refresh?.()
    tableTools.hidden = !editor.isActive('table')
  }
  return { root, refresh }
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface CanvasEditorOptions {
  selected: Surface
  select(surface: Surface): void
  changed(): void
  touched(): void
  /** Views follow content while typing; refreshes the block's summary badges. */
  viewsChanged(): void
}

export function renderCanvasEditor(block: EditableBlock, options: CanvasEditorOptions): HTMLElement {
  releaseDetachedEditors()
  const root = el('section', 'cl-canvas')
  const heading = input('Назва блоку', (block.content.heading as { uk?: string } | undefined)?.uk ?? '')
  heading.control.addEventListener('input', () => {
    block.content.heading = { uk: heading.control.value }
    options.touched()
  })
  root.append(heading.wrap)

  const tabs = el('div', 'cl-canvas__tabs')
  tabs.setAttribute('role', 'tablist')
  tabs.setAttribute('aria-label', 'Вигляд блоку')
  const panel = el('div', 'cl-canvas__panel')
  const selection = SURFACES.find(surface => surface.key === options.selected) ?? SURFACES[0]!
  const tabId = (key: Surface) => `cl-canvas-tab-${block.id}-${key}`
  // Select re-renders the block editor (mounted asynchronously), so the new
  // tab takes focus once it is on the page.
  const selectAndFocus = (key: Surface) => {
    pendingTabFocus = tabId(key)
    options.select(key)
  }
  if (pendingTabFocus) {
    const id = pendingTabFocus
    requestAnimationFrame(() => {
      if (pendingTabFocus !== id) return
      pendingTabFocus = null
      document.getElementById(id)?.focus()
    })
  }
  for (const surface of SURFACES) {
    const selected = surface.key === selection.key
    const count = itemsOf(block, surface.key).length
    const tab = button(count ? `${surface.label} · ${count}` : surface.label, () => selectAndFocus(surface.key), 'cl-canvas__tab')
    tab.setAttribute('role', 'tab')
    tab.setAttribute('aria-label', surface.label)
    tab.setAttribute('aria-selected', String(selected))
    tab.tabIndex = selected ? 0 : -1
    tab.id = tabId(surface.key)
    tab.setAttribute('aria-controls', `cl-canvas-panel-${block.id}`)
    tabs.append(tab)
  }
  tabs.addEventListener('keydown', event => {
    const index = SURFACES.indexOf(selection)
    const next = event.key === 'ArrowRight' ? (index + 1) % SURFACES.length
      : event.key === 'ArrowLeft' ? (index + SURFACES.length - 1) % SURFACES.length
        : event.key === 'Home' ? 0
          : event.key === 'End' ? SURFACES.length - 1
            : -1
    if (next < 0) return
    event.preventDefault()
    selectAndFocus(SURFACES[next]!.key)
  })
  panel.id = `cl-canvas-panel-${block.id}`
  panel.setAttribute('role', 'tabpanel')
  panel.setAttribute('aria-labelledby', tabId(selection.key))
  root.append(tabs, panel)
  panel.append(el('p', 'adm-field-hint', `${selection.hint} Порожня вкладка — на цьому екрані блок не з’явиться.`))

  const frame = el('div', 'cl-rte')
  const dialogHost = el('div', 'cl-rte__dialogs')
  const host = el('div', 'cl-rte__editor')
  const status = el('p', 'cl-rte__status')
  status.setAttribute('aria-live', 'polite')

  const editor = new Editor({
    element: host,
    extensions: extensions('Почніть писати або вставте текст…'),
    content: canvasItemsToHtml(itemsOf(block, selection.key)),
    editorProps: {
      attributes: { class: 'cl-rte__content', 'aria-label': `Вміст для вкладки «${selection.label}»`, 'aria-multiline': 'true', role: 'textbox' },
      // Content copied inside the editor keeps its structure; anything else
      // (Word, Google Docs, Moodle) goes through the lesson importer first.
      transformPastedHTML: html => {
        if (html.includes('data-pm-slice')) return html
        const parsed = parseCanvasHtml(html)
        if (parsed.warnings.length) status.textContent = `Під час вставлення: ${parsed.warnings.join(' ')}`
        return canvasItemsToHtml(parsed.items)
      },
      handleDoubleClickOn: (_view, _pos, node) => {
        if (node.type.name !== 'canvasLink' && node.type.name !== 'canvasImage' && node.type.name !== 'canvasVideo') return false
        mediaDialog(editor, dialogHost, node.type.name)
        return true
      },
    },
  })
  liveEditors.add(editor)

  const commit = () => {
    const parsed = parseCanvasHtml(editor.getHTML())
    block.content[selection.key] = parsed.items
    status.textContent = parsed.warnings.length
      ? parsed.warnings.join(' ')
      : `Елементів: ${parsed.items.length} з ${MAX_ITEMS}.`
    const before = viewsKey(block)
    syncViews(block)
    if (viewsKey(block) !== before) options.viewsChanged()
    const tab = document.getElementById(tabId(selection.key))
    if (tab) tab.textContent = parsed.items.length ? `${selection.label} · ${parsed.items.length}` : selection.label
    options.touched()
  }

  // HTML source mode: the same converter, applied on demand.
  const source = el('div', 'cl-rte__source')
  source.hidden = true
  const area = el('textarea', 'adm-input adm-input--code')
  area.rows = 12
  area.setAttribute('aria-label', `HTML для вкладки «${selection.label}»`)
  const report = el('p', 'adm-field-hint')
  area.addEventListener('input', () => {
    const parsed = parseCanvasHtml(area.value)
    report.textContent = parsed.warnings.length ? parsed.warnings.join(' ') : `Розпізнано елементів: ${parsed.items.length}. HTML буде перетворено на блоки.`
  })
  const showSource = (on: boolean) => {
    source.hidden = !on
    host.hidden = on
    bar.root.querySelectorAll<HTMLButtonElement>('.cl-rte__button').forEach(node => {
      if (node.getAttribute('aria-label') !== 'Початковий код HTML') node.disabled = on
    })
    if (on) {
      area.value = canvasItemsToHtml(itemsOf(block, selection.key))
      report.textContent = 'Змініть або вставте HTML і натисніть «Застосувати».'
      area.focus()
    } else {
      bar.refresh()
      editor.commands.focus()
    }
  }
  const bar = toolbar(editor, dialogHost, () => showSource(source.hidden === true))
  source.append(area, report, el('div', 'cl-rte__dialog-actions'))
  source.lastElementChild!.append(
    button('Застосувати HTML до цієї вкладки', () => {
      const parsed = parseCanvasHtml(area.value)
      if (!parsed.items.length && area.value.trim()) {
        report.textContent = `Нічого не перенесено. ${parsed.warnings.join(' ')}`
        return
      }
      editor.commands.setContent(canvasItemsToHtml(parsed.items), { emitUpdate: false })
      commit()
      if (parsed.warnings.length) status.textContent = parsed.warnings.join(' ')
      showSource(false)
    }, 'btn-adm btn--sm'),
    button('Скасувати', () => showSource(false)),
  )

  editor.on('update', commit)
  editor.on('transaction', bar.refresh)
  bar.refresh()
  status.textContent = `Елементів: ${itemsOf(block, selection.key).length} з ${MAX_ITEMS}.`
  frame.append(bar.root, dialogHost, host, source)
  panel.append(frame, status)
  return root
}
