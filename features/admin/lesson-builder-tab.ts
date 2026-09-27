// Lesson Builder: a large board of collected materials on the left (one canvas
// per topic, Miro-like) and the lesson outline on the right. Scattered ideas are
// dragged into a structured lesson. Cards show thumbnails only; a click opens a
// dialog with the preview and every action.

import {
  getAdminCurriculumLessons, getAdminCurriculumLesson, getAdminSubjectPacks, getAdminCurriculumOutcomes, getAdminCurriculumCards,
  createAdminCurriculumLesson, updateAdminCurriculumLesson, validateAdminCurriculumLesson,
  setAdminCurriculumLessonStatus, getTeacherMe, checkCurriculumActivity,
  getBuilderBoards, createBuilderBoard, renameBuilderBoard, deleteBuilderBoard, getBuilderMaterials, searchBuilderMaterials,
  createBuilderMaterial, updateBuilderMaterial, saveBuilderPositions, deleteBuilderMaterials,
  type AdminCurriculumLesson, type AdminCurriculumLessonSummary, type AdminSubjectPack, type AdminCurriculumOutcome,
  type AdminCurriculumCardLesson, type ApiError, type BuilderBoard, type BuilderMaterial, type BuilderMaterialKind,
} from '../api/client.js'
import {
  newLesson, newBlock, moveBlockTo, withoutAnswerKeys, activityTemplate, addActivityOutcome, removeActivityOutcome,
  setOnBoard, setOnDevices, convertToCanvas, CONVERTIBLE_TYPES, describeLessonIssue, type EditableLesson, type EditableBlock,
} from './curriculum-model.js'
import { renderCanvasItems } from '../lesson-engine/canvas-view.js'
import { renderSlide } from '../lesson-engine/presentation-view.js'
import { mountBoardWindow, type BoardWindowController } from '../lesson-engine/board-window.js'
import { presentationSlides, MECHANIC_LABELS } from '../lesson-engine/projection.js'
import type { CanvasItem, LessonDefinition } from '../lesson-engine/types.js'
import { openActivityDialog } from './activity-dialog.js'
import { createFocusTrap } from '../../utils/focus-trap.js'
import { friendlyError, showConfirm } from './ui.js'
import { blockTitle, blockKind, canvasItems, resourceItem, makeMaterial, appendSourceBlocks, lessonSize, KIND_LABELS, type BuilderKind } from './lesson-builder-model.js'
import { fileItem, materialInbox } from './lesson-builder-storage.js'
import { mountBoardCanvas, type BoardCanvas, type CanvasCard } from './builder-canvas.js'
import { freeSpot, type Placed, type Point } from './builder-canvas-model.js'

const MATERIAL_KINDS: BuilderMaterialKind[] = ['text', 'image', 'video', 'pdf', 'html', 'learningapps', 'link']
const LESSON_KINDS: BuilderKind[] = ['text', 'image', 'video', 'pdf', 'html', 'learningapps', 'link', 'activity']
const DEFAULT_BOARD = 'Мої матеріали'
const LAST_BOARD_KEY = 'rozumko_builder_board'
const MAX_LESSON_BYTES = 4 * 1024 * 1024

let packs: AdminSubjectPack[] = []
let outcomes: AdminCurriculumOutcome[] = []
let summaries: AdminCurriculumLessonSummary[] = []
let owner = ''
let loaded = false

// Board state
let boards: BuilderBoard[] = []
let boardId: string | null = null
let materials: BuilderMaterial[] = []
let query = ''
let kindFilter: BuilderMaterialKind | '' = ''
let searchResults: BuilderMaterial[] | null = null
let searchTimer: number | null = null
let searchSeq = 0
let canvas: BoardCanvas | null = null
const pendingPositions = new Map<string, Placed>()
let positionsTimer: number | null = null

// "From lessons" drawer
let cardIndex: AdminCurriculumCardLesson[] | null = null
let drawerKind: BuilderKind | '' = ''
let drawerQuery = ''

// Lesson state
let lesson: EditableLesson | null = null
let row: AdminCurriculumLesson | null = null
let dirty = false
let busy = false
let reserved = new Set<string>()
let undo: EditableLesson[] = []
let redo: EditableLesson[] = []
let board: BoardWindowController | null = null
let presenting = false
const sourceCache = new Map<string, EditableLesson>()

const root = () => document.getElementById('lb-root')!
const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = cls
  if (text !== undefined) node.textContent = text
  return node
}
function button(label: string, run: () => void, cls = 'btn-adm-ghost btn--sm') {
  const node = el('button', cls, label)
  node.type = 'button'
  node.addEventListener('click', run)
  return node
}
function iconButton(label: string, icon: string, run: () => void, cls = 'btn-adm-ghost btn--sm lb-icon') {
  const node = button(icon, run, cls)
  node.setAttribute('aria-label', label)
  node.title = label
  return node
}
function field(label: string, value: string, change: (value: string) => void, multiline = false): HTMLElement {
  const wrap = el('label', 'lb-field')
  const input = multiline ? el('textarea', 'adm-input') : el('input', 'adm-input')
  input.value = value
  input.addEventListener('input', () => change(input.value))
  if (input instanceof HTMLTextAreaElement) input.rows = 9
  wrap.append(el('span', 'adm-label', label), input)
  return wrap
}
function picker(label: string, values: [string, string][], value: string, change: (v: string) => void): HTMLElement {
  const wrap = el('label', 'lb-field')
  const select = el('select', 'adm-input adm-input--sm')
  for (const [id, text] of values) select.append(new Option(text, id))
  select.value = value
  select.addEventListener('change', () => change(select.value))
  wrap.append(el('span', 'adm-label', label), select)
  return wrap
}
function menu(label: string, items: [string, () => void][]): HTMLElement {
  const details = el('details', 'lb-menu')
  const summary = el('summary', 'btn-adm-ghost btn--sm lb-icon', '⋯')
  summary.setAttribute('aria-label', label)
  summary.title = label
  const list = el('div', 'lb-menu__list')
  for (const [text, run] of items) list.append(button(text, () => { details.open = false; run() }, 'lb-menu__item'))
  details.append(summary, list)
  return details
}

// ── Toasts replace inline messages, so nothing shifts the layout ──
function toast(text: string, options: { error?: boolean; action?: [string, () => void] } = {}) {
  let host = byId('lb-toasts')
  if (!host) { host = el('div', 'lb-toasts'); host.id = 'lb-toasts'; document.body.append(host) }
  const item = el('div', `lb-toast${options.error ? ' lb-toast--error' : ''}`)
  item.setAttribute('role', options.error ? 'alert' : 'status')
  item.append(el('span', '', text))
  if (options.action) {
    const [label, run] = options.action
    item.append(button(label, () => { item.remove(); run() }, 'lb-toast__action'))
  }
  host.append(item)
  // At most two at a time: a burst of additions must not bury the board.
  while (host.childElementCount > 2) host.firstElementChild!.remove()
  window.setTimeout(() => item.remove(), options.error ? 8000 : 4000)
}
function report(err: unknown) {
  const error = err as ApiError
  const issues = error.body?.issues as { path: string; message: string }[] | undefined
  if (error.status === 409 && !issues) {
    toast('Урок уже змінив інший редактор. Ваші зміни залишилися тут: експортуйте JSON перед оновленням.', { error: true })
    return
  }
  toast(issues?.length ? issues.map(describeLessonIssue).join(' · ') : friendlyError(error.message), { error: true })
}

function modal(title: string, options: { wide?: boolean; guard?: () => boolean } = {}) {
  const overlay = el('div', 'question-modal-overlay cl-overlay')
  overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', title)
  const card = el('div', `question-modal-card cl-overlay__card lb-dialog${options.wide ? ' lb-dialog--wide' : ''}`)
  const header = el('div', 'cl-overlay__head')
  const body = el('div', 'cl-overlay__body')
  const opener = document.activeElement as HTMLElement | null
  let removeTrap = () => {}
  let beforeClose = () => {}
  const close = (force = false) => {
    if (!force && options.guard && !options.guard()) return
    beforeClose(); removeTrap(); overlay.remove(); opener?.focus({ preventScroll: true })
  }
  const attempt = () => {
    if (options.guard && !options.guard()) showConfirm('Закрити без збереження змін?', () => close(true))
    else close(true)
  }
  header.append(el('h3', '', title), button('Закрити', attempt))
  card.append(header, body); overlay.append(card); document.body.append(overlay)
  removeTrap = createFocusTrap(overlay, attempt)
  header.querySelector('button')!.focus()
  return { body, card, close: () => close(true), onClose: (callback: () => void) => { beforeClose = callback } }
}

