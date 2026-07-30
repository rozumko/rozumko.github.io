import {
  getAdminQuestions, getAdminQuestionCounts, getAdminQuestionMatrix, getAdminDemoCoverage, updateQuestionChannels,
  createQuestion, updateQuestion, deleteQuestion,
  setQuestionEditorialStatus, setQuestionEditorialStatusBulk, deleteQuestionsBulk,
  getQuestionRevisions, restoreQuestionRevision,
  type AdminDemoCoverageGrade, type AdminOlympiadReadinessIssue,
  type AdminQuestionFilters, type AdminQuestionMatrixCell,
  type Question, type QuestionChannel, type QuestionType,
} from '../../features/api/client.js'
import { createFocusTrap } from '../../utils/focus-trap.js'
import { renderQuestion }  from '../../utils/question-renderer.js'
import { esc, showModal, showConfirm }  from './ui.js'
import { $, $maybe } from '../../utils/dom.js'
import { TOPIC_LABELS, TOPICS_BY_TRACK, fillTopicSelect } from './taxonomy.js'
import { refreshContentDeliveryBanner } from './publication-tab.js'
import { createPager } from './pagination.js'

let currentQuestions: Question[] = []

const pager = createPager({
  hostId: 'questions-pager',
  storageKey: 'admin:questions:page-size',
  noun: 'питань',
  onChange: () => { void loadQuestionsTab() },
})

/** Filters and sections change what the pages contain, so paging starts over
 *  and the selection — which was made against the old list — is dropped. */
function restartList(): void {
  pager.reset()
  clearSelection()
  void loadQuestionsTab()
}

const questionModal = $<HTMLElement>('question-modal')
const questionForm  = $<HTMLFormElement>('question-form')
const qfError       = $('qf-error')
const qfSubmitBtn   = $<HTMLButtonElement>('qf-submit')
const qfPublishBtn  = $<HTMLButtonElement>('qf-submit-publish')
const previewModal  = $<HTMLElement>('preview-modal')

let _qModalTrapRemove: (() => void) | null = null
let _pvTrapRemove:     (() => void) | null = null

const QF_SECTIONS: Record<string, string> = {
  choice:    'qf-section-choice',
  sort:      'qf-section-sort',
  sequence:  'qf-section-sequence',
  match:     'qf-section-match',
  truefalse: 'qf-section-truefalse',
  input:     'qf-section-input',
}

const DIFF_LABELS: Record<string, string> = { easy: 'Легке', medium: 'Середнє', hard: 'Складне' }
const TRACK_LABELS: Record<string, string> = {
  informatics: 'Інформатика',
  'computational-thinking': 'Обчислювальне мислення',
  'ai-basics': 'Основи ШІ',
}
const TYPE_LABELS: Record<QuestionType, string> = {
  choice:    'Вибір',
  truefalse: 'Так/Ні',
  input:     'Введення',
  sort:      'Порядок',
  sequence:  'Послідовність',
  match:     'Пари',
}
const CHANNEL_LABELS: Record<QuestionChannel, string> = {
  class_game: 'Школа — класна гра',
  path: 'Home Club',
  olympiad_training: 'Відкрита практика, демо та Шлях',
}
const CHANNEL_INPUTS: Record<QuestionChannel, string> = {
  class_game: 'qf-channel-class-game',
  path: 'qf-channel-path',
  olympiad_training: 'qf-channel-olympiad-training',
}
const STATUS_LABELS: Record<NonNullable<Question['editorialStatus']>, string> = {
  draft: 'Чернетка', review: 'Готове до публікації', published: 'Опубліковано', archived: 'Знято з публікації',
}
const STATUS_BADGES: Record<NonNullable<Question['editorialStatus']>, string> = {
  draft: 'qi-badge--medium', review: 'qi-badge--type', published: 'qi-badge--easy', archived: 'qi-badge--type',
}

// ─── Delivery section (bank scope) ────────────────────────────────────────────
// The bank always opens on one section instead of one pile. '' means every
// section; 'main_round' and 'unassigned' are not channels — see loadQuestionsTab.
const SECTION_STORAGE_KEY = 'admin_q_section'
let currentSection = ''

function sectionButtons(): HTMLButtonElement[] {
  return [...$('q-filter-section').querySelectorAll<HTMLButtonElement>('[data-section]')]
}

function applySectionUI(): void {
  for (const button of sectionButtons()) {
    button.setAttribute('aria-pressed', String((button.dataset.section ?? '') === currentSection))
  }
}

function restoreSection(): void {
  let stored = ''
  try { stored = localStorage.getItem(SECTION_STORAGE_KEY) ?? '' } catch { /* storage can be blocked */ }
  currentSection = sectionButtons().some(button => (button.dataset.section ?? '') === stored) ? stored : ''
  applySectionUI()
}

function setSection(section: string): void {
  currentSection = section
  try { localStorage.setItem(SECTION_STORAGE_KEY, section) } catch { /* storage can be blocked */ }
  applySectionUI()
}

function selectSection(section: string): void {
  setSection(section)
  restartList()
}

export function focusQuestionInBank(questionId: string, section: 'olympiad_training' | 'main_round'): void {
  $<HTMLInputElement>('q-filter-search').value = questionId
  $<HTMLSelectElement>('q-filter-grade').value = ''
  $<HTMLSelectElement>('q-filter-mechanic').value = ''
  $<HTMLSelectElement>('q-filter-difficulty').value = ''
  $<HTMLSelectElement>('q-filter-track').value = ''
  fillTopicSelect($<HTMLSelectElement>('q-filter-topic'), '', 'Всі теми')
  $<HTMLSelectElement>('q-filter-status').value = ''
  setSection(section)
  pager.reset()
  clearSelection()

  const tab = document.querySelector<HTMLButtonElement>('.admin-tab[data-tab="questions"]')
  if (tab?.classList.contains('tab-active')) void loadQuestionsTab()
  else tab?.click()
}

// Counters are informational: a failure must never hide the list itself.
async function refreshSectionCounts(filters: AdminQuestionFilters): Promise<void> {
  try {
    const { counts } = await getAdminQuestionCounts(filters)
    for (const slot of document.querySelectorAll<HTMLElement>('[data-section-count]')) {
      const key = slot.dataset.sectionCount as keyof typeof counts
      slot.textContent = String(counts[key] ?? 0)
    }
  } catch {
    for (const slot of document.querySelectorAll<HTMLElement>('[data-section-count]')) slot.textContent = ''
  }
}

// The delivery section as the API expresses it: a channel, the main round, or
// "delivered nowhere". Shared by the list and the coverage matrix.
interface SectionQuery {
  isOlympiad?: boolean
  channel?: QuestionChannel
  unassigned?: boolean
}

// ─── Coverage matrix ──────────────────────────────────────────────────────────
// Grade × topic inside the selected section, so an empty cell is a visible gap
// instead of something you have to go looking for.
const MATRIX_GRADES = [1, 2, 3, 4] as const

