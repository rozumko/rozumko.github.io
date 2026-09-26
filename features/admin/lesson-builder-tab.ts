import {
  getAdminCurriculumLessons, getAdminCurriculumLesson, getAdminSubjectPacks, getAdminCurriculumOutcomes,
  createAdminCurriculumLesson, updateAdminCurriculumLesson, validateAdminCurriculumLesson,
  setAdminCurriculumLessonStatus, getTeacherMe, checkCurriculumActivity,
  type AdminCurriculumLesson, type AdminCurriculumLessonSummary, type AdminSubjectPack, type AdminCurriculumOutcome, type ApiError,
} from '../api/client.js'
import {
  newLesson, newBlock, moveBlockTo, withoutAnswerKeys, activityTemplate, addActivityOutcome, removeActivityOutcome,
  setOnBoard, setOnDevices, convertToCanvas, CONVERTIBLE_TYPES, describeLessonIssue, type EditableLesson, type EditableBlock,
} from './curriculum-model.js'
import { renderCanvasItems } from '../lesson-engine/canvas-view.js'
import { renderSlide, openPresentation } from '../lesson-engine/presentation-view.js'
import { mountBoardWindow, type BoardWindowController } from '../lesson-engine/board-window.js'
import { presentationSlides, MECHANIC_LABELS } from '../lesson-engine/projection.js'
import type { CanvasItem, LessonDefinition } from '../lesson-engine/types.js'
import { openActivityDialog } from './activity-dialog.js'
import { createFocusTrap } from '../../utils/focus-trap.js'
import { friendlyError, showConfirm } from './ui.js'
import { blockTitle, blockKind, canvasItems, resourceItem, makeMaterial, appendSourceBlocks, lessonSize, KIND_LABELS, BUILDER_KINDS, type BuilderKind } from './lesson-builder-model.js'
import { fileItem, materialInbox, type BuilderMaterial } from './lesson-builder-storage.js'

let summaries: AdminCurriculumLessonSummary[] = []
let packs: AdminSubjectPack[] = []
let outcomes: AdminCurriculumOutcome[] = []
let inbox: BuilderMaterial[] = []
let owner = ''
let lesson: EditableLesson | null = null
let row: AdminCurriculumLesson | null = null
let dirty = false
let busy = false
let loaded = false
let selected: string | null = null
let reserved = new Set<string>()
let source: EditableLesson | null = null
let undo: EditableLesson[] = []
let redo: EditableLesson[] = []
let board: BoardWindowController | null = null
let presenting = false
const filters = { query: '', pack: '', grade: '', topic: '', kind: '' }

const root = () => document.getElementById('lb-root')!
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
function checkbox(label: string, value: boolean, change: (v: boolean) => void): HTMLElement {
  const wrap = el('label', 'cl-check')
  const input = el('input')
  input.type = 'checkbox'
  input.checked = value
  input.addEventListener('change', () => change(input.checked))
  wrap.append(input, ` ${label}`)
  return wrap
}
function message(text: string, error = false) {
  const host = document.getElementById('lb-message')!
  host.className = error ? 'adm-form-error' : 'adm-field-hint'
  host.textContent = text
}
function report(err: unknown) {
  const error = err as ApiError
  const issues = error.body?.issues as { path: string; message: string }[] | undefined
  if (error.status === 409) {
    message('Урок уже змінив інший редактор. Ваші зміни залишилися в конструкторі. Експортуйте JSON перед оновленням.', true)
    return
  }
  message(issues?.length ? issues.map(describeLessonIssue).join(' · ') : friendlyError(error.message), true)
}
function pack() { return packs.find(p => p.id === lesson?.subjectPackId) ?? packs[0]! }
function checkpoint() {
  if (!lesson) return
  undo.push(structuredClone(lesson))
  if (undo.length > 15) undo.shift()
  redo = []
}
function changed() {
  dirty = true
  renderSequence()
  renderPreview()
  updateActions()
}
function updateActions() {
  for (const node of root().querySelectorAll<HTMLButtonElement>('[data-save]')) node.disabled = busy || !lesson
  for (const node of root().querySelectorAll<HTMLButtonElement>('[data-start]')) node.disabled = busy || !lesson?.blocks.length
  root().querySelector<HTMLButtonElement>('[data-undo]')!.disabled = busy || !undo.length
  root().querySelector<HTMLButtonElement>('[data-redo]')!.disabled = busy || !redo.length
  const status = document.getElementById('lb-save-state')!
  status.textContent = busy ? 'Зберігаємо…' : dirty ? 'Є незбережені зміни' : row ? 'Збережено на сервері' : 'Новий урок'
  for (const input of root().querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea')) input.disabled = busy
}
function dropBoard() {
  board?.destroy()
  board = null
  presenting = false
}

export function initLessonBuilderTab() {
  window.addEventListener('beforeunload', event => { if (dirty) event.preventDefault() })
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
    const [list, registry, directory, me] = await Promise.all([
      getAdminCurriculumLessons(), getAdminSubjectPacks(), getAdminCurriculumOutcomes(), getTeacherMe(),
    ])
    summaries = list.lessons
    packs = registry.packs
    outcomes = directory.outcomes
    owner = me.id
    if (!packs.length) throw new Error('Немає доступного предмета для уроку.')
    try { inbox = await materialInbox(owner) } catch { inbox = [] }
    filters.pack = packs[0]!.id
    loaded = true
    createLesson()
  } catch (err) {
    root().replaceChildren(el('p', 'adm-form-error', friendlyError((err as Error).message)), button('Спробувати ще раз', () => { void loadLessonBuilderTab() }))
  }
}

