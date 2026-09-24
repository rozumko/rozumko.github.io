// Admin tab "Керовані уроки": list and editor for Lesson Engine lessons.
// Structure is edited with forms (lesson data, blocks, board and device
// switches, slides, outcomes); the content of a block and an activity's
// configuration and answer key are edited as JSON. The server validates every
// save; pure editing rules live in curriculum-model.ts.

import {
  createAdminCurriculumLesson,
  getAdminCurriculumLesson,
  getAdminCurriculumLessonRevisions,
  getAdminCurriculumLessons,
  getAdminCurriculumOutcomes,
  getAdminSubjectPacks,
  restoreAdminCurriculumLessonRevision,
  setAdminCurriculumLessonStatus,
  updateAdminCurriculumLesson,
  validateAdminCurriculumLesson,
  type AdminCurriculumLesson,
  type AdminCurriculumLessonSummary,
  type AdminCurriculumOutcome,
  type AdminSubjectPack,
  type ApiError,
  type CurriculumLessonStatus,
} from '../api/client.js'
import { $ } from '../../utils/dom.js'
import { createFocusTrap } from '../../utils/focus-trap.js'
import { friendlyError, showConfirm } from './ui.js'
import { renderLessonDocument } from '../lesson-engine/document-view.js'
import { openPresentation } from '../lesson-engine/presentation-view.js'
import { BLOCK_TYPE_LABELS, MODALITY_LABELS } from '../lesson-engine/projection.js'
import {
  ACTIVITY_TELEMETRY,
  BLOCK_MODALITIES,
  LESSON_BLOCK_TYPES,
  PRESENTATION_LAYOUTS,
  type ActivityMechanic,
  type ActivityTelemetry,
  type BlockModality,
  type LessonBlockType,
  type LessonDefinition,
  type PresentationLayout,
} from '../lesson-engine/types.js'
import {
  EDITOR_MECHANICS,
  LESSON_ID_RE,
  activityTemplate,
  addActivityOutcome,
  addLessonOutcome,
  describeIssueMessage,
  describeLessonIssue,
  formatJson,
  groupIssues,
  isRecord,
  moveBlock,
  newBlock,
  newLesson,
  optionalText,
  outcomeCoverage,
  parseJson,
  removeActivityOutcome,
  removeLessonOutcome,
  renameLesson,
  setOnBoard,
  setOnDevices,
  setStep,
  setStudentAudience,
  shortTextFromLines,
  withoutAnswerKeys,
  type EditableBlock,
  type EditableLesson,
  type EvidenceRole,
  type Issue,
  type OutcomeRole,
  type PackInfo,
} from './curriculum-model.js'

const STATUS_LABELS: Record<CurriculumLessonStatus, string> = {
  draft: 'Чернетка',
  review: 'На перевірці',
  published: 'Опубліковано',
  archived: 'Знято',
}

const LAYOUT_LABELS: Record<PresentationLayout, string> = {
  title: 'Титульний',
  visual: 'Зображення',
  concept: 'Поняття з тезами',
  question: 'Питання',
  'activity-launcher': 'Завдання',
}

const MECHANIC_LABELS: Record<ActivityMechanic, string> = {
  choice: 'Вибір однієї відповіді',
  truefalse: 'Правда / неправда',
  classify: 'Розподіл по групах',
  external: 'Зовнішній тренажер (без оцінки)',
  game: 'Гра платформи',
}

const TELEMETRY_LABELS: Record<ActivityTelemetry, string> = {
  practice: 'Тренування (не рахується)',
  checkpoint: 'Перевірка розуміння (сигнал вчителю)',
  evidence: 'Доказ досягнення результату',
}

const ROLE_LABELS: Record<OutcomeRole, string> = {
  introduced: 'Знайомство',
  practised: 'Відпрацювання',
  assessed: 'Оцінювання',
}

const EVIDENCE_ROLE_LABELS: Record<EvidenceRole, string> = {
  primary: 'основний доказ',
  supporting: 'допоміжний',
}

/** Which JSON keys each block type's content takes (shown as a hint). */
const CONTENT_HINTS: Record<LessonBlockType, string> = {
  hero: 'title (обов’язково), kicker, subtitle',
  'essential-question': 'question (обов’язково)',
  objectives: 'heading. Показує цілі уроку з розділу «Урок».',
  explanation: 'heading, paragraphs (1–20, обов’язково), callout { title, text }',
  visual: 'heading, assetId (id ресурсу з розділу «Ресурси»)',
  discussion: 'heading, prompt (обов’язково), expectedResponse (бачить лише вчитель)',
  practice: 'heading, intro, steps: [{ title, items: [...] }]',
  activity: 'heading. Завдання налаштовується нижче.',
  support: 'heading, items (1–20)',
  extension: 'heading, prompt (обов’язково), example',
  reflection: 'heading, prompt (обов’язково)',
  'success-criteria': 'heading, items (1–20), evidenceHint',
  vocabulary: 'heading, sentenceFrames. Показує словник уроку.',
  'teacher-note': 'text (обов’язково)',
  break: 'prompt',
}

const MECHANIC_HINTS: Record<ActivityMechanic, string> = {
  choice: 'Налаштування: prompt, options: [{ id, text }] (2–6). Ключ: { correctOptionId, explanation }.',
  truefalse: 'Налаштування: prompt, statements: [{ id, text }] (1–10). Ключ: { answers: { id: true | false } }.',
  classify: 'Налаштування: prompt, categories (2–4), items (2–20). Ключ: { placement: { itemId: categoryId } }.',
  external: 'Налаштування: toolKey (з дозволених предметом), instructions. Не оцінюється.',
  game: 'Налаштування: gameKey, level (з дозволених предметом), instructions. Результат лише допоміжний.',
}

// Text is { uk } with optional { en }; **жирний** і `код` — єдина розмітка.
const TEXT_HINT = 'Тексти — { "uk": "…" }. Розмітка лише **жирний** і `код`.'

interface EditorState {
  /** null until the lesson is first saved. */
  row: AdminCurriculumLesson | null
  lesson: EditableLesson
  /** Block ids a new block must not take: the published version's and deleted ones. */
  reserved: Set<string>
  dirty: boolean
  issues: Issue[]
  jsonErrors: Map<string, string>
  openBlocks: Set<string>
  message: string
}

let lessons: AdminCurriculumLessonSummary[] = []
let packs: AdminSubjectPack[] = []
let outcomes: AdminCurriculumOutcome[] = []
let editor: EditorState | null = null
let fieldCounter = 0
let backupTimer: number | undefined

// ── Small DOM helpers ───────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function button(label: string, className = 'btn-adm-ghost', onClick?: () => void): HTMLButtonElement {
  const b = el('button', className, label)
  b.type = 'button'
  if (onClick) b.addEventListener('click', onClick)
  return b
}

function nextId(): string {
  fieldCounter += 1
  return `cl-f-${fieldCounter}`
}

/** A labelled control; the label is always tied to the control. */
function field(label: string, control: HTMLElement, hint?: string): HTMLDivElement {
  const wrap = el('div', 'cl-field')
  control.id ||= nextId()
  const labelEl = el('label', 'adm-label', label)
  labelEl.htmlFor = control.id
  wrap.append(labelEl, control)
  if (hint) {
    const hintEl = el('p', 'adm-field-hint', hint)
    hintEl.id = `${control.id}-hint`
    control.setAttribute('aria-describedby', hintEl.id)
    wrap.append(hintEl)
  }
  return wrap
}

