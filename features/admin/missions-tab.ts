import {
  createAdminMission, getAdminMissionRevisions, getAdminMissions, getAdminQuestions,
  restoreAdminMissionRevision, setAdminMissionStatus, updateAdminMission,
  type AdminMissionQuestionSet, type AdminQuestionSetMissionInput, type AdminSortingLevel,
  type AdminClickTrainerMissionInput, type AdminClickTrainerRound,
  type AdminFactOpinionMissionInput, type AdminFactOpinionStatement,
  type AdminScenarioItem, type AdminScenarioMissionInput, type AdminSequenceMissionInput,
  type AdminSequenceSet, type AdminSimulatorMissionInput, type AdminSimulatorNode,
  type AdminSortingMissionInput, type Mission, type Question,
} from '../../features/api/client.js'
import { CLICK_TRAINER_COMPUTER_PARTS } from '../../features/games/click-trainer-data.js'
import { FO_LEVEL1_STATEMENTS, FO_LEVEL2_STATEMENTS } from '../../features/games/fact-opinion-data.js'
import {
  INFO_SORT_LEVELS, MULTISORT_LEVELS, SORTING_ATTRIBUTES_LEVELS, type SortingLevel,
} from '../../features/games/sorting-data.js'
import { SCENARIOS_DIGITAL_SAFETY } from '../../features/games/scenarios-data.js'
import { SEQUENCE_SETS_G2 } from '../../features/games/sequence-data.js'
import { HARDWARE_SCENARIO, SOFTWARE_SCENARIO } from '../../features/games/simulator-data.js'
import {
  defaultSimulatorPack, SIMULATOR_ALLOWED_TARGETS,
} from '../../features/games/simulator-content-loader.js'
import { createFocusTrap } from '../../utils/focus-trap.js'
import { $ } from '../../utils/dom.js'
import { esc, showConfirm, showModal } from './ui.js'
import { TOPIC_LABELS, TOPICS_BY_TRACK } from './taxonomy.js'
import { refreshContentDeliveryBanner } from './publication-tab.js'

const TRACK_LABELS: Record<string, string> = {
  informatics: 'Інформатика', 'computational-thinking': 'Обчислювальне мислення', 'ai-basics': 'Основи ШІ',
}
const KIND_LABELS: Record<string, string> = {
  'question-set': 'Набір питань', 'sorting-game': 'Гра-сортування',
  'sequence-game': 'Гра-кроки', 'scenario-game': 'Ситуаційна гра', puzzle: 'Головоломка',
  'fact-opinion-game': 'Факт чи думка', 'click-trainer-game': 'Клік-тренажер', 'simulator-game': 'Симулятор',
}
const FO_CATEGORY_OPTIONS: Array<{ value: AdminFactOpinionStatement['category']; label: string }> = [
  { value: 'fact', label: '✅ Факт' }, { value: 'opinion', label: '💬 Думка' }, { value: 'myth', label: '🔮 Міф' },
]
const STATUS_LABELS: Record<string, string> = {
  draft: 'Чернетка', review: 'Готова до публікації', published: 'Опублікована', active: 'Опублікована', archived: 'Знята з публікації',
}

let allMissions: Mission[] = []
let availableQuestions: Question[] = []
let editorMission: Mission | null = null
let workingSets: AdminMissionQuestionSet[] = []
let editorOverlay: HTMLElement | null = null
let editorTrapRemove: (() => void) | null = null

export function initMissionsTab() {
  $<HTMLSelectElement>('m-filter-track').addEventListener('change', renderMissions)
  $<HTMLSelectElement>('m-filter-grade').addEventListener('change', renderMissions)
  $('add-mission-btn').addEventListener('click', () => { void openEditor(null) })
  $('add-sorting-mission-btn').addEventListener('click', () => { openSortingEditor(null) })
  $('add-sequence-mission-btn').addEventListener('click', () => { openNarrativeEditor(null, 'sequence-game') })
  $('add-scenario-mission-btn').addEventListener('click', () => { openNarrativeEditor(null, 'scenario-game') })
  $('add-fact-opinion-mission-btn').addEventListener('click', () => { openNarrativeEditor(null, 'fact-opinion-game') })
  $('add-click-trainer-mission-btn').addEventListener('click', () => { openNarrativeEditor(null, 'click-trainer-game') })
  $('add-simulator-mission-btn').addEventListener('click', () => { openSimulatorEditor(null) })
}

export async function loadMissionsTab() {
  const list = $('missions-list')
  list.innerHTML = '<p class="admin-loading-text">Завантаження…</p>'
  try {
    const { missions } = await getAdminMissions()
    allMissions = missions
    renderMissions()
  } catch (err) {
    list.innerHTML = `<p class="admin-list-error">${esc((err as Error).message)}</p>`
  }
}

function renderMissions() {
  const list = $('missions-list')
  const track = $<HTMLSelectElement>('m-filter-track').value
  const grade = $<HTMLSelectElement>('m-filter-grade').value
  const filtered = allMissions.filter(m => (!track || m.track === track) && (!grade || m.grade === Number(grade)))
  $('m-count').textContent = `${filtered.length} місій`
  if (!filtered.length) {
    list.innerHTML = '<div class="admin-empty-state"><div><i class="fas fa-rocket admin-empty-state__icon" aria-hidden="true"></i><p class="admin-empty-state__title">Місій не знайдено</p></div></div>'
    return
  }
  list.innerHTML = ''
  for (const mission of filtered) list.appendChild(missionCard(mission))
}

function missionCard(mission: Mission): HTMLElement {
  const status = (mission.status as string) === 'active' ? 'published' : mission.status
  const editable = ['question-set', 'sorting-game', 'sequence-game', 'scenario-game', 'fact-opinion-game', 'click-trainer-game', 'simulator-game'].includes(mission.kind)
  const needsSortingImport = mission.kind === 'sorting-game'
    && !(typeof mission.config?.gameKey === 'string' && Array.isArray(mission.config?.levels)
      && mission.config.levels.every(level => {
        const value = level as Record<string, unknown>
        return Array.isArray(value.bins) && Array.isArray(value.items)
      }))
  const needsNarrativeImport = (mission.kind === 'sequence-game' && !Array.isArray(mission.config?.sets))
    || (mission.kind === 'scenario-game' && !Array.isArray(mission.config?.items))
    || (mission.kind === 'fact-opinion-game' && !Array.isArray(mission.config?.statements))
    || (mission.kind === 'click-trainer-game' && !Array.isArray(mission.config?.rounds))
  const needsImport = needsSortingImport || needsNarrativeImport
    || (mission.kind === 'simulator-game' && !Array.isArray(mission.config?.nodes))
  const nextStatus: Mission['status'] = status === 'draft' || status === 'review' ? 'published'
    : status === 'published' ? 'archived' : mission.publishedVersion ? 'published' : 'draft'
  const nextLabel = status === 'draft' || status === 'review' ? 'Опублікувати'
    : status === 'published' ? 'Зняти з публікації' : mission.publishedVersion ? 'Опублікувати знову' : 'Повернути в чернетки'
  const sets = mission.kind === 'question-set' && Array.isArray(mission.config?.questionSets)
    ? mission.config.questionSets as AdminMissionQuestionSet[] : []
  const el = document.createElement('div')
  el.className = 'question-item'
  el.innerHTML = `
    <div class="question-item__left">
      <div class="question-item__badges">
        <span class="qi-badge ${status === 'published' ? 'qi-badge--easy' : status === 'draft' ? 'qi-badge--medium' : 'qi-badge--type'}">${esc(STATUS_LABELS[status] ?? status)}</span>
        <span class="qi-badge qi-badge--grade">${esc(String(mission.grade))} клас</span>
        <span class="qi-badge qi-badge--practice">${esc(TRACK_LABELS[mission.track] ?? mission.track)}</span>
        <span class="qi-badge qi-badge--type">${esc(KIND_LABELS[mission.kind] ?? mission.kind)}</span>
        ${sets.length ? `<span class="qi-badge qi-badge--type">наборів: ${sets.length}</span>` : ''}
      </div>
      <p class="question-item__text">${esc(mission.title)}</p>
      <p class="question-item__meta">${esc(mission.id)} · робоча v${mission.version} · редакція ${mission.editVersion ?? 1}${mission.publishedVersion ? ` · опублікована v${mission.publishedVersion}` : ''}</p>
    </div>
    <div class="question-item__actions">
      ${editable ? '<button type="button" class="btn-adm-ghost m-edit">Редагувати</button><button type="button" class="btn-adm-ghost m-history">Історія</button><button type="button" class="btn-adm-sky btn--sm m-status"></button>' : '<span class="admin-filter-count">Редактор механіки — наступний зріз</span>'}
    </div>`
  if (editable) {
    el.querySelector<HTMLButtonElement>('.m-status')!.textContent = needsImport ? 'Спершу імпортувати' : nextLabel
    el.querySelector<HTMLButtonElement>('.m-edit')!.addEventListener('click', () => {
      if (mission.kind === 'sorting-game') openSortingEditor(mission)
      else if (mission.kind === 'sequence-game' || mission.kind === 'scenario-game' || mission.kind === 'fact-opinion-game' || mission.kind === 'click-trainer-game') openNarrativeEditor(mission, mission.kind)
      else if (mission.kind === 'simulator-game') openSimulatorEditor(mission)
      else void openEditor(mission)
    })
    el.querySelector<HTMLButtonElement>('.m-history')!.addEventListener('click', () => { void openHistory(mission) })
    el.querySelector<HTMLButtonElement>('.m-status')!.addEventListener('click', () => {
      if (needsSortingImport) { openSortingEditor(mission); return }
      if (needsNarrativeImport && (mission.kind === 'sequence-game' || mission.kind === 'scenario-game'
        || mission.kind === 'fact-opinion-game' || mission.kind === 'click-trainer-game')) {
        openNarrativeEditor(mission, mission.kind); return
      }
      if (mission.kind === 'simulator-game' && !Array.isArray(mission.config?.nodes)) {
        openSimulatorEditor(mission); return
      }
      showConfirm(`${nextLabel} місію «${mission.title}»?`, async () => {
        try {
          await setAdminMissionStatus(mission.id, nextStatus, mission.editVersion ?? 1)
          await loadMissionsTab()
          void refreshContentDeliveryBanner()
        }
        catch (err) { showModal((err as Error).message) }
      })
    })
  }
  return el
}