function createLesson() {
  dropBoard()
  const selectedPack = packs.find(p => p.id === filters.pack) ?? packs[0]!
  lesson = newLesson({ id: `builder-${crypto.randomUUID()}`, title: 'Новий урок', grade: Number(filters.grade) || selectedPack.gradeRange.min, pack: selectedPack })
  lesson.metadata.sourceRef = 'visual-builder'
  row = null
  dirty = false
  reserved = new Set()
  undo = []; redo = []
  selected = lesson.blocks[0]?.id ?? null
  render()
}
function discardThen(run: () => void) {
  if (busy) return
  if (dirty) showConfirm('Є незбережені зміни. Відкрити інший урок без збереження?', run)
  else run()
}
async function openSaved(id: string) {
  try {
    const result = await getAdminCurriculumLesson(id)
    dropBoard()
    row = result.lesson
    lesson = structuredClone(row.draftContent) as unknown as EditableLesson
    filters.pack = lesson.subjectPackId
    dirty = false
    reserved = new Set((row.publishedSnapshot?.blocks as EditableBlock[] | undefined)?.map(b => b.id) ?? [])
    undo = []; redo = []
    selected = lesson.blocks[0]?.id ?? null
    render()
  } catch (err) { report(err) }
}

function render() {
  root().replaceChildren()
  const header = el('div', 'admin-section-header')
  const heading = el('div')
  heading.append(el('h2', 'admin-section-title', 'Конструктор уроків'), el('p', 'admin-section-note', 'Додавайте матеріали, складайте послідовність і проводьте урок з одного пульта.'))
  const actions = el('div', 'admin-section-actions')
  actions.append(button('Новий урок', () => discardThen(createLesson)), button('Збережені уроки', showSaved), button('Оновити бібліотеку', () => { void refreshLibrary() }))
  header.append(heading, actions)
  const status = el('p', 'adm-field-hint')
  status.id = 'lb-message'
  status.setAttribute('role', 'status')
  const layout = el('div', 'lb-layout')
  const library = el('section', 'lb-library')
  library.setAttribute('aria-label', 'Бібліотека матеріалів')
  const filterBar = el('div', 'lb-filters')
  const search = field('Пошук матеріалів', filters.query, v => { filters.query = v; renderLibrary() })
  search.querySelector('input')!.type = 'search'
  filterBar.append(search,
    picker('Предмет', packs.map(p => [p.id, p.title.uk]), filters.pack, v => { filters.pack = v; source = null; renderLibrary() }),
    picker('Клас', [['', 'Усі класи'], ...Array.from({ length: 4 }, (_, i) => [String(i + 1), `${i + 1} клас`] as [string, string])], filters.grade, v => { filters.grade = v; renderLibrary() }),
    field('Тема / модуль', filters.topic, v => { filters.topic = v; renderLibrary() }),
    picker('Тип картки', [['', 'Усі типи'], ...BUILDER_KINDS.map(k => [k, KIND_LABELS[k]] as [string, string])], filters.kind, v => { filters.kind = v; renderLibrary() }),
  )
  const capture = el('div', 'lb-capture')
  capture.tabIndex = 0
  capture.setAttribute('aria-label', 'Додати матеріал: перетягніть файл або вставте посилання')
  capture.append(el('strong', '', 'Перетягніть файл чи зображення сюди або вставте посилання (Ctrl+V)'), el('p', 'adm-field-hint', 'PNG, JPEG, WebP, PDF — до 512 КіБ; увесь урок — до 4 МіБ. Файли залишаться в збереженому уроці.'))
  const types = el('div', 'lb-type-buttons')
  for (const kind of BUILDER_KINDS.filter(k => k !== 'lesson')) types.append(button(`+ ${KIND_LABELS[kind]}`, () => addDialog(kind)))
  const upload = el('input', 'sr-only')
  upload.type = 'file'; upload.multiple = true
  upload.accept = 'image/png,image/jpeg,image/webp,application/pdf'
  upload.setAttribute('aria-label', 'Завантажити файли')
  upload.addEventListener('change', () => { void captureFiles([...upload.files ?? []]); upload.value = '' })
  types.append(button('Завантажити файли', () => upload.click()), upload)
  capture.append(types)
  capture.addEventListener('dragover', event => { event.preventDefault(); capture.classList.add('lb-drop-active') })
  capture.addEventListener('dragleave', () => capture.classList.remove('lb-drop-active'))
  capture.addEventListener('drop', event => {
    event.preventDefault(); capture.classList.remove('lb-drop-active')
    const data = event.dataTransfer
    if (!data || data.getData('application/x-rozumko-card')) return
    if (data.files.length) void captureFiles([...data.files])
    else captureTransfer(data)
  })
  capture.addEventListener('paste', event => {
    if ((event.target as Element).closest('input,textarea,[contenteditable]')) return
    const data = event.clipboardData
    if (!data) return
    event.preventDefault()
    if (data.files.length) void captureFiles([...data.files])
    else captureTransfer(data)
  })
  const cards = el('div', 'lb-cards'); cards.id = 'lb-library-cards'
  library.append(filterBar, capture, el('p', 'adm-field-hint', 'Нові матеріали зберігаються в бібліотеці цього браузера. Після збереження уроку його картки доступні з сервера на інших пристроях.'), cards)
  const sequence = el('section', 'lb-lesson')
  sequence.setAttribute('aria-label', 'Послідовність уроку')
  const meta = el('div', 'lb-meta')
  meta.append(field('Назва уроку', lesson!.title.uk, v => {
    lesson!.title.uk = v; dirty = true
    const hero = lesson!.blocks.find(b => b.type === 'hero')
    if (hero) { hero.content.title = { uk: v }; if (hero.presentation) hero.presentation.headline = { uk: v } }
    updateActions()
  }), picker('Предмет уроку', packs.map(p => [p.id, p.title.uk]), lesson!.subjectPackId, v => {
    if (row || lesson!.blocks.length > 1) { message('Предмет можна змінити в новому порожньому уроці.', true); render(); return }
    const p = packs.find(p => p.id === v)!
    checkpoint(); lesson!.subjectPackId = v; lesson!.subject = p.subject; lesson!.grade = p.gradeRange.min; filters.pack = v; dirty = true; render()
  }), picker('Клас уроку', Array.from({ length: pack().gradeRange.max - pack().gradeRange.min + 1 }, (_, i) => {
    const g = pack().gradeRange.min + i; return [String(g), `${g} клас`] as [string, string]
  }), String(lesson!.grade), v => { checkpoint(); lesson!.grade = Number(v); changed() }),
  field('Тема / модуль уроку (латиницею)', lesson!.moduleId ?? '', v => { if (v.trim()) lesson!.moduleId = v.trim(); else delete lesson!.moduleId; dirty = true; updateActions() }))
  const controls = el('div', 'lb-actions')
  const undoButton = button('↶ Скасувати', () => historyMove(undo, redo)); undoButton.dataset.undo = ''
  const redoButton = button('↷ Повторити', () => historyMove(redo, undo)); redoButton.dataset.redo = ''
  const expand = button('Розширити урок', () => { layout.classList.toggle('lb-layout--wide'); expand.textContent = layout.classList.contains('lb-layout--wide') ? 'Звузити урок' : 'Розширити урок' })
  controls.append(undoButton, redoButton, expand)
  const blocks = el('ol', 'lb-sequence'); blocks.id = 'lb-sequence'
  blocks.addEventListener('dragover', e => e.preventDefault())
  blocks.addEventListener('drop', event => {
    if ((event.target as Element).closest('[data-block]')) return
    event.preventDefault(); void dropCard(event.dataTransfer, lesson!.blocks.length)
  })
  const preview = el('div', 'lb-preview'); preview.id = 'lb-preview'
  const footer = el('div', 'lb-footer')
  const saved = el('p', 'adm-field-hint'); saved.id = 'lb-save-state'; saved.setAttribute('role', 'status')
  const save = button('Зберегти урок', () => { void saveLesson() }, 'btn-adm-emerald'); save.dataset.save = ''
  const start = button('Розпочати урок', () => { void startLesson() }, 'btn-adm-violet'); start.dataset.start = ''
  footer.append(saved, save, start, button('Експорт JSON', exportLesson))
  sequence.append(meta, controls, blocks, preview, footer)
  layout.append(library, sequence)
  const console = el('section', 'lb-console'); console.id = 'lb-console'; console.hidden = true
  root().append(header, status, layout, console)
  renderLibrary(); renderSequence(); renderPreview(); updateActions()
}