function textInput(value: string, onInput: (value: string) => void, options: { maxLength?: number; placeholder?: string } = {}): HTMLInputElement {
  const input = el('input', 'adm-input adm-input--sm')
  input.type = 'text'
  input.value = value
  if (options.maxLength) input.maxLength = options.maxLength
  if (options.placeholder) input.placeholder = options.placeholder
  input.addEventListener('input', () => onInput(input.value))
  return input
}

function textArea(value: string, onInput: (value: string) => void, rows = 2): HTMLTextAreaElement {
  const area = el('textarea', 'adm-input')
  area.rows = rows
  area.value = value
  area.addEventListener('input', () => onInput(area.value))
  return area
}

function select<T extends string>(options: readonly T[], labels: Record<T, string> | ((value: T) => string), value: string, onChange: (value: T) => void): HTMLSelectElement {
  const s = el('select', 'adm-input adm-input--sm')
  for (const option of options) {
    const o = el('option', undefined, typeof labels === 'function' ? labels(option) : labels[option])
    o.value = option
    s.append(o)
  }
  s.value = value
  s.addEventListener('change', () => onChange(s.value as T))
  return s
}

function checkbox(label: string, checked: boolean, onChange: (checked: boolean) => void, disabled = false): HTMLLabelElement {
  const wrap = el('label', 'cl-check')
  const input = el('input')
  input.type = 'checkbox'
  input.checked = checked
  input.disabled = disabled
  input.addEventListener('change', () => onChange(input.checked))
  wrap.append(input, ` ${label}`)
  return wrap
}

function packInfo(id: string): PackInfo | null {
  const pack = packs.find(p => p.id === id)
  return pack ? { id: pack.id, subject: pack.subject, gradeRange: pack.gradeRange, tools: pack.tools, games: pack.games } : null
}

function outcomeLabel(id: string): string {
  const outcome = outcomes.find(o => o.id === id)
  if (!outcome) return id
  return `${outcome.code} — ${outcome.titleUk}${outcome.status === 'archived' ? ' (знятий)' : ''}`
}

// ── List ────────────────────────────────────────────────────────────────────

export function initCurriculumTab() {
  $<HTMLInputElement>('cl-filter-search').addEventListener('input', renderList)
  $<HTMLSelectElement>('cl-filter-status').addEventListener('change', renderList)
  $('cl-new-btn').addEventListener('click', () => { void startNewLesson() })
  $<HTMLInputElement>('cl-import-file').addEventListener('change', event => {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (file) void importFile(file)
  })
  window.addEventListener('beforeunload', event => {
    if (editor?.dirty) event.preventDefault()
  })
}

export async function loadCurriculumTab() {
  $('cl-list-error').textContent = ''
  try {
    const [list, packList, directory] = await Promise.all([
      getAdminCurriculumLessons(),
      packs.length ? Promise.resolve({ packs }) : getAdminSubjectPacks(),
      getAdminCurriculumOutcomes(),
    ])
    lessons = list.lessons
    packs = packList.packs
    outcomes = directory.outcomes
    if (!editor) renderList()
  } catch (err) {
    $('cl-list-error').textContent = (err as ApiError).status === 404
      ? 'Керовані уроки вимкнені на сервері (LESSON_ENGINE_ENABLED).'
      : friendlyError((err as Error).message)
  }
}

function renderList() {
  const list = $('cl-list')
  const query = $<HTMLInputElement>('cl-filter-search').value.trim().toLowerCase()
  const status = $<HTMLSelectElement>('cl-filter-status').value
  // Single-editor workflow: a lesson left "on review" by the API counts as a draft here.
  const filtered = lessons.filter(lesson =>
    (!status || lesson.status === status || (status === 'draft' && lesson.status === 'review'))
    && (!query || `${lesson.title} ${lesson.id}`.toLowerCase().includes(query)))
  $('cl-count').textContent = `${filtered.length} із ${lessons.length}`
  list.replaceChildren()
  if (filtered.length === 0) {
    const empty = el('div', 'admin-empty-state')
    const inner = el('div')
    inner.append(el('p', 'admin-empty-state__title', lessons.length ? 'За цими фільтрами нічого не знайдено' : 'Керованих уроків ще немає'))
    empty.append(inner)
    list.append(empty)
    return
  }
  for (const lesson of filtered) {
    const item = el('div', 'question-item')
    item.dataset.lessonId = lesson.id
    const left = el('div', 'question-item__left')
    const badges = el('div', 'question-item__badges')
    const badgeClass = lesson.status === 'published' ? 'qi-badge--easy' : lesson.status === 'draft' ? 'qi-badge--medium' : 'qi-badge--type'
    badges.append(el('span', `qi-badge ${badgeClass}`, STATUS_LABELS[lesson.status]), el('span', 'qi-badge qi-badge--type', `${lesson.grade} клас`))
    if (lesson.publishedVersion && lesson.status !== 'published') {
      badges.append(el('span', 'qi-badge qi-badge--practice', `вчителі бачать v${lesson.publishedVersion}`))
    }
    left.append(badges, el('p', 'question-item__text', lesson.title))
    const meta = [lesson.id, `редакція ${lesson.editVersion}`]
    if (lesson.publishedVersion) meta.push(`опублікована v${lesson.publishedVersion}`)
    left.append(el('p', 'question-item__meta', meta.join(' · ')))
    const actions = el('div', 'question-item__actions')
    actions.append(button('Редагувати', 'btn-adm-ghost', () => { void openLesson(lesson.id) }))
    item.append(left, actions)
    list.append(item)
  }
}

// ── Opening, creating, importing ────────────────────────────────────────────

function reservedFrom(row: AdminCurriculumLesson | null): Set<string> {
  const published = row?.publishedSnapshot
  const blocks = isRecord(published) && Array.isArray(published.blocks) ? published.blocks : []
  return new Set(blocks.map(b => (isRecord(b) && typeof b.id === 'string' ? b.id : '')).filter(Boolean))
}

function startEditor(row: AdminCurriculumLesson | null, lesson: EditableLesson, dirty: boolean) {
  editor = {
    row,
    lesson,
    reserved: reservedFrom(row),
    dirty,
    issues: [],
    jsonErrors: new Map(),
    openBlocks: new Set(),
    message: '',
  }
  $('cl-list-view').hidden = true
  $('cl-editor-view').hidden = false
  renderEditor()
  offerBackup()
  $('cl-editor-view').querySelector<HTMLElement>('h2')?.focus()
}

async function openLesson(id: string) {
  $('cl-list-error').textContent = ''
  try {
    if (!outcomes.length || !packs.length) await loadCurriculumTab()
    const { lesson: row } = await getAdminCurriculumLesson(id)
    startEditor(row, structuredClone(row.draftContent) as unknown as EditableLesson, false)
  } catch (err) {
    $('cl-list-error').textContent = friendlyError((err as Error).message)
  }
}