function pack() { return packs.find(p => p.id === lesson?.subjectPackId) ?? packs[0]! }
function checkpoint() {
  if (!lesson) return
  undo.push(structuredClone(lesson))
  if (undo.length > 30) undo.shift()
  redo = []
}
function changed() {
  dirty = true
  renderSequence()
  updateActions()
}
function updateActions() {
  const host = root()
  for (const node of host.querySelectorAll<HTMLButtonElement>('[data-save]')) node.disabled = busy || !lesson
  for (const node of host.querySelectorAll<HTMLButtonElement>('[data-start]')) node.disabled = busy || !lesson?.blocks.length
  const undoButton = host.querySelector<HTMLButtonElement>('[data-undo]')
  const redoButton = host.querySelector<HTMLButtonElement>('[data-redo]')
  if (undoButton) undoButton.disabled = busy || !undo.length
  if (redoButton) redoButton.disabled = busy || !redo.length
  const status = byId('lb-save-state')
  if (status) status.textContent = busy ? 'Зберігаємо…' : dirty ? 'Є незбережені зміни' : row ? 'Збережено' : 'Новий урок'
}
function dropBoard() {
  board?.destroy()
  board = null
  presenting = false
}
function rememberBoard(id: string | null) {
  try { if (id) localStorage.setItem(LAST_BOARD_KEY, id); else localStorage.removeItem(LAST_BOARD_KEY) } catch { /* per-viewer convenience only */ }
}
function rememberedBoard(): string | null {
  try { return localStorage.getItem(LAST_BOARD_KEY) } catch { return null }
}

// ── Thumbnails ──
// A 640×400 slide scaled into whatever box holds it. Layout width is used, so
// cards inside the zoomed canvas keep a stable scale. Detached thumbnails
// report size 0 once and are released.
const thumbScale = new ResizeObserver(entries => {
  for (const entry of entries) {
    const node = entry.target as HTMLElement
    if (!node.isConnected) { thumbScale.unobserve(node); continue }
    if (entry.contentRect.width) node.style.setProperty('--lb-scale', String(entry.contentRect.width / 640))
  }
})
function thumb(block: EditableBlock, context: EditableLesson = lesson!): HTMLElement {
  const kind = blockKind(block)
  const node = el('div', 'lb-thumb lb-thumb--' + kind)
  node.setAttribute('aria-hidden', 'true')
  const layer = el('div', 'lb-thumb-content')
  const items = canvasItems(block)
  const video = items.find(item => item.type === 'video')
  const file = items.find(item => item.type === 'file')
  if (video?.type === 'video') {
    const image = el('img')
    image.src = `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`
    image.alt = ''
    layer.append(image)
  } else if (kind === 'html') {
    // Authored code never runs in a thumbnail: dozens of live frames would stall the board.
    const html = items.find(item => item.type === 'html')
    const text = html?.type === 'html' ? html.html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ''
    layer.append(el('div', 'lb-thumb-symbol', '</>'), el('strong', '', text.slice(0, 80) || blockTitle(block)))
  } else if (kind === 'pdf' || kind === 'learningapps' || (file?.type === 'file' && !file.data)) {
    layer.append(el('div', 'lb-thumb-symbol', kind === 'pdf' ? 'PDF' : kind === 'learningapps' ? 'LearningApps' : '🖼'), el('strong', '', blockTitle(block)))
  } else {
    // Only the projected view is used; answer keys and teacher notes are excluded.
    const safe = withoutAnswerKeys({ ...context, blocks: [block] }) as unknown as LessonDefinition
    const slide = presentationSlides(safe)[0]
    if (slide) layer.append(renderSlide(slide))
    else layer.append(el('strong', '', blockTitle(block)))
  }
  layer.inert = true
  layer.querySelectorAll('iframe').forEach(frame => frame.remove())
  layer.querySelectorAll('img').forEach(image => { image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; image.draggable = false })
  node.append(layer)
  thumbScale.observe(node)
  return node
}

/** A full-size preview for dialogs: live media and sandboxed HTML are allowed here. */
function preview(block: EditableBlock, context: EditableLesson): HTMLElement {
  const host = el('div', 'lb-dialog-preview')
  const safe = withoutAnswerKeys({ ...context, blocks: [block] }) as unknown as LessonDefinition
  const slide = presentationSlides(safe)[0]
  if (slide) host.append(renderSlide(slide))
  else if (block.type === 'canvas') host.append(renderCanvasItems(canvasItems(block), 'teacher'))
  else host.append(el('p', 'lb-dialog-note', 'Ця картка не показується на проєкторі.'))
  return host
}

function materialBlock(material: Pick<BuilderMaterial, 'title' | 'items'>): EditableBlock {
  return makeMaterial(lesson!, pack(), material.title, material.items, reserved)
}
/** Lesson blocks for several materials at once; each gets its own fresh ID. */
function materialBlocks(list: Pick<BuilderMaterial, 'title' | 'items'>[]): EditableBlock[] {
  const taken = new Set(reserved)
  return list.map(material => {
    const block = makeMaterial(lesson!, pack(), material.title, material.items, taken)
    taken.add(block.id)
    return block
  })
}

// ── Entry points ──
export function initLessonBuilderTab() {
  window.addEventListener('beforeunload', event => { if (dirty) event.preventDefault() })
  // Menus close on any click outside them, like native menus.
  document.addEventListener('pointerdown', event => {
    for (const open of document.querySelectorAll<HTMLDetailsElement>('.lb-menu[open]')) {
      if (!open.contains(event.target as Node)) open.open = false
    }
  })
  // Tab changes stop the local show and release its keyboard/channel listeners.
  document.querySelectorAll<HTMLElement>('.admin-tab').forEach(tab => tab.addEventListener('click', () => {
    if (tab.dataset.tab !== 'lesson-builder') dropBoard()
  }))
}

export async function loadLessonBuilderTab() {
  if (loaded) {
    if (row && !dirty) await openSaved(row.id)
    return
  }
  root().textContent = 'Завантажуємо конструктор…'
  try {
    const [list, registry, directory, me, boardList] = await Promise.all([
      getAdminCurriculumLessons(), getAdminSubjectPacks(), getAdminCurriculumOutcomes(), getTeacherMe(), getBuilderBoards(),
    ])
    summaries = list.lessons
    packs = registry.packs
    outcomes = directory.outcomes
    owner = me.id
    boards = boardList.boards
    if (!packs.length) throw new Error('Немає доступного предмета для уроку.')
    loaded = true
    createLesson()
    const remembered = rememberedBoard()
    await openBoard(boards.find(b => b.id === remembered)?.id ?? boards[0]?.id ?? null)
    await importBrowserInbox()
  } catch (err) {
    root().replaceChildren(el('p', 'adm-form-error', friendlyError((err as Error).message)), button('Спробувати ще раз', () => { void loadLessonBuilderTab() }))
  }
}

/** The pre-board library lived in this browser only; move it to the server once. */
async function importBrowserInbox() {
  let legacy: Awaited<ReturnType<typeof materialInbox>>
  try { legacy = await materialInbox(owner) } catch { return }
  if (!legacy.length) return
  try {
    const target = await ensureBoard()
    let moved = 0
    for (const item of legacy) {
      const at = freeSpot(materials, { x: 0, y: 0 })
      const { material } = await createBuilderMaterial(target, { title: item.title.slice(0, 200) || 'Матеріал', items: item.items, x: at.x, y: at.y })
      materials.push(material)
      moved++
    }
    await materialInbox(owner, [])
    await refreshBoards()
    renderBoard()
    toast(`Перенесено ${moved} матеріал(и) з цього браузера на дошку «${boards.find(b => b.id === target)?.title ?? DEFAULT_BOARD}».`)
  } catch (err) { report(err) }
}

function createLesson() {
  dropBoard()
  const selectedPack = packs.find(p => p.id === lesson?.subjectPackId) ?? packs[0]!
  lesson = newLesson({ id: `builder-${crypto.randomUUID()}`, title: 'Новий урок', grade: selectedPack.gradeRange.min, pack: selectedPack })
  lesson.metadata.sourceRef = 'visual-builder'
  row = null
  dirty = false
  reserved = new Set()
  undo = []; redo = []
  render()
}
function discardThen(run: () => void) {
  if (busy) return
  if (dirty) showConfirm('Є незбережені зміни в уроці. Продовжити без збереження?', run)
  else run()
}
async function openSaved(id: string) {
  try {
    const result = await getAdminCurriculumLesson(id)
    dropBoard()
    row = result.lesson
    lesson = structuredClone(row.draftContent) as unknown as EditableLesson
    dirty = false
    reserved = new Set((row.publishedSnapshot?.blocks as EditableBlock[] | undefined)?.map(b => b.id) ?? [])
    undo = []; redo = []
    render()
  } catch (err) { report(err) }
}