function historyMove(from: EditableLesson[], to: EditableLesson[]) {
  if (!lesson || !from.length || busy) return
  to.push(structuredClone(lesson)); lesson = from.pop()!
  selected = lesson.blocks.find(b => b.id === selected)?.id ?? lesson.blocks[0]?.id ?? null
  dropBoard(); dirty = true; render()
}

async function refreshLibrary() {
  try { summaries = (await getAdminCurriculumLessons()).lessons; source = null; renderLibrary(); message('Бібліотеку оновлено.') }
  catch (err) { report(err) }
}
function matches(title: string, subject: string, grade: number, topic: string, kind: BuilderKind): boolean {
  return (!filters.pack || subject === filters.pack) && (!filters.grade || grade === Number(filters.grade))
    && (!filters.topic || topic.toLowerCase().includes(filters.topic.toLowerCase()))
    && (!filters.kind || kind === filters.kind) && (!filters.query || title.toLowerCase().includes(filters.query.toLowerCase()))
}

function thumb(block: EditableBlock, context = lesson!): HTMLElement {
  const node = el('div', `lb-thumb lb-thumb--${blockKind(block)}`)
  const item = canvasItems(block).find(i => ['image', 'video', 'file'].includes(i.type))
  if (item?.type === 'image' || item?.type === 'video' || (item?.type === 'file' && item.mime !== 'application/pdf')) {
    const img = el('img')
    img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'
    img.src = item.type === 'image' ? item.src : item.type === 'video' ? `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg` : `data:${item.mime};base64,${item.data}`
    node.append(img)
  } else if (block.type === 'visual') {
    const asset = context.assets?.find(a => a.id === block.content.assetId)
    if (asset) {
      const img = el('img'); img.src = asset.src; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; node.append(img)
    } else node.append(el('span', '', 'Зображення'))
  } else {
    const items = canvasItems(block)
    const html = items.find(i => i.type === 'html')
    const paragraph = items.find(i => i.type === 'paragraph' || i.type === 'heading')
    const sample = html?.type === 'html'
      ? new DOMParser().parseFromString(html.html, 'text/html').body.querySelector('h1,h2,h3,p')?.textContent?.trim().slice(0, 130)
      : paragraph?.type === 'paragraph' || paragraph?.type === 'heading' ? paragraph.text.uk.slice(0, 130) : blockTitle(block).slice(0, 130)
    node.append(el('span', '', sample || KIND_LABELS[blockKind(block)]))
  }
  return node
}