function freeLessonId(grade: number): string {
  const taken = new Set(lessons.map(l => l.id))
  let n = 1
  while (taken.has(`g${grade}-new-l${n}`)) n++
  return `g${grade}-new-l${n}`
}

async function startNewLesson() {
  if (!packs.length) await loadCurriculumTab()
  const pack = packs[0]
  if (!pack) {
    $('cl-list-error').textContent = 'Немає жодного предмета.'
    return
  }
  const grade = pack.gradeRange.min
  startEditor(null, newLesson({ id: freeLessonId(grade), title: 'Новий урок', grade, pack: packInfo(pack.id)! }), true)
}

async function importFile(file: File) {
  const parsed = parseJson(await file.text())
  if (!parsed.ok || !isRecord(parsed.value) || typeof parsed.value.id !== 'string' || !Array.isArray(parsed.value.blocks)) {
    $('cl-list-error').textContent = 'Це не схоже на урок: потрібен JSON з полями id і blocks.'
    return
  }
  const imported = parsed.value as unknown as EditableLesson
  if (!packs.length) await loadCurriculumTab()
  const existing = lessons.find(l => l.id === imported.id)
  if (!existing) {
    startEditor(null, imported, true)
    setMessage('Урок імпортовано, але ще не збережено. Перевірте й натисніть «Зберегти».')
    return
  }
  showConfirm(`Урок «${existing.title}» (${existing.id}) уже є. Замінити його чернетку імпортованим файлом? Опублікована версія не зміниться, доки ви не опублікуєте нову.`, () => {
    void (async () => {
      await openLesson(existing.id)
      if (!editor) return
      editor.lesson = imported
      editor.dirty = true
      renderEditor()
      setMessage('Чернетку замінено імпортованим файлом. Збережіть, щоб зберегти зміни.')
    })()
  })
}

function closeEditor() {
  const leave = () => {
    clearBackup()
    editor = null
    $('cl-editor-view').replaceChildren()
    $('cl-editor-view').hidden = true
    $('cl-list-view').hidden = false
    void loadCurriculumTab()
  }
  if (editor?.dirty) showConfirm('Вийти без збереження? Незбережені зміни буде втрачено.', leave)
  else leave()
}

// ── Local backup of unsaved work (per browser, best effort) ─────────────────

function backupKey(): string {
  return `admin:curriculum:backup:${editor?.row?.id ?? 'new'}`
}

function scheduleBackup() {
  window.clearTimeout(backupTimer)
  backupTimer = window.setTimeout(() => {
    if (!editor?.dirty) return
    try {
      localStorage.setItem(backupKey(), JSON.stringify({ baseEditVersion: editor.row?.editVersion ?? 0, lesson: editor.lesson }))
    } catch { /* storage unavailable: the editor still works */ }
  }, 800)
}

function clearBackup() {
  window.clearTimeout(backupTimer)
  try { localStorage.removeItem(backupKey()) } catch { /* ignore */ }
}

function offerBackup() {
  if (!editor) return
  let stored: { baseEditVersion?: number; lesson?: unknown } | null
  try { stored = JSON.parse(localStorage.getItem(backupKey()) ?? 'null') } catch { stored = null }
  if (!stored || !isRecord(stored.lesson)) return
  if (stored.baseEditVersion !== (editor.row?.editVersion ?? 0)) {
    clearBackup()
    return
  }
  if (JSON.stringify(stored.lesson) === JSON.stringify(editor.lesson)) return
  const banner = $('cl-editor-view').querySelector<HTMLElement>('.cl-backup')
  if (!banner) return
  const backup = stored.lesson as unknown as EditableLesson
  banner.replaceChildren(
    el('span', undefined, 'У цьому браузері є незбережені зміни з минулого разу. '),
    button('Відновити', 'btn-adm-sky btn--sm', () => {
      if (!editor) return
      editor.lesson = backup
      editor.dirty = true
      renderEditor()
      setMessage('Незбережені зміни відновлено.')
    }),
    button('Відкинути', 'btn-adm-ghost btn--sm', () => {
      clearBackup()
      banner.hidden = true
    }),
  )
  banner.hidden = false
}

// ── Editing plumbing ────────────────────────────────────────────────────────

function setMessage(text: string) {
  if (!editor) return
  editor.message = text
  const status = $('cl-editor-view').querySelector<HTMLElement>('.cl-ed-message')
  if (status) status.textContent = text
}

/** A value changed in place (no re-render, focus stays put). */
function touched() {
  if (!editor) return
  if (!editor.dirty) {
    editor.dirty = true
    updateDirtyUi()
  }
  scheduleBackup()
}

/** A structural change: rebuild the editor. */
function changed(focusSelector?: string) {
  if (!editor) return
  editor.dirty = true
  scheduleBackup()
  renderEditor()
  if (focusSelector) $('cl-editor-view').querySelector<HTMLElement>(focusSelector)?.focus()
}

function updateDirtyUi() {
  if (!editor) return
  const view = $('cl-editor-view')
  view.querySelector('.cl-ed-dirty')?.toggleAttribute('hidden', !editor.dirty)
  view.querySelectorAll<HTMLButtonElement>('[data-needs-saved]').forEach(b => { b.disabled = editor!.dirty })
}

function jsonField(key: string, label: string, value: unknown, apply: (value: unknown) => string | null, hint?: string, rows = 6): HTMLDivElement {
  const area = el('textarea', 'adm-input adm-input--code cl-json')
  area.rows = rows
  area.spellcheck = false
  area.value = formatJson(value)
  const error = el('p', 'adm-form-error cl-json-error')
  error.setAttribute('role', 'alert')
  const showError = (message: string | null) => {
    if (!editor) return
    if (message) editor.jsonErrors.set(key, message)
    else editor.jsonErrors.delete(key)
    error.textContent = message ?? ''
    area.setAttribute('aria-invalid', message ? 'true' : 'false')
  }
  area.addEventListener('input', () => {
    const parsed = parseJson(area.value)
    if (!parsed.ok) {
      showError(`Помилка JSON: ${parsed.error}`)
      return
    }
    showError(apply(parsed.value))
    touched()
  })
  const wrap = field(label, area, hint)
  wrap.append(error)
  if (editor?.jsonErrors.has(key)) showError(editor.jsonErrors.get(key)!)
  return wrap
}

// ── Editor rendering ────────────────────────────────────────────────────────

const FOCUSABLE = 'input, select, textarea, button, summary'

