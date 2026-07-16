import {
  getAdminPathMaps, updateAdminPathMap, getAdminLessons,
  type AdminPathMap,
} from '../../features/api/client.js'
import { esc, showModal, showConfirm } from './ui.js'
import { $ } from '../../utils/dom.js'
import { createFocusTrap } from '../../utils/focus-trap.js'

// Form-based path point editor with an SVG preview. The database is the source
// of truth; the audited publication tab deploys child-facing static bundles.
// Changing step activity bumps its server-side version automatically.

interface StepJson {
  id: string
  version: number
  title: string
  activity: Record<string, unknown> & { kind: string }
  required: boolean
}

interface PointJson {
  id: string
  title: string
  icon: string
  access?: 'free' | 'club'
  curriculum: Array<{ track: string; topic: string }>
  activities: StepJson[]
  unlockAfter: string[]
  x: number
  y: number
}

const KIND_LABELS: Record<string, string> = {
  lesson: '📖 урок', mission: '🚀 місія', sequence: '👣 кроки', scenarios: '💬 ситуації',
  puzzles: '🧩 головоломки', sorting: '🧺 сортування', 'fact-opinion': '🧐 факт/думка', simulator: '🔧 симулятор',
}
const TRACK_COLORS: Record<string, string> = {
  informatics: '#0ea5e9', 'computational-thinking': '#8b5cf6', 'ai-basics': '#f59e0b',
}

let maps: AdminPathMap[] = []
let lessonIds: string[] = []
let currentPathId = 'grade-2'
let workingPoints: PointJson[] = []
let workingTitle = ''
let dirty = false
let editingPointId: string | null = null
let loaded = false
let pointModalTrapRemove: (() => void) | null = null
let dynamicFieldId = 0

export function initPathTab() {
  $<HTMLSelectElement>('pm-grade').addEventListener('change', () => {
    if (dirty && !confirm('Незбережені зміни буде втрачено. Перемкнути карту?')) {
      $<HTMLSelectElement>('pm-grade').value = currentPathId
      return
    }
    currentPathId = $<HTMLSelectElement>('pm-grade').value
    resetWorking()
    renderPathTab()
  })
  $<HTMLInputElement>('pm-title').addEventListener('input', event => {
    workingTitle = (event.currentTarget as HTMLInputElement).value
    markDirty()
  })
  $('pm-add-point').addEventListener('click', () => openPointEditor(null))
  $('pm-save').addEventListener('click', () => { void saveMap() })
  $('pf-cancel').addEventListener('click', closePointEditor)
  $('pf-add-tag').addEventListener('click', () => addTagRow())
  $('pf-add-step').addEventListener('click', () => addStepRow())
  $('pf-delete').addEventListener('click', deleteEditedPoint)
  $<HTMLFormElement>('point-form').addEventListener('submit', (e) => { e.preventDefault(); applyPoint() })
  window.addEventListener('beforeunload', (event) => {
    if (!dirty) return
    event.preventDefault()
  })
}

export async function loadPathTab() {
  if (loaded) {
    renderPathTab()
    return
  }
  const status = $('pm-status')
  status.textContent = 'Завантаження…'
  try {
    const [{ maps: loadedMaps }, { lessons }] = await Promise.all([getAdminPathMaps(), getAdminLessons()])
    maps = loadedMaps
    lessonIds = lessons.filter(lesson => lesson.publishedVersion && lesson.status !== 'archived').map(lesson => lesson.id).sort()
    loaded = true
    resetWorking()
    renderPathTab()
  } catch (err) {
    status.textContent = ''
    $('pm-error').textContent = (err as Error).message
  }
}

function currentMap(): AdminPathMap | undefined {
  return maps.find(map => map.pathId === currentPathId)
}

function resetWorking() {
  const map = currentMap()
  workingPoints = map ? JSON.parse(JSON.stringify(map.points)) as PointJson[] : []
  workingTitle = map?.title ?? ''
  dirty = false
  $('pm-error').textContent = ''
}

