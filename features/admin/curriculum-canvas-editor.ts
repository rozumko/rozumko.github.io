import type { CanvasItem } from '../lesson-engine/types.js'
import { renderCanvasItems } from '../lesson-engine/canvas-view.js'
import { canvasItemsToHtml, parseCanvasHtml, youtubeId } from './curriculum-html.js'
import type { EditableBlock } from './curriculum-model.js'

type Surface = 'teacher' | 'board' | 'student'
const SURFACES: { key: Surface; label: string; hint: string }[] = [
  { key: 'teacher', label: 'Учитель', hint: 'План і пояснення для вчителя.' },
  { key: 'board', label: 'Презентація', hint: 'Те, що видно класу на великому екрані.' },
  { key: 'student', label: 'Учень', hint: 'З’явиться на пристроях під час цього кроку.' },
]
const LABELS: Record<CanvasItem['type'], string> = {
  paragraph: 'Текст', heading: 'Заголовок', list: 'Список', table: 'Таблиця', image: 'Зображення', video: 'YouTube', link: 'Посилання',
}
const uk = (value: string) => ({ uk: value })

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

function input(label: string, value: string, onInput: (value: string) => void): HTMLElement {
  const wrap = el('label', 'cl-canvas__field')
  wrap.append(el('span', 'adm-label', label))
  const control = el('input', 'adm-input adm-input--sm')
  control.type = 'text'
  control.value = value
  control.addEventListener('input', () => onInput(control.value))
  wrap.append(control)
  return wrap
}

function textarea(label: string, value: string, onInput: (value: string) => void, rows = 3): HTMLElement {
  const wrap = el('label', 'cl-canvas__field')
  wrap.append(el('span', 'adm-label', label))
  const control = el('textarea', 'adm-input')
  control.rows = rows
  control.value = value
  control.addEventListener('input', () => onInput(control.value))
  wrap.append(control)
  return wrap
}

function itemsOf(block: EditableBlock, surface: Surface): CanvasItem[] {
  const value = block.content[surface]
  if (Array.isArray(value)) return value as CanvasItem[]
  const items: CanvasItem[] = []
  block.content[surface] = items
  return items
}

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

function newItem(type: CanvasItem['type']): CanvasItem {
  switch (type) {
    case 'paragraph': return { type, text: uk('Новий текст') }
    case 'heading': return { type, text: uk('Заголовок') }
    case 'list': return { type, items: [uk('Перший пункт')] }
    case 'table': return { type, headers: [uk('Стовпець 1'), uk('Стовпець 2')], rows: [[uk('Значення 1'), uk('Значення 2')]] }
    case 'image': return { type, src: '', alt: uk('Опис зображення') }
    case 'video': return { type, videoId: '' }
    case 'link': return { type, url: '', label: uk('Посилання') }
  }
}