function renderEditor() {
  if (!editor) return
  const state = editor
  const view = $('cl-editor-view')
  const scrollY = window.scrollY
  // A rebuild keeps keyboard users in place: refocus the control at the same position.
  const active = document.activeElement
  const focusIndex = active && view.contains(active) ? [...view.querySelectorAll(FOCUSABLE)].indexOf(active) : -1
  view.replaceChildren()

  const header = el('div', 'cl-ed-header')
  header.append(button('← До списку', 'btn-adm-ghost', closeEditor))
  const title = el('h2', 'admin-section-title', state.lesson.title?.uk || state.lesson.id)
  title.tabIndex = -1
  header.append(title)
  if (state.row) header.append(el('span', `qi-badge ${state.row.status === 'published' ? 'qi-badge--easy' : 'qi-badge--medium'}`, STATUS_LABELS[state.row.status]))
  else header.append(el('span', 'qi-badge qi-badge--medium', 'Ще не збережено'))
  const meta = el('p', 'question-item__meta')
  meta.textContent = state.row
    ? [state.row.id, `редакція ${state.row.editVersion}`, state.row.publishedVersion ? `вчителі бачать v${state.row.publishedVersion}` : 'ще не опубліковано'].join(' · ')
    : 'Новий урок'
  header.append(meta)

  const actions = el('div', 'cl-ed-actions')
  actions.setAttribute('role', 'toolbar')
  actions.setAttribute('aria-label', 'Дії з уроком')
  actions.append(
    button('Перевірити', 'btn-adm-ghost', () => { void runValidation() }),
    button('Зберегти', 'btn-adm-emerald cl-save', () => { void save() }),
  )
  for (const [label, status, style] of statusActions(state.row?.status)) {
    const b = button(label, style, () => changeStatus(status))
    b.dataset.needsSaved = ''
    b.disabled = state.dirty
    actions.append(b)
  }
  actions.append(
    button('Попередній перегляд', 'btn-adm-violet', openPreview),
    button('Завантажити JSON', 'btn-adm-ghost', downloadJson),
  )
  if (state.row) actions.append(button('Історія', 'btn-adm-ghost', () => { void openHistory() }))
  const dirty = el('p', 'cl-ed-dirty', 'Є незбережені зміни. Щоб змінити статус, спершу збережіть.')
  dirty.hidden = !state.dirty
  const message = el('p', 'cl-ed-message')
  message.setAttribute('role', 'status')
  message.textContent = state.message
  const backup = el('div', 'cl-backup')
  backup.hidden = true

  const grouped = groupIssues(state.issues)
  view.append(header, actions, dirty, message, backup)
  if (state.issues.length) view.append(renderIssueSummary(grouped))
  view.append(renderLessonSection(grouped.lesson), renderOutcomeSection(), renderBlocksSection(grouped.blocks), renderResourcesSection())
  window.scrollTo(0, scrollY)
  if (focusIndex >= 0) {
    const controls = view.querySelectorAll<HTMLElement>(FOCUSABLE)
    controls[Math.min(focusIndex, controls.length - 1)]?.focus({ preventScroll: true })
  }
}

// Single-editor workflow, as in the other admin tabs: a draft is published in
// one step. The API still requires review first, so publishing a draft makes
// both transitions and both land in the lesson's history.
function statusActions(status: CurriculumLessonStatus | undefined): [string, CurriculumLessonStatus, string][] {
  switch (status) {
    case 'draft': return [['Опублікувати', 'published', 'btn-adm-emerald'], ['Зняти', 'archived', 'btn-adm-ghost']]
    case 'review': return [['Опублікувати', 'published', 'btn-adm-emerald'], ['Повернути в чернетку', 'draft', 'btn-adm-ghost']]
    case 'published': return [['Зняти з публікації', 'archived', 'btn-adm-ghost']]
    case 'archived': return [['Повернути в чернетку', 'draft', 'btn-adm-ghost']]
    default: return []
  }
}

function renderIssueSummary(grouped: ReturnType<typeof groupIssues>): HTMLElement {
  const box = el('section', 'cl-issues')
  box.setAttribute('aria-labelledby', 'cl-issues-title')
  const h = el('h3', 'cl-section-title', `Потрібно виправити: ${editor!.issues.length}`)
  h.id = 'cl-issues-title'
  const list = el('ul')
  for (const issue of grouped.lesson) list.append(el('li', undefined, describeLessonIssue(issue)))
  for (const [index, issues] of grouped.blocks) {
    const block = editor!.lesson.blocks[index]
    const item = el('li')
    const link = button(`Блок ${index + 1}${block ? ` (${BLOCK_TYPE_LABELS[block.type] ?? block.type})` : ''}: ${issues.length}`, 'cl-link', () => {
      if (!editor || !block) return
      editor.openBlocks.add(block.id)
      renderEditor()
      $('cl-editor-view').querySelector<HTMLElement>(`[data-block-id="${CSS.escape(block.id)}"] summary`)?.focus()
    })
    item.append(link)
    list.append(item)
  }
  box.append(h, list)
  return box
}

function section(title: string, open = true): { root: HTMLDetailsElement; body: HTMLDivElement } {
  const root = el('details', 'cl-section')
  root.open = open
  root.append(el('summary', 'cl-section-title', title))
  const body = el('div', 'cl-section-body')
  root.append(body)
  return { root, body }
}

function renderLessonSection(issues: Issue[]): HTMLElement {
  const state = editor!
  const lesson = state.lesson
  const { root, body } = section('Урок')
  const grid = el('div', 'adm-form-grid')

  const idInput = textInput(lesson.id, () => {}, { maxLength: 64 })
  idInput.classList.add('adm-input--code')
  idInput.disabled = !!state.row
  idInput.addEventListener('change', () => {
    const value = idInput.value.trim()
    if (!LESSON_ID_RE.test(value)) {
      setMessage('ID: лише малі латинські літери, цифри й дефіси, напр. g2-m1-l3.')
      idInput.value = lesson.id
      return
    }
    state.lesson = renameLesson(lesson, value)
    changed()
  })
  grid.append(field('ID уроку', idInput, state.row ? 'Не змінюється: на нього посилаються проведені уроки.' : 'Напр. g2-m1-l3. Після першого збереження не змінити.'))

  const packSelect = select(packs.map(p => p.id), id => packs.find(p => p.id === id)?.title.uk ?? id, lesson.subjectPackId, id => {
    const pack = packInfo(id)
    if (!pack) return
    lesson.subjectPackId = pack.id
    lesson.subject = pack.subject
    changed()
  })
  packSelect.disabled = !!state.row
  grid.append(field('Предмет', packSelect))

  const range = packInfo(lesson.subjectPackId)?.gradeRange ?? { min: 1, max: 4 }
  const grades = Array.from({ length: range.max - range.min + 1 }, (_, i) => String(range.min + i))
  grid.append(field('Клас', select(grades, g => `${g} клас`, String(lesson.grade), g => { lesson.grade = Number(g); touched() })))

  const duration = el('input', 'adm-input adm-input--sm')
  duration.type = 'number'
  duration.min = '1'
  duration.max = '240'
  duration.value = String(lesson.durationMin)
  duration.addEventListener('input', () => { lesson.durationMin = Number(duration.value); touched() })
  grid.append(field('Тривалість, хв', duration))

  grid.append(field('Модуль (необов’язково)', textInput(lesson.moduleId ?? '', v => {
    if (v.trim()) lesson.moduleId = v.trim()
    else delete lesson.moduleId
    touched()
  }, { maxLength: 64, placeholder: 'напр. m1' })))

  const number = el('input', 'adm-input adm-input--sm')
  number.type = 'number'
  number.min = '1'
  number.value = lesson.lessonNumber ? String(lesson.lessonNumber) : ''
  number.addEventListener('input', () => {
    if (number.value) lesson.lessonNumber = Number(number.value)
    else delete lesson.lessonNumber
    touched()
  })
  grid.append(field('Номер уроку (необов’язково)', number))
  body.append(grid)

  const titleInput = textInput(lesson.title.uk, v => {
    lesson.title = { ...lesson.title, uk: v }
    touched()
  }, { maxLength: 200 })
  body.append(field('Назва уроку', titleInput))
  body.append(field('Назва англійською (необов’язково)', textInput(lesson.title.en ?? '', v => {
    if (v.trim()) lesson.title = { ...lesson.title, en: v.trim() }
    else lesson.title = { uk: lesson.title.uk }
    touched()
  }, { maxLength: 200 })))
  body.append(field('Головне питання уроку (необов’язково)', textArea(lesson.essentialQuestion?.uk ?? '', v => {
    const text = optionalText(v, lesson.essentialQuestion)
    if (text) lesson.essentialQuestion = text
    else delete lesson.essentialQuestion
    touched()
  })))

  const objectives = el('fieldset', 'cl-fieldset')
  objectives.append(el('legend', 'adm-label', 'Цілі уроку (1–20)'))
  lesson.objectives.forEach((objective, i) => {
    const row = el('div', 'cl-row')
    const input = textInput(objective.text.uk, v => { objective.text = { ...objective.text, uk: v }; touched() }, { maxLength: 2000 })
    input.setAttribute('aria-label', `Ціль ${i + 1}`)
    row.append(input, button('Прибрати', 'btn-adm-ghost btn--sm', () => {
      lesson.objectives.splice(i, 1)
      changed()
    }))
    row.lastElementChild!.setAttribute('aria-label', `Прибрати ціль ${i + 1}`)
    objectives.append(row)
  })
  objectives.append(button('Додати ціль', 'btn-adm-ghost btn--sm', () => {
    const used = new Set(lesson.objectives.map(o => o.id))
    let n = lesson.objectives.length + 1
    while (used.has(`o${n}`)) n++
    lesson.objectives.push({ id: `o${n}`, text: { uk: 'Учні зможуть …' } })
    changed()
  }))
  body.append(objectives)

  if (issues.length) body.append(issueList(issues.map(describeLessonIssue)))
  return root
}