async function openEditor(mission: Mission | null) {
  editorMission = mission
  const config = mission?.config ?? {}
  workingSets = Array.isArray(config.questionSets)
    ? JSON.parse(JSON.stringify(config.questionSets)) as AdminMissionQuestionSet[]
    : [{ id: 'practice', purpose: 'practice', variant: 'default', questionIds: [] }]
  editorOverlay = document.createElement('div')
  editorOverlay.className = 'admin-modal-overlay'
  editorOverlay.setAttribute('role', 'dialog')
  editorOverlay.setAttribute('aria-modal', 'true')
  editorOverlay.setAttribute('aria-labelledby', 'mission-editor-title')
  editorOverlay.innerHTML = `
    <div class="admin-modal-card mission-editor-card">
      <div class="admin-section-header"><h3 id="mission-editor-title" class="admin-section-title">${mission ? 'Редагувати місію' : 'Нова question-set місія'}</h3>
        <button type="button" class="btn-adm-ghost me-close">Закрити</button></div>
      <form class="mission-editor-form qf-space" novalidate>
        <div class="adm-form-grid adm-form-grid--4">
          <div><label class="adm-label">ID</label><input class="adm-input adm-input--sm adm-input--code me-id" value="${esc(mission?.id ?? '')}" ${mission ? 'disabled' : ''}></div>
          <div><label class="adm-label">Назва</label><input class="adm-input adm-input--sm me-title" value="${esc(mission?.title ?? '')}"></div>
          <div><label class="adm-label">Клас</label><select class="adm-input adm-input--sm me-grade">${[1,2,3,4].map(g => `<option value="${g}" ${mission?.grade === g ? 'selected' : ''}>${g} клас</option>`).join('')}</select></div>
          <div><label class="adm-label">Напрям</label><select class="adm-input adm-input--sm me-track">${Object.entries(TRACK_LABELS).map(([value,label]) => `<option value="${value}" ${mission?.track === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
          <div><label class="adm-label">Тема</label><select class="adm-input adm-input--sm me-topic"></select></div>
          <div><label class="adm-label">Складність</label><select class="adm-input adm-input--sm me-difficulty"><option value="">Будь-яка</option><option value="easy">Легка</option><option value="medium">Середня</option><option value="hard">Складна</option></select></div>
        </div>
        <div class="admin-section-header"><span class="adm-label">Версіоновані набори</span><div class="admin-section-actions">
          <button type="button" class="btn-adm-ghost me-template">A/B шаблон</button><button type="button" class="btn-adm-ghost me-add-set">Додати набір</button></div></div>
        <p class="admin-section-note">Одне питання може входити лише в один набір цієї місії. Apply і confirm для кожного варіанта утворюють пару.</p>
        <div class="mission-set-list qf-space"></div>
        <p class="adm-form-error me-error" role="alert"></p>
        <div class="adm-form-actions"><button type="submit" class="btn-adm-emerald me-save">Зберегти чернетку</button><button type="button" class="btn-adm-violet me-preview">Перевірити склад</button></div>
      </form>
    </div>`
  document.body.appendChild(editorOverlay)
  const track = editorOverlay.querySelector<HTMLSelectElement>('.me-track')!
  const grade = editorOverlay.querySelector<HTMLSelectElement>('.me-grade')!
  const difficulty = editorOverlay.querySelector<HTMLSelectElement>('.me-difficulty')!
  difficulty.value = typeof config.difficulty === 'string' ? config.difficulty : ''
  fillEditorTopics(typeof config.topic === 'string' ? config.topic : '')
  track.addEventListener('change', () => { fillEditorTopics(''); void loadEditorQuestions() })
  grade.addEventListener('change', () => { void loadEditorQuestions() })
  editorOverlay.querySelector<HTMLButtonElement>('.me-close')!.addEventListener('click', closeEditor)
  editorOverlay.querySelector<HTMLButtonElement>('.me-add-set')!.addEventListener('click', () => {
    workingSets.push({ id: `set-${workingSets.length + 1}`, purpose: 'practice', variant: 'default', questionIds: [] }); renderSetRows()
  })
  editorOverlay.querySelector<HTMLButtonElement>('.me-template')!.addEventListener('click', () => {
    workingSets = [
      { id: 'apply-a', purpose: 'apply', variant: 'a', questionIds: [] },
      { id: 'confirm-a', purpose: 'confirm', variant: 'a', questionIds: [] },
      { id: 'apply-b', purpose: 'apply', variant: 'b', questionIds: [] },
      { id: 'confirm-b', purpose: 'confirm', variant: 'b', questionIds: [] },
    ]; renderSetRows()
  })
  editorOverlay.querySelector<HTMLButtonElement>('.me-preview')!.addEventListener('click', previewComposition)
  editorOverlay.querySelector<HTMLFormElement>('.mission-editor-form')!.addEventListener('submit', event => { event.preventDefault(); void saveMission() })
  editorTrapRemove = createFocusTrap(editorOverlay, closeEditor)
  await loadEditorQuestions()
}

function fillEditorTopics(selected: string) {
  if (!editorOverlay) return
  const track = editorOverlay.querySelector<HTMLSelectElement>('.me-track')!.value as keyof typeof TOPICS_BY_TRACK
  const select = editorOverlay.querySelector<HTMLSelectElement>('.me-topic')!
  select.innerHTML = '<option value="">Без теми</option>' + (TOPICS_BY_TRACK[track] ?? [])
    .map(topic => `<option value="${esc(topic)}">${esc(TOPIC_LABELS[topic] ?? topic)}</option>`).join('')
  select.value = selected
}

async function loadEditorQuestions() {
  if (!editorOverlay) return
  const grade = Number(editorOverlay.querySelector<HTMLSelectElement>('.me-grade')!.value)
  const track = editorOverlay.querySelector<HTMLSelectElement>('.me-track')!.value
  const { questions } = await getAdminQuestions({ grade, track, status: 'published' })
  availableQuestions = questions
  renderSetRows()
}

function renderSetRows() {
  if (!editorOverlay) return
  const list = editorOverlay.querySelector<HTMLElement>('.mission-set-list')!
  list.innerHTML = ''
  workingSets.forEach((set, setIndex) => {
    const block = document.createElement('fieldset')
    block.className = 'lf-block mission-set-block'
    block.innerHTML = `
      <div class="adm-form-grid adm-form-grid--4">
        <div><label class="adm-label">ID набору</label><input class="adm-input adm-input--sm adm-input--code ms-id" value="${esc(set.id)}"></div>
        <div><label class="adm-label">Роль</label><select class="adm-input adm-input--sm ms-purpose"><option value="practice">practice</option><option value="apply">apply</option><option value="confirm">confirm</option></select></div>
        <div><label class="adm-label">Варіант</label><select class="adm-input adm-input--sm ms-variant"><option value="default">default</option><option value="a">A</option><option value="b">B</option></select></div>
        <div><button type="button" class="btn-adm-ghost ms-remove">Видалити набір</button></div>
      </div>
      <p class="question-item__meta">Вибрано: <span class="ms-count">${set.questionIds.length}</span></p>
      <div class="mission-question-grid"></div>`
    block.querySelector<HTMLSelectElement>('.ms-purpose')!.value = set.purpose
    block.querySelector<HTMLSelectElement>('.ms-variant')!.value = set.variant
    block.querySelector<HTMLInputElement>('.ms-id')!.addEventListener('input', event => { set.id = (event.target as HTMLInputElement).value })
    block.querySelector<HTMLSelectElement>('.ms-purpose')!.addEventListener('change', event => { set.purpose = (event.target as HTMLSelectElement).value as AdminMissionQuestionSet['purpose'] })
    block.querySelector<HTMLSelectElement>('.ms-variant')!.addEventListener('change', event => { set.variant = (event.target as HTMLSelectElement).value as AdminMissionQuestionSet['variant'] })
    block.querySelector<HTMLButtonElement>('.ms-remove')!.addEventListener('click', () => { workingSets.splice(setIndex, 1); renderSetRows() })
    const grid = block.querySelector<HTMLElement>('.mission-question-grid')!
    for (const question of availableQuestions) {
      const label = document.createElement('label')
      label.className = 'mission-question-option'
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'; checkbox.value = question.id; checkbox.checked = set.questionIds.includes(question.id)
      checkbox.addEventListener('change', () => {
        set.questionIds = checkbox.checked ? [...set.questionIds, question.id] : set.questionIds.filter(id => id !== question.id)
        block.querySelector<HTMLElement>('.ms-count')!.textContent = String(set.questionIds.length)
      })
      const text = document.createElement('span')
      text.textContent = `${question.q} (${question.difficulty ?? '—'})`
      label.append(checkbox, text); grid.appendChild(label)
    }
    list.appendChild(block)
  })
}

function collectMission(): AdminQuestionSetMissionInput {
  if (!editorOverlay) throw new Error('Редактор закрито')
  const config: AdminQuestionSetMissionInput['config'] = { questionSets: workingSets.map(set => ({ ...set, questionIds: [...set.questionIds] })) }
  const topic = editorOverlay.querySelector<HTMLSelectElement>('.me-topic')!.value
  const difficulty = editorOverlay.querySelector<HTMLSelectElement>('.me-difficulty')!.value
  if (topic) config.topic = topic
  if (difficulty) config.difficulty = difficulty as NonNullable<AdminQuestionSetMissionInput['config']['difficulty']>
  return {
    id: editorMission?.id ?? editorOverlay.querySelector<HTMLInputElement>('.me-id')!.value.trim(),
    title: editorOverlay.querySelector<HTMLInputElement>('.me-title')!.value.trim(), kind: 'question-set',
    track: editorOverlay.querySelector<HTMLSelectElement>('.me-track')!.value as AdminQuestionSetMissionInput['track'],
    grade: Number(editorOverlay.querySelector<HTMLSelectElement>('.me-grade')!.value), config,
  }
}

function previewComposition() {
  const allIds = workingSets.flatMap(set => set.questionIds)
  const overlap = allIds.length - new Set(allIds).size
  const summary = workingSets.map(set => `${set.id}: ${set.purpose}/${set.variant} — ${set.questionIds.length}`).join('\n')
  showModal(`${summary || 'Наборів немає'}\n\nПеретинів: ${overlap}`)
}

async function saveMission() {
  if (!editorOverlay) return
  const error = editorOverlay.querySelector<HTMLElement>('.me-error')!
  const save = editorOverlay.querySelector<HTMLButtonElement>('.me-save')!
  error.textContent = ''; save.disabled = true
  try {
    const data = collectMission()
    if (editorMission) await updateAdminMission(editorMission.id, { ...data, expectedEditVersion: editorMission.editVersion ?? 1 })
    else await createAdminMission(data)
    closeEditor(); await loadMissionsTab(); void refreshContentDeliveryBanner()
  } catch (err) { error.textContent = (err as Error).message }
  finally { save.disabled = false }
}

function closeEditor() {
  editorTrapRemove?.(); editorTrapRemove = null; editorOverlay?.remove(); editorOverlay = null; editorMission = null
}

const SORTING_FALLBACKS: Record<string, { gameKey: string; levels: SortingLevel[] }> = {
  'game-sorting-attributes-grade1': { gameKey: 'attributes', levels: SORTING_ATTRIBUTES_LEVELS },
  'game-sorting-information-grade1': { gameKey: 'infosort', levels: INFO_SORT_LEVELS },
  'game-multisort-attributes-grade2': { gameKey: 'multisort', levels: MULTISORT_LEVELS },
}
let sortingLevels: AdminSortingLevel[] = []

function blankSortingLevel(): AdminSortingLevel {
  return {
    instruction: 'Розклади предмети по кошиках',
    bins: [{ id: 'first', label: 'Перша група' }, { id: 'second', label: 'Друга група' }],
    items: [{ emoji: '1️⃣', label: 'Перший предмет', bin: 'first' }, { emoji: '2️⃣', label: 'Другий предмет', bin: 'second' }],
  }
}

function cloneSortingLevels(levels: SortingLevel[] | AdminSortingLevel[]): AdminSortingLevel[] {
  return JSON.parse(JSON.stringify(levels)) as AdminSortingLevel[]
}

function openSortingEditor(mission: Mission | null) {
  editorMission = mission
  const config = mission?.config ?? {}
  const fallback = mission ? SORTING_FALLBACKS[mission.id] : undefined
  const storedLevels = Array.isArray(config.levels) && config.levels.every(level => {
    const value = level as Record<string, unknown>
    return Array.isArray(value.bins) && Array.isArray(value.items)
  }) ? config.levels as unknown as AdminSortingLevel[] : null
  sortingLevels = storedLevels ? cloneSortingLevels(storedLevels) : fallback ? cloneSortingLevels(fallback.levels) : [blankSortingLevel()]
  const inferredGameKey = typeof config.gameKey === 'string' ? config.gameKey : fallback?.gameKey ?? ''
  editorOverlay = document.createElement('div')
  editorOverlay.className = 'admin-modal-overlay'
  editorOverlay.setAttribute('role', 'dialog')
  editorOverlay.setAttribute('aria-modal', 'true')
  editorOverlay.setAttribute('aria-labelledby', 'sorting-editor-title')
  editorOverlay.innerHTML = `
    <div class="admin-modal-card mission-editor-card">
      <div class="admin-section-header"><h3 id="sorting-editor-title" class="admin-section-title">${mission ? 'Редагувати гру-сортування' : 'Нова гра-сортування'}</h3>
        <button type="button" class="btn-adm-ghost se-close">Закрити</button></div>
      ${fallback && !storedLevels ? '<p class="admin-section-note">Повний вміст імпортовано з поточного вбудованого пакета. Після збереження ним можна керувати через історію та публікацію.</p>' : ''}
      <form class="sorting-editor-form qf-space" novalidate>
        <div class="adm-form-grid adm-form-grid--4">
          <div><label class="adm-label">ID</label><input aria-label="ID гри" class="adm-input adm-input--sm adm-input--code se-id" value="${esc(mission?.id ?? '')}" ${mission ? 'disabled' : ''}></div>
          <div><label class="adm-label">Назва</label><input aria-label="Назва гри" class="adm-input adm-input--sm se-title" value="${esc(mission?.title ?? '')}"></div>
          <div><label class="adm-label">Клас</label><select aria-label="Клас гри" class="adm-input adm-input--sm se-grade">${[1,2,3,4].map(g => `<option value="${g}" ${mission?.grade === g ? 'selected' : ''}>${g} клас</option>`).join('')}</select></div>
          <div><label class="adm-label">Напрям</label><select aria-label="Напрям гри" class="adm-input adm-input--sm se-track">${Object.entries(TRACK_LABELS).map(([value,label]) => `<option value="${value}" ${mission?.track === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
          <div><label class="adm-label">Ключ гри</label><input aria-label="Ключ гри" class="adm-input adm-input--sm adm-input--code se-key" value="${esc(inferredGameKey)}"></div>
          <div><label class="adm-label">Тема</label><input aria-label="Тема гри" class="adm-input adm-input--sm se-topic" value="${esc(typeof config.topic === 'string' ? config.topic : '')}"></div>
          <div><label class="adm-label">Концепт</label><input aria-label="Концепт гри" class="adm-input adm-input--sm se-concept" value="${esc(typeof config.conceptKey === 'string' ? config.conceptKey : '')}"></div>
        </div>
        <div class="admin-section-header"><span class="adm-label">Рівні гри</span><button type="button" class="btn-adm-ghost se-add-level">Додати рівень</button></div>
        <p class="admin-section-note">Кошики: один рядок <code>id | назва</code>. Предмети: <code>символ | підпис | id кошика</code>.</p>
        <div class="sorting-level-list qf-space"></div>
        <p class="adm-form-error se-error" role="alert"></p>
        <div class="adm-form-actions"><button type="submit" class="btn-adm-emerald se-save">Зберегти чернетку</button><button type="button" class="btn-adm-violet se-check">Перевірити склад</button></div>
      </form>
    </div>`
  document.body.appendChild(editorOverlay)
  renderSortingLevels()
  editorOverlay.querySelector<HTMLButtonElement>('.se-close')!.addEventListener('click', closeEditor)
  editorOverlay.querySelector<HTMLButtonElement>('.se-add-level')!.addEventListener('click', () => { sortingLevels.push(blankSortingLevel()); renderSortingLevels() })
  editorOverlay.querySelector<HTMLButtonElement>('.se-check')!.addEventListener('click', () => {
    try {
      collectSortingMission()
      showModal(`${sortingLevels.length} рівнів · ${sortingLevels.reduce((sum, level) => sum + level.items.length, 0)} предметів · структура коректна`)
    } catch (err) { showModal((err as Error).message) }
  })
  editorOverlay.querySelector<HTMLFormElement>('.sorting-editor-form')!.addEventListener('submit', event => { event.preventDefault(); void saveSortingMission() })
  editorTrapRemove = createFocusTrap(editorOverlay, closeEditor)
}

function sortingLines(rows: string[][]): string {
  return rows.map(row => row.join(' | ')).join('\n')
}

function renderSortingLevels() {
  if (!editorOverlay) return
  const list = editorOverlay.querySelector<HTMLElement>('.sorting-level-list')!
  list.innerHTML = ''
  sortingLevels.forEach((level, index) => {
    const block = document.createElement('fieldset')
    block.className = 'lf-block sorting-level-block'
    block.innerHTML = `
      <div class="admin-section-header"><strong>Рівень ${index + 1}</strong><button type="button" class="btn-adm-ghost sl-remove">Видалити</button></div>
      <div><label class="adm-label">Інструкція</label><input aria-label="Інструкція рівня ${index + 1}" class="adm-input adm-input--sm sl-instruction" value="${esc(level.instruction)}"></div>
      <div class="sorting-level-columns">
        <div><label class="adm-label">Кошики</label><textarea aria-label="Кошики рівня ${index + 1}" class="adm-input sl-bins" rows="6">${esc(sortingLines(level.bins.map(bin => [bin.id, bin.label])))}</textarea></div>
        <div><label class="adm-label">Предмети</label><textarea aria-label="Предмети рівня ${index + 1}" class="adm-input sl-items" rows="8">${esc(sortingLines(level.items.map(item => [item.emoji, item.label ?? '', item.bin])))}</textarea></div>
      </div>`
    block.querySelector<HTMLButtonElement>('.sl-remove')!.addEventListener('click', () => { sortingLevels.splice(index, 1); renderSortingLevels() })
    list.appendChild(block)
  })
}

function parseSortingRows(value: string, fields: number, label: string): string[][] {
  const rows = value.split(/\r?\n/).map(row => row.trim()).filter(Boolean).map(row => row.split('|').map(cell => cell.trim()))
  if (!rows.length || rows.some(row => row.length !== fields || row.some((cell, index) => !cell && !(fields === 3 && index === 1)))) {
    throw new Error(`${label}: перевір формат рядків і порожні значення`)
  }
  return rows
}

function collectSortingMission(): AdminSortingMissionInput {
  if (!editorOverlay) throw new Error('Редактор закрито')
  const blocks = [...editorOverlay.querySelectorAll<HTMLElement>('.sorting-level-block')]
  if (!blocks.length) throw new Error('Додай хоча б один рівень')
  sortingLevels = blocks.map((block, index) => ({
    instruction: block.querySelector<HTMLInputElement>('.sl-instruction')!.value.trim(),
    bins: parseSortingRows(block.querySelector<HTMLTextAreaElement>('.sl-bins')!.value, 2, `Рівень ${index + 1}, кошики`)
      .map(([id, label]) => ({ id, label })),
    items: parseSortingRows(block.querySelector<HTMLTextAreaElement>('.sl-items')!.value, 3, `Рівень ${index + 1}, предмети`)
      .map(([emoji, label, bin]) => ({ emoji, ...(label ? { label } : {}), bin })),
  }))
  const config: AdminSortingMissionInput['config'] = {
    gameKey: editorOverlay.querySelector<HTMLInputElement>('.se-key')!.value.trim(), levels: sortingLevels,
  }
  const topic = editorOverlay.querySelector<HTMLInputElement>('.se-topic')!.value.trim()
  const conceptKey = editorOverlay.querySelector<HTMLInputElement>('.se-concept')!.value.trim()
  if (topic) config.topic = topic
  if (conceptKey) config.conceptKey = conceptKey
  return {
    id: editorMission?.id ?? editorOverlay.querySelector<HTMLInputElement>('.se-id')!.value.trim(),
    title: editorOverlay.querySelector<HTMLInputElement>('.se-title')!.value.trim(), kind: 'sorting-game',
    track: editorOverlay.querySelector<HTMLSelectElement>('.se-track')!.value as AdminSortingMissionInput['track'],
    grade: Number(editorOverlay.querySelector<HTMLSelectElement>('.se-grade')!.value), config,
  }
}

async function saveSortingMission() {
  if (!editorOverlay) return
  const error = editorOverlay.querySelector<HTMLElement>('.se-error')!
  const save = editorOverlay.querySelector<HTMLButtonElement>('.se-save')!
  error.textContent = ''; save.disabled = true
  try {
    const data = collectSortingMission()
    if (editorMission) await updateAdminMission(editorMission.id, { ...data, expectedEditVersion: editorMission.editVersion ?? 1 })
    else await createAdminMission(data)
    closeEditor(); await loadMissionsTab(); void refreshContentDeliveryBanner()
  } catch (err) { error.textContent = (err as Error).message }
  finally { save.disabled = false }
}

type NarrativeKind = 'sequence-game' | 'scenario-game' | 'fact-opinion-game' | 'click-trainer-game'
let narrativeKind: NarrativeKind = 'sequence-game'
let sequenceSets: AdminSequenceSet[] = []
let scenarioItems: AdminScenarioItem[] = []
let factOpinionStatements: AdminFactOpinionStatement[] = []
let clickTrainerRounds: AdminClickTrainerRound[] = []

const NARRATIVE_DEFAULTS: Record<NarrativeKind, { key: string; title: string; heading: string; sectionLabel: string }> = {
  'sequence-game': { key: 'algorithms-g2', title: 'Гра: Упорядкуй кроки', heading: 'Редактор гри «Упорядкуй кроки»', sectionLabel: 'Набори кроків' },
  'scenario-game': { key: 'digital-safety', title: 'Гра: Як вчинити?', heading: 'Редактор ситуаційної гри', sectionLabel: 'Ситуації' },
  'fact-opinion-game': { key: 'level1', title: 'Гра: Факт чи думка?', heading: 'Редактор гри «Факт чи думка»', sectionLabel: 'Твердження' },
  'click-trainer-game': { key: 'computer-parts', title: 'Тренажер: Клацни правильну картку', heading: 'Редактор клік-тренажера', sectionLabel: 'Раунди' },
}

function openNarrativeEditor(mission: Mission | null, kind: NarrativeKind) {
  editorMission = mission
  narrativeKind = kind
  const config = mission?.config ?? {}
  const sequenceStored = Array.isArray(config.sets) ? config.sets as unknown as AdminSequenceSet[] : null
  const scenarioStored = Array.isArray(config.items) ? config.items as unknown as AdminScenarioItem[] : null
  const factOpinionStored = Array.isArray(config.statements) ? config.statements as unknown as AdminFactOpinionStatement[] : null
  const clickTrainerStored = Array.isArray(config.rounds) ? config.rounds as unknown as AdminClickTrainerRound[] : null
  sequenceSets = cloneData(sequenceStored ?? SEQUENCE_SETS_G2)
  scenarioItems = cloneData(scenarioStored ?? SCENARIOS_DIGITAL_SAFETY)
  factOpinionStatements = cloneData(factOpinionStored
    ?? (config.gameKey === 'level2' ? FO_LEVEL2_STATEMENTS : FO_LEVEL1_STATEMENTS) as AdminFactOpinionStatement[])
  clickTrainerRounds = cloneData(clickTrainerStored ?? CLICK_TRAINER_COMPUTER_PARTS as AdminClickTrainerRound[])
  const legacyImport = mission && ((kind === 'sequence-game' && !sequenceStored) || (kind === 'scenario-game' && !scenarioStored)
    || (kind === 'fact-opinion-game' && !factOpinionStored) || (kind === 'click-trainer-game' && !clickTrainerStored))
  const defaultKey = mission && kind === 'fact-opinion-game' && config.gameKey === 'level2' ? 'level2' : NARRATIVE_DEFAULTS[kind].key
  const defaultTitle = NARRATIVE_DEFAULTS[kind].title
  editorOverlay = document.createElement('div')
  editorOverlay.className = 'admin-modal-overlay'
  editorOverlay.setAttribute('role', 'dialog')
  editorOverlay.setAttribute('aria-modal', 'true')
  editorOverlay.setAttribute('aria-labelledby', 'narrative-editor-title')
  editorOverlay.innerHTML = `
    <div class="admin-modal-card mission-editor-card">
      <div class="admin-section-header"><h3 id="narrative-editor-title" class="admin-section-title">${NARRATIVE_DEFAULTS[kind].heading}</h3>
        <button type="button" class="btn-adm-ghost ne-close">Закрити</button></div>
      ${legacyImport ? '<p class="admin-section-note">Повний чинний вміст імпортовано з вбудованого пакета. Збережи його як чернетку, перевір і опублікуй.</p>' : ''}
      <form class="narrative-editor-form qf-space" novalidate>
        <div class="adm-form-grid adm-form-grid--4">
          <div><label class="adm-label">ID</label><input aria-label="ID гри" class="adm-input adm-input--sm adm-input--code ne-id" value="${esc(mission?.id ?? '')}" ${mission ? 'disabled' : ''}></div>
          <div><label class="adm-label">Назва</label><input aria-label="Назва гри" class="adm-input adm-input--sm ne-title" value="${esc(mission?.title ?? defaultTitle)}"></div>
          <div><label class="adm-label">Клас</label><select aria-label="Клас гри" class="adm-input adm-input--sm ne-grade">${[1,2,3,4].map(g => `<option value="${g}" ${mission?.grade === g || (!mission && g === 2) ? 'selected' : ''}>${g} клас</option>`).join('')}</select></div>
          <div><label class="adm-label">Напрям</label><select aria-label="Напрям гри" class="adm-input adm-input--sm ne-track">${Object.entries(TRACK_LABELS).map(([value,label]) => `<option value="${value}" ${mission?.track === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
          <div><label class="adm-label">Ключ гри</label><input aria-label="Ключ гри" class="adm-input adm-input--sm adm-input--code ne-key" value="${esc(typeof config.gameKey === 'string' ? config.gameKey : defaultKey)}"></div>
          <div><label class="adm-label">Тема</label><input aria-label="Тема гри" class="adm-input adm-input--sm ne-topic" value="${esc(typeof config.topic === 'string' ? config.topic : '')}"></div>
        </div>
        <div class="admin-section-header"><span class="adm-label">${NARRATIVE_DEFAULTS[kind].sectionLabel}</span><button type="button" class="btn-adm-ghost ne-add">Додати</button></div>
        <div class="narrative-item-list qf-space"></div>
        <p class="adm-form-error ne-error" role="alert"></p>
        <div class="adm-form-actions"><button type="submit" class="btn-adm-emerald ne-save">Зберегти чернетку</button><button type="button" class="btn-adm-violet ne-check">Перевірити склад</button></div>
      </form>
    </div>`
  document.body.appendChild(editorOverlay)
  renderNarrativeItems()
  editorOverlay.querySelector<HTMLButtonElement>('.ne-close')!.addEventListener('click', closeEditor)
  editorOverlay.querySelector<HTMLButtonElement>('.ne-add')!.addEventListener('click', () => {
    if (narrativeKind === 'sequence-game') sequenceSets.push({ id: `set-${sequenceSets.length + 1}`, title: 'Новий набір', steps: ['Перший крок', 'Другий крок', 'Третій крок'] })
    else if (narrativeKind === 'fact-opinion-game') factOpinionStatements.push({
      id: `statement-${factOpinionStatements.length + 1}`, category: 'fact',
      text: 'Нове твердження', explanation: 'Поясни дитині, чому це так.',
    })
    else if (narrativeKind === 'click-trainer-game') clickTrainerRounds.push({
      lead: 'Знайди потрібну картку.', target: { label: 'Покажи предмет', emoji: '🎯' },
      options: [
        { label: 'правильна картка', emoji: '✅', correct: true, feedback: 'Так, це вона.' },
        { label: 'інша картка', emoji: '❌', correct: false, feedback: 'Це не та картка. Спробуй ще раз.' },
      ],
    })
    else scenarioItems.push({ id: `scenario-${scenarioItems.length + 1}`, emoji: '💬', text: 'Опиши ситуацію', options: [
      { label: 'Правильна дія', correct: true, feedback: 'Так, це правильна дія.' },
      { label: 'Неправильна дія', correct: false, feedback: 'Спробуй обрати безпечнішу дію.' },
    ] })
    renderNarrativeItems()
  })
  editorOverlay.querySelector<HTMLButtonElement>('.ne-check')!.addEventListener('click', () => {
    try {
      const value = collectNarrativeMission()
      const count = value.kind === 'sequence-game' ? value.config.sets.length
        : value.kind === 'fact-opinion-game' ? value.config.statements.length
        : value.kind === 'click-trainer-game' ? value.config.rounds.length : value.config.items.length
      const noun = value.kind === 'sequence-game' ? 'наборів' : value.kind === 'fact-opinion-game' ? 'тверджень'
        : value.kind === 'click-trainer-game' ? 'раундів' : 'ситуацій'
      showModal(`${count} ${noun} · структура коректна`)
    } catch (err) { showModal((err as Error).message) }
  })
  editorOverlay.querySelector<HTMLFormElement>('.narrative-editor-form')!.addEventListener('submit', event => { event.preventDefault(); void saveNarrativeMission() })
  editorTrapRemove = createFocusTrap(editorOverlay, closeEditor)
}

function cloneData<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }

function renderNarrativeItems() {
  if (!editorOverlay) return
  const list = editorOverlay.querySelector<HTMLElement>('.narrative-item-list')!
  list.innerHTML = ''
  const count = narrativeKind === 'sequence-game' ? sequenceSets.length
    : narrativeKind === 'fact-opinion-game' ? factOpinionStatements.length
    : narrativeKind === 'click-trainer-game' ? clickTrainerRounds.length : scenarioItems.length
  for (let index = 0; index < count; index++) {
    const block = document.createElement('fieldset')
    block.className = 'lf-block narrative-item-block'
    if (narrativeKind === 'click-trainer-game') {
      const round = clickTrainerRounds[index]
      block.innerHTML = `<div class="admin-section-header"><strong>Раунд ${index + 1}</strong><button type="button" class="btn-adm-ghost ni-remove">Видалити</button></div>
        <div><label class="adm-label">Підказка дитині</label><input aria-label="Підказка раунду ${index + 1}" class="adm-input adm-input--sm ni-lead" value="${esc(round.lead)}"></div>
        <div class="adm-form-grid">
          <div><label class="adm-label">Ціль — назва</label><input aria-label="Назва цілі раунду ${index + 1}" class="adm-input adm-input--sm ni-target-label" value="${esc(round.target.label)}"></div>
          <div><label class="adm-label">Ціль — символ</label><input aria-label="Символ цілі раунду ${index + 1}" class="adm-input adm-input--sm ni-target-emoji" value="${esc(round.target.emoji)}"></div>
        </div>
        <div><label class="adm-label">Картки: <code>так/ні | символ | підпис | фідбек</code></label><textarea aria-label="Картки раунду ${index + 1}" class="adm-input ni-lines" rows="6">${esc(round.options.map(option => `${option.correct ? 'так' : 'ні'} | ${option.emoji} | ${option.label} | ${option.feedback}`).join('\n'))}</textarea></div>`
    } else if (narrativeKind === 'fact-opinion-game') {
      const statement = factOpinionStatements[index]
      block.innerHTML = `<div class="admin-section-header"><strong>Твердження ${index + 1}</strong><button type="button" class="btn-adm-ghost ni-remove">Видалити</button></div>
        <div class="adm-form-grid adm-form-grid--4">
          <div><label class="adm-label">ID</label><input aria-label="ID твердження ${index + 1}" class="adm-input adm-input--sm adm-input--code ni-id" value="${esc(statement.id)}"></div>
          <div><label class="adm-label">Категорія</label><select aria-label="Категорія твердження ${index + 1}" class="adm-input adm-input--sm ni-category">${FO_CATEGORY_OPTIONS.map(option => `<option value="${option.value}">${option.label}</option>`).join('')}</select></div>
          <div><label class="adm-label">Мова джерела</label><select aria-label="Мова джерела твердження ${index + 1}" class="adm-input adm-input--sm ni-lang"><option value="">—</option><option value="uk">українська</option><option value="en">англійська</option></select></div>
        </div>
        <div><label class="adm-label">Твердження</label><textarea aria-label="Текст твердження ${index + 1}" class="adm-input ni-text" rows="2">${esc(statement.text)}</textarea></div>
        <div><label class="adm-label">Пояснення для дитини</label><textarea aria-label="Пояснення твердження ${index + 1}" class="adm-input ni-explanation" rows="2">${esc(statement.explanation)}</textarea></div>
        <div class="adm-form-grid">
          <div><label class="adm-label">Джерело — назва</label><input aria-label="Назва джерела твердження ${index + 1}" class="adm-input adm-input--sm ni-source-title" value="${esc(statement.sourceTitle ?? '')}"></div>
          <div><label class="adm-label">Джерело — https-посилання</label><input aria-label="Посилання джерела твердження ${index + 1}" class="adm-input adm-input--sm ni-source-url" value="${esc(statement.sourceUrl ?? '')}"></div>
        </div>`
      block.querySelector<HTMLSelectElement>('.ni-category')!.value = statement.category
      block.querySelector<HTMLSelectElement>('.ni-lang')!.value = statement.sourceLanguage ?? ''
      const bind = (selector: string, apply: (value: string) => void) => {
        const control = block.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector)!
        control.addEventListener('input', () => { apply(control.value) })
      }
      bind('.ni-id', value => { statement.id = value })
      bind('.ni-category', value => { statement.category = value as AdminFactOpinionStatement['category'] })
      bind('.ni-text', value => { statement.text = value })
      bind('.ni-explanation', value => { statement.explanation = value })
      bind('.ni-source-title', value => { statement.sourceTitle = value })
      bind('.ni-source-url', value => { statement.sourceUrl = value })
      bind('.ni-lang', value => {
        if (value === 'uk' || value === 'en') statement.sourceLanguage = value
        else delete statement.sourceLanguage
      })
    } else if (narrativeKind === 'sequence-game') {
      const set = sequenceSets[index]
      block.innerHTML = `<div class="admin-section-header"><strong>Набір ${index + 1}</strong><button type="button" class="btn-adm-ghost ni-remove">Видалити</button></div>
        <div class="adm-form-grid"><div><label class="adm-label">ID</label><input aria-label="ID набору ${index + 1}" class="adm-input adm-input--sm ni-id" value="${esc(set.id)}"></div>
        <div><label class="adm-label">Назва</label><input aria-label="Назва набору ${index + 1}" class="adm-input adm-input--sm ni-title" value="${esc(set.title)}"></div></div>
        <div><label class="adm-label">Кроки у правильному порядку — один на рядок</label><textarea aria-label="Кроки набору ${index + 1}" class="adm-input ni-lines" rows="6">${esc(set.steps.join('\n'))}</textarea></div>`
    } else {
      const item = scenarioItems[index]
      block.innerHTML = `<div class="admin-section-header"><strong>Ситуація ${index + 1}</strong><button type="button" class="btn-adm-ghost ni-remove">Видалити</button></div>
        <div class="adm-form-grid adm-form-grid--4"><div><label class="adm-label">ID</label><input aria-label="ID ситуації ${index + 1}" class="adm-input adm-input--sm ni-id" value="${esc(item.id)}"></div>
        <div><label class="adm-label">Символ</label><input aria-label="Символ ситуації ${index + 1}" class="adm-input adm-input--sm ni-emoji" value="${esc(item.emoji)}"></div></div>
        <div><label class="adm-label">Текст ситуації</label><textarea aria-label="Текст ситуації ${index + 1}" class="adm-input ni-text" rows="3">${esc(item.text)}</textarea></div>
        <div><label class="adm-label">Варіанти: <code>так/ні | відповідь | фідбек</code></label><textarea aria-label="Варіанти ситуації ${index + 1}" class="adm-input ni-lines" rows="7">${esc(item.options.map(option => `${option.correct ? 'так' : 'ні'} | ${option.label} | ${option.feedback}`).join('\n'))}</textarea></div>`
    }
    block.querySelector<HTMLButtonElement>('.ni-remove')!.addEventListener('click', () => {
      if (narrativeKind === 'sequence-game') sequenceSets.splice(index, 1)
      else if (narrativeKind === 'fact-opinion-game') factOpinionStatements.splice(index, 1)
      else if (narrativeKind === 'click-trainer-game') clickTrainerRounds.splice(index, 1)
      else scenarioItems.splice(index, 1)
      renderNarrativeItems()
    })
    list.appendChild(block)
  }
}

function nonEmptyLines(value: string, label: string): string[] {
  const lines = value.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (!lines.length) throw new Error(`${label}: додай хоча б один рядок`)
  return lines
}

function collectNarrativeMission(): AdminSequenceMissionInput | AdminScenarioMissionInput | AdminFactOpinionMissionInput | AdminClickTrainerMissionInput {
  if (!editorOverlay) throw new Error('Редактор закрито')
  const common = {
    id: editorMission?.id ?? editorOverlay.querySelector<HTMLInputElement>('.ne-id')!.value.trim(),
    title: editorOverlay.querySelector<HTMLInputElement>('.ne-title')!.value.trim(),
    track: editorOverlay.querySelector<HTMLSelectElement>('.ne-track')!.value as AdminSequenceMissionInput['track'],
    grade: Number(editorOverlay.querySelector<HTMLSelectElement>('.ne-grade')!.value),
  }
  const gameKey = editorOverlay.querySelector<HTMLInputElement>('.ne-key')!.value.trim()
  const topic = editorOverlay.querySelector<HTMLInputElement>('.ne-topic')!.value.trim()
  const blocks = [...editorOverlay.querySelectorAll<HTMLElement>('.narrative-item-block')]
  if (narrativeKind === 'click-trainer-game') {
    const rounds = blocks.map((block, index) => ({
      lead: block.querySelector<HTMLInputElement>('.ni-lead')!.value.trim(),
      target: {
        label: block.querySelector<HTMLInputElement>('.ni-target-label')!.value.trim(),
        emoji: block.querySelector<HTMLInputElement>('.ni-target-emoji')!.value.trim(),
      },
      options: nonEmptyLines(block.querySelector<HTMLTextAreaElement>('.ni-lines')!.value, `Раунд ${index + 1}`).map(line => {
        const parts = line.split('|').map(part => part.trim())
        if (parts.length !== 4 || !['так', 'ні'].includes(parts[0].toLocaleLowerCase('uk-UA')) || !parts[1] || !parts[2] || !parts[3]) {
          throw new Error(`Раунд ${index + 1}: формат картки — так/ні | символ | підпис | фідбек`)
        }
        return { correct: parts[0].toLocaleLowerCase('uk-UA') === 'так', emoji: parts[1], label: parts[2], feedback: parts[3] }
      }),
    }))
    return { ...common, kind: 'click-trainer-game', config: { gameKey, ...(topic ? { topic } : {}), rounds } }
  }
  if (narrativeKind === 'fact-opinion-game') {
    const statements = factOpinionStatements.map(statement => ({
      id: statement.id.trim(),
      category: statement.category,
      text: statement.text.trim(),
      explanation: statement.explanation.trim(),
      ...(statement.sourceTitle?.trim() ? { sourceTitle: statement.sourceTitle.trim() } : {}),
      ...(statement.sourceUrl?.trim() ? { sourceUrl: statement.sourceUrl.trim() } : {}),
      ...(statement.sourceLanguage ? { sourceLanguage: statement.sourceLanguage } : {}),
    }))
    return { ...common, kind: 'fact-opinion-game', config: { gameKey, ...(topic ? { topic } : {}), statements } }
  }
  if (narrativeKind === 'sequence-game') {
    const sets = blocks.map((block, index) => ({
      id: block.querySelector<HTMLInputElement>('.ni-id')!.value.trim(),
      title: block.querySelector<HTMLInputElement>('.ni-title')!.value.trim(),
      steps: nonEmptyLines(block.querySelector<HTMLTextAreaElement>('.ni-lines')!.value, `Набір ${index + 1}`),
    }))
    return { ...common, kind: 'sequence-game', config: { gameKey, ...(topic ? { topic } : {}), sets } }
  }
  const items = blocks.map((block, index) => ({
    id: block.querySelector<HTMLInputElement>('.ni-id')!.value.trim(),
    emoji: block.querySelector<HTMLInputElement>('.ni-emoji')!.value.trim(),
    text: block.querySelector<HTMLTextAreaElement>('.ni-text')!.value.trim(),
    options: nonEmptyLines(block.querySelector<HTMLTextAreaElement>('.ni-lines')!.value, `Ситуація ${index + 1}`).map(line => {
      const parts = line.split('|').map(part => part.trim())
      if (parts.length !== 3 || !['так', 'ні'].includes(parts[0].toLocaleLowerCase('uk-UA')) || !parts[1] || !parts[2]) {
        throw new Error(`Ситуація ${index + 1}: формат варіанта — так/ні | відповідь | фідбек`)
      }
      return { correct: parts[0].toLocaleLowerCase('uk-UA') === 'так', label: parts[1], feedback: parts[2] }
    }),
  }))
  return { ...common, kind: 'scenario-game', config: { gameKey, ...(topic ? { topic } : {}), items } }
}

async function saveNarrativeMission() {
  if (!editorOverlay) return
  const error = editorOverlay.querySelector<HTMLElement>('.ne-error')!
  const save = editorOverlay.querySelector<HTMLButtonElement>('.ne-save')!
  error.textContent = ''; save.disabled = true
  try {
    const data = collectNarrativeMission()
    if (editorMission) await updateAdminMission(editorMission.id, { ...data, expectedEditVersion: editorMission.editVersion ?? 1 })
    else await createAdminMission(data)
    closeEditor(); await loadMissionsTab(); void refreshContentDeliveryBanner()
  } catch (err) { error.textContent = (err as Error).message }
  finally { save.disabled = false }
}

let simulatorNodes: AdminSimulatorNode[] = []
let simulatorScenarioKey = 'assembly-hardware'

function simulatorScenario() {
  return simulatorScenarioKey === 'assembly-software' ? SOFTWARE_SCENARIO : HARDWARE_SCENARIO
}

function resetSimulatorNodes() {
  simulatorNodes = cloneData(defaultSimulatorPack(simulatorScenario()).nodes)
}

function openSimulatorEditor(mission: Mission | null) {
  editorMission = mission
  const config = mission?.config ?? {}
  simulatorScenarioKey = typeof config.scenarioKey === 'string' && config.scenarioKey === 'assembly-software'
    ? 'assembly-software' : 'assembly-hardware'
  simulatorNodes = Array.isArray(config.nodes)
    ? cloneData(config.nodes as unknown as AdminSimulatorNode[])
    : cloneData(defaultSimulatorPack(simulatorScenario()).nodes)
  const legacyImport = mission && !Array.isArray(config.nodes)
  editorOverlay = document.createElement('div')
  editorOverlay.className = 'admin-modal-overlay'
  editorOverlay.setAttribute('role', 'dialog')
  editorOverlay.setAttribute('aria-modal', 'true')
  editorOverlay.setAttribute('aria-labelledby', 'simulator-editor-title')
  editorOverlay.innerHTML = `
    <div class="admin-modal-card mission-editor-card">
      <div class="admin-section-header"><h3 id="simulator-editor-title" class="admin-section-title">Редактор симулятора</h3>
        <button type="button" class="btn-adm-ghost sie-close">Закрити</button></div>
      ${legacyImport ? '<p class="admin-section-note">Тексти й переходи імпортовано з чинної механіки. Дії над станом, умови перемоги та помилки залишаються заблокованими в коді.</p>' : ''}
      <form class="simulator-editor-form qf-space" novalidate>
        <div class="adm-form-grid adm-form-grid--4">
          <div><label class="adm-label">ID</label><input aria-label="ID симулятора" class="adm-input adm-input--sm adm-input--code sie-id" value="${esc(mission?.id ?? '')}" ${mission ? 'disabled' : ''}></div>
          <div><label class="adm-label">Назва</label><input aria-label="Назва симулятора" class="adm-input adm-input--sm sie-title" value="${esc(mission?.title ?? simulatorScenario().title)}"></div>
          <div><label class="adm-label">Клас</label><select aria-label="Клас симулятора" class="adm-input adm-input--sm sie-grade">${[1,2,3,4].map(g => `<option value="${g}" ${(mission?.grade ?? (simulatorScenarioKey === 'assembly-software' ? 4 : 2)) === g ? 'selected' : ''}>${g} клас</option>`).join('')}</select></div>
          <div><label class="adm-label">Напрям</label><select aria-label="Напрям симулятора" class="adm-input adm-input--sm sie-track">${Object.entries(TRACK_LABELS).map(([value,label]) => `<option value="${value}" ${(mission?.track ?? 'informatics') === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
          <div><label class="adm-label">Code-owned механіка</label><select aria-label="Механіка симулятора" class="adm-input adm-input--sm sie-scenario" ${mission ? 'disabled' : ''}><option value="assembly-hardware">Збірка ПК</option><option value="assembly-software">Налаштування ОС</option></select></div>
          <div><label class="adm-label">Версія механіки</label><input aria-label="Версія механіки" class="adm-input adm-input--sm" value="1" disabled></div>
          <div><label class="adm-label">Тема</label><input aria-label="Тема симулятора" class="adm-input adm-input--sm sie-topic" value="${esc(typeof config.topic === 'string' ? config.topic : '')}"></div>
        </div>
        <p class="admin-section-note">Редаговані поля: символи, всі текстові варіанти, довідки, підписи дій і дозволені навігаційні переходи. State actions та системні переходи позначені як заблоковані.</p>
        <div class="simulator-node-list qf-space"></div>
        <p class="adm-form-error sie-error" role="alert"></p>
        <div class="adm-form-actions"><button type="submit" class="btn-adm-emerald sie-save">Зберегти чернетку</button><button type="button" class="btn-adm-violet sie-check">Перевірити граф</button></div>
      </form>
    </div>`
  document.body.appendChild(editorOverlay)
  const scenarioSelect = editorOverlay.querySelector<HTMLSelectElement>('.sie-scenario')!
  scenarioSelect.value = simulatorScenarioKey
  scenarioSelect.addEventListener('change', () => {
    simulatorScenarioKey = scenarioSelect.value
    resetSimulatorNodes()
    editorOverlay!.querySelector<HTMLInputElement>('.sie-title')!.value = simulatorScenario().title
    editorOverlay!.querySelector<HTMLSelectElement>('.sie-grade')!.value = simulatorScenarioKey === 'assembly-software' ? '4' : '2'
    renderSimulatorNodes()
  })
  renderSimulatorNodes()
  editorOverlay.querySelector<HTMLButtonElement>('.sie-close')!.addEventListener('click', closeEditor)
  editorOverlay.querySelector<HTMLButtonElement>('.sie-check')!.addEventListener('click', () => {
    const transitions = simulatorNodes.reduce((sum, node) => sum + node.transitions.length, 0)
    showModal(`${simulatorNodes.length} вузлів · ${transitions} переходів · механіка v1 заблокована кодом`)
  })
  editorOverlay.querySelector<HTMLFormElement>('.simulator-editor-form')!.addEventListener('submit', event => { event.preventDefault(); void saveSimulatorMission() })
  editorTrapRemove = createFocusTrap(editorOverlay, closeEditor)
}

function fieldLabel(text: string, control: HTMLElement): HTMLLabelElement {
  const label = document.createElement('label')
  label.className = 'adm-label simulator-field-label'
  label.append(document.createTextNode(text), control)
  return label
}

function renderSimulatorNodes() {
  if (!editorOverlay) return
  const list = editorOverlay.querySelector<HTMLElement>('.simulator-node-list')!
  list.innerHTML = ''
  const allowed = SIMULATOR_ALLOWED_TARGETS[simulatorScenarioKey] ?? {}
  simulatorNodes.forEach((node, nodeIndex) => {
    const block = document.createElement('fieldset')
    block.className = 'lf-block simulator-node-block'
    const legend = document.createElement('legend')
    legend.className = 'adm-label'
    legend.textContent = `Вузол: ${node.id}`
    block.appendChild(legend)
    const header = document.createElement('div')
    header.className = 'adm-form-grid adm-form-grid--4'
    const icon = document.createElement('input')
    icon.className = 'adm-input adm-input--sm'; icon.value = node.icon
    icon.setAttribute('aria-label', `Символ вузла ${node.id}`)
    icon.addEventListener('input', () => { node.icon = icon.value })
    header.appendChild(fieldLabel('Символ', icon))
    block.appendChild(header)
    if (node.info !== undefined) {
      const info = document.createElement('textarea')
      info.className = 'adm-input'; info.rows = 3; info.value = node.info
      info.setAttribute('aria-label', `Довідка вузла ${node.id}`)
      info.addEventListener('input', () => { node.info = info.value })
      block.appendChild(fieldLabel('Довідка «Це цікаво»', info))
    }
    const textTitle = document.createElement('strong'); textTitle.textContent = 'Текстові стани'; block.appendChild(textTitle)
    node.texts.forEach((variant, variantIndex) => {
      const wrap = document.createElement('details'); wrap.className = 'simulator-variant'
      const summary = document.createElement('summary')
      summary.textContent = `Варіант ${variantIndex + 1}: ${variant.source.replace(/\s+/g, ' ').slice(0, 90)}`
      const textarea = document.createElement('textarea')
      textarea.className = 'adm-input'; textarea.rows = 4; textarea.value = variant.value
      textarea.setAttribute('aria-label', `Текст вузла ${node.id}, варіант ${variantIndex + 1}`)
      textarea.addEventListener('input', () => { variant.value = textarea.value })
      wrap.append(summary, textarea); block.appendChild(wrap)
    })
    if (node.transitions.length) {
      const transitionTitle = document.createElement('strong'); transitionTitle.textContent = 'Дії та переходи'; block.appendChild(transitionTitle)
    }
    node.transitions.forEach(transition => {
      const row = document.createElement('div'); row.className = 'simulator-transition'
      const title = document.createElement('span'); title.className = 'adm-label'; title.textContent = transition.slot
      row.appendChild(title)
      transition.labels.forEach((variant, variantIndex) => {
        const input = document.createElement('input')
        input.className = 'adm-input adm-input--sm'; input.value = variant.value
        input.setAttribute('aria-label', `Підпис дії ${node.id}.${transition.slot}, варіант ${variantIndex + 1}`)
        input.addEventListener('input', () => { variant.value = input.value })
        row.appendChild(input)
      })
      const targets = allowed[`${node.id}.${transition.slot}`] ?? []
      if (targets.length) {
        const select = document.createElement('select')
        select.className = 'adm-input adm-input--sm'
        select.setAttribute('aria-label', `Дозволений перехід ${node.id}.${transition.slot}`)
        select.innerHTML = '<option value="">Системний перехід</option>' + targets.map(target => `<option value="${esc(target)}">→ ${esc(target)}</option>`).join('')
        select.value = transition.target ?? ''
        select.addEventListener('change', () => {
          if (select.value) transition.target = select.value
          else delete transition.target
        })
        row.appendChild(select)
      } else {
        const locked = document.createElement('span'); locked.className = 'qi-badge qi-badge--type'; locked.textContent = 'перехід заблоковано механікою'; row.appendChild(locked)
      }
      block.appendChild(row)
    })
    list.appendChild(block)
    void nodeIndex
  })
}

function collectSimulatorMission(): AdminSimulatorMissionInput {
  if (!editorOverlay) throw new Error('Редактор закрито')
  const topic = editorOverlay.querySelector<HTMLInputElement>('.sie-topic')!.value.trim()
  return {
    id: editorMission?.id ?? editorOverlay.querySelector<HTMLInputElement>('.sie-id')!.value.trim(),
    title: editorOverlay.querySelector<HTMLInputElement>('.sie-title')!.value.trim(),
    kind: 'simulator-game',
    track: editorOverlay.querySelector<HTMLSelectElement>('.sie-track')!.value as AdminSimulatorMissionInput['track'],
    grade: Number(editorOverlay.querySelector<HTMLSelectElement>('.sie-grade')!.value),
    config: { scenarioKey: simulatorScenarioKey, mechanicsVersion: 1, ...(topic ? { topic } : {}), nodes: simulatorNodes },
  }
}

async function saveSimulatorMission() {
  if (!editorOverlay) return
  const error = editorOverlay.querySelector<HTMLElement>('.sie-error')!
  const save = editorOverlay.querySelector<HTMLButtonElement>('.sie-save')!
  error.textContent = ''; save.disabled = true
  try {
    const data = collectSimulatorMission()
    if (editorMission) await updateAdminMission(editorMission.id, { ...data, expectedEditVersion: editorMission.editVersion ?? 1 })
    else await createAdminMission(data)
    closeEditor(); await loadMissionsTab(); void refreshContentDeliveryBanner()
  } catch (err) { error.textContent = (err as Error).message }
  finally { save.disabled = false }
}

async function openHistory(mission: Mission) {
  try {
    const { revisions } = await getAdminMissionRevisions(mission.id)
    const overlay = document.createElement('div')
    overlay.className = 'admin-modal-overlay'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', 'Історія місії')
    overlay.innerHTML = '<div class="admin-modal-card question-history-card"><div class="admin-section-header"><h3 class="admin-section-title">Історія місії</h3><button type="button" class="btn-adm-ghost mh-close">Закрити</button></div><div class="admin-list admin-list--sm history-list"></div></div>'
    const list = overlay.querySelector<HTMLElement>('.history-list')!
    for (const revision of revisions) {
      const item = document.createElement('div'); item.className = 'question-item'
      item.innerHTML = `<div class="question-item__left"><p class="question-item__text">Редакція ${revision.editVersion} · ${esc(revision.action)}</p><p class="question-item__meta">${esc(new Date(revision.createdAt).toLocaleString('uk-UA'))}</p></div>${revision.editVersion !== mission.editVersion ? '<button type="button" class="btn-adm-sky btn--sm mh-restore">Відновити</button>' : ''}`
      item.querySelector<HTMLButtonElement>('.mh-restore')?.addEventListener('click', () => {
        close(); showConfirm(`Відновити редакцію ${revision.editVersion} як чернетку?`, async () => {
          try {
            await restoreAdminMissionRevision(mission.id, revision.editVersion, mission.editVersion ?? 1)
            await loadMissionsTab()
            void refreshContentDeliveryBanner()
          }
          catch (err) { showModal((err as Error).message) }
        })
      }); list.appendChild(item)
    }
    document.body.appendChild(overlay)
    let removeTrap: () => void = () => {}; const close = () => { removeTrap(); overlay.remove() }
    removeTrap = createFocusTrap(overlay, close); overlay.querySelector<HTMLButtonElement>('.mh-close')!.addEventListener('click', close)
  } catch (err) { showModal((err as Error).message) }
}
