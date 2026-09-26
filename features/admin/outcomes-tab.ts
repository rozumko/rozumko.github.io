// Admin tab "Результати навчання": the Lesson Engine learning outcome
// directory. Outcomes are archived, never deleted (student evidence refers to
// them), and their id and subject pack never change after creation.
// «Стандарти й програми» shows the read-only NUSH/Cambridge catalogue and
// which skills cover each entry.

import {
  createAdminCurriculumOutcome,
  getAdminCurriculumOutcomes,
  getAdminFrameworkRefs,
  getAdminSubjectPacks,
  setAdminCurriculumOutcomeStatus,
  updateAdminCurriculumOutcome,
  type AdminCurriculumOutcome,
  type AdminFrameworkRef,
  type AdminSubjectPack,
  type ApiError,
  type CurriculumMappingStrength,
  type CurriculumOutcomeMapping,
  type CurriculumOutcomeSource,
} from '../api/client.js'
import { $ } from '../../utils/dom.js'
import { createFocusTrap } from '../../utils/focus-trap.js'
import { showConfirm, friendlyError } from './ui.js'
import {
  MAPPING_STRENGTH_LABELS,
  OUTCOME_FRAMEWORK_SUGGESTIONS,
  OUTCOME_SOURCE_LABELS,
  describeOutcomeIssue,
  filterOutcomes,
  filterRefs,
  findRef,
  normalizeMappingRefs,
  frameworkTitle,
  levelLabel,
  mappingSummary,
  outcomeInputFromForm,
  refCoverage,
  refKey,
  refLevels,
  refLinkLevel,
  skillDraftFromRef,
} from './outcomes-model.js'

let outcomes: AdminCurriculumOutcome[] = []
let usage: Record<string, string[]> = {}
let packs: AdminSubjectPack[] = []
let editing: AdminCurriculumOutcome | null = null
let refs: AdminFrameworkRef[] = []
let refsLoaded = false
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
  $('o-view-skills').addEventListener('click', () => setView('skills'))
  $('o-view-catalog').addEventListener('click', () => setView('catalog'))
  $<HTMLInputElement>('oc-search').addEventListener('input', renderCatalog)
  $<HTMLSelectElement>('oc-framework').addEventListener('change', () => { fillLevelSelect(); renderCatalog() })
  $<HTMLSelectElement>('oc-level').addEventListener('change', renderCatalog)
  $<HTMLInputElement>('oc-no-direct').addEventListener('change', renderCatalog)
  $('of-add-mapping').addEventListener('click', () => addMappingRow({ framework: '', ref: '' }, true))
  $('of-cancel').addEventListener('click', closeEditor)
  $<HTMLFormElement>('outcome-form').addEventListener('submit', event => {
    event.preventDefault()
    void save()
  })
  const datalist = $('of-frameworks')
  for (const suggestion of OUTCOME_FRAMEWORK_SUGGESTIONS) {
    const option = el('option')
    option.value = suggestion.framework
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
    await loadCatalog()
  } catch (err) {
    const status = (err as ApiError).status
    $('o-load-error').textContent = status === 404
      ? 'Керовані уроки вимкнені на сервері (LESSON_ENGINE_ENABLED).'
      : friendlyError((err as Error).message)
  }
}

/** The catalogue loads once; a failure leaves the skills view working. */
async function loadCatalog() {
  if (!refsLoaded) {
    try {
      refs = (await getAdminFrameworkRefs()).refs ?? []
      refsLoaded = true
      $('oc-error').textContent = ''
      fillLevelSelect()
      fillRefLists()
    } catch (err) {
      $('oc-error').textContent = `Не вдалося завантажити стандарти: ${friendlyError((err as Error).message)}`
    }
  }
  renderCatalog()
}

function setView(view: 'skills' | 'catalog') {
  const catalog = view === 'catalog'
  $('o-catalog-view').hidden = !catalog
  $('o-skills-view').hidden = catalog
  $('o-view-skills').classList.toggle('o-view--on', !catalog)
  $('o-view-catalog').classList.toggle('o-view--on', catalog)
  $('o-view-skills').setAttribute('aria-pressed', String(!catalog))
  $('o-view-catalog').setAttribute('aria-pressed', String(catalog))
}