// ── Layout ──
function render() {
  const host = root()
  canvas?.destroy()
  canvas = null
  host.replaceChildren()
  const layout = el('div', 'lb-layout')

  // Left: boards
  const area = el('section', 'lb-board')
  area.setAttribute('aria-label', 'Дошки матеріалів')
  const tabs = el('div', 'lb-boardbar')
  tabs.id = 'lb-boardbar'
  const toolbar = el('div', 'lb-toolbar')
  const search = el('input', 'adm-input lb-search')
  search.type = 'search'
  search.placeholder = 'Пошук по всіх дошках'
  search.setAttribute('aria-label', 'Пошук матеріалів по всіх дошках')
  search.value = query
  search.addEventListener('input', () => scheduleSearch(search.value))
  const chips = el('div', 'lb-chips')
  chips.setAttribute('role', 'group')
  chips.setAttribute('aria-label', 'Тип матеріалу')
  chips.id = 'lb-chips'
  const upload = el('input', 'sr-only')
  upload.type = 'file'; upload.multiple = true
  upload.accept = 'image/png,image/jpeg,image/webp,application/pdf'
  upload.setAttribute('aria-label', 'Завантажити файли')
  upload.addEventListener('change', () => { void captureFiles([...upload.files ?? []], canvas?.centre() ?? { x: 0, y: 0 }); upload.value = '' })
  const add = menu('Додати матеріал', [
    ...MATERIAL_KINDS.map(kind => [KIND_LABELS[kind], () => addDialog(kind, 'board')] as [string, () => void]),
    ['Файл з комп’ютера…', () => upload.click()],
  ])
  add.classList.add('lb-add')
  add.querySelector('summary')!.textContent = '+ Додати'
  add.querySelector('summary')!.className = 'btn-adm-emerald btn--sm'
  toolbar.append(search, chips,
    button('Упорядкувати', arrangeBoard), button('З уроків', () => { void toggleDrawer() }), add, upload)
  const found = el('div', 'lb-found')
  found.id = 'lb-found'
  found.hidden = true
  canvas = mountBoardCanvas({
    label: 'Полотно матеріалів',
    emptyHint: 'Перетягніть сюди файли, картинки чи посилання, вставте їх через Ctrl+V або натисніть «+ Додати».',
    onOpen: id => { const m = materials.find(item => item.id === id); if (m) materialDialog(m) },
    onMove: queuePositions,
    onDelete: ids => { void removeMaterials(ids) },
    // Several cards keep their reading order on the board: top to bottom, then left to right.
    onDropOutside: (ids, client) => dropIntoLesson(client, () => materialBlocks(materials
      .filter(m => ids.includes(m.id)).sort((a, b) => a.y - b.y || a.x - b.x))),
    onDragOutside: client => markInsertion(client),
    onExternalDrop: (data, at) => capture(data, at),
    onPaste: (data, at) => capture(data, at),
  })
  const stage = el('div', 'lb-stage')
  const drawer = el('aside', 'lb-drawer')
  drawer.id = 'lb-drawer'
  drawer.hidden = true
  drawer.setAttribute('aria-label', 'Картки з уроків')
  stage.append(canvas.element, drawer)
  area.append(tabs, toolbar, found, stage, el('p', 'lb-hint', 'Тягніть фон — рух полотном · Ctrl + колесо — масштаб · Shift + тягнути — виділити кілька · перетягніть картку в урок праворуч'))

  // Right: lesson outline
  const outline = el('section', 'lb-lesson')
  outline.setAttribute('aria-label', 'Структура уроку')
  const head = el('div', 'lb-lesson-head')
  const title = el('input', 'adm-input lb-lesson-title')
  title.value = lesson!.title.uk
  title.setAttribute('aria-label', 'Назва уроку')
  title.addEventListener('input', () => {
    lesson!.title.uk = title.value
    const hero = lesson!.blocks.find(b => b.type === 'hero')
    if (hero) { hero.content.title = { uk: title.value }; if (hero.presentation) hero.presentation.headline = { uk: title.value } }
    dirty = true
    updateActions()
  })
  // The hero thumbnail follows once typing is done, not on every keystroke.
  title.addEventListener('change', () => renderSequence())
  const undoButton = iconButton('Скасувати', '↶', () => historyMove(undo, redo)); undoButton.dataset.undo = ''
  const redoButton = iconButton('Повторити', '↷', () => historyMove(redo, undo)); redoButton.dataset.redo = ''
  head.append(title, undoButton, redoButton, menu('Дії з уроком', [
    ['Новий урок', () => discardThen(createLesson)],
    ['Відкрити урок…', openLessonDialog],
    ['Параметри уроку…', settingsDialog],
    ['Повний редактор', () => { void openFullEditor() }],
    ['Експорт JSON', exportLesson],
  ]))
  const sequence = el('ol', 'lb-sequence')
  sequence.id = 'lb-sequence'
  sequence.setAttribute('aria-label', 'Кроки уроку')
  const quick = el('div', 'lb-quick')
  quick.append(button('+ Текстовий слайд', () => addDialog('text', 'lesson')), button('+ Завдання', addActivity))
  const footer = el('div', 'lb-footer')
  const saved = el('p', 'adm-field-hint'); saved.id = 'lb-save-state'; saved.setAttribute('role', 'status')
  const save = button('Зберегти', () => { void saveLesson() }, 'btn-adm-slate'); save.dataset.save = ''
  const start = button('Провести урок', conductDialog, 'btn-adm-emerald'); start.dataset.start = ''
  footer.append(saved, save, start)
  outline.append(head, sequence, quick, footer)
  layout.append(area, outline)

  const console = el('section', 'lb-console'); console.id = 'lb-console'; console.hidden = true
  host.append(el('h2', 'sr-only', 'Конструктор уроків'), layout, console)
  renderBoardBar(); renderChips(); renderBoard(); renderSequence(); updateActions()
  requestAnimationFrame(() => canvas?.fit())
}

function historyMove(from: EditableLesson[], to: EditableLesson[]) {
  if (!lesson || !from.length || busy) return
  to.push(structuredClone(lesson)); lesson = from.pop()!
  dropBoard(); dirty = true
  const title = root().querySelector<HTMLInputElement>('.lb-lesson-title')
  if (title) title.value = lesson.title.uk
  renderSequence(); updateActions()
}

// ── Boards ──
async function refreshBoards() {
  boards = (await getBuilderBoards()).boards
  renderBoardBar()
}
async function openBoard(id: string | null) {
  boardId = id
  rememberBoard(id)
  materials = []
  renderBoardBar()
  if (id) {
    try { materials = (await getBuilderMaterials(id)).materials }
    catch (err) { report(err) }
  }
  renderBoard()
  canvas?.fit()
}
async function ensureBoard(): Promise<string> {
  if (boardId) return boardId
  const existing = boards.find(b => b.title === DEFAULT_BOARD)
  if (existing) { await openBoard(existing.id); return existing.id }
  const { board: created } = await createBuilderBoard(DEFAULT_BOARD)
  boards = [created, ...boards]
  boardId = created.id
  rememberBoard(created.id)
  renderBoardBar()
  return created.id
}
function renderBoardBar() {
  const bar = byId('lb-boardbar')
  if (!bar) return
  bar.replaceChildren()
  const list = el('div', 'lb-boardtabs')
  list.setAttribute('role', 'tablist')
  list.setAttribute('aria-label', 'Дошки')
  for (const item of boards) {
    const tab = button(item.title, () => { if (item.id !== boardId) void openBoard(item.id) }, 'lb-boardtab')
    tab.setAttribute('role', 'tab')
    tab.setAttribute('aria-selected', String(item.id === boardId))
    tab.title = `${item.title} · ${item.materialCount} матеріал(ів)`
    list.append(tab)
  }
  bar.append(list, button('+ Дошка', newBoardDialog, 'lb-boardtab lb-boardtab--new'))
  const current = boards.find(b => b.id === boardId)
  if (current) bar.append(menu('Дії з дошкою', [
    ['Перейменувати…', () => renameBoardDialog(current)],
    ['Видалити дошку…', () => deleteBoard(current)],
  ]))
}
function newBoardDialog() {
  const { body, close } = modal('Нова дошка')
  let title = ''
  const input = field('Назва дошки (тема)', '', v => { title = v })
  const create = button('Створити', async () => {
    if (!title.trim()) return
    try {
      const { board: created } = await createBuilderBoard(title.trim())
      boards = [created, ...boards]
      close()
      await openBoard(created.id)
    } catch (err) { report(err) }
  }, 'btn-adm-emerald')
  input.querySelector('input')!.addEventListener('keydown', event => { if (event.key === 'Enter') create.click() })
  body.append(input, create)
  input.querySelector('input')!.focus()
}
function renameBoardDialog(current: BuilderBoard) {
  const { body, close } = modal('Перейменувати дошку')
  let title = current.title
  body.append(field('Назва дошки', title, v => { title = v }), button('Зберегти', async () => {
    if (!title.trim()) return
    try { await renameBuilderBoard(current.id, title.trim()); close(); await refreshBoards() } catch (err) { report(err) }
  }, 'btn-adm-emerald'))
}
function deleteBoard(current: BuilderBoard) {
  showConfirm(`Видалити дошку «${current.title}» разом з її матеріалами (${current.materialCount})? Уроки, куди ви їх уже додали, не зміняться.`, () => {
    void (async () => {
      try {
        await deleteBuilderBoard(current.id)
        boards = boards.filter(b => b.id !== current.id)
        await openBoard(boards[0]?.id ?? null)
      } catch (err) { report(err) }
    })()
  })
}