function renderLibrary() {
  const host = document.getElementById('lb-library-cards')!
  host.replaceChildren()
  for (const material of inbox) {
    const dummy = makeMaterial(lesson!, pack(), material.title, material.items)
    if (!matches(material.title, material.subjectPackId, material.grade, material.topic, blockKind(dummy))) continue
    const card = el('article', 'lb-card')
    card.draggable = true
    card.addEventListener('dragstart', event => event.dataTransfer?.setData('application/x-rozumko-card', JSON.stringify({ inbox: material.id })))
    card.append(thumb(dummy), el('h3', '', material.title), el('p', 'adm-field-hint', `${material.grade} клас · ${material.topic || 'Без теми'} · у цьому браузері`),
      button('Додати до уроку', () => addInbox(material)), button('Прибрати з бібліотеки', () => {
        inbox = inbox.filter(m => m.id !== material.id); void persistInbox(); renderLibrary()
      }))
    host.append(card)
  }
  if (source) {
    const section = el('section', 'lb-source')
    section.append(el('h3', '', `Картки: ${source.title.uk}`), button('Закрити добірку', () => { source = null; renderLibrary() }))
    const grid = el('div', 'lb-cards')
    for (const block of source.blocks) {
      if (!matches(blockTitle(block), source.subjectPackId, source.grade, source.moduleId ?? '', blockKind(block))) continue
      const card = el('article', 'lb-card')
      card.draggable = true
      card.addEventListener('dragstart', event => event.dataTransfer?.setData('application/x-rozumko-card', JSON.stringify({ source: source!.id, block: block.id })))
      card.append(thumb(block, source), el('h4', '', blockTitle(block)), button('Додати до уроку', () => { if (source) addSource(source, [block]) }))
      grid.append(card)
    }
    section.append(grid); host.append(section)
  }
  for (const saved of summaries) {
    if (!matches(saved.title, saved.subjectPackId, saved.grade, saved.moduleId ?? '', 'lesson') && !(filters.kind && filters.kind !== 'lesson' && saved.subjectPackId === filters.pack && (!filters.grade || saved.grade === Number(filters.grade)))) continue
    const card = el('article', 'lb-card')
    card.draggable = true
    card.addEventListener('dragstart', event => event.dataTransfer?.setData('application/x-rozumko-card', JSON.stringify({ lesson: saved.id })))
    card.append(el('div', 'lb-thumb lb-thumb--lesson', 'Урок'), el('h3', '', saved.title), el('p', 'adm-field-hint', `${saved.grade} клас · ${saved.moduleId || 'Без теми'}`),
      button('Переглянути картки', () => { void loadSource(saved.id) }),
      button('Додати весь урок', () => { void addSavedSource(saved.id) }))
    host.append(card)
  }
  if (!host.childElementCount) host.append(el('p', 'adm-field-hint', 'Немає матеріалів за цими фільтрами. Додайте свій матеріал або змініть фільтри.'))
}
async function loadSource(id: string) {
  try { source = (await getAdminCurriculumLesson(id)).lesson.draftContent as unknown as EditableLesson; renderLibrary() }
  catch (err) { report(err) }
}
async function addSavedSource(id: string) {
  try { const result = await getAdminCurriculumLesson(id); const src = result.lesson.draftContent as unknown as EditableLesson; addSource(src, src.blocks) }
  catch (err) { report(err) }
}
function addSource(src: EditableLesson, blocks: EditableBlock[]) {
  if (busy) return
  const before = structuredClone(lesson!)
  try {
    checkpoint()
    const ids = appendSourceBlocks(lesson!, src, blocks, pack(), reserved)
    if (lessonSize(lesson!) > 4 * 1024 * 1024) throw new Error('Урок перевищує 4 МіБ. Приберіть великі файли.')
    selected = ids[0] ?? selected; changed()
  } catch (err) { lesson = before; undo.pop(); report(err) }
}
function addInbox(material: BuilderMaterial) {
  if (busy) return
  if (material.subjectPackId !== lesson!.subjectPackId) { message('Матеріал належить іншому предмету.', true); return }
  const block = makeMaterial(lesson!, pack(), material.title, material.items, reserved)
  appendMaterial(block)
}
function appendMaterial(block: EditableBlock) {
  if (lesson!.blocks.length >= 60) { message('Максимум 60 карток в одному уроці.', true); return }
  checkpoint(); lesson!.blocks.push(block)
  if (lessonSize(lesson!) > 4 * 1024 * 1024) { lesson = undo.pop()!; message('Урок перевищує 4 МіБ. Приберіть великі файли.', true); return }
  selected = block.id; changed()
}