function fillLevelSelect() {
  const select = $<HTMLSelectElement>('oc-level')
  const framework = $<HTMLSelectElement>('oc-framework').value
  select.replaceChildren(new Option('Усі класи', ''))
  for (const level of refLevels(refs, framework)) select.append(new Option(levelLabel({ framework, level }), level))
}

/** One datalist of codes per framework, for the mapping rows in the editor. */
function fillRefLists() {
  const host = $('of-ref-lists')
  host.replaceChildren()
  for (const framework of new Set(refs.map(ref => ref.framework))) {
    const list = el('datalist')
    list.id = `of-refs-${framework}`
    for (const ref of refs.filter(r => r.framework === framework)) {
      const option = el('option')
      option.value = ref.code
      option.label = ref.title.length > 90 ? `${ref.title.slice(0, 89)}…` : ref.title
      list.append(option)
    }
    host.append(list)
  }
}

function renderCatalog() {
  const list = $('oc-list')
  const coverage = refCoverage(outcomes, refs)
  const framework = $<HTMLSelectElement>('oc-framework').value
  const inFramework = refs.filter(ref => ref.framework === framework)
  const levels = inFramework.map(ref => refLinkLevel(coverage.get(refKey(ref.framework, ref.code))))
  const direct = levels.filter(level => level === 'direct').length
  const indirect = levels.filter(level => level === 'indirect').length
  const filtered = filterRefs(refs, {
    framework,
    level: $<HTMLSelectElement>('oc-level').value,
    query: $<HTMLInputElement>('oc-search').value,
    withoutDirectOnly: $<HTMLInputElement>('oc-no-direct').checked,
  }, coverage)
  $('oc-count').textContent = refsLoaded ? `${filtered.length} із ${inFramework.length} · з прямою відповідністю: ${direct} · лише з частковими зв’язками: ${indirect}` : ''
  list.replaceChildren()
  if (!refsLoaded) return
  if (filtered.length === 0) {
    const empty = el('div', 'admin-empty-state')
    const inner = el('div')
    inner.append(el('p', 'admin-empty-state__title', inFramework.length ? 'За цими фільтрами нічого не знайдено' : 'Каталог порожній: застосуйте міграцію 0059'))
    empty.append(inner)
    list.append(empty)
    return
  }
  for (const ref of filtered) {
    const covers = coverage.get(refKey(ref.framework, ref.code)) ?? []
    const item = el('div', 'question-item')
    item.dataset.refCode = ref.code
    const left = el('div', 'question-item__left')
    const badges = el('div', 'question-item__badges')
    badges.append(el('span', 'qi-badge qi-badge--type', levelLabel(ref)))
    // NUSH groups are long general results: the badge shows the code, the meta line the wording.
    const longGroup = !!ref.groupTitle && ref.groupTitle.length > 60
    if (ref.groupTitle) badges.append(el('span', 'qi-badge qi-badge--type', longGroup ? String(ref.groupCode) : ref.groupTitle))
    // Linked is not covered: only an author-marked direct mapping gets the green badge.
    const link = refLinkLevel(covers)
    badges.append(link === 'direct'
      ? el('span', 'qi-badge qi-badge--easy', 'є пряма відповідність')
      : link === 'indirect'
        ? el('span', 'qi-badge qi-badge--type', 'лише часткові зв’язки')
        : el('span', 'qi-badge qi-badge--medium', 'немає вмінь'))
    const text = el('p', 'question-item__text')
    const wording = el('span', undefined, ` — ${ref.title}`)
    wording.lang = ref.lang
    text.append(el('strong', undefined, ref.code), wording)
    left.append(badges, text)
    if (covers.length) {
      const names = covers.map(c => `${c.code} (${c.strength ? MAPPING_STRENGTH_LABELS[c.strength] : 'сила не вказана'})`)
      left.append(el('p', 'question-item__meta', `Пов’язані вміння: ${names.join(', ')}`))
    }
    if (longGroup) left.append(el('p', 'question-item__meta', `${ref.groupCode}: ${ref.groupTitle}`))
    if (ref.examples.length) left.append(foldList(`Приклади завдань МОН (${ref.examples.length})`, ref.examples, 'uk'))
    if (ref.guidance) left.append(foldList('Примітки Cambridge', [ref.guidance], 'en'))
    if (ref.aliases?.length) left.append(el('p', 'question-item__meta', `Інше написання коду: ${ref.aliases.join(', ')}`))
    left.append(el('p', 'question-item__meta', ref.source))

    const actions = el('div', 'question-item__actions')
    const create = button('Створити вміння', 'btn-adm-ghost')
    create.setAttribute('aria-label', `Створити вміння з відповідністю ${ref.code}`)
    create.addEventListener('click', () => openEditor(null, skillDraftFromRef(ref)))
    actions.append(create)
    item.append(left, actions)
    list.append(item)
  }
}