function renderChips() {
  const chips = byId('lb-chips')
  if (!chips) return
  chips.replaceChildren()
  for (const kind of ['', ...MATERIAL_KINDS] as (BuilderMaterialKind | '')[]) {
    const chip = button(kind ? KIND_LABELS[kind] : 'Усі', () => { kindFilter = kind; renderChips(); paintMatches() }, 'lb-chip')
    chip.setAttribute('aria-pressed', String(kindFilter === kind))
    chips.append(chip)
  }
}

function renderBoard() {
  if (!canvas || !lesson) return
  canvas.setCards(materials.map((material): CanvasCard => ({
    id: material.id, x: material.x, y: material.y, title: material.title, version: material.updatedAt,
    render: () => thumb(materialBlock(material)),
  })))
  paintMatches()
}

// ── Search and filters: dim the board, list matches from other boards ──
function scheduleSearch(value: string) {
  query = value.trim()
  if (searchTimer !== null) window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => { void runSearch() }, 250)
}
async function runSearch() {
  const seq = ++searchSeq
  if (query.length < 2) { searchResults = null; paintMatches(); return }
  try {
    const { materials: found } = await searchBuilderMaterials(query)
    if (seq !== searchSeq) return
    searchResults = found
    paintMatches()
  } catch (err) { report(err) }
}
function paintMatches() {
  if (!canvas) return
  const byQuery = searchResults ? new Set(searchResults.map(m => m.id)) : null
  const active = byQuery !== null || kindFilter !== ''
  const ids = materials.filter(m => (!kindFilter || m.kind === kindFilter) && (!byQuery || byQuery.has(m.id))).map(m => m.id)
  canvas.setMatches(active ? new Set(ids) : null)
  const found = byId('lb-found')
  if (!found) return
  found.replaceChildren()
  const elsewhere = (searchResults ?? []).filter(m => m.boardId !== boardId && (!kindFilter || m.kind === kindFilter))
  found.hidden = !active
  if (!active) return
  const summary = el('p', 'lb-found__summary', `На цій дошці: ${ids.length}${searchResults ? ` · на інших дошках: ${elsewhere.length}` : ''}`)
  if (ids.length) summary.append(button('Показати знайдені', () => canvas?.fit(ids), 'lb-link'))
  found.append(summary)
  if (!elsewhere.length) return
  const strip = el('div', 'lb-found__strip')
  for (const material of elsewhere) {
    const card = el('button', 'lb-mini')
    card.type = 'button'
    card.title = `${material.title} · дошка «${material.boardTitle ?? ''}»`
    card.setAttribute('aria-label', card.title)
    card.append(thumb(materialBlock(material)))
    pointerDrag(card, {
      click: () => materialDialog(material),
      drop: client => { dropIntoLesson(client, () => [materialBlock(material)]) },
    })
    strip.append(card)
  }
  found.append(strip)
}

// ── Materials ──
function queuePositions(positions: Placed[]) {
  for (const position of positions) {
    pendingPositions.set(position.id, position)
    const material = materials.find(m => m.id === position.id)
    if (material) { material.x = position.x; material.y = position.y }
  }
  if (positionsTimer !== null) window.clearTimeout(positionsTimer)
  positionsTimer = window.setTimeout(() => { void flushPositions() }, 400)
}
async function flushPositions() {
  positionsTimer = null
  if (!boardId || !pendingPositions.size) return
  const batch = [...pendingPositions.values()]
  pendingPositions.clear()
  try { await saveBuilderPositions(boardId, batch) }
  catch (err) { report(err) }
}
function arrangeBoard() {
  if (!canvas || !materials.length) return
  const rank = (m: BuilderMaterial) => MATERIAL_KINDS.indexOf(m.kind)
  const order = [...materials].sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title, 'uk')).map(m => m.id)
  queuePositions(canvas.arrange(order))
}

async function createMaterial(title: string, items: CanvasItem[], at: Point): Promise<BuilderMaterial | null> {
  try {
    const target = await ensureBoard()
    const spot = freeSpot(materials, at)
    const { material } = await createBuilderMaterial(target, { title: title.slice(0, 200) || 'Матеріал', items, x: spot.x, y: spot.y })
    if (target === boardId) { materials.push(material); renderBoard() }
    void refreshBoards()
    toast(`«${material.title}» на дошці.`, { action: ['Додати в урок', () => appendToLesson([materialBlock(material)], lesson!.blocks.length)] })
    return material
  } catch (err) { report(err); return null }
}
async function removeMaterials(ids: string[]) {
  const removed = materials.filter(m => ids.includes(m.id))
  if (!removed.length) return
  try {
    await deleteBuilderMaterials(ids)
    materials = materials.filter(m => !ids.includes(m.id))
    renderBoard()
    void refreshBoards()
    const target = boardId!
    toast(removed.length === 1 ? `«${removed[0]!.title}» видалено.` : `Видалено матеріалів: ${removed.length}.`, {
      action: ['Повернути', () => {
        void (async () => {
          for (const m of removed) {
            try {
              const { material } = await createBuilderMaterial(target, { title: m.title, items: m.items, x: m.x, y: m.y })
              if (target === boardId) materials.push(material)
            } catch (err) { report(err) }
          }
          renderBoard(); void refreshBoards()
        })()
      }],
    })
  } catch (err) { report(err) }
}

function capture(data: DataTransfer, at: Point) {
  if (data.files.length) { void captureFiles([...data.files], at); return }
  try {
    const html = data.getData('text/html')
    const doc = html ? new DOMParser().parseFromString(html, 'text/html') : null
    const image = doc?.querySelector('img[src]')
    const raw = image?.getAttribute('src') ?? data.getData('text/uri-list').split('\n').find(v => v && !v.startsWith('#')) ?? data.getData('text/plain')
    const label = image?.getAttribute('alt')?.slice(0, 200) || doc?.querySelector('a')?.textContent?.trim().slice(0, 200) || 'Новий матеріал'
    void createMaterial(label, [resourceItem(raw, image ? 'image' : undefined, label)], at)
  } catch (err) { report(err) }
}
async function captureFiles(files: File[], at: Point) {
  for (const file of files) {
    try { await createMaterial(file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 200), [await fileItem(file)], at) }
    catch (err) { report(err) }
  }
}