function renderSequence() {
  const host = document.getElementById('lb-sequence')!
  host.replaceChildren()
  for (const [index, block] of lesson!.blocks.entries()) {
    const item = el('li', `lb-step${selected === block.id ? ' lb-step--selected' : ''}`)
    item.dataset.block = block.id
    item.draggable = true
    item.addEventListener('dragstart', event => {
      if ((event.target as Element).closest('button,input,textarea')) { event.preventDefault(); return }
      event.dataTransfer?.setData('application/x-rozumko-card', JSON.stringify({ move: block.id }))
    })
    item.addEventListener('dragover', event => { event.preventDefault(); event.stopPropagation() })
    item.addEventListener('drop', event => { event.preventDefault(); event.stopPropagation(); void dropCard(event.dataTransfer, index) })
    const choose = button(`${index + 1}. ${blockTitle(block)}`, () => { selected = block.id; renderSequence(); renderPreview(); if (presenting) board?.follow(block.id) }, 'lb-step-title')
    choose.setAttribute('aria-pressed', String(selected === block.id))
    const actions = el('div', 'lb-step-actions')
    const up = button('↑', () => reorder(index, index - 1)); up.disabled = index === 0; up.setAttribute('aria-label', `Перемістити картку ${index + 1} вище`)
    const down = button('↓', () => reorder(index, index + 1)); down.disabled = index === lesson!.blocks.length - 1; down.setAttribute('aria-label', `Перемістити картку ${index + 1} нижче`)
    actions.append(button('Редагувати', () => editBlock(block)), button('Копія', () => addSource(lesson!, [block])), up, down, button('Видалити', () => {
      checkpoint(); reserved.add(block.id); lesson!.blocks.splice(index, 1); selected = lesson!.blocks[Math.min(index, lesson!.blocks.length - 1)]?.id ?? null; changed()
    }))
    const badges = [block.views.presentation ? 'Проєктор' : '', block.views.remote ? 'Пристрої учнів' : '', block.type === 'teacher-note' ? 'Лише вчитель' : ''].filter(Boolean)
    item.append(thumb(block), choose, el('p', 'adm-field-hint', badges.join(' · ')), actions)
    host.append(item)
  }
  if (!lesson!.blocks.length) host.append(el('li', 'adm-field-hint', 'Додайте або перетягніть картку з бібліотеки.'))
}
function reorder(from: number, to: number) {
  if (busy || from === to || to < 0 || to >= lesson!.blocks.length) return
  checkpoint(); moveBlockTo(lesson!, from, to); changed()
}
async function dropCard(data: DataTransfer | null, index: number) {
  if (!data || busy) return
  const raw = data.getData('application/x-rozumko-card')
  if (!raw) {
    if (data.files.length) await captureFiles([...data.files])
    else captureTransfer(data)
    return
  }
  try {
    const card = JSON.parse(raw)
    if (typeof card.move === 'string') { reorder(lesson!.blocks.findIndex(b => b.id === card.move), Math.min(index, lesson!.blocks.length - 1)); return }
    const count = lesson!.blocks.length
    if (typeof card.inbox === 'string') { const m = inbox.find(m => m.id === card.inbox); if (m) addInbox(m) }
    else if (typeof card.lesson === 'string') await addSavedSource(card.lesson)
    else if (source?.id === card.source) { const b = source.blocks.find(b => b.id === card.block); if (b) addSource(source, [b]) }
    if (index < count && lesson!.blocks.length > count) {
      const appended = lesson!.blocks.splice(count)
      lesson!.blocks.splice(index, 0, ...appended)
      changed()
    }
  } catch (err) { report(err) }
}
function renderPreview() {
  const host = document.getElementById('lb-preview')!
  host.replaceChildren()
  const safe = withoutAnswerKeys(lesson!) as unknown as LessonDefinition
  const slide = presentationSlides(safe).find(s => s.blockId === selected)
  if (slide) host.append(el('h3', '', 'Перегляд на проєкторі'), renderSlide(slide))
  else host.append(el('p', 'adm-field-hint', 'Ця картка не показується на проєкторі. Увімкніть показ у редакторі картки.'))
}