function renderItem(item: CanvasItem, items: CanvasItem[], index: number, surface: Surface, changed: () => void, touched: () => void): HTMLElement {
  const card = el('div', 'cl-canvas__item')
  let preview: HTMLDivElement | null = null
  const touch = () => {
    touched()
    if (preview) preview.replaceChildren(renderCanvasItems([item], surface === 'board' ? 'board' : surface === 'student' ? 'student' : 'teacher'))
  }
  const header = el('div', 'cl-canvas__item-head')
  header.append(el('strong', undefined, `${index + 1}. ${LABELS[item.type]}`))
  const controls = el('span', 'cl-canvas__item-actions')
  const up = button('↑', () => { [items[index - 1], items[index]] = [items[index]!, items[index - 1]!]; changed() })
  up.disabled = index === 0
  up.setAttribute('aria-label', `Перемістити ${LABELS[item.type]} вище`)
  const down = button('↓', () => { [items[index], items[index + 1]] = [items[index + 1]!, items[index]!]; changed() })
  down.disabled = index === items.length - 1
  down.setAttribute('aria-label', `Перемістити ${LABELS[item.type]} нижче`)
  controls.append(up, down, button('Прибрати', () => { items.splice(index, 1); changed() }))
  header.append(controls)
  card.append(header)

  if (item.type === 'paragraph' || item.type === 'heading') {
    const editable = el(item.type === 'heading' ? 'h3' : 'p', 'cl-canvas__editable', item.text.uk)
    editable.contentEditable = 'plaintext-only'
    editable.setAttribute('role', 'textbox')
    editable.setAttribute('aria-label', item.type === 'heading' ? 'Текст заголовка' : 'Текст абзацу')
    editable.setAttribute('aria-multiline', item.type === 'paragraph' ? 'true' : 'false')
    editable.addEventListener('input', () => { item.text.uk = editable.innerText.trim(); touch() })
    card.append(editable)
  } else if (item.type === 'list') {
    card.append(textarea('Пункти списку, кожен з нового рядка', item.items.map(line => line.uk).join('\n'), value => {
      item.items = value.split('\n').map(line => uk(line.trim())).filter(line => line.uk)
      touch()
    }))
  } else if (item.type === 'table') {
    const grid = el('div', 'cl-canvas__table-grid')
    const table = el('table', 'le-practice__table')
    table.setAttribute('aria-label', 'Редагування таблиці')
    const head = el('thead')
    const headRow = el('tr')
    item.headers.forEach((cell, column) => {
      const th = el('th')
      th.append(input(`Заголовок ${column + 1}`, cell.uk, value => { cell.uk = value; touch() }))
      headRow.append(th)
    })
    head.append(headRow)
    const body = el('tbody')
    item.rows.forEach((row, rowIndex) => {
      const tr = el('tr')
      row.forEach((cell, column) => {
        const td = el('td')
        td.append(input(`Рядок ${rowIndex + 1}, стовпець ${column + 1}`, cell.uk, value => { cell.uk = value; touch() }))
        tr.append(td)
      })
      body.append(tr)
    })
    table.append(head, body)
    grid.append(table)
    card.append(grid)
    const controls = el('div', 'cl-canvas__add')
    const addRow = button('+ Рядок', () => { item.rows.push(item.headers.map(() => uk('Значення'))); changed() })
    addRow.disabled = item.rows.length >= 20
    const addColumn = button('+ Стовпець', () => { item.headers.push(uk(`Стовпець ${item.headers.length + 1}`)); item.rows.forEach(row => row.push(uk('Значення'))); changed() })
    addColumn.disabled = item.headers.length >= 10
    const removeRow = button('− Рядок', () => { item.rows.pop(); changed() })
    removeRow.disabled = item.rows.length <= 1
    const removeColumn = button('− Стовпець', () => { item.headers.pop(); item.rows.forEach(row => row.pop()); changed() })
    removeColumn.disabled = item.headers.length <= 2
    controls.append(addRow, addColumn, removeRow, removeColumn)
    card.append(controls)
    const paste = el('details')
    paste.append(el('summary', undefined, 'Вставити таблицю з Excel або Google Sheets'))
    let pastedRows: { uk: string }[][] | null = null
    paste.append(textarea('Уся таблиця: рядки з нового рядка, клітинки через Tab', '', value => {
      const rows = value.split('\n').map(line => line.trimEnd().split('\t').map(cell => uk(cell.trim()))).filter(row => row.some(cell => cell.uk))
      pastedRows = rows.length >= 2 && rows.length <= 21 && rows[0]!.length >= 2 && rows[0]!.length <= 10 && rows.every(row => row.length === rows[0]!.length) ? rows : null
    }, 5))
    paste.append(button('Застосувати вставлену таблицю', () => {
      if (!pastedRows) return
      item.headers = pastedRows[0]!
      item.rows = pastedRows.slice(1)
      changed()
    }))
    card.append(paste)
  } else if (item.type === 'image') {
    card.append(input('Адреса зображення (HTTPS або /шлях)', item.src, value => { item.src = value.trim(); touch() }))
    card.append(input('Опис зображення', item.alt.uk, value => { item.alt.uk = value; touch() }))
  } else if (item.type === 'video') {
    const status = el('p', 'adm-field-hint', item.videoId ? 'Відео YouTube готове до показу.' : 'Вставте посилання на YouTube.')
    card.append(input('Посилання на YouTube', item.videoId ? `https://www.youtube.com/watch?v=${item.videoId}` : '', value => {
      item.videoId = youtubeId(value) ?? ''
      status.textContent = item.videoId ? 'Відео YouTube готове до показу.' : 'Потрібне коректне посилання на YouTube.'
      touch()
    }), status)
  } else if (item.type === 'link') {
    card.append(input('Адреса посилання', item.url, value => { item.url = value.trim(); touch() }))
    card.append(input('Текст посилання', item.label.uk, value => { item.label.uk = value; touch() }))
  }
  preview = el('div', 'cl-canvas__item-preview')
  preview.append(renderCanvasItems([item], surface === 'board' ? 'board' : surface === 'student' ? 'student' : 'teacher'))
  card.append(preview)
  return card
}