function issueList(lines: string[]): HTMLUListElement {
  const list = el('ul', 'cl-block-issues')
  for (const line of lines) list.append(el('li', undefined, line))
  return list
}

/** Datalist-backed picker of the lesson pack's active outcomes. */
function outcomePicker(label: string, onPick: (outcomeId: string) => void): HTMLElement {
  const state = editor!
  const active = outcomes.filter(o => o.subjectPackId === state.lesson.subjectPackId && o.status === 'active')
  const listId = nextId()
  const datalist = el('datalist')
  datalist.id = listId
  const byLabel = new Map<string, string>()
  for (const outcome of active) {
    const text = `${outcome.code} — ${outcome.titleUk}`
    byLabel.set(text, outcome.id)
    byLabel.set(outcome.code, outcome.id)
    const option = el('option')
    option.value = text
    datalist.append(option)
  }
  const input = el('input', 'adm-input adm-input--sm')
  input.type = 'text'
  input.id = nextId()
  input.setAttribute('list', listId)
  input.placeholder = active.length ? 'Почніть вводити код або слово' : 'У довіднику ще немає результатів цього предмета'
  const error = el('p', 'adm-form-error')
  error.setAttribute('role', 'alert')
  const add = button('Додати', 'btn-adm-ghost btn--sm', () => {
    const value = input.value.trim()
    const id = byLabel.get(value)
      ?? active.find(o => `${o.code} ${o.titleUk}`.toLowerCase().includes(value.toLowerCase()) && value.length >= 3)?.id
    if (!id) {
      error.textContent = 'Оберіть результат зі списку довідника («Результати навчання»).'
      return
    }
    onPick(id)
  })
  const labelEl = el('label', 'adm-label', label)
  labelEl.htmlFor = input.id
  const row = el('div', 'cl-row')
  row.append(input, add)
  const wrap = el('div', 'cl-field cl-picker')
  wrap.append(labelEl, row, datalist, error)
  return wrap
}

function renderOutcomeSection(): HTMLElement {
  const state = editor!
  const lesson = state.lesson
  const { root, body } = section('Результати навчання уроку')
  body.append(el('p', 'adm-field-hint', 'Результат додається сам, коли ви пов’язуєте його із завданням. Щоб звіт міг вирішити, чи результат досягнуто, потрібне завдання-доказ з основним зв’язком.'))
  const coverage = outcomeCoverage(lesson)
  if (coverage.length === 0) body.append(el('p', 'question-item__meta', 'Урок ще не пов’язаний із жодним результатом.'))
  const list = el('ul', 'cl-coverage')
  for (const item of coverage) {
    const li = el('li', `cl-coverage__item ${item.measured ? 'cl-coverage__item--ok' : item.activities.length ? 'cl-coverage__item--partial' : 'cl-coverage__item--none'}`)
    li.dataset.outcomeId = item.outcomeId
    const head = el('div', 'cl-row')
    head.append(el('span', 'cl-coverage__mark', item.measured ? '🟢' : item.activities.length ? '🟡' : '🔴'), el('strong', undefined, outcomeLabel(item.outcomeId)))
    const role = select(['introduced', 'practised', 'assessed'] as const, ROLE_LABELS, item.role, value => {
      const link = lesson.learningOutcomes.find(l => l.outcomeId === item.outcomeId)
      if (link) link.role = value
      touched()
    })
    role.setAttribute('aria-label', `Роль у уроці: ${outcomeLabel(item.outcomeId)}`)
    head.append(role, button('Прибрати з уроку', 'btn-adm-ghost btn--sm', () => {
      const run = () => { removeLessonOutcome(lesson, item.outcomeId); changed() }
      if (item.activities.length) showConfirm(`Результат пов’язаний із завданнями (${item.activities.length}). Прибрати його з уроку й з усіх завдань?`, run)
      else run()
    }))
    li.append(head)
    const detail = item.activities.length
      ? item.activities.map(a => `блок ${a.blockIndex + 1} · ${a.instanceId} · ${TELEMETRY_LABELS[a.telemetry]}, ${EVIDENCE_ROLE_LABELS[a.evidenceRole]}`).join('; ')
      : 'Немає жодного завдання, що його перевіряє.'
    li.append(el('p', 'question-item__meta', item.measured ? detail : `${detail} Звіт покаже «Недостатньо даних».`))
    list.append(li)
  }
  body.append(list, outcomePicker('Додати результат до уроку без завдання (знайомство)', id => {
    if (addLessonOutcome(lesson, id)) changed()
  }))
  return root
}

function blockSummaryText(block: EditableBlock, index: number): string {
  const content = block.content
  const pick = ['title', 'heading', 'question', 'prompt', 'text'].map(k => content[k]).find(v => isRecord(v) && typeof v.uk === 'string') as { uk: string } | undefined
  const label = BLOCK_TYPE_LABELS[block.type] ?? block.type
  return `${index + 1}. ${label}${pick ? `: ${pick.uk}` : ''}`
}