function modal(title: string) {
  const overlay = el('div', 'question-modal-overlay cl-overlay')
  overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', title)
  const card = el('div', 'question-modal-card cl-overlay__card')
  const header = el('div', 'cl-overlay__head')
  const body = el('div', 'cl-overlay__body')
  const opener = document.activeElement as HTMLElement | null
  let removeTrap = () => {}
  let beforeClose = () => {}
  const close = () => { beforeClose(); removeTrap(); overlay.remove(); opener?.focus() }
  header.append(el('h3', '', title), button('Закрити', close))
  card.append(header, body); overlay.append(card); document.body.append(overlay)
  removeTrap = createFocusTrap(overlay, close)
  header.querySelector('button')!.focus()
  return { body, close, onClose: (callback: () => void) => { beforeClose = callback } }
}

function addDialog(kind: BuilderKind) {
  if (!lesson || busy) return
  if (kind === 'activity') {
    const block = newBlock('activity', lesson, pack(), reserved)
    appendMaterial(block); editBlock(block); return
  }
  const { body, close } = modal(`Додати: ${KIND_LABELS[kind]}`)
  let title = KIND_LABELS[kind]
  let value = kind === 'html' ? '<h1>Привіт, клас!</h1>\n<p>Мій матеріал уроку</p>' : ''
  body.append(field('Назва картки / опис', title, v => { title = v }))
  const content = field(kind === 'html' ? 'HTML, CSS та JavaScript' : kind === 'text' ? 'Текст картки' : 'Посилання на матеріал', value, v => { value = v }, kind === 'html' || kind === 'text')
  if (kind === 'html') {
    content.querySelector('textarea')!.classList.add('adm-input--code')
    content.querySelector('textarea')!.maxLength = 65_536
  }
  body.append(content)
  const preview = el('div', 'lb-dialog-preview')
  const error = el('p', 'adm-form-error'); error.setAttribute('role', 'alert')
  const read = (): CanvasItem[] => {
    if (!title.trim() || title.length > 200) throw new Error('Додайте назву картки (до 200 символів).')
    if (!value.trim()) throw new Error('Додайте вміст картки.')
    if (kind === 'html') return [{ type: 'html', html: value }]
    if (kind === 'text') {
      const lines = value.split(/\n\s*\n/).filter(v => v.trim())
      if (lines.length > 20 || lines.some(v => v.length > 2000)) throw new Error('До 20 абзаців, кожен до 2000 символів.')
      return lines.map(text => ({ type: 'paragraph', text: { uk: text } }))
    }
    return [resourceItem(value, kind, title)]
  }
  if (kind === 'html') body.append(el('p', 'adm-field-hint', 'Код працює в ізольованій картці. Підтримуються вбудовані CSS та JavaScript; зовнішні бібліотеки, мережеві запити й доступ до платформи недоступні.'), button('Оновити перегляд HTML', () => {
    try { preview.replaceChildren(renderCanvasItems(read(), 'teacher')); error.textContent = '' } catch (err) { error.textContent = (err as Error).message }
  }))
  if (kind === 'link') body.append(el('p', 'adm-field-hint', 'Звичайний сайт відкривається окремо. Для показу всередині уроку використайте YouTube, LearningApps або HTML-картку.'))
  body.append(preview, error, button('Додати картку', () => {
    try { const items = read(); captureMaterial(title, items); close() } catch (err) { error.textContent = (err as Error).message }
  }, 'btn-adm-emerald'))
}