function materialDialog(material: BuilderMaterial) {
  const { body, close } = modal(material.title, { wide: true })
  body.append(preview(materialBlock(material), lesson!))
  const actions = el('div', 'lb-dialog-actions')
  actions.append(
    button('Додати в урок', () => { appendToLesson([materialBlock(material)], lesson!.blocks.length); close() }, 'btn-adm-emerald'),
    button('Редагувати', () => { close(); addDialog(material.kind, 'board', material) }, 'btn-adm-slate'),
  )
  if (material.boardId === boardId) actions.append(button('Видалити', () => { close(); void removeMaterials([material.id]) }, 'btn-adm-ghost'))
  else actions.append(button(`Відкрити дошку «${material.boardTitle ?? ''}»`, () => {
    close()
    void openBoard(material.boardId).then(() => canvas?.focusCard(material.id))
  }, 'btn-adm-ghost'))
  const others = boards.filter(b => b.id !== material.boardId)
  if (others.length) {
    const move = picker('Перемістити на дошку', [['', 'Оберіть дошку'], ...others.map(b => [b.id, b.title] as [string, string])], '', async target => {
      if (!target) return
      try {
        const spot = freeSpot([], { x: 0, y: 0 })
        await updateBuilderMaterial(material.id, { boardId: target, x: spot.x, y: spot.y })
        materials = materials.filter(m => m.id !== material.id)
        renderBoard(); void refreshBoards(); close()
        toast(`«${material.title}» перенесено на дошку «${boards.find(b => b.id === target)?.title ?? ''}».`)
      } catch (err) { report(err) }
    })
    move.classList.add('lb-move')
    actions.append(move)
  }
  body.append(actions)
}

// ── Adding and editing a material (board) or a text slide (lesson) ──
const EXTERNAL_CODE = /<script[^>]+src\s*=|<link[^>]+href\s*=\s*["']?https?:|@import|(?:src|href)\s*=\s*["']?https?:\/\/|fetch\(|XMLHttpRequest/i

function addDialog(kind: BuilderKind, target: 'board' | 'lesson', existing?: BuilderMaterial) {
  if (!lesson || busy) return
  const editing = existing !== undefined
  let dirtyForm = false
  const { body, card, close } = modal(editing ? `Редагувати: ${existing.title}` : `Додати: ${KIND_LABELS[kind]}`, { wide: kind === 'html', guard: () => !dirtyForm })
  if (kind === 'html') card.classList.add('lb-dialog--html')
  const current = existing?.items ?? []
  const firstHtml = current.find(item => item.type === 'html')
  const urlItem = current.find(item => item.type !== 'paragraph' && item.type !== 'heading' && item.type !== 'html' && item.type !== 'file' && item.type !== 'asset')
  let title = existing?.title ?? ''
  let value = kind === 'html'
    ? (firstHtml?.type === 'html' ? firstHtml.html : '<h1>Привіт, клас!</h1>\n<p>Мій матеріал уроку</p>')
    : kind === 'text'
      ? current.filter(item => item.type === 'paragraph').map(item => item.type === 'paragraph' ? item.text.uk : '').join('\n\n')
      : urlItem ? urlValue(urlItem) : ''
  const hasFile = current.some(item => item.type === 'file' || item.type === 'asset')
  const titleField = field(kind === 'text' ? 'Заголовок слайда' : 'Назва', title, v => { title = v; dirtyForm = true })
  body.append(titleField)
  const preview = el('div', 'lb-dialog-preview')
  const error = el('p', 'adm-form-error'); error.setAttribute('role', 'alert')
  const warning = el('p', 'adm-field-hint lb-warning')
  const read = (): CanvasItem[] => {
    if (!title.trim() || title.length > 200) throw new Error('Додайте назву (до 200 символів).')
    if (hasFile && editing) return current
    if (!value.trim()) throw new Error('Додайте вміст.')
    if (kind === 'html') return [{ type: 'html', html: value }]
    if (kind === 'text') {
      const lines = value.split(/\n\s*\n/).filter(v => v.trim())
      if (lines.length > 20 || lines.some(v => v.length > 2000)) throw new Error('До 20 абзаців, кожен до 2000 символів.')
      return lines.map(text => ({ type: 'paragraph', text: { uk: text.trim() } }))
    }
    return [resourceItem(value, kind, title)]
  }
  const refresh = () => {
    try {
      preview.replaceChildren(renderCanvasItems(read(), 'teacher'))
      error.textContent = ''
    } catch (err) { preview.replaceChildren(); error.textContent = (err as Error).message }
    warning.textContent = kind === 'html' && EXTERNAL_CODE.test(value)
      ? 'Зовнішні бібліотеки, шрифти, картинки за посиланням і мережеві запити в картці не завантажаться. Вбудуйте CSS і JavaScript у код.'
      : ''
  }
  let timer: number | null = null
  const later = () => { if (timer !== null) window.clearTimeout(timer); timer = window.setTimeout(refresh, 500) }
  if (!(hasFile && editing)) {
    const label = kind === 'html' ? 'HTML, CSS та JavaScript' : kind === 'text' ? 'Текст (абзаци через порожній рядок)' : 'Посилання'
    const content = field(label, value, v => { value = v; dirtyForm = true; later() }, kind === 'html' || kind === 'text')
    if (kind === 'html') {
      const area = content.querySelector('textarea')!
      area.classList.add('adm-input--code'); area.maxLength = 65_536; area.spellcheck = false
    }
    body.append(content)
    if (kind === 'image' || kind === 'pdf') {
      const upload = el('input', 'sr-only')
      upload.type = 'file'
      upload.accept = kind === 'pdf' ? 'application/pdf' : 'image/png,image/jpeg,image/webp'
      upload.addEventListener('change', () => {
        const file = upload.files?.[0]
        if (!file) return
        void fileItem(file).then(item => {
          dirtyForm = false
          close()
          const name = title.trim() || file.name.replace(/\.[a-z0-9]+$/i, '')
          if (target === 'lesson') appendToLesson([makeMaterial(lesson!, pack(), name, [item], reserved)], lesson!.blocks.length)
          else void createMaterial(name, [item], canvas?.centre() ?? { x: 0, y: 0 })
        }, err => { error.textContent = (err as Error).message })
      })
      body.append(el('p', 'adm-field-hint', 'або'), button(kind === 'pdf' ? 'Обрати PDF з комп’ютера' : 'Обрати зображення з комп’ютера', () => upload.click()), upload,
        el('p', 'adm-field-hint', kind === 'pdf' ? 'PDF до 2 МБ. Більші файли додайте посиланням.' : 'Великі фото автоматично стискаються.'))
    }
    if (kind === 'link') body.append(el('p', 'adm-field-hint', 'Звичайний сайт відкривається окремою вкладкою. Всередині уроку показуються YouTube, LearningApps і HTML-картки.'))
  }
  body.append(warning, preview, error)
  const save = button(editing ? 'Зберегти' : target === 'lesson' ? 'Додати в урок' : 'Додати на дошку', () => {
    let items: CanvasItem[]
    try { items = read() } catch (err) { error.textContent = (err as Error).message; return }
    dirtyForm = false
    close()
    if (editing) {
      void updateBuilderMaterial(existing.id, { title: title.trim(), items }).then(({ material }) => {
        materials = materials.map(m => m.id === material.id ? material : m)
        renderBoard()
      }, report)
    } else if (target === 'lesson') {
      appendToLesson([makeMaterial(lesson!, pack(), title.trim(), items, reserved)], lesson!.blocks.length)
    } else void createMaterial(title.trim(), items, canvas?.centre() ?? { x: 0, y: 0 })
  }, 'btn-adm-emerald')
  body.append(save)
  if (value || editing) refresh()
  titleField.querySelector('input')!.focus()
}
function urlValue(item: CanvasItem): string {
  switch (item.type) {
    case 'video': return `https://www.youtube.com/watch?v=${item.videoId}`
    case 'learningapps': return `https://learningapps.org/watch?v=p${item.appId}`
    case 'image': return item.src
    case 'link': case 'pdf': return item.url
    default: return ''
  }
}

// ── "From lessons" drawer: every saved lesson's cards, grouped by lesson ──
async function toggleDrawer() {
  const drawer = byId('lb-drawer')
  if (!drawer) return
  if (!drawer.hidden) { drawer.hidden = true; return }
  drawer.hidden = false
  if (!cardIndex) {
    drawer.replaceChildren(el('p', 'adm-field-hint', 'Завантажуємо картки з уроків…'))
    try { cardIndex = (await getAdminCurriculumCards()).lessons }
    catch (err) { report(err); drawer.hidden = true; return }
  }
  renderDrawer()
}
const lazyThumbs = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue
    lazyThumbs.unobserve(entry.target)
    ;(entry.target as HTMLElement & { renderThumb?: () => void }).renderThumb?.()
  }
})
function renderDrawer() {
  const drawer = byId('lb-drawer')
  if (!drawer || !cardIndex || !lesson) return
  const head = el('div', 'lb-drawer__head')
  const search = el('input', 'adm-input lb-search')
  search.type = 'search'
  search.placeholder = 'Урок або картка'
  search.setAttribute('aria-label', 'Пошук у картках уроків')
  search.value = drawerQuery
  search.addEventListener('input', () => { drawerQuery = search.value; renderDrawerBody() })
  const chips = el('div', 'lb-chips')
  chips.setAttribute('role', 'group')
  chips.setAttribute('aria-label', 'Тип картки')
  for (const kind of ['', ...LESSON_KINDS] as (BuilderKind | '')[]) {
    const chip = button(kind ? KIND_LABELS[kind] : 'Усі', () => { drawerKind = kind; renderDrawer() }, 'lb-chip')
    chip.setAttribute('aria-pressed', String(drawerKind === kind))
    chips.append(chip)
  }
  head.append(el('h3', '', 'Картки з уроків'), iconButton('Закрити', '×', () => { drawer.hidden = true }), search, chips)
  const list = el('div', 'lb-drawer__body')
  list.id = 'lb-drawer-body'
  drawer.replaceChildren(head, list)
  renderDrawerBody()
}
function renderDrawerBody() {
  const list = byId('lb-drawer-body')
  if (!list || !cardIndex || !lesson) return
  list.querySelectorAll('.lb-mini').forEach(node => lazyThumbs.unobserve(node))
  list.replaceChildren()
  const needle = drawerQuery.trim().toLowerCase()
  let shown = 0
  for (const entry of cardIndex) {
    const definition = entry.definition as unknown as EditableLesson
    if (definition.subjectPackId !== lesson.subjectPackId) continue
    const lessonMatch = !needle || definition.title.uk.toLowerCase().includes(needle)
    const blocks = definition.blocks.filter(block => block.type !== 'hero'
      && (!drawerKind || blockKind(block) === drawerKind)
      && (lessonMatch || blockTitle(block).toLowerCase().includes(needle)))
    if (!blocks.length) continue
    const group = el('details', 'lb-group')
    group.open = Boolean(needle || drawerKind)
    const summary = el('summary', '', `${definition.grade} кл. · ${definition.title.uk}`)
    summary.append(el('span', 'lb-group__count', String(blocks.length)))
    const grid = el('div', 'lb-group__grid')
    const fill = () => {
      if (grid.childElementCount) return
      for (const block of blocks) {
        const card = el('button', 'lb-mini') as HTMLButtonElement & { renderThumb?: () => void }
        card.type = 'button'
        card.title = blockTitle(block)
        card.setAttribute('aria-label', `${blockTitle(block)} · ${definition.title.uk}`)
        card.renderThumb = () => card.append(thumb(block, definition))
        lazyThumbs.observe(card)
        pointerDrag(card, {
          click: () => lessonCardDialog(entry.id, definition, block),
          drop: client => { void dropLessonCard(entry.id, block.id, client) },
        })
        grid.append(card)
      }
    }
    group.addEventListener('toggle', () => { if (group.open) fill() })
    if (group.open) fill()
    group.append(summary, grid)
    list.append(group)
    shown++
  }
  if (!shown) list.append(el('p', 'adm-field-hint', 'Нічого не знайдено. Змініть пошук або тип.'))
}
async function fullSource(id: string): Promise<EditableLesson> {
  const cached = sourceCache.get(id)
  if (cached) return cached
  const definition = (await getAdminCurriculumLesson(id)).lesson.draftContent as unknown as EditableLesson
  sourceCache.set(id, definition)
  return definition
}
async function dropLessonCard(lessonId: string, blockId: string, client: Point) {
  const index = sequenceIndexAt(client)
  const onBoard = index === null ? canvas?.worldAt(client) ?? null : null
  if (index === null && !onBoard) return
  try {
    const source = await fullSource(lessonId)
    const block = source.blocks.find(b => b.id === blockId)
    if (!block) return
    if (index !== null) addSource(source, [block], index)
    else if (block.type === 'canvas' && !block.activity) void createMaterial(blockTitle(block), canvasItems(block), onBoard!)
    else toast('На дошку можна покласти лише матеріали. Завдання додавайте прямо в урок.', { error: true })
  } catch (err) { report(err) }
}
function lessonCardDialog(lessonId: string, definition: EditableLesson, block: EditableBlock) {
  const { body, close } = modal(blockTitle(block), { wide: true })
  body.append(el('p', 'adm-field-hint', `З уроку: ${definition.grade} кл. · ${definition.title.uk}`), preview(block, definition))
  const actions = el('div', 'lb-dialog-actions')
  actions.append(button('Додати в урок', () => {
    close()
    void fullSource(lessonId).then(source => {
      const full = source.blocks.find(b => b.id === block.id)
      if (full) addSource(source, [full], lesson!.blocks.length)
    }, report)
  }, 'btn-adm-emerald'))
  if (block.type === 'canvas' && !block.activity) actions.append(button('На дошку', () => {
    close()
    void fullSource(lessonId).then(source => {
      const full = source.blocks.find(b => b.id === block.id)
      if (full) void createMaterial(blockTitle(full), canvasItems(full), canvas?.centre() ?? { x: 0, y: 0 })
    }, report)
  }, 'btn-adm-slate'))
  body.append(actions)
}