function foldList(title: string, lines: string[], lang: string): HTMLDetailsElement {
  const fold = el('details', 'oc-fold')
  fold.append(el('summary', undefined, title))
  const ul = el('ul')
  ul.lang = lang
  for (const line of lines) ul.append(el('li', undefined, line))
  fold.append(ul)
  return fold
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

function addMappingRow(mapping: CurriculumOutcomeMapping, focus = false) {
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
  const strength = el('select', 'adm-input adm-input--sm of-strength')
  strength.setAttribute('aria-label', `Відповідність ${index}: сила зв'язку`)
  strength.append(new Option('сила не вказана', ''))
  for (const [value, label] of Object.entries(MAPPING_STRENGTH_LABELS)) strength.append(new Option(label, value))
  strength.value = mapping.strength ?? ''
  const remove = button('Прибрати', 'btn-adm-ghost btn--sm')
  remove.setAttribute('aria-label', `Прибрати відповідність ${index}`)
  remove.addEventListener('click', () => {
    row.remove()
    $('of-add-mapping').focus()
  })
  const hint = el('p', 'adm-field-hint of-ref-hint')
  const describe = () => {
    ref.setAttribute('list', `of-refs-${framework.value.trim()}`)
    const found = findRef(refs, framework.value, ref.value)
    // An old portal code still resolves, and the hint names the normative one to use instead.
    const byAlias = found && found.code !== ref.value.trim() ? ` Код у стандарті: ${found.code}, його й буде збережено.` : ''
    hint.textContent = found ? `${frameworkTitle(found.framework)}, ${levelLabel(found)}: ${found.title}${byAlias}` : ''
    if (found) hint.lang = found.lang
    else hint.removeAttribute('lang')
  }
  framework.addEventListener('input', describe)
  ref.addEventListener('input', describe)
  describe()
  row.append(framework, ref, strength, remove, hint)
  host.append(row)
  if (focus) framework.focus()
}

/** `draft` prefills a new skill from a catalogue entry (grade and a direct mapping). */
function openEditor(outcome: AdminCurriculumOutcome | null, draft?: { gradeBand: string; mappings: CurriculumOutcomeMapping[] }) {
  editing = outcome
  $('outcome-modal-title').textContent = outcome ? `Редагувати: ${outcome.code}` : 'Новий результат навчання'
  $('of-error').replaceChildren()
  const pack = $<HTMLSelectElement>('of-pack')
  pack.value = outcome?.subjectPackId ?? ($<HTMLSelectElement>('o-filter-pack').value || packs[0]?.id || '')
  pack.disabled = !!outcome
  const id = $<HTMLInputElement>('of-id')
  id.value = outcome?.id ?? ''
  id.disabled = !!outcome
  $<HTMLSelectElement>('of-source').value = outcome?.source ?? (draft ? 'internal' : 'national-standard')
  $<HTMLInputElement>('of-code').value = outcome?.code ?? ''
  $<HTMLInputElement>('of-grade').value = outcome?.gradeBand ?? draft?.gradeBand ?? ''
  $<HTMLTextAreaElement>('of-title').value = outcome?.titleUk ?? ''
  $<HTMLInputElement>('of-title-en').value = outcome?.titleEn ?? ''
  $<HTMLInputElement>('of-source-ref').value = outcome?.sourceRef ?? ''
  $('of-mappings').replaceChildren()
  for (const mapping of outcome?.mappings ?? draft?.mappings ?? []) addMappingRow(mapping)

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
      strength: row.querySelector<HTMLSelectElement>('.of-strength')!.value as CurriculumMappingStrength | '',
    })),
  })
  // An old portal code is stored as the catalogue's normative code.
  input.mappings = normalizeMappingRefs(input.mappings, refs)
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