async function persistInbox() {
  try { await materialInbox(owner, inbox) } catch { message('Матеріали додано, але браузер не зберіг бібліотеку. Збережіть урок на сервері.', true) }
}
function captureMaterial(title: string, items: CanvasItem[]) {
  const material: BuilderMaterial = {
    id: crypto.randomUUID(), title, items: structuredClone(items), subjectPackId: filters.pack || lesson!.subjectPackId,
    grade: Number(filters.grade) || lesson!.grade, topic: filters.topic,
  }
  inbox.unshift(material); void persistInbox(); renderLibrary(); addInbox(material)
  message(material.topic ? 'Картку додано до бібліотеки й уроку.' : 'Картку додано. Тему можна уточнити в параметрах уроку.')
}
async function captureFiles(files: File[]) {
  if (busy) return
  for (const file of files) {
    try { captureMaterial(file.name.slice(0, 200), [await fileItem(file)]) } catch (err) { report(err); break }
  }
}
function captureTransfer(data: DataTransfer) {
  try {
    const html = data.getData('text/html')
    const doc = html ? new DOMParser().parseFromString(html, 'text/html') : null
    const image = doc?.querySelector('img[src]')
    const raw = image?.getAttribute('src') ?? data.getData('text/uri-list').split('\n').find(v => v && !v.startsWith('#')) ?? data.getData('text/plain')
    const label = image?.getAttribute('alt')?.slice(0, 200) || doc?.querySelector('a')?.textContent?.trim().slice(0, 200) || 'Новий матеріал'
    captureMaterial(label, [resourceItem(raw, image ? 'image' : undefined, label)])
  } catch (err) { report(err) }
}

function editBlock(block: EditableBlock) {
  if (busy) return
  if (block.activity) { editActivity(block); return }
  const working = structuredClone(block)
  if (working.type !== 'canvas' && CONVERTIBLE_TYPES.has(working.type)) convertToCanvas(working, lesson!)
  const { body, close, onClose } = modal(`Редагувати: ${blockTitle(block)}`)
  let title = blockTitle(block)
  body.append(field('Назва картки', title, v => { title = v; working.content.heading = { uk: v } }))
  const htmlItems = canvasItems(working)
  if (htmlItems.length === 1 && htmlItems[0]!.type === 'html') {
    let code = htmlItems[0]!.html
    const codeField = field('HTML, CSS та JavaScript', code, v => { code = v }, true)
    const area = codeField.querySelector('textarea')!; area.classList.add('adm-input--code'); area.maxLength = 65_536
    const preview = el('div', 'lb-dialog-preview')
    const refresh = () => preview.replaceChildren(renderCanvasItems([{ type: 'html', html: code }], 'teacher'))
    body.append(codeField, button('Оновити перегляд HTML', refresh), preview)
    refresh()
    body.append(button('Застосувати', () => {
      if (!code.trim() || !title.trim()) return
      checkpoint()
      for (const surface of ['teacher', 'board', 'student']) {
        if ((working.content[surface] as CanvasItem[]).length) working.content[surface] = [{ type: 'html', html: code }]
      }
      Object.assign(block, working); close(); changed()
    }, 'btn-adm-emerald'))
  } else if (working.type === 'canvas') {
    let surface: 'teacher' | 'board' | 'student' = 'board'
    const editorHost = el('div')
    body.append(editorHost, button('Застосувати', () => {
      checkpoint(); Object.assign(block, working); close(); changed()
    }, 'btn-adm-emerald'))
    editorHost.textContent = 'Завантажуємо редактор…'
    void import('./curriculum-canvas-editor.js').then(({ renderCanvasEditor, disposeCanvasEditors }) => {
      if (!editorHost.isConnected) return
      onClose(() => disposeCanvasEditors(editorHost))
      const refresh = () => editorHost.replaceChildren(renderCanvasEditor(working, {
        selected: surface, select: s => { surface = s; refresh() }, touched: () => {}, changed: refresh, viewsChanged: () => {},
      }))
      refresh()
    }, () => { editorHost.textContent = 'Не вдалося завантажити редактор. Оновіть сторінку.' })
  } else {
    body.append(el('p', 'adm-field-hint', 'Для цього службового блоку доступні повні налаштування в розділі «Уроки».'), button('Відкрити повний редактор', () => { close(); void openFullEditor() }))
  }
  body.append(checkbox('Показувати на проєкторі', working.views.presentation, value => setOnBoard(working, value)),
    checkbox('Показувати учням під час цього кроку', working.views.remote, value => {
      if (working.type === 'canvas' && value && !(working.content.student as CanvasItem[]).length) working.content.student = structuredClone(working.content.board)
      setOnDevices(working, value)
    }))
}