// ── Pointer drag from a panel into the lesson (or onto the board) ──
function pointerDrag(node: HTMLElement, handlers: { click(): void; drop(client: Point): void }) {
  node.addEventListener('pointerdown', event => {
    if (event.button !== 0) return
    const start = { x: event.clientX, y: event.clientY }
    let ghost: HTMLElement | null = null
    node.setPointerCapture(event.pointerId)
    const move = (e: PointerEvent) => {
      if (!ghost && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5) return
      if (!ghost) {
        ghost = el('div', 'bc-ghost')
        ghost.append(node.firstElementChild?.cloneNode(true) ?? el('span'))
        document.body.append(ghost)
      }
      ghost.style.left = `${e.clientX + 8}px`
      ghost.style.top = `${e.clientY + 8}px`
      markInsertion({ x: e.clientX, y: e.clientY })
    }
    const up = (e: PointerEvent) => {
      node.removeEventListener('pointermove', move)
      node.removeEventListener('pointerup', up)
      node.removeEventListener('pointercancel', up)
      markInsertion(null)
      if (!ghost) { if (e.type === 'pointerup') handlers.click(); return }
      ghost.remove()
      if (e.type === 'pointerup') handlers.drop({ x: e.clientX, y: e.clientY })
    }
    node.addEventListener('pointermove', move)
    node.addEventListener('pointerup', up)
    node.addEventListener('pointercancel', up)
  })
  node.addEventListener('click', event => { if (event.detail === 0) handlers.click() })
}

// ── Lesson outline ──
function sequenceIndexAt(client: Point): number | null {
  const list = byId('lb-sequence')
  if (!list || !lesson) return null
  const box = list.getBoundingClientRect()
  if (client.x < box.left || client.x > box.right || client.y < box.top - 24 || client.y > box.bottom + 24) return null
  const steps = [...list.querySelectorAll<HTMLElement>('.lb-step')]
  const index = steps.findIndex(step => { const r = step.getBoundingClientRect(); return client.y < r.top + r.height / 2 })
  return index === -1 ? lesson.blocks.length : index
}
function markInsertion(client: Point | null) {
  const list = byId('lb-sequence')
  if (!list) return
  list.querySelectorAll('.lb-insert-before').forEach(node => node.classList.remove('lb-insert-before'))
  list.classList.remove('lb-sequence--target', 'lb-insert-end')
  const index = client ? sequenceIndexAt(client) : null
  if (index === null) return
  list.classList.add('lb-sequence--target')
  const steps = list.querySelectorAll<HTMLElement>('.lb-step')
  if (index < steps.length) steps[index]!.classList.add('lb-insert-before')
  else list.classList.add('lb-insert-end')
}
function dropIntoLesson(client: Point, blocks: () => EditableBlock[]): boolean {
  const index = sequenceIndexAt(client)
  if (index === null) return false
  appendToLesson(blocks(), index)
  return true
}
function appendToLesson(blocks: EditableBlock[], index: number) {
  if (!lesson || busy || !blocks.length) return
  if (lesson.blocks.length + blocks.length > 60) { toast('В одному уроці може бути не більше 60 карток.', { error: true }); return }
  checkpoint()
  lesson.blocks.splice(index, 0, ...blocks)
  if (lessonSize(lesson) > MAX_LESSON_BYTES) {
    lesson = undo.pop()!
    toast('Урок перевищує 4 МіБ. Приберіть великі файли.', { error: true })
    return
  }
  changed()
}
function addSource(source: EditableLesson, blocks: EditableBlock[], index: number) {
  if (!lesson || busy) return
  const before = structuredClone(lesson)
  try {
    checkpoint()
    const count = lesson.blocks.length
    appendSourceBlocks(lesson, source, blocks, pack(), reserved)
    if (lessonSize(lesson) > MAX_LESSON_BYTES) throw new Error('Урок перевищує 4 МіБ. Приберіть великі файли.')
    if (index < count) lesson.blocks.splice(index, 0, ...lesson.blocks.splice(count))
    changed()
  } catch (err) { lesson = before; undo.pop(); report(err) }
}
function addActivity() {
  if (!lesson || busy) return
  const block = newBlock('activity', lesson, pack(), reserved)
  appendToLesson([block], lesson.blocks.length)
  editActivity(block, true)
}