function markDirty() {
  dirty = true
  renderPathTab()
}

// ── Рендер ────────────────────────────────────────────────────

function renderPathTab() {
  const map = currentMap()
  const titleInput = $<HTMLInputElement>('pm-title')
  if (titleInput.value !== workingTitle) titleInput.value = workingTitle
  titleInput.disabled = !map
  $<HTMLButtonElement>('pm-add-point').disabled = !map
  $<HTMLButtonElement>('pm-save').disabled = !map
  $('pm-status').textContent = map
    ? `${workingTitle} · v${map.version} · точок: ${workingPoints.length}${dirty ? ' · ✳ не збережено' : ''}`
    : 'Карту не знайдено (міграції 0033–0034 застосовані?)'
  renderPreview()
  renderPointsList()
}

function renderPreview() {
  const box = $('pm-preview')
  const byId = new Map(workingPoints.map(point => [point.id, point]))
  const edges = workingPoints.flatMap(point => point.unlockAfter.map(dep => {
    const from = byId.get(dep)
    if (!from) return ''
    return `<line x1="${from.x}" y1="${from.y}" x2="${point.x}" y2="${point.y}" stroke="#cbd5e1" stroke-width="0.6"/>`
  })).join('')
  const nodes = workingPoints.map(point => {
    const color = TRACK_COLORS[point.curriculum[0]?.track ?? ''] ?? '#64748b'
    const ring = point.access === 'club' ? `<circle cx="${point.x}" cy="${point.y}" r="4.6" fill="none" stroke="#f59e0b" stroke-width="0.7" stroke-dasharray="1.5 1"/>` : ''
    return `${ring}<circle cx="${point.x}" cy="${point.y}" r="3.4" fill="${color}"/>
      <text x="${point.x}" y="${point.y + 1.2}" text-anchor="middle" font-size="3.4">${esc(point.icon)}</text>
      <text x="${point.x}" y="${point.y + 7}" text-anchor="middle" font-size="2.4" fill="#475569">${esc(point.title.slice(0, 22))}</text>`
  }).join('')
  box.innerHTML = `<svg viewBox="0 0 100 105" role="img" aria-label="Схема карти">${edges}${nodes}</svg>`
}

function renderPointsList() {
  const list = $('pm-points')
  list.innerHTML = ''
  for (const point of workingPoints) {
    const el = document.createElement('div')
    el.className = 'question-item'
    const steps = point.activities
      .map(step => `${KIND_LABELS[step.activity.kind] ?? step.activity.kind}${step.required ? '' : ' (бонус)'}`)
      .join(' → ')
    el.innerHTML = `
      <div class="question-item__left">
        <div class="question-item__badges">
          ${point.access === 'club' ? '<span class="qi-badge qi-badge--medium">🔒 клуб</span>' : '<span class="qi-badge qi-badge--easy">безкоштовно</span>'}
          <span class="qi-badge qi-badge--type">${esc(String(point.x))}:${esc(String(point.y))}</span>
        </div>
        <p class="question-item__text">${esc(point.icon)} ${esc(point.title)}</p>
        <p class="question-item__meta">${esc(point.id)} · ${esc(steps)}</p>
      </div>
      <div class="question-item__actions">
        <button type="button" class="btn-adm-ghost pm-edit">Редагувати</button>
      </div>`
    el.querySelector<HTMLButtonElement>('.pm-edit')!.addEventListener('click', () => openPointEditor(point))
    list.appendChild(el)
  }
}

// ── Редактор точки ────────────────────────────────────────────