function editActivity(block: EditableBlock) {
  checkpoint()
  const touch = () => { dirty = true; updateActions() }
  const dialog = openActivityDialog({
    lesson: lesson!, block, mechanicLabels: MECHANIC_LABELS, pack: pack(),
    outcomeCode: id => outcomes.find(o => o.id === id)?.code ?? id,
    outcomeTitle: id => outcomes.find(o => o.id === id)?.titleUk ?? id,
    outcomePicker: onPick => picker('Результат навчання', [['', 'Оберіть вміння'], ...outcomes.filter(o => o.status === 'active' && o.subjectPackId === lesson!.subjectPackId).map(o => [o.id, `${o.code}: ${o.titleUk}`] as [string, string])], '', id => { if (id) onPick(id) }),
    addOutcome: id => { addActivityOutcome(lesson!, lesson!.blocks.indexOf(block), id); touch() },
    removeOutcome: id => { removeActivityOutcome(lesson!, lesson!.blocks.indexOf(block), id); touch() },
    switchMechanic: (mechanic, done) => {
      const apply = () => { block.activity = activityTemplate(mechanic, block.activity!.instanceId, pack()); touch(); done() }
      showConfirm('Замінити тип активності? Її поточні запитання буде замінено шаблоном.', apply)
    },
    contentFields: () => field('Назва активності', blockTitle(block), v => { block.content.heading = { uk: v }; touch() }),
    slideFields: () => null,
    jsonFields: () => el('p', 'adm-field-hint', 'Розширені налаштування доступні в повному редакторі «Уроки».'),
    touched: touch, changed: () => { touch(); dialog.refresh() }, closed: changed,
  })
}

async function saveLesson(): Promise<boolean> {
  if (!lesson || busy) return false
  busy = true; updateActions()
  try {
    const result = row ? await updateAdminCurriculumLesson(row.id, lesson, row.editVersion) : await createAdminCurriculumLesson(lesson)
    row = result.lesson
    lesson = structuredClone(row.draftContent) as unknown as EditableLesson
    dirty = false
    const summary = { ...row }
    summaries = [...summaries.filter(s => s.id !== row!.id), summary]
    source = null
    renderLibrary(); renderSequence(); renderPreview()
    message('Урок збережено на сервері. Його картки доступні в бібліотеці.')
    return true
  } catch (err) { report(err); return false }
  finally { busy = false; updateActions() }
}
async function startLesson() {
  if (busy || !lesson?.blocks.length) return
  if ((dirty || !row) && !await saveLesson()) return
  try {
    const validation = await validateAdminCurriculumLesson(lesson, row!.id)
    if (!validation.ok) { message(validation.issues.map(describeLessonIssue).join(' · '), true); return }
    startPresentation()
  } catch (err) { report(err) }
}
function startPresentation() {
  dropBoard()
  const safe = withoutAnswerKeys(lesson!) as unknown as LessonDefinition
  const slides = presentationSlides(safe)
  if (!slides.length) { message('Увімкніть показ на проєкторі хоча б для однієї картки.', true); return }
  presenting = true
  root().querySelector<HTMLElement>('.lb-layout')!.hidden = true
  const host = document.getElementById('lb-console')!
  host.replaceChildren(); host.hidden = false
  board = mountBoardWindow(safe, {
    ...(row?.status === 'published' && !dirty ? { check: (instanceId, answer) => checkCurriculumActivity(row!.id, instanceId, answer) } : {}),
    onSlideChange: id => { selected = id; renderSequence(); renderPreview(); highlight() },
  })
  const rail = el('div', 'lb-console-rail')
  for (const slide of slides) {
    const btn = button(blockTitle(slide.block as unknown as EditableBlock), () => { selected = slide.blockId; board!.follow(slide.blockId); renderSequence(); renderPreview(); highlight() }, 'lb-console-card')
    btn.dataset.slide = slide.blockId
    btn.prepend(thumb(slide.block as unknown as EditableBlock)); rail.append(btn)
  }
  const highlight = () => rail.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.slide === selected)))
  highlight()
  host.append(el('h3', '', 'Пульт уроку'), board.element, rail,
    button('Провести з учнями', () => { void conductWithStudents() }, 'btn-adm-emerald'),
    el('p', 'adm-field-hint', 'Проведення з учнями використовує опубліковану версію та наявну панель класу: приєднання, запуск завдань і результати.'),
    button('Повернутися до конструктора', () => { dropBoard(); host.hidden = true; root().querySelector<HTMLElement>('.lb-layout')!.hidden = false }))
  host.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
async function conductWithStudents() {
  if (busy || !row) return
  if (dirty) { message('Збережіть зміни та розпочніть урок знову.', true); return }
  const navigate = () => { location.href = `lesson-engine.html?lesson=${encodeURIComponent(row!.id)}` }
  if (row.status === 'published') { navigate(); return }
  showConfirm('Опублікувати цю версію уроку та відкрити панель проведення з учнями? Опублікований урок стане доступним учителям.', () => {
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
function showSaved() {
  const { body, close } = modal('Збережені уроки')
  if (!summaries.length) body.append(el('p', '', 'Збережених уроків ще немає.'))
  for (const summary of summaries) {
    const item = el('div', 'lb-saved-row')
    item.append(el('strong', '', summary.title), el('span', 'adm-field-hint', `${summary.grade} клас · ${summary.status === 'published' ? 'Опубліковано' : 'Чернетка'}`), button('Відкрити', () => {
      close(); discardThen(() => { void openSaved(summary.id) })
    }))
    body.append(item)
  }
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