async function refreshMatrix(filters: AdminQuestionFilters, section: SectionQuery): Promise<void> {
  const panel = $maybe<HTMLDetailsElement>('q-matrix-panel')
  const box = $maybe('q-matrix')
  if (!panel || !box || !panel.open) return
  try {
    const { grade: _grade, topic: _topic, ...shared } = filters
    const { cells } = await getAdminQuestionMatrix({ ...shared, ...section })
    box.innerHTML = renderMatrix(cells, $<HTMLSelectElement>('q-filter-track').value)
    for (const button of box.querySelectorAll<HTMLButtonElement>('[data-matrix-grade]')) {
      button.addEventListener('click', () => {
        $<HTMLSelectElement>('q-filter-grade').value = button.dataset.matrixGrade ?? ''
        const topic = button.dataset.matrixTopic ?? ''
        const topicSelect = $<HTMLSelectElement>('q-filter-topic')
        if (!topicSelect.disabled) topicSelect.value = topic
        void loadQuestionsTab()
      })
    }
  } catch (err) {
    box.textContent = (err as Error).message
  }
}

function renderMatrix(cells: AdminQuestionMatrixCell[], track: string): string {
  const totals = new Map<string, number>()
  for (const cell of cells) totals.set(`${cell.grade ?? 0}:${cell.topic ?? ''}`, cell.total)

  // With a track filter the axis is that track's full topic list (so a topic
  // with no questions at all still shows up as a row of zeros); without one it
  // is the topics that actually have rows. "Без теми" appears only if such
  // questions exist — an always-empty row would be noise.
  const known = (TOPICS_BY_TRACK as Record<string, readonly string[]>)[track]
  const seen = [...new Set(cells.map(cell => cell.topic ?? ''))].sort()
  const topics: string[] = known ? [...known] : seen.filter(topic => topic !== '')
  if (seen.includes('')) topics.push('')

  const head = MATRIX_GRADES.map(grade => `<th scope="col">${grade} клас</th>`).join('')
  const rows = topics.map(topic => {
    const label = topic ? (TOPIC_LABELS[topic] ?? topic) : 'Без теми'
    const cellsHtml = MATRIX_GRADES.map(grade => {
      const total = totals.get(`${grade}:${topic}`) ?? 0
      return `<td class="admin-matrix__cell${total ? '' : ' admin-matrix__cell--gap'}">
        <button type="button" class="admin-matrix__link" data-matrix-grade="${grade}" data-matrix-topic="${esc(topic)}"
                aria-label="${esc(label)}, ${grade} клас: ${total}">${total}</button>
      </td>`
    }).join('')
    return `<tr><th scope="row">${esc(label)}</th>${cellsHtml}</tr>`
  }).join('')

  return `<table class="admin-matrix__table">
    <thead><tr><th scope="col">Тема</th>${head}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

// ─── Bulk delivery change ─────────────────────────────────────────────────────
// Channels are delivery, not authored content, so a selection can be moved
// between sections in one action (backend: POST /api/admin/questions/channels).
async function refreshDemoCoverage(): Promise<void> {
  const panel = $maybe<HTMLDetailsElement>('q-demo-coverage-panel')
  const box = $maybe('q-demo-coverage')
  if (!panel || !box || !panel.open) return
  box.textContent = 'Перевіряємо покриття…'
  try {
    const { grades } = await getAdminDemoCoverage()
    box.innerHTML = grades.map(renderDemoCoverageGrade).join('')
    for (const button of box.querySelectorAll<HTMLButtonElement>('[data-demo-gap-grade]')) {
      button.addEventListener('click', () => {
        $<HTMLSelectElement>('q-filter-grade').value = button.dataset.demoGapGrade ?? ''
        $<HTMLSelectElement>('q-filter-track').value = button.dataset.demoGapTrack ?? ''
        fillTopicSelect(
          $<HTMLSelectElement>('q-filter-topic'),
          button.dataset.demoGapTrack ?? '',
          'Всі теми',
        )
        $<HTMLSelectElement>('q-filter-difficulty').value = button.dataset.demoGapDifficulty ?? ''
        $<HTMLSelectElement>('q-filter-status').value = 'published'
        selectSection('olympiad_training')
      })
    }
    for (const button of box.querySelectorAll<HTMLButtonElement>('[data-question-id]')) {
      button.addEventListener('click', () => {
        const questionId = button.dataset.questionId
        if (questionId) focusQuestionInBank(questionId, 'olympiad_training')
      })
    }
  } catch (err) {
    box.textContent = (err as Error).message
  }
}

const METADATA_ISSUE_LABELS: Record<string, string> = {
  'missing-estimated-seconds': 'Не вказано орієнтовний час',
  'missing-template-id': 'Не вказано шаблон варіанта',
  'missing-image-role': 'Не визначено роль зображення',
}

function groupReadinessIssues(issues: AdminOlympiadReadinessIssue[]): AdminOlympiadReadinessIssue[] {
  const grouped = new Map<string, AdminOlympiadReadinessIssue>()
  const result: AdminOlympiadReadinessIssue[] = []
  for (const issue of issues) {
    const label = METADATA_ISSUE_LABELS[issue.code]
    if (!label) {
      result.push(issue)
      continue
    }
    const existing = grouped.get(issue.code)
    if (existing) {
      existing.questionIds = [...new Set([...(existing.questionIds ?? []), ...(issue.questionIds ?? [])])]
      continue
    }
    const aggregated = { ...issue, questionIds: [...(issue.questionIds ?? [])] }
    grouped.set(issue.code, aggregated)
    result.push(aggregated)
  }
  for (const issue of grouped.values()) {
    const count = issue.questionIds?.length ?? 0
    issue.message = `${METADATA_ISSUE_LABELS[issue.code]}: ${count} пит.`
  }
  return result
}

function renderQuestionIssueLinks(questionIds: string[] | undefined): string {
  if (!questionIds?.length) return ''
  const buttons = questionIds.map((questionId, index) =>
    `<button type="button" class="btn-adm-ghost btn--sm" data-question-id="${esc(questionId)}">№${index + 1}</button>`,
  ).join('')
  if (questionIds.length === 1) return ` <span class="admin-issue-links">Відкрити: ${buttons}</span>`
  return `<details class="admin-issue-links">
    <summary>Відкрити питання (${questionIds.length})</summary>
    <div>${buttons}</div>
  </details>`
}

function renderReadinessIssue(issue: AdminOlympiadReadinessIssue): string {
  return `<li class="${issue.severity === 'error' ? 'event-readiness__error' : ''}">${esc(issue.message)}${renderQuestionIssueLinks(issue.questionIds)}</li>`
}

function renderDemoCoverageGrade(coverage: AdminDemoCoverageGrade): string {
  const sample = coverage.sample
  const standard = coverage.standard
  const statusClass = coverage.ready ? 'admin-demo-grade--ready' : 'admin-demo-grade--gap'
  const status = coverage.ready ? 'Готово' : coverage.canCompose ? 'Потрібне наповнення' : 'Демо не складається'
  const metrics = sample
    ? `${sample.mechanics.length}/5 механік · ${sample.images}/2 візуальних · прогресія ${sample.progression.recognize}/${sample.progression.apply}/${sample.progression.reason}`
    : 'Неможливо побудувати тестовий набір'
  const issues = coverage.issues.length
    ? `<ul class="admin-demo-grade__issues">${coverage.issues.map(issue =>
        `<li>${esc(issue.message)}${renderQuestionIssueLinks(issue.questionIds)}</li>`,
      ).join('')}</ul>`
    : '<p class="admin-demo-grade__ok">Усі обов’язкові перевірки пройдено.</p>'
  const groupedStandardIssues = standard ? groupReadinessIssues(standard.issues) : []
  const standardIssues = standard
    ? `<div class="admin-demo-grade__standard">
        <p><strong>Стандарт набору:</strong> ${standard.metrics.questionCount}/${standard.policy.questionCount} пит. ·
          ${standard.metrics.effortUnits} од. навантаження · ${standard.metrics.mechanics.length} механік ·
          ${standard.metrics.essentialImages} сюжетних зображень</p>
        <p><strong>Аудит комбінацій:</strong> ${coverage.audit.passed}/${coverage.audit.samples} пройдено ·
          ${coverage.audit.uniqueSets} унікальних наборів</p>
        ${groupedStandardIssues.length
          ? `<details ${standard.ready ? '' : 'open'}><summary>Зауваження стандарту: ${groupedStandardIssues.length}</summary>
              <ul>${groupedStandardIssues.map(renderReadinessIssue).join('')}</ul></details>`
          : '<p class="admin-demo-grade__ok">Згенерований набір відповідає стандарту.</p>'}
      </div>`
    : '<p class="event-readiness__error">Контрольний набір не вдалося згенерувати.</p>'

  const cells = coverage.cells.map(cell => {
    const gap = cell.missingCandidates > 0
    const mechanicLabels = cell.mechanics.map(type => TYPE_LABELS[type] ?? type).join(', ') || 'немає'
    return `<tr class="${gap ? 'admin-demo-grade__cell-gap' : ''}">
      <td>${cell.slotId ? `<strong>${esc(cell.slotId)}</strong><br>` : ''}${esc(TRACK_LABELS[cell.track] ?? cell.track)}</td>
      <td>${esc(DIFF_LABELS[cell.difficulty] ?? cell.difficulty)}</td>
      <td>${cell.requiredSlots}</td>
      <td><strong>${cell.candidates}/${cell.targetCandidates}</strong></td>
      <td>${esc(mechanicLabels)}</td>
      <td>
        <button type="button" class="btn-adm-ghost btn--sm"
                data-demo-gap-grade="${coverage.grade}"
                data-demo-gap-track="${esc(cell.track)}"
                data-demo-gap-difficulty="${esc(cell.difficulty)}">Відкрити</button>
      </td>
    </tr>`
  }).join('')

  return `<section class="admin-demo-grade ${statusClass}">
    <div class="admin-demo-grade__header">
      <h4>${coverage.grade} клас</h4>
      <span class="qi-badge ${coverage.ready ? 'qi-badge--easy' : 'qi-badge--medium'}">${status}</span>
    </div>
    <p class="admin-demo-grade__metrics">${esc(metrics)}</p>
    ${issues}
    ${standardIssues}
    <div class="admin-matrix__scroll">
      <table class="admin-matrix__table">
        <thead><tr><th>Напрям</th><th>Складність</th><th>Слотів</th><th>Є / ціль</th><th>Механіки</th><th></th></tr></thead>
        <tbody>${cells}</tbody>
      </table>
    </div>
  </section>`
}

const selectedIds = new Set<string>()

/** Mirrors the server's maxItems on the bulk routes. */
const BULK_LIMIT = 200

function renderBulkBar(): void {
  const bar = $maybe('q-bulk')
  const label = $maybe('q-bulk-count')
  if (!bar || !label) return
  bar.classList.toggle('hidden', selectedIds.size === 0)
  label.textContent = `Вибрано ${selectedIds.size}`

  const all = $maybe<HTMLInputElement>('q-select-all')
  if (all) {
    // Scoped to the page: the checkbox reflects the rows on screen, not the
    // whole filtered set, which may span pages.
    const onPage = currentQuestions.filter(q => selectedIds.has(q.id)).length
    all.checked = currentQuestions.length > 0 && onPage === currentQuestions.length
    all.indeterminate = onPage > 0 && onPage < currentQuestions.length
  }
}

/** Selects or clears the questions on the current page. Rows picked on other
 *  pages stay selected — the bulk bar counts them all. */
function toggleSelectAll(checked: boolean): void {
  for (const box of document.querySelectorAll<HTMLInputElement>('.qi-select')) {
    box.checked = checked
    if (checked) selectedIds.add(box.value)
    else selectedIds.delete(box.value)
  }
  renderBulkBar()
}

function toggleSelection(id: string, selected: boolean): void {
  if (selected) selectedIds.add(id)
  else selectedIds.delete(id)
  renderBulkBar()
}

function clearSelection(): void {
  selectedIds.clear()
  for (const box of document.querySelectorAll<HTMLInputElement>('.qi-select')) box.checked = false
  renderBulkBar()
}

function applyBulkChannel(action: 'add' | 'remove'): Promise<void> {
  const select = $<HTMLSelectElement>('q-bulk-channel')
  const channel = select.value as QuestionChannel
  const channelLabel = select.selectedOptions[0]?.textContent?.trim() ?? channel
  const verb = action === 'add' ? 'Додати до розділу' : 'Прибрати з розділу'
  return runBulk(`${verb} «${channelLabel}» для {n} питань?`, async ids => {
    const result = await updateQuestionChannels(ids, channel, action)
    const lines = [describeBulkResult('Змінено', result.updated, result.skipped)]
    if (result.unchanged) lines.splice(1, 0, `Без змін: ${result.unchanged}`)
    return lines.join('\n')
  })
}

/** Renders the outcome of a bulk call: what changed, and why the rest did not.
 *  Reasons are grouped — 40 rows blocked for one reason is one line, not forty. */
function describeBulkResult(done: string, count: number, skipped: { reason: string }[]): string {
  const lines = [`${done}: ${count}`]
  for (const reason of new Set(skipped.map(item => item.reason))) {
    lines.push(`${skipped.filter(item => item.reason === reason).length} — ${reason}`)
  }
  return lines.join('\n')
}

async function runBulk(
  confirmText: string,
  run: (ids: string[]) => Promise<string>,
): Promise<void> {
  const ids = [...selectedIds]
  if (!ids.length) return
  // The server caps a bulk call at 200 ids; say so here instead of letting it
  // come back as a schema error after the confirmation.
  if (ids.length > BULK_LIMIT) {
    showModal(`За один раз можна змінити не більше ${BULK_LIMIT} питань. Зараз вибрано ${ids.length} — зніми зайві або зменш розмір сторінки.`)
    return
  }
  showConfirm(confirmText.replace('{n}', String(ids.length)), async () => {
    try {
      const summary = await run(ids)
      clearSelection()
      await loadQuestionsTab()
      void refreshContentDeliveryBanner()
      showModal(summary)
    } catch (err) {
      showModal((err as Error).message)
    }
  })
}

function applyBulkStatus(status: 'published' | 'archived'): Promise<void> {
  const [confirmText, done] = status === 'published'
    ? ['Опублікувати {n} питань?', 'Опубліковано']
    : ['Зняти з публікації {n} питань?', 'Знято з публікації']
  return runBulk(confirmText, async ids => {
    const result = await setQuestionEditorialStatusBulk(ids, status)
    const lines = [describeBulkResult(done, result.updated, result.skipped)]
    if (result.unchanged) lines.splice(1, 0, `Уже в цьому стані: ${result.unchanged}`)
    return lines.join('\n')
  })
}

function applyBulkDelete(): Promise<void> {
  return runBulk('Видалити {n} вибраних питань?\n\nВидаляються лише чернетки. Цю дію неможливо скасувати.', async ids => {
    const result = await deleteQuestionsBulk(ids)
    return describeBulkResult('Видалено', result.deleted, result.skipped)
  })
}

function selectedChannels(): QuestionChannel[] {
  return (Object.entries(CHANNEL_INPUTS) as [QuestionChannel, string][])
    .filter(([, inputId]) => $<HTMLInputElement>(inputId).checked)
    .map(([channel]) => channel)
}

function syncDistributionUI(): void {
  const isMainRound = $<HTMLInputElement>('qf-olympiad').checked
  for (const inputId of Object.values(CHANNEL_INPUTS)) {
    const input = $<HTMLInputElement>(inputId)
    if (isMainRound) input.checked = false
    input.disabled = isMainRound
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initQuestionsTab() {
  $<HTMLButtonElement>('add-question-btn').addEventListener('click', () => openQuestionModal(null))
  $<HTMLButtonElement>('qf-cancel').addEventListener('click', closeQuestionModal)
  $<HTMLButtonElement>('preview-close').addEventListener('click', closePreview)
  previewModal.addEventListener('click', (e) => { if (e.target === previewModal) closePreview() })
  for (const button of previewModal.querySelectorAll<HTMLButtonElement>('[data-preview-preset]')) {
    button.addEventListener('click', () => setPreviewPreset(button.dataset.previewPreset ?? '1366x625'))
  }
  $<HTMLSelectElement>('qf-type').addEventListener('change', (e) => {
    applyTypeUI((e.target as HTMLSelectElement).value)
  })
  restoreSection()
  for (const button of sectionButtons()) {
    button.addEventListener('click', () => selectSection(button.dataset.section ?? ''))
  }
  // The coverage view is loaded only while it is open — it is a planning tool,
  // not something every list refresh should pay for.
  $maybe<HTMLDetailsElement>('q-matrix-panel')?.addEventListener('toggle', () => { void loadQuestionsTab() })
  $maybe<HTMLDetailsElement>('q-demo-coverage-panel')?.addEventListener('toggle', () => { void refreshDemoCoverage() })
  $<HTMLButtonElement>('q-demo-coverage-refresh').addEventListener('click', () => { void refreshDemoCoverage() })
  $<HTMLButtonElement>('q-bulk-add').addEventListener('click', () => { void applyBulkChannel('add') })
  $<HTMLButtonElement>('q-bulk-remove').addEventListener('click', () => { void applyBulkChannel('remove') })
  $<HTMLButtonElement>('q-bulk-publish').addEventListener('click', () => { void applyBulkStatus('published') })
  $<HTMLButtonElement>('q-bulk-archive').addEventListener('click', () => { void applyBulkStatus('archived') })
  $<HTMLButtonElement>('q-bulk-delete').addEventListener('click', () => { void applyBulkDelete() })
  $<HTMLButtonElement>('q-bulk-clear').addEventListener('click', clearSelection)
  $<HTMLInputElement>('q-select-all').addEventListener('change', event => {
    toggleSelectAll((event.target as HTMLInputElement).checked)
  })
  $<HTMLButtonElement>('q-filter-apply').addEventListener('click', restartList)
  $<HTMLInputElement>('q-filter-search').addEventListener('keydown', event => {
    if (event.key === 'Enter') restartList()
  })
  // Тема залежить від напряму — і у фільтрі, і у формі
  $<HTMLSelectElement>('q-filter-track').addEventListener('change', (e) => {
    fillTopicSelect($<HTMLSelectElement>('q-filter-topic'), (e.target as HTMLSelectElement).value, 'Всі теми')
  })
  $<HTMLSelectElement>('qf-track').addEventListener('change', (e) => {
    fillTopicSelect($<HTMLSelectElement>('qf-topic'), (e.target as HTMLSelectElement).value, 'Без теми')
  })
  $<HTMLInputElement>('qf-olympiad').addEventListener('change', syncDistributionUI)
  for (const inputId of Object.values(CHANNEL_INPUTS)) {
    $<HTMLInputElement>(inputId).addEventListener('change', event => {
      if ((event.target as HTMLInputElement).checked) $<HTMLInputElement>('qf-olympiad').checked = false
      syncDistributionUI()
    })
  }
  $<HTMLInputElement>('qf-img').addEventListener('input', (e) => {
    const prev = $maybe<HTMLImageElement>('qf-img-preview')
    const url  = (e.target as HTMLInputElement).value.trim()
    if (url && prev) { prev.src = url; prev.classList.remove('hidden') }
    else if (prev)   { prev.classList.add('hidden'); prev.src = '' }
  })
  questionForm.addEventListener('submit', handleSubmit)
  qfPublishBtn.addEventListener('click', event => { void handleSubmit(event, true) })
  $<HTMLButtonElement>('qf-preview').addEventListener('click', handlePreviewClick)
}

// ─── List ──────────────────────────────────────────────────────────────────────

export async function loadQuestionsTab() {
  const list = $('questions-list')
  list.innerHTML = '<p class="admin-loading-text">Завантаження…</p>'
  try {
    const filters: AdminQuestionFilters = {
      grade:      $<HTMLSelectElement>('q-filter-grade').value || undefined,
      type:       $<HTMLSelectElement>('q-filter-mechanic').value || undefined,
      difficulty: $<HTMLSelectElement>('q-filter-difficulty').value || undefined,
      track:      $<HTMLSelectElement>('q-filter-track').value || undefined,
      topic:      $<HTMLSelectElement>('q-filter-topic').value || undefined,
      status:     $<HTMLSelectElement>('q-filter-status').value || undefined,
      search:     $<HTMLInputElement>('q-filter-search').value.trim() || undefined,
    }
    // The counters describe every section under the same filters, so they are
    // built from `filters` alone — the section below narrows the list only.
    void refreshSectionCounts(filters)

    const section    = currentSection
    const isMainRound = section === 'main_round'
    const unassigned = section === 'unassigned'
    const isOlympiad = section && !unassigned ? isMainRound : undefined
    const channel    = section && !isMainRound && !unassigned ? section as QuestionChannel : undefined
    const sectionQuery: SectionQuery = { isOlympiad, channel, unassigned }
    void refreshMatrix(filters, sectionQuery)

    const { questions, page } = await getAdminQuestions({ ...filters, ...sectionQuery, ...pager.range() })
    currentQuestions = questions

    $('q-count').textContent = `${page.total} питань`

    if (!questions.length) {
      pager.apply(page)
      list.innerHTML = `
        <div class="admin-empty-state"><div>
          <i class="fas fa-question-circle admin-empty-state__icon"></i>
          <p class="admin-empty-state__title">Питань не знайдено</p>
        </div></div>`
      return
    }

    list.innerHTML = ''
    questions.forEach(q => list.appendChild(buildQuestionCard(q)))
    pager.apply(page)
    renderBulkBar()
  } catch (err) {
    pager.clear()
    list.innerHTML = ''
    const error = document.createElement('p')
    error.className = 'admin-list-error'
    error.textContent = (err as Error).message
    list.appendChild(error)
  }
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function buildQuestionCard(q: Question): HTMLElement {
  const diffLabel  = DIFF_LABELS[q.difficulty ?? ''] ?? q.difficulty ?? '—'
  const trackLabel = q.track ? (TRACK_LABELS[q.track] ?? q.track) : null
  const type = q.type ?? 'choice'
  const correctHint = describeCorrectAnswer(q)
  const status = q.editorialStatus ?? 'published'
  const immutable = Boolean(q.publishedAt) || status === 'published'
  const nextStatus = status === 'draft' || status === 'review' ? 'published' : status === 'published' ? 'archived' : immutable ? 'published' : 'draft'
  const nextLabel = status === 'draft' || status === 'review' ? 'Опублікувати' : status === 'published' ? 'Зняти з публікації' : immutable ? 'Опублікувати знову' : 'Повернути в чернетки'
  const el = document.createElement('div')
  el.className = 'question-item'
  el.innerHTML = `
    <label class="question-item__select">
      <input type="checkbox" class="qi-select" value="${esc(q.id)}" ${selectedIds.has(q.id) ? 'checked' : ''}
             aria-label="Вибрати питання для масової зміни розділів"/>
    </label>
    <div class="question-item__left">
      <div class="question-item__badges">
        <span class="qi-badge ${STATUS_BADGES[status]}">${STATUS_LABELS[status]}</span>
        <span class="qi-badge qi-badge--grade">${esc(String(q.grade))} клас</span>
        <span class="qi-badge qi-badge--type">${esc(TYPE_LABELS[type] ?? type)}</span>
        <span class="qi-badge qi-badge--${q.difficulty ?? 'medium'}">${esc(diffLabel)}</span>
        ${trackLabel ? `<span class="qi-badge qi-badge--practice">${esc(trackLabel)}</span>` : ''}
        ${q.topic ? `<span class="qi-badge qi-badge--type">${esc(TOPIC_LABELS[q.topic] ?? q.topic)}</span>` : ''}
        ${q.isOlympiad
          ? '<span class="qi-badge qi-badge--olympiad">Основний тур</span>'
          : (q.channels?.length
              ? q.channels.map(channel => `<span class="qi-badge qi-badge--practice">${esc(CHANNEL_LABELS[channel] ?? channel)}</span>`).join('')
              : '<span class="qi-badge qi-badge--type">Без розділу</span>')}
      </div>
      <p class="question-item__text">${esc(q.q)}</p>
      ${q.code ? `<p class="question-item__code">${esc(q.code.split('\n')[0])}…</p>` : ''}
      <p class="question-item__meta">✓ ${esc(correctHint)} · контент v${esc(String(q.version ?? 1))} · редакція ${esc(String(q.editVersion ?? 1))}</p>
    </div>
    <div class="question-item__actions">
      <button class="btn-q-edit btn-adm-slate btn-icon" aria-label="Редагувати питання"><i class="fas fa-pen" aria-hidden="true"></i></button>
      <button class="btn-q-copy btn-adm-ghost btn-icon" aria-label="Дублювати питання"><i class="fas fa-copy" aria-hidden="true"></i></button>
      <button class="btn-q-history btn-adm-ghost btn-icon" aria-label="Історія питання"><i class="fas fa-history" aria-hidden="true"></i></button>
      <button class="btn-q-status btn-adm-sky btn--sm">${nextLabel}</button>
      ${status === 'draft' ? '<button class="btn-q-del btn-adm-danger btn-icon" aria-label="Видалити чернетку"><i class="fas fa-trash" aria-hidden="true"></i></button>' : ''}
    </div>`

  el.querySelector<HTMLInputElement>('.qi-select')!.addEventListener('change', event => {
    toggleSelection(q.id, (event.target as HTMLInputElement).checked)
  })
  el.querySelector<HTMLButtonElement>('.btn-q-edit')!.setAttribute(
    'aria-label', immutable ? 'Створити нову версію як чернетку' : 'Редагувати питання',
  )
  el.querySelector<HTMLButtonElement>('.btn-q-edit')!.addEventListener('click', () => openQuestionModal(q, immutable))
  el.querySelector<HTMLButtonElement>('.btn-q-copy')!.addEventListener('click', () => openQuestionModal(q, true))
  el.querySelector<HTMLButtonElement>('.btn-q-history')!.addEventListener('click', () => { void openHistory(q) })
  el.querySelector<HTMLButtonElement>('.btn-q-status')!.addEventListener('click', () => {
    showConfirm(`${nextLabel} це питання?`, async () => {
      try {
        await setQuestionEditorialStatus(q.id, nextStatus, q.editVersion ?? 1)
        await loadQuestionsTab()
        void refreshContentDeliveryBanner()
      } catch (err) { showModal((err as Error).message) }
    })
  })
  el.querySelector<HTMLButtonElement>('.btn-q-del')?.addEventListener('click', () => {
    showConfirm(
      `Видалити чернетку?\n\n«${q.q.slice(0, 80)}${q.q.length > 80 ? '…' : ''}»\n\nЦю дію неможливо скасувати.`,
      async () => {
        try {
          await deleteQuestion(q.id)
          await loadQuestionsTab()
          void refreshContentDeliveryBanner()
        } catch (err) {
          showModal((err as Error).message)
        }
      }
    )
  })

  return el
}

async function openHistory(question: Question) {
  try {
    const { revisions } = await getQuestionRevisions(question.id)
    const overlay = document.createElement('div')
    overlay.className = 'admin-modal-overlay'
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.setAttribute('aria-labelledby', 'question-history-title')
    overlay.innerHTML = `
      <div class="admin-modal-card question-history-card">
        <div class="admin-section-header">
          <h3 id="question-history-title" class="admin-section-title">Історія питання</h3>
          <button type="button" class="btn-adm-ghost history-close">Закрити</button>
        </div>
        <p class="admin-section-note">Кожне відновлення створює нову чернетку — попередня історія не зникає.</p>
        <div class="admin-list admin-list--sm history-list"></div>
      </div>`
    const list = overlay.querySelector<HTMLElement>('.history-list')!
    for (const revision of revisions) {
      const snapshot = revision.snapshot
      const status = String(snapshot.editorialStatus ?? snapshot.editorial_status ?? '—')
      const text = String(snapshot.q ?? '(без тексту)')
      const item = document.createElement('div')
      item.className = 'question-item'
      item.innerHTML = `
        <div class="question-item__left">
          <div class="question-item__badges">
            <span class="qi-badge qi-badge--type">редакція ${revision.editVersion}</span>
            <span class="qi-badge qi-badge--type">${esc(revision.action)}</span>
            <span class="qi-badge qi-badge--type">${esc(status)}</span>
          </div>
          <p class="question-item__text">${esc(text)}</p>
          <p class="question-item__meta">${esc(new Date(revision.createdAt).toLocaleString('uk-UA'))}</p>
        </div>
        ${!question.publishedAt && question.editorialStatus !== 'published' && revision.editVersion !== (question.editVersion ?? 1)
          ? '<div class="question-item__actions"><button type="button" class="btn-adm-sky btn--sm history-restore">Відновити</button></div>'
          : ''}`
      item.querySelector<HTMLButtonElement>('.history-restore')?.addEventListener('click', () => {
        close()
        showConfirm(`Відновити редакцію ${revision.editVersion} як нову чернетку?`, async () => {
          try {
            await restoreQuestionRevision(question.id, revision.editVersion, question.editVersion ?? 1)
            await loadQuestionsTab()
          } catch (err) { showModal((err as Error).message) }
        })
      })
      list.appendChild(item)
    }
    document.body.appendChild(overlay)
    let removeTrap: () => void = () => {}
    const close = () => {
      removeTrap()
      overlay.remove()
    }
    removeTrap = createFocusTrap(overlay, close)
    overlay.querySelector<HTMLButtonElement>('.history-close')!.addEventListener('click', close)
    overlay.addEventListener('click', event => { if (event.target === overlay) close() })
  } catch (err) {
    showModal((err as Error).message)
  }
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function openQuestionModal(q: Question | null, duplicate = false) {
  $('question-modal-title').textContent                 = duplicate && (q?.editorialStatus === 'published' || q?.publishedAt)
    ? 'Нова версія як чернетка' : duplicate ? 'Дублювати питання' : q ? 'Редагувати питання' : 'Нове питання'
  $<HTMLInputElement>('qf-id').value                    = duplicate ? '' : q?.id ?? ''
  $<HTMLSelectElement>('qf-grade').value                = String(q?.grade ?? '1')
  $<HTMLSelectElement>('qf-difficulty').value           = q?.difficulty ?? 'medium'
  $<HTMLSelectElement>('qf-track').value                = q?.track ?? ''
  fillTopicSelect($<HTMLSelectElement>('qf-topic'), q?.track ?? '', 'Без теми')
  $<HTMLSelectElement>('qf-topic').value                = q?.topic ?? ''
  $<HTMLSelectElement>('qf-concept').value              = q?.conceptKey ?? ''
  $<HTMLSelectElement>('qf-band').value                 = q?.progressionBand ?? ''
  ;($<HTMLInputElement>('qf-olympiad')).checked         = q?.isOlympiad ?? false
  for (const [channel, inputId] of Object.entries(CHANNEL_INPUTS) as [QuestionChannel, string][]) {
    $<HTMLInputElement>(inputId).checked = q?.channels?.includes(channel) ?? false
  }
  syncDistributionUI()
  $<HTMLTextAreaElement>('qf-q').value                  = q?.q ?? ''
  $<HTMLTextAreaElement>('qf-explanation').value        = q?.explanation ?? ''
  $<HTMLTextAreaElement>('qf-code').value               = q?.code ?? ''

  resetTypeFields()
  const type = q?.type ?? 'choice'
  populateTypeFields(type, q)

  const imgUrl = (q as any)?.img ?? ''
  $<HTMLInputElement>('qf-img').value = imgUrl
  $<HTMLInputElement>('qf-image-alt').value = q?.imageAlt ?? ''
  $<HTMLSelectElement>('qf-image-role').value = q?.meta?.imageRole ?? ''
  $<HTMLInputElement>('qf-estimated-seconds').value = q?.meta?.estimatedSeconds
    ? String(q.meta.estimatedSeconds) : ''
  $<HTMLInputElement>('qf-template-id').value = q?.meta?.templateId ?? ''
  const prev = $maybe<HTMLImageElement>('qf-img-preview')
  if (prev) {
    if (imgUrl) { prev.src = imgUrl; prev.classList.remove('hidden') }
    else        { prev.classList.add('hidden'); prev.src = '' }
  }

  $<HTMLSelectElement>('qf-type').value = type
  applyTypeUI(type)

  qfError.textContent = ''
  questionModal.classList.remove('hidden')
  _qModalTrapRemove?.()
  _qModalTrapRemove = createFocusTrap(questionModal, closeQuestionModal)
}

export function closeQuestionModal() {
  _qModalTrapRemove?.()
  _qModalTrapRemove = null
  questionModal.classList.add('hidden')
}

// ─── Submit ───────────────────────────────────────────────────────────────────

async function handleSubmit(e: Event, publish = false) {
  e.preventDefault()
  qfError.textContent = ''

  const id = $<HTMLInputElement>('qf-id').value
  const q  = $<HTMLTextAreaElement>('qf-q').value.trim()
  if (!q) { qfError.textContent = 'Введи текст питання.'; return }

  let shape
  try {
    shape = collectQuestionShape()
  } catch (err) {
    qfError.textContent = (err as Error).message
    return
  }

  const data = {
    q,
    ...shape,
    grade:       Number($<HTMLSelectElement>('qf-grade').value),
    difficulty:  $<HTMLSelectElement>('qf-difficulty').value,
    track:       $<HTMLSelectElement>('qf-track').value || null,
    topic:       $<HTMLSelectElement>('qf-topic').value || null,
    conceptKey:  $<HTMLSelectElement>('qf-concept').value || null,
    progressionBand: ($<HTMLSelectElement>('qf-band').value || null) as 'recognize' | 'apply' | 'reason' | null,
    isOlympiad:  $<HTMLInputElement>('qf-olympiad').checked,
    channels:    selectedChannels(),
    explanation: $<HTMLTextAreaElement>('qf-explanation').value.trim(),
    code:        $<HTMLTextAreaElement>('qf-code').value.trim() || undefined,
    img:         $<HTMLInputElement>('qf-img').value.trim() || null,
    imageAlt:    $<HTMLInputElement>('qf-image-alt').value.trim() || null,
    imageRole:   $<HTMLSelectElement>('qf-image-role').value || null,
    estimatedSeconds: $<HTMLInputElement>('qf-estimated-seconds').value
      ? Number($<HTMLInputElement>('qf-estimated-seconds').value) : null,
    templateId:  $<HTMLInputElement>('qf-template-id').value.trim() || null,
  }

  const buttons = [qfSubmitBtn, qfPublishBtn]
  for (const button of buttons) button.disabled = true
  const activeBtn = publish ? qfPublishBtn : qfSubmitBtn
  activeBtn.textContent = publish ? 'Публікація…' : 'Збереження…'
  try {
    // Publishing needs the editVersion the save produced — the status route uses
    // it as an optimistic lock, so reusing the pre-save one would always 409.
    let savedId = id
    let editVersion: number
    if (id) {
      const current = currentQuestions.find(question => question.id === id)
      if (!current) throw new Error('Питання змінилося або список застарів. Онови вкладку.')
      const saved = await updateQuestion(id, { ...data, expectedEditVersion: current.editVersion ?? 1 })
      editVersion = saved.editVersion
    } else {
      const created = await createQuestion(data)
      savedId = created.id
      editVersion = 1
    }
    if (publish) await setQuestionEditorialStatus(savedId, 'published', editVersion)
    closeQuestionModal()
    await loadQuestionsTab()
    void refreshContentDeliveryBanner()
  } catch (err) {
    // A failed publish still kept the save, so say so rather than let the editor
    // think the edit was lost and redo it.
    const message = (err as Error).message
    qfError.textContent = publish ? `Збережено, але не опубліковано: ${message}` : message
    if (publish) { await loadQuestionsTab(); void refreshContentDeliveryBanner() }
  } finally {
    for (const button of buttons) button.disabled = false
    qfSubmitBtn.textContent  = 'Зберегти'
    qfPublishBtn.textContent = 'Зберегти й опублікувати'
  }
}

// ─── Preview ──────────────────────────────────────────────────────────────────

function setPreviewPreset(preset: string): void {
  const viewport = $('pv-viewport')
  viewport.dataset.previewPreset = preset === '1280x800' ? preset : '1366x625'
  for (const button of previewModal.querySelectorAll<HTMLButtonElement>('[data-preview-preset]')) {
    button.setAttribute('aria-pressed', String(button.dataset.previewPreset === viewport.dataset.previewPreset))
  }
  requestAnimationFrame(updatePreviewFitStatus)
}

function updatePreviewFitStatus(): void {
  const viewport = $('pv-viewport')
  const status = $('pv-fit-status')
  const fits = viewport.scrollHeight <= viewport.clientHeight + 1
    && viewport.scrollWidth <= viewport.clientWidth + 1
  status.classList.toggle('preview-fit-status--blocked', !fits)
  status.textContent = fits
    ? `Орієнтовно вміщується у пропорції ${viewport.dataset.previewPreset}.`
    : `Орієнтовно не вміщується у пропорції ${viewport.dataset.previewPreset}: скоротіть умову або кількість елементів.`
}

function handlePreviewClick() {
  let shape
  try {
    shape = collectQuestionShape()
  } catch (err) {
    qfError.textContent = (err as Error).message
    return
  }
  qfError.textContent = ''

  const q = {
    type:        shape.type,
    q:           $<HTMLTextAreaElement>('qf-q').value.trim() || '(текст питання)',
    options:     shape.options,
    correct:     shape.correct,
    img:         $<HTMLInputElement>('qf-img').value.trim() || null,
    imageAlt:    $<HTMLInputElement>('qf-image-alt').value.trim() || null,
    code:        $<HTMLTextAreaElement>('qf-code').value.trim() || null,
    explanation: $<HTMLTextAreaElement>('qf-explanation').value.trim(),
    ...(Array.isArray(shape.options) ? { a: shape.options } : shape.options),
  }

  $('pv-question-text').textContent = q.q
  const pvImg = $maybe<HTMLImageElement>('pv-image')
  if (pvImg) {
    if (q.img) {
      pvImg.src = q.img
      pvImg.alt = q.imageAlt || 'Зображення до питання'
      pvImg.classList.remove('hidden')
      pvImg.addEventListener('load', updatePreviewFitStatus, { once: true })
    }
    else       { pvImg.classList.add('hidden'); pvImg.src = '' }
  }

  const pvCode = $maybe('pv-code')
  if (pvCode) {
    if (q.code) { pvCode.textContent = q.code; pvCode.classList.remove('hidden') }
    else        { pvCode.classList.add('hidden') }
  }

  const pvOpts = $<HTMLElement>('pv-options')
  pvOpts.className = 'pv-options pv-options--grid'
  renderQuestion(q, pvOpts, { preview: true })

  const explWrap = $maybe('pv-explanation-wrap')
  if (explWrap) {
    if (q.explanation) {
      $('pv-explanation').textContent = q.explanation
      explWrap.classList.remove('hidden')
    } else {
      explWrap.classList.add('hidden')
    }
  }

  previewModal.classList.remove('hidden')
  setPreviewPreset('1366x625')
  requestAnimationFrame(() => requestAnimationFrame(updatePreviewFitStatus))
  _pvTrapRemove?.()
  _pvTrapRemove = createFocusTrap(previewModal, closePreview)
}

function closePreview() {
  _pvTrapRemove?.()
  _pvTrapRemove = null
  previewModal.classList.add('hidden')
}

// ─── applyTypeUI ──────────────────────────────────────────────────────────────

export function applyTypeUI(type: string) {
  Object.values(QF_SECTIONS).forEach(id => $maybe(id)?.classList.add('hidden'))
  $maybe(QF_SECTIONS[type] ?? 'qf-section-choice')?.classList.remove('hidden')
  const showCode = ['choice', 'sort', 'algorithm'].includes(type)
  $maybe('qf-code-wrap')?.classList.toggle('hidden', !showCode)
}

function resetTypeFields() {
  document.querySelectorAll<HTMLInputElement>('input[type="radio"][name^="qf-"]').forEach(inp => { inp.checked = false })
  document.querySelectorAll<HTMLInputElement>('.qf-opt, .qf-seq-opt').forEach(inp => { inp.value = '' })
  $<HTMLTextAreaElement>('qf-items').value = ''
  $<HTMLInputElement>('qf-correct-order').value = ''
  $<HTMLInputElement>('qf-given').value = ''
  $<HTMLTextAreaElement>('qf-left').value = ''
  $<HTMLTextAreaElement>('qf-right').value = ''
  $<HTMLInputElement>('qf-pairs').value = ''
  $<HTMLInputElement>('qf-input-correct').value = ''
  $<HTMLSelectElement>('qf-input-type').value = 'text'
}

function populateTypeFields(type: QuestionType, q: Question | null) {
  if (!q) return
  const options = asOptionsObject(q.options)

  if (type === 'choice') {
    populateInputs('.qf-opt', Array.isArray(q.options) ? q.options : [])
    checkRadio('qf-correct', String(q.correct ?? 0))
  } else if (type === 'truefalse') {
    checkRadio('qf-tf-correct', q.correct === 1 ? 'false' : 'true')
  } else if (type === 'sort') {
    $<HTMLTextAreaElement>('qf-items').value = asStringList(options['items']).join('\n')
    $<HTMLInputElement>('qf-correct-order').value = asNumberList(options['correctOrder']).join(',')
  } else if (type === 'sequence') {
    $<HTMLInputElement>('qf-given').value = asStringList(options['given']).join(',')
    populateInputs('.qf-seq-opt', asStringList(options['choices']))
    checkRadio('qf-seq-correct', String(q.correct ?? 0))
  } else if (type === 'match') {
    $<HTMLTextAreaElement>('qf-left').value = asStringList(options['left']).join('\n')
    $<HTMLTextAreaElement>('qf-right').value = asStringList(options['right']).join('\n')
    $<HTMLInputElement>('qf-pairs').value = asNumberList(options['pairs']).join(',')
  } else if (type === 'input') {
    $<HTMLInputElement>('qf-input-correct').value = String(options['answer'] ?? '')
    $<HTMLSelectElement>('qf-input-type').value = options['inputType'] === 'number' ? 'number' : 'text'
  }
}

function collectQuestionShape(): { type: QuestionType; options: string[] | Record<string, unknown>; correct: number | null } {
  const type = $<HTMLSelectElement>('qf-type').value as QuestionType

  if (type === 'choice') {
    const options = inputValues('.qf-opt')
    const correct = checkedIndex('qf-correct')
    if (options.some(o => !o)) throw new Error('Заповни всі 4 варіанти.')
    if (correct === null) throw new Error('Вибери правильну відповідь.')
    return { type, options, correct }
  }

  if (type === 'truefalse') {
    const selected = document.querySelector<HTMLInputElement>('input[name="qf-tf-correct"]:checked')
    if (!selected) throw new Error('Вибери правильну відповідь.')
    return { type, options: ['Так', 'Ні'], correct: selected.value === 'true' ? 0 : 1 }
  }

  if (type === 'sort') {
    const items = splitLines($<HTMLTextAreaElement>('qf-items').value)
    const correctOrder = parseIndexList($<HTMLInputElement>('qf-correct-order').value)
    if (items.length < 2) throw new Error('Додай щонайменше 2 елементи.')
    if (correctOrder.length !== items.length) throw new Error('Вкажи індекс кожного елемента у правильному порядку.')
    if ([...correctOrder].sort((a, b) => a - b).some((index, position) => index !== position)) {
      throw new Error('Правильний порядок має містити кожен індекс рівно один раз.')
    }
    return { type, options: { items, correctOrder }, correct: null }
  }

  if (type === 'sequence') {
    const given = splitComma($<HTMLInputElement>('qf-given').value)
    const choices = inputValues('.qf-seq-opt')
    const correct = checkedIndex('qf-seq-correct')
    if (!given.length) throw new Error('Вкажи задану послідовність.')
    if (choices.some(o => !o)) throw new Error('Заповни всі 4 варіанти.')
    if (correct === null) throw new Error('Вибери правильну відповідь.')
    return { type, options: { given, choices }, correct }
  }

  if (type === 'match') {
    const left = splitLines($<HTMLTextAreaElement>('qf-left').value)
    const right = splitLines($<HTMLTextAreaElement>('qf-right').value)
    const pairs = parseIndexList($<HTMLInputElement>('qf-pairs').value)
    if (!left.length || !right.length) throw new Error('Заповни обидва стовпці.')
    if (pairs.length !== left.length) throw new Error('Вкажи індекс пари для кожного рядка ліворуч.')
    if (new Set(right).size !== right.length) throw new Error('Значення правого стовпця мають бути унікальними.')
    if (pairs.some(index => index >= right.length)) throw new Error('Індекс пари виходить за межі правого стовпця.')
    return { type, options: { left, right, pairs }, correct: null }
  }

  const inputType = $<HTMLSelectElement>('qf-input-type').value === 'number' ? 'number' : 'text'
  const rawAnswer = $<HTMLInputElement>('qf-input-correct').value.trim()
  if (!rawAnswer) throw new Error('Вкажи правильну відповідь.')
  const answer = inputType === 'number' ? Number(rawAnswer) : rawAnswer
  if (inputType === 'number' && !Number.isFinite(answer)) throw new Error('Правильна відповідь має бути числом.')
  return { type, options: { answer, inputType }, correct: null }
}

function describeCorrectAnswer(q: Question): string {
  const type = q.type ?? 'choice'
  const options = asOptionsObject(q.options)
  if (type === 'choice') return String(Array.isArray(q.options) ? q.options[q.correct ?? -1] ?? '—' : '—')
  if (type === 'truefalse') return q.correct === 0 ? 'Так' : q.correct === 1 ? 'Ні' : '—'
  if (type === 'sequence') return String(asStringList(options['choices'])[q.correct ?? -1] ?? '—')
  if (type === 'sort') return describeIndexedList(options['items'], options['correctOrder'])
  if (type === 'match') {
    const left = asStringList(options['left'])
    const right = asStringList(options['right'])
    return left.map((item, i) => `${item} → ${right[asNumberList(options['pairs'])[i]] ?? '?'}`).join('; ') || '—'
  }
  return String(options['answer'] ?? '—')
}

function describeIndexedList(itemsValue: unknown, indexesValue: unknown): string {
  const items = asStringList(itemsValue)
  const indexes = asNumberList(indexesValue)
  return indexes.map(index => items[index] ?? '?').join(' → ') || '—'
}

function populateInputs(selector: string, values: string[]) {
  document.querySelectorAll<HTMLInputElement>(selector).forEach((inp, i) => { inp.value = values[i] ?? '' })
}

function inputValues(selector: string): string[] {
  return [...document.querySelectorAll<HTMLInputElement>(selector)].map(inp => inp.value.trim())
}

function checkRadio(name: string, value: string) {
  const radio = document.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`)
  if (radio) radio.checked = true
}

function checkedIndex(name: string): number | null {
  const radio = document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)
  return radio ? Number(radio.value) : null
}

function splitLines(value: string): string[] {
  return value.split('\n').map(item => item.trim()).filter(Boolean)
}

function splitComma(value: string): string[] {
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

function parseIndexList(value: string): number[] {
  if (!value.trim()) return []
  const indexes = value.split(',').map(item => Number(item.trim()))
  if (indexes.some(index => !Number.isInteger(index) || index < 0)) {
    throw new Error('Індекси мають бути цілими невід’ємними числами через кому.')
  }
  return indexes
}

function asOptionsObject(options: Question['options']): Record<string, unknown> {
  return options && typeof options === 'object' && !Array.isArray(options) ? options : {}
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function asNumberList(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : []
}