function renderSequence() {
  const host = byId('lb-sequence')
  if (!host || !lesson) return
  host.replaceChildren()
  for (const [index, block] of lesson.blocks.entries()) {
    const item = el('li', 'lb-step')
    item.dataset.block = block.id
    const card = el('button', 'lb-step__card')
    card.type = 'button'
    const title = blockTitle(block)
    const shown = [block.views.presentation ? 'проєктор' : '', block.views.remote ? 'пристрої' : ''].filter(Boolean).join(' + ') || 'лише вчитель'
    card.title = `${index + 1}. ${title} · ${shown}`
    card.setAttribute('aria-label', card.title)
    card.append(el('span', 'lb-step__number', String(index + 1)), thumb(block))
    pointerDrag(card, {
      click: () => stepDialog(block.id),
      drop: client => {
        const to = sequenceIndexAt(client)
        const from = lesson!.blocks.findIndex(b => b.id === block.id)
        if (to === null || from < 0) return
        reorder(from, to > from ? to - 1 : to)
      },
    })
    item.append(card)
    host.append(item)
  }
  if (!lesson.blocks.length) host.append(el('li', 'lb-sequence__empty', 'Перетягніть сюди картки з дошки.'))
}
function reorder(from: number, to: number) {
  if (!lesson || busy || from === to || to < 0 || to >= lesson.blocks.length) return
  checkpoint(); moveBlockTo(lesson, from, to); changed()
}

function stepDialog(blockId: string) {
  if (!lesson) return
  const index = lesson.blocks.findIndex(b => b.id === blockId)
  const block = lesson.blocks[index]
  if (!block) return
  const { body, close } = modal(`${index + 1}. ${blockTitle(block)}`, { wide: true })
  body.append(preview(block, lesson))
  const actions = el('div', 'lb-dialog-actions')
  const up = button('↑ Вище', () => { reorder(index, index - 1); close(); stepDialog(blockId) })
  up.disabled = index === 0
  const down = button('↓ Нижче', () => { reorder(index, index + 1); close(); stepDialog(blockId) })
  down.disabled = index === lesson.blocks.length - 1
  actions.append(
    button('Редагувати', () => { close(); editBlock(block) }, 'btn-adm-emerald'),
    button('Копія', () => { close(); addSource(lesson!, [block], index + 1) }),
    up, down,
    button('Видалити з уроку', () => {
      close(); checkpoint(); reserved.add(block.id); lesson!.blocks.splice(index, 1); changed()
      toast(`«${blockTitle(block)}» прибрано з уроку.`, { action: ['Повернути', () => historyMove(undo, redo)] })
    }),
  )
  body.append(actions)
  if (block.type !== 'teacher-note') {
    const mode = block.views.presentation && block.views.remote ? 'both' : block.views.remote ? 'devices' : block.views.presentation ? 'board' : 'none'
    const show = picker('Де показувати', [
      ['board', 'Проєктор'], ['devices', 'Пристрої учнів'], ['both', 'Проєктор і пристрої'], ['none', 'Лише вчителю'],
    ], mode, value => {
      checkpoint()
      setShow(block, value)
      changed()
    })
    show.classList.add('lb-show')
    body.append(show)
  }
}
function setShow(block: EditableBlock, value: string) {
  const onDevices = value === 'devices' || value === 'both'
  if (block.type === 'canvas' && onDevices && !(block.content.student as CanvasItem[]).length) block.content.student = structuredClone(block.content.board)
  setOnBoard(block, value === 'board' || value === 'both')
  setOnDevices(block, onDevices)
}

function editBlock(block: EditableBlock) {
  if (busy || !lesson) return
  if (block.activity) { editActivity(block); return }
  const working = structuredClone(block)
  if (working.type !== 'canvas' && CONVERTIBLE_TYPES.has(working.type)) convertToCanvas(working, lesson)
  let touched = false
  const { body, card, close, onClose } = modal(`Редагувати: ${blockTitle(block)}`, { wide: true, guard: () => !touched })
  body.append(field('Назва картки', blockTitle(block), v => { working.content.heading = { uk: v }; touched = true }))
  const htmlItems = canvasItems(working)
  const apply = () => {
    touched = false
    close()
    checkpoint()
    Object.assign(block, working)
    changed()
  }
  if (htmlItems.length === 1 && htmlItems[0]!.type === 'html') {
    card.classList.add('lb-dialog--html')
    let code = htmlItems[0]!.html
    const codeField = field('HTML, CSS та JavaScript', code, v => { code = v; touched = true; later() }, true)
    const area = codeField.querySelector('textarea')!; area.classList.add('adm-input--code'); area.maxLength = 65_536; area.spellcheck = false
    const view = el('div', 'lb-dialog-preview')
    const warning = el('p', 'adm-field-hint lb-warning')
    const error = el('p', 'adm-form-error'); error.setAttribute('role', 'alert')
    const refresh = () => {
      view.replaceChildren(renderCanvasItems([{ type: 'html', html: code }], 'teacher'))
      warning.textContent = EXTERNAL_CODE.test(code) ? 'Зовнішні бібліотеки, шрифти, картинки за посиланням і мережеві запити в картці не завантажаться.' : ''
    }
    let timer: number | null = null
    const later = () => { if (timer !== null) window.clearTimeout(timer); timer = window.setTimeout(refresh, 500) }
    body.append(codeField, warning, view, error, button('Застосувати', () => {
      if (!code.trim()) { error.textContent = 'Код не може бути порожнім.'; return }
      for (const surface of ['teacher', 'board', 'student']) {
        if ((working.content[surface] as CanvasItem[]).length) working.content[surface] = [{ type: 'html', html: code }]
      }
      apply()
    }, 'btn-adm-emerald'))
    refresh()
  } else if (working.type === 'canvas') {
    let surface: 'teacher' | 'board' | 'student' = 'board'
    const editorHost = el('div')
    body.append(editorHost, button('Застосувати', apply, 'btn-adm-emerald'))
    editorHost.textContent = 'Завантажуємо редактор…'
    void import('./curriculum-canvas-editor.js').then(({ renderCanvasEditor, disposeCanvasEditors }) => {
      if (!editorHost.isConnected) return
      onClose(() => disposeCanvasEditors(editorHost))
      const refresh = () => editorHost.replaceChildren(renderCanvasEditor(working, {
        selected: surface, select: s => { surface = s; refresh() }, touched: () => { touched = true }, changed: () => { touched = true; refresh() }, viewsChanged: () => {},
      }))
      refresh()
    }, () => { editorHost.textContent = 'Не вдалося завантажити редактор. Оновіть сторінку.' })
  } else {
    body.append(el('p', 'adm-field-hint', 'Для цього службового блоку доступні повні налаштування в розділі «Уроки».'), button('Відкрити повний редактор', () => { close(); void openFullEditor() }))
  }
}