function renderBlocksSection(blockIssues: Map<number, Issue[]>): HTMLElement {
  const state = editor!
  const lesson = state.lesson
  const { root, body } = section(`Блоки уроку (${lesson.blocks.length})`)
  body.append(el('p', 'adm-field-hint', 'Порядок блоків — порядок уроку. ID блоку не змінюється: на нього посилаються проведені уроки й докази.'))
  const list = el('ol', 'cl-blocks')
  lesson.blocks.forEach((block, index) => list.append(renderBlock(block, index, blockIssues.get(index) ?? [])))
  body.append(list)

  const addRow = el('div', 'cl-row')
  const type = select(LESSON_BLOCK_TYPES, BLOCK_TYPE_LABELS as Record<LessonBlockType, string>, 'explanation', () => {})
  addRow.append(field('Новий блок', type), button('Додати блок', 'btn-adm-emerald btn--sm', () => {
    const block = newBlock(type.value as LessonBlockType, lesson, packInfo(lesson.subjectPackId), state.reserved)
    lesson.blocks.push(block)
    state.openBlocks.add(block.id)
    changed(`[data-block-id="${CSS.escape(block.id)}"] summary`)
  }))
  body.append(addRow)
  return root
}

function renderBlock(block: EditableBlock, index: number, issues: Issue[]): HTMLLIElement {
  const state = editor!
  const lesson = state.lesson
  const li = el('li', 'cl-block')
  const details = el('details')
  details.dataset.blockId = block.id
  details.open = state.openBlocks.has(block.id)
  details.addEventListener('toggle', () => {
    if (details.open) state.openBlocks.add(block.id)
    else state.openBlocks.delete(block.id)
  })
  const summary = el('summary', 'cl-block__summary')
  summary.append(el('span', 'cl-block__title', blockSummaryText(block, index)))
  const badges = el('span', 'question-item__badges')
  if (block.runtime?.step) badges.append(el('span', 'qi-badge qi-badge--type', 'крок'))
  if (block.views.presentation) badges.append(el('span', 'qi-badge qi-badge--type', 'дошка'))
  if (block.views.remote) badges.append(el('span', 'qi-badge qi-badge--type', 'пристрої'))
  if (!block.audience.student) badges.append(el('span', 'qi-badge qi-badge--medium', 'лише вчитель'))
  if (issues.length) badges.append(el('span', 'qi-badge cl-badge--error', `помилок: ${issues.length}`))
  summary.append(badges, el('span', 'question-item__meta', block.id))
  details.append(summary)

  const body = el('div', 'cl-block__body')
  const tools = el('div', 'cl-row')
  const n = index + 1
  const up = button('↑ Вище', 'btn-adm-ghost btn--sm', () => { if (moveBlock(lesson, index, -1)) changed(`[data-move-up="${CSS.escape(block.id)}"]`) })
  up.dataset.moveUp = block.id
  up.disabled = index === 0
  up.setAttribute('aria-label', `Блок ${n} вище`)
  const down = button('↓ Нижче', 'btn-adm-ghost btn--sm', () => { if (moveBlock(lesson, index, 1)) changed(`[data-move-down="${CSS.escape(block.id)}"]`) })
  down.dataset.moveDown = block.id
  down.disabled = index === lesson.blocks.length - 1
  down.setAttribute('aria-label', `Блок ${n} нижче`)
  const remove = button('Видалити', 'btn-adm-ghost btn--sm', () => {
    const published = state.reserved.has(block.id)
    showConfirm(`Видалити блок ${n} (${BLOCK_TYPE_LABELS[block.type]})?${published ? ' Він є в опублікованій версії: вчителі бачитимуть його, доки ви не опублікуєте нову.' : ''}`, () => {
      state.reserved.add(block.id)
      lesson.blocks.splice(index, 1)
      state.openBlocks.delete(block.id)
      changed()
    })
  })
  remove.setAttribute('aria-label', `Видалити блок ${n}`)
  tools.append(up, down, remove)
  body.append(tools)

  const switches = el('div', 'cl-switches')
  switches.append(
    checkbox('Бачать учні', block.audience.student, v => { setStudentAudience(block, v); changed() }, block.type === 'teacher-note'),
    checkbox('Крок уроку (консоль вчителя)', !!block.runtime?.step, v => { setStep(block, v); changed() }),
    checkbox('Показувати на дошці', block.views.presentation, v => { setOnBoard(block, v); changed() }, !block.audience.student),
    checkbox('У плані для вчителя', block.views.document, v => { block.views.document = v; touched() }),
  )
  if (block.type === 'activity') {
    switches.append(checkbox('Надсилати на пристрої учнів', block.views.remote, v => { setOnDevices(block, v); changed() }, !block.audience.student))
  }
  body.append(switches)

  const grid = el('div', 'adm-form-grid')
  grid.append(field('Формат', select(BLOCK_MODALITIES, MODALITY_LABELS as Record<BlockModality, string>, block.modality, v => { block.modality = v; touched() })))
  const minutes = el('input', 'adm-input adm-input--sm')
  minutes.type = 'number'
  minutes.min = '1'
  minutes.max = '240'
  minutes.value = block.estimatedMinutes ? String(block.estimatedMinutes) : ''
  minutes.addEventListener('input', () => {
    if (minutes.value) block.estimatedMinutes = Number(minutes.value)
    else delete block.estimatedMinutes
    touched()
  })
  grid.append(field('Хвилин (необов’язково)', minutes))
  body.append(grid)

  if (block.presentation) body.append(renderSlideFields(block))
  if (block.activity) body.append(renderActivityFields(block, index))

  body.append(jsonField(`content:${block.id}`, 'Зміст блоку (JSON)', block.content, value => {
    if (!isRecord(value)) return 'Зміст має бути об’єктом { … }.'
    block.content = value
    return null
  }, `${CONTENT_HINTS[block.type]}. ${TEXT_HINT}`))

  if (issues.length) body.append(issueList(issues.map(i => `${i.path || 'блок'}: ${describeIssueMessage(i.message)}`)))
  details.append(body)
  li.append(details)
  return li
}

function renderSlideFields(block: EditableBlock): HTMLElement {
  const lesson = editor!.lesson
  const slide = block.presentation!
  const box = el('fieldset', 'cl-fieldset')
  box.append(el('legend', 'adm-label', 'Слайд для дошки'))
  box.append(field('Макет', select(PRESENTATION_LAYOUTS, LAYOUT_LABELS, slide.layout, v => { slide.layout = v; touched() })))
  box.append(field('Заголовок слайда (необов’язково)', textInput(slide.headline?.uk ?? '', v => {
    const text = optionalText(v, slide.headline)
    if (text) slide.headline = text
    else delete slide.headline
    touched()
  }, { maxLength: 200 }), 'Якщо порожньо — береться назва або питання блоку.'))
  box.append(field('Тези на слайді (кожна з нового рядка, до 5)', textArea((slide.shortText ?? []).map(t => t.uk).join('\n'), v => {
    const points = shortTextFromLines(v)
    if (points) slide.shortText = points
    else delete slide.shortText
    touched()
  }, 3)))
  const assets = lesson.assets ?? []
  if (assets.length) {
    const pickAssets = el('div', 'cl-switches')
    pickAssets.setAttribute('role', 'group')
    pickAssets.setAttribute('aria-label', 'Зображення на слайді')
    for (const asset of assets) {
      pickAssets.append(checkbox(`${asset.id}: ${asset.alt?.uk ?? ''}`, slide.assetIds?.includes(asset.id) ?? false, v => {
        const ids = new Set(slide.assetIds ?? [])
        if (v) ids.add(asset.id)
        else ids.delete(asset.id)
        if (ids.size) slide.assetIds = [...ids]
        else delete slide.assetIds
        touched()
      }))
    }
    box.append(el('p', 'adm-label', 'Зображення на слайді'), pickAssets)
  }
  box.append(field('Підказка вчителю до слайда (на дошку не потрапляє)', textArea(slide.speakerNotes?.uk ?? '', v => {
    const text = optionalText(v, slide.speakerNotes)
    if (text) slide.speakerNotes = text
    else delete slide.speakerNotes
    touched()
  })))
  return box
}