function openPointEditor(point: PointJson | null) {
  editingPointId = point?.id ?? null
  $('point-modal-title').textContent = point ? `Точка: ${point.title}` : 'Нова точка'
  $('pf-error').textContent = ''
  const idInput = $<HTMLInputElement>('pf-id')
  idInput.value = point?.id ?? `${currentPathId.replace('grade-', 'g')}-`
  idInput.disabled = !!point // на id посилаються unlockAfter і activityId результатів
  $<HTMLInputElement>('pf-title').value = point?.title ?? ''
  $<HTMLInputElement>('pf-icon').value = point?.icon ?? ''
  $<HTMLSelectElement>('pf-access').value = point?.access ?? 'free'
  $<HTMLInputElement>('pf-x').value = String(point?.x ?? 50)
  $<HTMLInputElement>('pf-y').value = String(point?.y ?? 50)
  $<HTMLButtonElement>('pf-delete').classList.toggle('hidden', !point)

  const unlock = $('pf-unlock')
  unlock.innerHTML = ''
  for (const other of workingPoints) {
    if (other.id === point?.id) continue
    const label = document.createElement('label')
    label.className = 'pf-unlock__item'
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.value = other.id
    checkbox.checked = !!point?.unlockAfter.includes(other.id)
    label.append(checkbox, ` ${other.icon} ${other.title}`)
    unlock.appendChild(label)
  }

  $('pf-tags').innerHTML = ''
  for (const tag of point?.curriculum ?? [{ track: 'informatics', topic: '' }]) addTagRow(tag)
  $('pf-steps').innerHTML = ''
  for (const step of point?.activities ?? []) addStepRow(step)

  $('point-modal').classList.remove('hidden')
  pointModalTrapRemove?.()
  pointModalTrapRemove = createFocusTrap($('point-modal'), closePointEditor)
}

function closePointEditor() {
  pointModalTrapRemove?.()
  pointModalTrapRemove = null
  $('point-modal').classList.add('hidden')
  editingPointId = null
}

function cloneTemplate(templateId: string, root: HTMLElement): HTMLElement {
  const template = $<HTMLTemplateElement>(templateId)
  const block = (template.content.cloneNode(true) as DocumentFragment).firstElementChild as HTMLElement
  block.querySelector<HTMLButtonElement>('.pf-remove')!
    .addEventListener('click', () => block.remove())
  root.appendChild(block)
  return block
}

function addTagRow(tag?: { track: string; topic: string }) {
  const row = cloneTemplate('pf-tag-template', $('pf-tags'))
  if (tag) {
    row.querySelector<HTMLSelectElement>('.pf-tag-track')!.value = tag.track
    row.querySelector<HTMLInputElement>('.pf-tag-topic')!.value = tag.topic
  }
}

function addStepRow(step?: StepJson) {
  const row = cloneTemplate('pf-step-template', $('pf-steps'))
  row.querySelector<HTMLInputElement>('.pf-step-id')!.value = step?.id ?? ''
  row.querySelector<HTMLInputElement>('.pf-step-title')!.value = step?.title ?? ''
  row.querySelector<HTMLInputElement>('.pf-step-required')!.checked = step?.required ?? true
  const kindSelect = row.querySelector<HTMLSelectElement>('.pf-step-kind')!
  kindSelect.value = step?.activity.kind ?? 'lesson'
  kindSelect.addEventListener('change', () => renderStepParams(row, { kind: kindSelect.value }))
  renderStepParams(row, step?.activity ?? { kind: kindSelect.value })
}

