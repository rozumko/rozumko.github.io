// Admin tab "Результати навчання": the Lesson Engine learning outcome
// directory. Outcomes are archived, never deleted (student evidence refers to
// them), and their id and subject pack never change after creation.

import {
  createAdminCurriculumOutcome,
  getAdminCurriculumOutcomes,
  getAdminSubjectPacks,
  setAdminCurriculumOutcomeStatus,
  updateAdminCurriculumOutcome,
  type AdminCurriculumOutcome,
  type AdminSubjectPack,
  type ApiError,
  type CurriculumOutcomeSource,
} from '../api/client.js'
import { $ } from '../../utils/dom.js'
import { createFocusTrap } from '../../utils/focus-trap.js'
import { showConfirm, friendlyError } from './ui.js'
import {
  OUTCOME_FRAMEWORK_SUGGESTIONS,
  OUTCOME_SOURCE_LABELS,
  describeOutcomeIssue,
  filterOutcomes,
  mappingSummary,
  outcomeInputFromForm,
} from './outcomes-model.js'

let outcomes: AdminCurriculumOutcome[] = []
let usage: Record<string, string[]> = {}
let packs: AdminSubjectPack[] = []
let editing: AdminCurriculumOutcome | null = null
let removeTrap: (() => void) | null = null
let loaded = false

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function button(label: string, className: string): HTMLButtonElement {
  const b = el('button', className, label)
  b.type = 'button'
  return b
}

function packTitle(id: string): string {
  return packs.find(pack => pack.id === id)?.title.uk ?? id
}

export function initOutcomesTab() {
  $<HTMLInputElement>('o-filter-search').addEventListener('input', renderList)
  $<HTMLSelectElement>('o-filter-pack').addEventListener('change', renderList)
  $<HTMLSelectElement>('o-filter-status').addEventListener('change', renderList)
  $('add-outcome-btn').addEventListener('click', () => openEditor(null))
  $('of-add-mapping').addEventListener('click', () => addMappingRow({ framework: '', ref: '' }, true))
  $('of-cancel').addEventListener('click', closeEditor)
  $<HTMLFormElement>('outcome-form').addEventListener('submit', event => {
    event.preventDefault()
    void save()
  })
  const datalist = $('of-frameworks')
  for (const suggestion of OUTCOME_FRAMEWORK_SUGGESTIONS) {
    const option = el('option')
    option.value = suggestion.key
    option.label = suggestion.label
    datalist.append(option)
  }
}

export async function loadOutcomesTab() {
  $('o-load-error').textContent = ''
  try {
    const [directory, packList] = await Promise.all([
      getAdminCurriculumOutcomes(),
      loaded ? Promise.resolve({ packs }) : getAdminSubjectPacks(),
    ])
    outcomes = directory.outcomes
    usage = directory.usage
    if (!loaded) {
      packs = packList.packs
      fillPackSelect($<HTMLSelectElement>('o-filter-pack'), true)
      fillPackSelect($<HTMLSelectElement>('of-pack'), false)
      loaded = true
    }
    renderList()
  } catch (err) {
    const status = (err as ApiError).status
    $('o-load-error').textContent = status === 404
      ? 'Керовані уроки вимкнені на сервері (LESSON_ENGINE_ENABLED).'
      : friendlyError((err as Error).message)
  }
}

function fillPackSelect(select: HTMLSelectElement, withAll: boolean) {
  select.replaceChildren()
  if (withAll) {
    const all = el('option', undefined, 'Усі предмети')
    all.value = ''
    select.append(all)
  }
  for (const pack of packs) {
    const option = el('option', undefined, pack.title.uk)
    option.value = pack.id
    select.append(option)
  }
}