function renderActivityFields(block: EditableBlock, index: number): HTMLElement {
  const state = editor!
  const lesson = state.lesson
  const activity = block.activity!
  const pack = packInfo(lesson.subjectPackId)
  const box = el('fieldset', 'cl-fieldset')
  box.append(el('legend', 'adm-label', 'Завдання'))
  const grid = el('div', 'adm-form-grid')
  grid.append(field('Механіка', select(EDITOR_MECHANICS, MECHANIC_LABELS, activity.mechanic, mechanic => {
    showConfirm('Змінити механіку? Налаштування й ключ відповіді буде замінено шаблоном нової механіки.', () => {
      const template = activityTemplate(mechanic, activity.instanceId, pack)
      block.activity = { ...template, telemetry: activity.telemetry, outcomes: activity.outcomes, attempts: activity.attempts }
      if (!block.activity.outcomes) delete block.activity.outcomes
      if (!block.activity.attempts) delete block.activity.attempts
      state.jsonErrors.delete(`config:${block.id}`)
      state.jsonErrors.delete(`key:${block.id}`)
      changed()
    })
    renderEditor()
  })))
  grid.append(field('Призначення', select(ACTIVITY_TELEMETRY, TELEMETRY_LABELS, activity.telemetry, v => { activity.telemetry = v; changed() }),
    'Доказ: одна спроба, учень не бачить оцінки, результат іде у звіт.'))
  const instance = textInput(activity.instanceId, v => { activity.instanceId = v.trim(); touched() }, { maxLength: 64 })
  instance.classList.add('adm-input--code')
  grid.append(field('ID завдання', instance, 'Унікальний в уроці; не змінюйте після публікації.'))
  const attempts = el('input', 'adm-input adm-input--sm')
  attempts.type = 'number'
  attempts.min = '1'
  attempts.max = '10'
  attempts.placeholder = activity.telemetry === 'evidence' ? '1' : '10'
  attempts.value = activity.attempts?.max ? String(activity.attempts.max) : ''
  attempts.addEventListener('input', () => {
    if (attempts.value) activity.attempts = { max: Number(attempts.value) }
    else delete activity.attempts
    touched()
  })
  grid.append(field('Спроб (необов’язково)', attempts, 'Порожньо: доказ — 1, інше — 10.'))
  box.append(grid)

  const links = el('div', 'cl-links')
  links.append(el('p', 'adm-label', 'Результати, які перевіряє завдання'))
  const list = el('ul', 'cl-link-list')
  for (const link of activity.outcomes ?? []) {
    const li = el('li', 'cl-row')
    li.append(el('span', undefined, outcomeLabel(link.outcomeId)))
    const role = select(['primary', 'supporting'] as const, { primary: 'Основний доказ', supporting: 'Допоміжний' }, link.evidenceRole, v => {
      link.evidenceRole = v
      changed()
    })
    role.setAttribute('aria-label', `Вага доказу: ${outcomeLabel(link.outcomeId)}`)
    if (activity.scoring.mode === 'client-unverified') role.disabled = true
    li.append(role, button('Прибрати', 'btn-adm-ghost btn--sm', () => {
      removeActivityOutcome(lesson, index, link.outcomeId)
      changed()
    }))
    li.lastElementChild!.setAttribute('aria-label', `Прибрати зв’язок: ${outcomeLabel(link.outcomeId)}`)
    list.append(li)
  }
  if (!activity.outcomes?.length) list.append(el('li', 'question-item__meta', activity.telemetry === 'evidence' ? 'Доказ має бути пов’язаний хоча б з одним результатом.' : 'Не пов’язане з результатами.'))
  links.append(list, outcomePicker('Пов’язати з результатом', id => {
    if (addActivityOutcome(lesson, index, id)) changed()
  }))
  box.append(links)

  let hint = MECHANIC_HINTS[activity.mechanic]
  if (activity.mechanic === 'external' && pack) hint += ` Дозволено: ${pack.tools.map(t => t.key).join(', ') || 'нічого'}.`
  if (activity.mechanic === 'game' && pack) hint += ` Дозволено: ${pack.games.map(g => `${g.key} (${g.levels.join('/')})`).join(', ')}.`
  box.append(jsonField(`config:${block.id}`, 'Налаштування завдання (JSON)', activity.config, value => {
    if (!isRecord(value)) return 'Налаштування мають бути об’єктом { … }.'
    activity.config = value
    return null
  }, `${hint} ${TEXT_HINT}`))
  if (activity.scoring.mode === 'server') {
    box.append(jsonField(`key:${block.id}`, 'Ключ відповіді (JSON; бачить лише сервер)', activity.scoring.key ?? {}, value => {
      if (!isRecord(value)) return 'Ключ має бути об’єктом { … }.'
      activity.scoring.key = value
      return null
    }, undefined, 4))
  }
  return box
}

function renderResourcesSection(): HTMLElement {
  const lesson = editor!.lesson
  const { root, body } = section('Ресурси й словник', false)
  body.append(jsonField('assets', 'Ресурси: зображення, схеми, відео (JSON)', lesson.assets ?? [], value => {
    if (!Array.isArray(value)) return 'Ресурси мають бути списком [ … ].'
    if (value.length) lesson.assets = value as EditableLesson['assets']
    else delete lesson.assets
    return null
  }, 'Кожен: { "id": "img1", "kind": "image" | "diagram" | "video", "src": "/curriculum-lessons/assets/… або https://…", "alt": { "uk": "опис для незрячих" }, "caption": { "uk": "…" } }.', 6))
  body.append(jsonField('vocabulary', 'Словник уроку (JSON)', lesson.vocabulary ?? [], value => {
    if (!Array.isArray(value)) return 'Словник має бути списком [ … ].'
    if (value.length) lesson.vocabulary = value
    else delete lesson.vocabulary
    return null
  }, 'Кожен: { "term": { "uk": "файл", "en": "file" }, "definition": { "uk": "…" } }.', 4))
  return root
}

// ── Actions ─────────────────────────────────────────────────────────────────

function blockedByJson(): boolean {
  if (!editor?.jsonErrors.size) return false
  setMessage(`Спершу виправте JSON у полях (${editor.jsonErrors.size}): вони підсвічені червоним.`)
  return true
}

async function runValidation() {
  if (!editor || blockedByJson()) return
  try {
    const result = await validateAdminCurriculumLesson(editor.lesson, editor.row?.id)
    editor.issues = result.issues
    editor.message = result.ok ? 'Перевірено: помилок немає.' : `Знайдено помилок: ${result.issues.length}.`
    renderEditor()
  } catch (err) {
    setMessage(friendlyError((err as Error).message))
  }
}