export interface CanvasEditorOptions {
  selected: Surface
  select(surface: Surface): void
  changed(): void
  touched(): void
}

export function renderCanvasEditor(block: EditableBlock, options: CanvasEditorOptions): HTMLElement {
  const root = el('section', 'cl-canvas')
  root.append(input('Назва блоку', (block.content.heading as { uk?: string } | undefined)?.uk ?? '', value => {
    block.content.heading = uk(value)
    options.touched()
  }))
  const tabs = el('div', 'cl-canvas__tabs')
  tabs.setAttribute('role', 'tablist')
  tabs.setAttribute('aria-label', 'Вигляд блоку')
  const panel = el('div', 'cl-canvas__panel')
  const selection = SURFACES.find(surface => surface.key === options.selected) ?? SURFACES[0]!
  for (const surface of SURFACES) {
    const tab = button(surface.label, () => options.select(surface.key), 'cl-canvas__tab')
    tab.setAttribute('role', 'tab')
    tab.setAttribute('aria-selected', String(surface.key === selection.key))
    tab.id = `cl-canvas-tab-${block.id}-${surface.key}`
    tab.setAttribute('aria-controls', `cl-canvas-panel-${block.id}`)
    tabs.append(tab)
  }
  panel.id = `cl-canvas-panel-${block.id}`
  panel.setAttribute('role', 'tabpanel')
  panel.setAttribute('aria-labelledby', `cl-canvas-tab-${block.id}-${selection.key}`)
  root.append(tabs, panel)
  panel.append(el('p', 'adm-field-hint', selection.hint))
  const items = itemsOf(block, selection.key)
  if (!items.length) panel.append(el('p', 'cl-canvas__empty', 'Тут порожньо — на цьому екрані блок не з’явиться.'))
  items.forEach((item, index) => panel.append(renderItem(item, items, index, selection.key, () => { syncViews(block); options.changed() }, options.touched)))
  const add = el('div', 'cl-canvas__add')
  for (const type of Object.keys(LABELS) as CanvasItem['type'][]) {
    add.append(button(`+ ${LABELS[type]}`, () => { items.push(newItem(type)); syncViews(block); options.changed() }))
  }
  panel.append(add)

  const html = el('details', 'cl-canvas__html')
  html.append(el('summary', undefined, '</> HTML — вставити або змінити код'))
  const area = el('textarea', 'adm-input adm-input--code')
  area.rows = 10
  area.value = canvasItemsToHtml(items)
  area.setAttribute('aria-label', `HTML для вкладки «${selection.label}»`)
  const report = el('p', 'adm-field-hint')
  area.addEventListener('input', () => {
    const parsed = parseCanvasHtml(area.value)
    report.textContent = parsed.warnings.length ? parsed.warnings.join(' ') : `Розпізнано елементів: ${parsed.items.length}. HTML буде перетворено на блоки.`
  })
  html.append(area, report, button('Застосувати HTML до цієї вкладки', () => {
    const parsed = parseCanvasHtml(area.value)
    if (!parsed.items.length && area.value.trim()) {
      report.textContent = `Нічого не перенесено. ${parsed.warnings.join(' ')}`
      return
    }
    block.content[selection.key] = parsed.items
    syncViews(block)
    options.changed()
  }))
  panel.append(html)
  return root
}