/** Opening the dialog records one undo step; an unchanged dialog leaves none behind. */
function editActivity(block: EditableBlock, justAdded = false) {
  if (!lesson) return
  const before = JSON.stringify(lesson)
  if (!justAdded) checkpoint()
  const touch = () => { dirty = true; updateActions() }
  const dialog = openActivityDialog({
    lesson, block, mechanicLabels: MECHANIC_LABELS, pack: pack(),
    outcomeCode: id => outcomes.find(o => o.id === id)?.code ?? id,
    outcomeTitle: id => outcomes.find(o => o.id === id)?.titleUk ?? id,
    outcomePicker: onPick => picker('Результат навчання', [['', 'Оберіть вміння'], ...outcomes.filter(o => o.status === 'active' && o.subjectPackId === lesson!.subjectPackId).map(o => [o.id, `${o.code}: ${o.titleUk}`] as [string, string])], '', id => { if (id) onPick(id) }),
    addOutcome: id => { addActivityOutcome(lesson!, lesson!.blocks.indexOf(block), id); touch() },
    removeOutcome: id => { removeActivityOutcome(lesson!, lesson!.blocks.indexOf(block), id); touch() },
    switchMechanic: (mechanic, done) => {
      const apply = () => { block.activity = activityTemplate(mechanic, block.activity!.instanceId, pack()); touch(); done() }
      showConfirm('Замінити тип завдання? Його поточні запитання буде замінено шаблоном.', apply)
    },
    contentFields: () => field('Назва завдання', blockTitle(block), v => { block.content.heading = { uk: v }; touch() }),
    slideFields: () => null,
    jsonFields: () => el('p', 'adm-field-hint', 'Розширені налаштування доступні в повному редакторі «Уроки».'),
    touched: touch, changed: () => { touch(); dialog.refresh() },
    closed: () => {
      if (!justAdded && JSON.stringify(lesson) === before) undo.pop()
      changed()
    },
  })
}

// ── Lesson dialogs ──
function openLessonDialog() {
  const { body, close } = modal('Відкрити урок', { wide: true })
  const list = el('div', 'lb-saved')
  let needle = ''
  const paint = () => {
    list.replaceChildren()
    const rows = summaries.filter(s => !needle || s.title.toLowerCase().includes(needle))
    for (const summary of rows.slice(0, 200)) {
      const item = button(`${summary.grade} кл. · ${summary.title}`, () => { close(); discardThen(() => { void openSaved(summary.id) }) }, 'lb-saved-row')
      item.append(el('span', 'adm-field-hint', summary.status === 'published' ? 'Опубліковано' : 'Чернетка'))
      list.append(item)
    }
    if (!rows.length) list.append(el('p', 'adm-field-hint', 'Уроків не знайдено.'))
  }
  const search = field('Пошук', '', v => { needle = v.trim().toLowerCase(); paint() })
  body.append(search, list)
  paint()
  search.querySelector('input')!.focus()
}
function settingsDialog() {
  if (!lesson) return
  const { body } = modal('Параметри уроку')
  const empty = !row && lesson.blocks.length <= 1
  const grades = Array.from({ length: pack().gradeRange.max - pack().gradeRange.min + 1 }, (_, i) => {
    const g = pack().gradeRange.min + i
    return [String(g), `${g} клас`] as [string, string]
  })
  if (empty) body.append(picker('Предмет', packs.map(p => [p.id, p.title.uk]), lesson.subjectPackId, v => {
    const p = packs.find(item => item.id === v)!
    checkpoint(); lesson!.subjectPackId = v; lesson!.subject = p.subject; lesson!.grade = p.gradeRange.min; changed()
  }))
  body.append(picker('Клас', grades, String(lesson.grade), v => { checkpoint(); lesson!.grade = Number(v); changed() }))
  const modules = [...new Set(summaries.filter(s => s.subjectPackId === lesson!.subjectPackId && s.grade === lesson!.grade && s.moduleId).map(s => s.moduleId!))].sort()
  body.append(picker('Модуль', [['', 'Без модуля'], ...modules.map(m => [m, m] as [string, string])], lesson.moduleId ?? '', v => {
    if (v) lesson!.moduleId = v; else delete lesson!.moduleId
    dirty = true; updateActions()
  }))
}

// ── Saving and conducting ──
async function saveLesson(): Promise<boolean> {
  if (!lesson || busy) return false
  busy = true; updateActions()
  try {
    const result = row ? await updateAdminCurriculumLesson(row.id, lesson, row.editVersion) : await createAdminCurriculumLesson(lesson)
    row = result.lesson
    lesson = structuredClone(row.draftContent) as unknown as EditableLesson
    sourceCache.set(row.id, structuredClone(lesson))
    cardIndex = null
    dirty = false
    summaries = [...summaries.filter(s => s.id !== row!.id), { ...row }]
    renderSequence()
    toast('Урок збережено.')
    return true
  } catch (err) { report(err); return false }
  finally { busy = false; updateActions() }
}
function conductDialog() {
  if (!lesson?.blocks.length) return
  const { body, close } = modal('Провести урок')
  const option = (title: string, note: string, run: () => void) => {
    const node = button(title, () => { close(); run() }, 'lb-choice')
    node.append(el('span', 'lb-choice__note', note))
    return node
  }
  body.append(
    option('Лише проєктор', 'Показ слайдів на екрані класу. Учні нічого не відкривають.', () => { void startLesson() }),
    option('З класом', 'Учні приєднуються з пристроїв, виконують завдання, ви бачите результати. Урок буде опубліковано.', () => { void conductWithStudents() }),
  )
}
async function startLesson() {
  if (busy || !lesson?.blocks.length) return
  // A save already runs every server-side check.
  if ((dirty || !row) && !await saveLesson()) return
  if (!dirty && row) {
    try {
      const validation = await validateAdminCurriculumLesson(lesson, row.id)
      if (!validation.ok) { toast(validation.issues.map(describeLessonIssue).join(' · '), { error: true }); return }
    } catch (err) { report(err); return }
  }
  startPresentation()
}
function startPresentation() {
  dropBoard()
  const safe = withoutAnswerKeys(lesson!) as unknown as LessonDefinition
  const slides = presentationSlides(safe)
  if (!slides.length) { toast('Увімкніть показ на проєкторі хоча б для однієї картки.', { error: true }); return }
  presenting = true
  root().querySelector<HTMLElement>('.lb-layout')!.hidden = true
  const host = byId('lb-console')!
  host.replaceChildren(); host.hidden = false
  let selected = slides[0]!.blockId
  board = mountBoardWindow(safe, {
    ...(row?.status === 'published' && !dirty ? { check: (instanceId, answer) => checkCurriculumActivity(row!.id, instanceId, answer) } : {}),
    onSlideChange: id => { selected = id; highlight() },
  })
  const rail = el('div', 'lb-console-rail')
  for (const slide of slides) {
    const btn = button(blockTitle(slide.block as unknown as EditableBlock), () => { selected = slide.blockId; board!.follow(slide.blockId); highlight() }, 'lb-console-card')
    btn.dataset.slide = slide.blockId
    btn.prepend(thumb(slide.block as unknown as EditableBlock)); rail.append(btn)
  }
  const highlight = () => rail.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.slide === selected)))
  highlight()
  const actions = el('div', 'lb-dialog-actions')
  actions.append(
    button('Повернутися до конструктора', () => { dropBoard(); host.hidden = true; root().querySelector<HTMLElement>('.lb-layout')!.hidden = false }, 'btn-adm-slate'),
    button('Провести з класом', () => { void conductWithStudents() }, 'btn-adm-emerald'),
  )
  host.append(el('h3', '', 'Пульт уроку'), board.element, rail, actions)
  host.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
async function conductWithStudents() {
  if (busy || !lesson) return
  if ((dirty || !row) && !await saveLesson()) return
  const navigate = () => { location.href = `lesson-engine.html?lesson=${encodeURIComponent(row!.id)}` }
  if (row!.status === 'published') { navigate(); return }
  showConfirm('Опублікувати цю версію уроку та відкрити панель проведення з класом? Опублікований урок стане доступним учителям.', () => {
    void (async () => {
      busy = true; updateActions()
      try {
        if (row!.status === 'archived') row = (await setAdminCurriculumLessonStatus(row!.id, 'draft', row!.editVersion)).lesson
        if (row!.status === 'draft') row = (await setAdminCurriculumLessonStatus(row!.id, 'review', row!.editVersion)).lesson
        row = (await setAdminCurriculumLessonStatus(row!.id, 'published', row!.editVersion)).lesson
        navigate()
      } catch (err) { report(err) }
      finally { busy = false; updateActions() }
    })()
  })
}
async function openFullEditor() {
  if ((dirty || !row) && !await saveLesson()) return
  const id = row!.id
  document.querySelector<HTMLButtonElement>('[data-tab="curriculum"]')!.click()
  const { openCurriculumLessonEditor } = await import('./curriculum-tab.js')
  await openCurriculumLessonEditor(id)
}
function exportLesson() {
  if (!lesson) return
  const url = URL.createObjectURL(new Blob([JSON.stringify(lesson, null, 2)], { type: 'application/json' }))
  const anchor = el('a'); anchor.href = url; anchor.download = `${lesson.id}.json`; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