function renderList() {
  const list = $('outcomes-list')
  const filtered = filterOutcomes(outcomes, {
    packId: $<HTMLSelectElement>('o-filter-pack').value,
    status: $<HTMLSelectElement>('o-filter-status').value as '' | 'active' | 'archived',
    query: $<HTMLInputElement>('o-filter-search').value,
  })
  $('o-count').textContent = `${filtered.length} із ${outcomes.length}`
  list.replaceChildren()

  if (filtered.length === 0) {
    const empty = el('div', 'admin-empty-state')
    const inner = el('div')
    inner.append(el('p', 'admin-empty-state__title', outcomes.length ? 'За цими фільтрами нічого не знайдено' : 'Результатів ще немає'))
    empty.append(inner)
    list.append(empty)
    return
  }

  for (const outcome of filtered) {
    const lessons = usage[outcome.id] ?? []
    const item = el('div', 'question-item')
    item.dataset.outcomeId = outcome.id
    const left = el('div', 'question-item__left')
    const badges = el('div', 'question-item__badges')
    badges.append(
      el('span', `qi-badge ${outcome.status === 'active' ? 'qi-badge--easy' : 'qi-badge--type'}`, outcome.status === 'active' ? 'Діючий' : 'Знятий'),
      el('span', 'qi-badge qi-badge--type', OUTCOME_SOURCE_LABELS[outcome.source]),
    )
    if (outcome.gradeBand) badges.append(el('span', 'qi-badge qi-badge--type', `${outcome.gradeBand} кл.`))
    badges.append(el('span', 'qi-badge qi-badge--practice', lessons.length ? `уроків: ${lessons.length}` : 'не використовується'))
    const text = el('p', 'question-item__text')
    text.append(el('strong', undefined, outcome.code), ` — ${outcome.titleUk}`)
    const metaParts = [outcome.id, packTitle(outcome.subjectPackId)]
    if (outcome.sourceRef) metaParts.push(outcome.sourceRef)
    const mapped = mappingSummary(outcome)
    if (mapped) metaParts.push(`відповідності: ${mapped}`)
    left.append(badges, text, el('p', 'question-item__meta', metaParts.join(' · ')))

    const actions = el('div', 'question-item__actions')
    const edit = button('Редагувати', 'btn-adm-ghost')
    edit.addEventListener('click', () => openEditor(outcome))
    const toggle = button(outcome.status === 'active' ? 'Зняти з використання' : 'Повернути', 'btn-adm-ghost')
    toggle.addEventListener('click', () => toggleStatus(outcome, lessons))
    actions.append(edit, toggle)
    item.append(left, actions)
    list.append(item)
  }
}

function toggleStatus(outcome: AdminCurriculumOutcome, lessons: string[]) {
  const next = outcome.status === 'active' ? 'archived' : 'active'
  const run = async () => {
    try {
      await setAdminCurriculumOutcomeStatus(outcome.id, next, outcome.editVersion)
      await loadOutcomesTab()
    } catch (err) {
      $('o-load-error').textContent = friendlyError((err as Error).message)
    }
  }
  if (next === 'active') {
    void run()
    return
  }
  const warning = lessons.length
    ? ` Його використовують уроки: ${lessons.join(', ')}. Їх не вдасться зберегти чи опублікувати, доки результат не приберуть з уроку або не повернуть.`
    : ''
  showConfirm(`Зняти «${outcome.code}» з використання?${warning} Звіти про вже проведені уроки не зміняться.`, () => { void run() })
}

function addMappingRow(mapping: { framework: string; ref: string }, focus = false) {
  const host = $('of-mappings')
  const index = host.childElementCount + 1
  const row = el('div', 'of-mapping-row')
  const framework = el('input', 'adm-input adm-input--sm of-framework')
  framework.type = 'text'
  framework.maxLength = 64
  framework.value = mapping.framework
  framework.setAttribute('list', 'of-frameworks')
  framework.setAttribute('aria-label', `Відповідність ${index}: документ (nush, cambridge…)`)
  framework.placeholder = 'cambridge'
  const ref = el('input', 'adm-input adm-input--sm of-ref')
  ref.type = 'text'
  ref.maxLength = 200
  ref.value = mapping.ref
  ref.setAttribute('aria-label', `Відповідність ${index}: код або критерій`)
  ref.placeholder = 'напр. 3Pc.01'
  const remove = button('Прибрати', 'btn-adm-ghost btn--sm')
  remove.setAttribute('aria-label', `Прибрати відповідність ${index}`)
  remove.addEventListener('click', () => {
    row.remove()
    $('of-add-mapping').focus()
  })
  row.append(framework, ref, remove)
  host.append(row)
  if (focus) framework.focus()
}