/** Kind-специфічні параметри кроку. Значення читаються назад у collectStep. */
function renderStepParams(row: HTMLElement, activity: Record<string, unknown> & { kind: string }) {
  const box = row.querySelector<HTMLElement>('.pf-step-params')!
  box.innerHTML = ''
  const field = (label: string, input: HTMLElement) => {
    const wrap = document.createElement('div')
    const labelEl = document.createElement('label')
    labelEl.className = 'adm-label'
    labelEl.textContent = label
    input.id = `pf-dynamic-${++dynamicFieldId}`
    labelEl.htmlFor = input.id
    wrap.append(labelEl, input)
    box.appendChild(wrap)
  }
  const select = (className: string, options: Array<[string, string]>, value?: string) => {
    const el = document.createElement('select')
    el.className = `${className} adm-input adm-input--sm`
    for (const [optionValue, optionLabel] of options) {
      const option = document.createElement('option')
      option.value = optionValue
      option.textContent = optionLabel
      el.appendChild(option)
    }
    if (value !== undefined) el.value = value
    return el
  }
  const numberInput = (className: string, value: unknown) => {
    const el = document.createElement('input')
    el.type = 'number'
    el.min = '1'
    el.max = '12'
    el.className = `${className} adm-input adm-input--sm`
    if (Number.isInteger(value)) el.value = String(value)
    return el
  }

  switch (activity.kind) {
    case 'lesson': {
      const known = lessonIds.includes(activity.lessonId as string) || !activity.lessonId
        ? lessonIds : [activity.lessonId as string, ...lessonIds]
      field('Урок', select('pf-param-lesson', known.map(id => [id, id]), activity.lessonId as string | undefined))
      break
    }
    case 'mission': {
      field('Напрям (порожньо = будь-який)', select('pf-param-track', [
        ['', '—'], ['informatics', 'Інформатика'],
        ['computational-thinking', 'Обчислювальне мислення'], ['ai-basics', 'Основи ШІ'],
      ], (activity.track as string) ?? ''))
      const topic = document.createElement('input')
      topic.type = 'text'
      topic.className = 'pf-param-topic adm-input adm-input--sm adm-input--code'
      topic.value = (activity.topic as string) ?? ''
      field('Тема (topic)', topic)
      const tracks = document.createElement('input')
      tracks.type = 'text'
      tracks.className = 'pf-param-tracks adm-input adm-input--sm adm-input--code'
      tracks.placeholder = 'informatics,ai-basics (для міксу)'
      tracks.value = Array.isArray(activity.tracks) ? (activity.tracks as string[]).join(',') : ''
      field('Мікс напрямів', tracks)
      field('Кількість питань', numberInput('pf-param-count', activity.count))
      break
    }
    case 'sorting':
      field('Гра', select('pf-param-game', [
        ['attributes', 'Розумне сортування'], ['infosort', 'ІнфоСорт'], ['multisort', 'Мульти-Сортування'],
      ], activity.game as string | undefined))
      break
    case 'fact-opinion':
      field('Рівень', select('pf-param-level', [['1', 'Рівень 1 (факт/думка)'], ['2', 'Рівень 2 (+міф)']],
        String(activity.level ?? 1)))
      break
    case 'simulator':
      field('Сценарій', select('pf-param-scenario', [
        ['hardware', 'Збери компʼютер'], ['software', 'Встанови систему'],
      ], activity.scenario as string | undefined))
      break
    default: // sequence | scenarios | puzzles
      field('Кількість (порожньо = типова)', numberInput('pf-param-count', activity.count))
  }
}

function collectStep(row: HTMLElement): StepJson {
  const kind = row.querySelector<HTMLSelectElement>('.pf-step-kind')!.value
  const activity: Record<string, unknown> & { kind: string } = { kind }
  const readValue = (selector: string) => row.querySelector<HTMLInputElement | HTMLSelectElement>(selector)?.value?.trim() ?? ''

  if (kind === 'lesson') activity.lessonId = readValue('.pf-param-lesson')
  if (kind === 'sorting') activity.game = readValue('.pf-param-game')
  if (kind === 'fact-opinion') activity.level = Number(readValue('.pf-param-level'))
  if (kind === 'simulator') activity.scenario = readValue('.pf-param-scenario')
  if (kind === 'mission') {
    const track = readValue('.pf-param-track')
    if (track) activity.track = track
    const topic = readValue('.pf-param-topic')
    if (topic) activity.topic = topic
    const tracks = readValue('.pf-param-tracks')
    if (tracks) activity.tracks = tracks.split(',').map(value => value.trim()).filter(Boolean)
  }
  const count = readValue('.pf-param-count')
  if (count) activity.count = Number(count)

  return {
    id: row.querySelector<HTMLInputElement>('.pf-step-id')!.value.trim(),
    version: 1, // для змінених кроків сервер підставить prev+1, для нових лишить 1
    title: row.querySelector<HTMLInputElement>('.pf-step-title')!.value.trim(),
    activity,
    required: row.querySelector<HTMLInputElement>('.pf-step-required')!.checked,
  }
}