async function save() {
  if (!editor || blockedByJson()) return
  const state = editor
  const saveButton = $('cl-editor-view').querySelector<HTMLButtonElement>('.cl-save')
  if (saveButton) saveButton.disabled = true
  try {
    const definition = structuredClone(state.lesson)
    const result = state.row
      ? await updateAdminCurriculumLesson(state.row.id, definition, state.row.editVersion)
      : await createAdminCurriculumLesson(definition)
    clearBackup()
    state.row = result.lesson
    state.lesson = structuredClone(result.lesson.draftContent) as unknown as EditableLesson
    state.reserved = new Set([...state.reserved, ...reservedFrom(result.lesson)])
    state.dirty = false
    state.issues = []
    state.message = 'changed' in result && result.changed === false
      ? 'Змін немає.'
      : `Збережено. Редакція ${result.lesson.editVersion}${result.lesson.publishedVersion ? `; вчителі бачать v${result.lesson.publishedVersion}, доки ви не опублікуєте нову` : ''}.`
    renderEditor()
  } catch (err) {
    const apiError = err as ApiError
    const issues = Array.isArray(apiError.body?.issues) ? apiError.body.issues as Issue[] : null
    if (issues) {
      state.issues = issues
      state.message = `Не збережено: помилок ${issues.length}. Вони показані нижче.`
      renderEditor()
    } else {
      setMessage(friendlyError(apiError.message))
    }
  } finally {
    if (saveButton?.isConnected) saveButton.disabled = false
  }
}

const STATUS_CONFIRM: Partial<Record<CurriculumLessonStatus, string>> = {
  published: 'Опублікувати урок? Вчителі одразу побачать цю версію. Уроки, які вже йдуть, доведуть попередню.',
  archived: 'Зняти урок? Вчителі більше не зможуть його підготувати. Проведені уроки й звіти збережуться.',
}

function changeStatus(status: CurriculumLessonStatus) {
  const state = editor
  if (!state?.row || state.dirty) return
  const run = async () => {
    try {
      let row = state.row!
      if (status === 'published' && row.status === 'draft') {
        row = (await setAdminCurriculumLessonStatus(row.id, 'review', row.editVersion)).lesson
        state.row = row
      }
      const { lesson } = await setAdminCurriculumLessonStatus(row.id, status, row.editVersion)
      state.row = lesson
      state.message = `Статус: ${STATUS_LABELS[lesson.status]}.`
      renderEditor()
    } catch (err) {
      const apiError = err as ApiError
      const issues = Array.isArray(apiError.body?.issues) ? apiError.body.issues as Issue[] : null
      if (issues) {
        state.issues = issues
        state.message = `Не опубліковано: помилок ${issues.length}.`
        renderEditor()
      } else {
        setMessage(friendlyError(apiError.message))
      }
    }
  }
  const question = STATUS_CONFIRM[status]
  if (question) showConfirm(question, () => { void run() })
  else void run()
}

function downloadJson() {
  if (!editor) return
  const blob = new Blob([`${formatJson(editor.lesson)}\n`], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = el('a')
  a.href = url
  a.download = `${editor.lesson.id}.json`
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** A full-screen admin overlay with a focus trap; returns its body and a closer. */
function overlay(title: string): { body: HTMLDivElement; close: () => void } {
  const root = el('div', 'question-modal-overlay cl-overlay')
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  const card = el('div', 'question-modal-card cl-overlay__card')
  const titleId = nextId()
  const h = el('h3', 'question-modal-title', title)
  h.id = titleId
  root.setAttribute('aria-labelledby', titleId)
  const body = el('div', 'cl-overlay__body')
  let removeTrap: () => void = () => {}
  const opener = document.activeElement as HTMLElement | null
  const close = () => {
    removeTrap()
    root.remove()
    opener?.focus()
  }
  const closeButton = button('Закрити', 'btn-adm-slate', close)
  const head = el('div', 'cl-row cl-overlay__head')
  head.append(h, closeButton)
  card.append(head, body)
  root.append(card)
  document.body.append(root)
  removeTrap = createFocusTrap(root, close)
  closeButton.focus()
  return { body, close }
}

function openPreview() {
  if (!editor || blockedByJson()) return
  const shown = withoutAnswerKeys(editor.lesson) as unknown as LessonDefinition
  const { body, close } = overlay(`Попередній перегляд: ${editor.lesson.title.uk}`)
  body.append(el('p', 'adm-field-hint', 'Так урок побачить вчитель (без ключів відповідей). Слайди — як на дошці.'))
  body.append(button('Показати слайди', 'btn-adm-violet', () => {
    // One dialog at a time: the slides own the focus trap while they are open.
    close()
    if (!openPresentation(shown, {})) setMessage('У цьому уроці немає слайдів для дошки.')
  }))
  try {
    const doc = el('div', 'cl-preview')
    doc.append(renderLessonDocument(shown))
    body.append(doc)
  } catch {
    body.append(el('p', 'adm-form-error', 'Перегляд не вдався: спершу натисніть «Перевірити» й виправте помилки.'))
  }
}

async function openHistory() {
  const state = editor
  if (!state?.row) return
  const { body } = overlay('Історія змін')
  body.append(el('p', 'question-item__meta', 'Завантаження…'))
  try {
    const { revisions } = await getAdminCurriculumLessonRevisions(state.row.id)
    body.replaceChildren()
    const list = el('ol', 'cl-history')
    const actionLabels = { create: 'створено', update: 'зміни', status: 'статус', restore: 'відновлено' } as const
    for (const revision of revisions) {
      const li = el('li', 'cl-row')
      const status = isRecord(revision.snapshot) && typeof revision.snapshot.status === 'string' ? ` · ${STATUS_LABELS[revision.snapshot.status as CurriculumLessonStatus] ?? revision.snapshot.status}` : ''
      li.append(el('span', undefined, `Редакція ${revision.editVersion} · ${actionLabels[revision.action] ?? revision.action}${status} · ${new Date(revision.createdAt).toLocaleString('uk-UA')}`))
      if (revision.editVersion !== state.row.editVersion) {
        li.append(button('Відновити як чернетку', 'btn-adm-ghost btn--sm', () => {
          showConfirm(`Відновити редакцію ${revision.editVersion} як нову чернетку? Поточна чернетка залишиться в історії.${state.dirty ? ' Незбережені зміни буде втрачено.' : ''}`, () => {
            void (async () => {
              try {
                const { lesson } = await restoreAdminCurriculumLessonRevision(state.row!.id, revision.editVersion, state.row!.editVersion)
                document.querySelector('.cl-overlay')?.remove()
                clearBackup()
                startEditor(lesson, structuredClone(lesson.draftContent) as unknown as EditableLesson, false)
                setMessage(`Відновлено редакцію ${revision.editVersion} як чернетку.`)
              } catch (err) {
                body.prepend(el('p', 'adm-form-error', friendlyError((err as Error).message)))
              }
            })()
          })
        }))
      } else {
        li.append(el('span', 'qi-badge qi-badge--type', 'поточна'))
      }
      list.append(li)
    }
    body.append(list)
  } catch (err) {
    body.replaceChildren(el('p', 'adm-form-error', friendlyError((err as Error).message)))
  }
}