function openEditor(outcome: AdminCurriculumOutcome | null) {
  editing = outcome
  $('outcome-modal-title').textContent = outcome ? `Редагувати: ${outcome.code}` : 'Новий результат навчання'
  $('of-error').replaceChildren()
  const pack = $<HTMLSelectElement>('of-pack')
  pack.value = outcome?.subjectPackId ?? ($<HTMLSelectElement>('o-filter-pack').value || packs[0]?.id || '')
  pack.disabled = !!outcome
  const id = $<HTMLInputElement>('of-id')
  id.value = outcome?.id ?? ''
  id.disabled = !!outcome
  $<HTMLSelectElement>('of-source').value = outcome?.source ?? 'national-standard'
  $<HTMLInputElement>('of-code').value = outcome?.code ?? ''
  $<HTMLInputElement>('of-grade').value = outcome?.gradeBand ?? ''
  $<HTMLTextAreaElement>('of-title').value = outcome?.titleUk ?? ''
  $<HTMLInputElement>('of-title-en').value = outcome?.titleEn ?? ''
  $<HTMLInputElement>('of-source-ref').value = outcome?.sourceRef ?? ''
  $('of-mappings').replaceChildren()
  for (const mapping of outcome?.mappings ?? []) addMappingRow(mapping)

  $('outcome-modal').classList.remove('hidden')
  removeTrap?.()
  removeTrap = createFocusTrap($('outcome-modal'), closeEditor)
  $<HTMLInputElement>('of-code').focus()
}

function closeEditor() {
  removeTrap?.()
  removeTrap = null
  $('outcome-modal').classList.add('hidden')
  editing = null
  $('add-outcome-btn').focus()
}

function showErrors(message: string, issues: { path: string; message: string }[] = []) {
  const host = $('of-error')
  host.replaceChildren(el('p', undefined, message))
  if (issues.length) {
    const list = el('ul', 'of-issues')
    for (const issue of issues) list.append(el('li', undefined, describeOutcomeIssue(issue)))
    host.append(list)
  }
}

async function save() {
  const input = outcomeInputFromForm({
    code: $<HTMLInputElement>('of-code').value,
    titleUk: $<HTMLTextAreaElement>('of-title').value,
    titleEn: $<HTMLInputElement>('of-title-en').value,
    source: $<HTMLSelectElement>('of-source').value as CurriculumOutcomeSource,
    sourceRef: $<HTMLInputElement>('of-source-ref').value,
    gradeBand: $<HTMLInputElement>('of-grade').value,
    mappings: [...$('of-mappings').querySelectorAll('.of-mapping-row')].map(row => ({
      framework: row.querySelector<HTMLInputElement>('.of-framework')!.value,
      ref: row.querySelector<HTMLInputElement>('.of-ref')!.value,
    })),
  })
  const idValue = $<HTMLInputElement>('of-id').value.trim()
  if (!editing && idValue && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(idValue)) {
    showErrors('ID: лише малі латинські літери, цифри й дефіси між ними.')
    return
  }
  const saveButton = $<HTMLButtonElement>('of-save')
  saveButton.disabled = true
  try {
    if (editing) await updateAdminCurriculumOutcome(editing.id, input, editing.editVersion)
    else await createAdminCurriculumOutcome($<HTMLSelectElement>('of-pack').value, input, idValue || undefined)
    closeEditor()
    await loadOutcomesTab()
  } catch (err) {
    const body = (err as ApiError).body
    const issues = Array.isArray(body?.issues) ? body.issues as { path: string; message: string }[] : []
    showErrors(friendlyError((err as Error).message), issues)
  } finally {
    saveButton.disabled = false
  }
}