function applyPoint() {
  const point: PointJson = {
    id: $<HTMLInputElement>('pf-id').value.trim(),
    title: $<HTMLInputElement>('pf-title').value.trim(),
    icon: $<HTMLInputElement>('pf-icon').value.trim(),
    access: $<HTMLSelectElement>('pf-access').value as 'free' | 'club',
    curriculum: [...$('pf-tags').querySelectorAll<HTMLElement>('.pf-row')].map(row => ({
      track: row.querySelector<HTMLSelectElement>('.pf-tag-track')!.value,
      topic: row.querySelector<HTMLInputElement>('.pf-tag-topic')!.value.trim(),
    })),
    activities: [...$('pf-steps').querySelectorAll<HTMLElement>('.lf-block')].map(collectStep),
    unlockAfter: [...$('pf-unlock').querySelectorAll<HTMLInputElement>('input:checked')].map(box => box.value),
    x: Number($<HTMLInputElement>('pf-x').value),
    y: Number($<HTMLInputElement>('pf-y').value),
  }
  if (!point.id) {
    $('pf-error').textContent = 'Вкажи ID точки'
    return
  }
  if (!editingPointId && workingPoints.some(existing => existing.id === point.id)) {
    $('pf-error').textContent = 'Точка з таким ID вже існує'
    return
  }

  // Версії незмінених кроків зберігаємо локально, щоб діф на сервері був чесним.
  const previous = workingPoints.find(existing => existing.id === (editingPointId ?? point.id))
  if (previous) {
    for (const step of point.activities) {
      const before = previous.activities.find(existing => existing.id === step.id)
      if (before) step.version = before.version
    }
  }

  const shouldRestoreEditedPoint = editingPointId !== null
  if (editingPointId) {
    workingPoints = workingPoints.map(existing => existing.id === editingPointId ? point : existing)
  } else {
    workingPoints.push(point)
  }
  closePointEditor()
  markDirty()
  if (shouldRestoreEditedPoint) {
    const index = workingPoints.findIndex(existing => existing.id === point.id)
    $('pm-points').querySelectorAll<HTMLButtonElement>('.pm-edit')[index]?.focus()
  }
}

function deleteEditedPoint() {
  if (!editingPointId) return
  const id = editingPointId
  showConfirm(`Видалити точку «${id}»? Посилання unlockAfter на неї буде прибрано.`, () => {
    workingPoints = workingPoints
      .filter(point => point.id !== id)
      .map(point => ({ ...point, unlockAfter: point.unlockAfter.filter(dep => dep !== id) }))
    closePointEditor()
    markDirty()
  })
}

async function saveMap() {
  $('pm-error').textContent = ''
  const save = $<HTMLButtonElement>('pm-save')
  save.disabled = true
  try {
    const { map, bumpedSteps } = await updateAdminPathMap(currentPathId, {
      expectedVersion: currentMap()?.version ?? 0,
      title: workingTitle,
      points: workingPoints,
    })
    maps = maps.map(existing => existing.pathId === map.pathId ? map : existing)
    resetWorking()
    renderPathTab()
    showModal(bumpedSteps.length
      ? `Збережено (v${map.version}). Підняті версії кроків: ${bumpedSteps.join(', ')}. Для доставки дітям запусти загальну публікацію.`
      : `Збережено (v${map.version}). Для доставки дітям запусти загальну публікацію.`)
  } catch (err) {
    $('pm-error').textContent = (err as Error).message
  } finally {
    save.disabled = false
  }
}
