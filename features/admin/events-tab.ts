import {
  createEvent, getAdminEvents, getAllAdminQuestions, getEventQuestions, getEventReadiness,
  setEventQuestions, updateEvent,
  type AdminOlympiadEventReadiness, type AdminOlympiadSetReadiness,
  type AdminOlympiadReadinessIssue,
  type OlympiadEvent, type EventQuestion, type Question,
} from '../api/client.js'
import { EVENT_STATUS_LABELS, buildEventPayload, formatEventDate } from './event-utils.js'
import { esc, showModal, showConfirm } from './ui.js'
import { $, $maybe } from '../../utils/dom.js'
import { createPager } from './pagination.js'
import { focusQuestionInBank } from './questions-tab.js'

interface Deps { refreshStats?: () => void }

const pager = createPager({
  hostId: 'events-pager',
  storageKey: 'admin:events:page-size',
  noun: 'подій',
  onChange: () => { void loadEvents() },
})

let deps: Deps = {}
let events: OlympiadEvent[] = []
let selectedEvent: OlympiadEvent | null = null
let pickerGrade = 1
let selectedQuestionIds = new Set<string>()

export function initEventsTab(nextDeps: Deps = {}) {
  deps = { ...deps, ...nextDeps }

  $maybe('create-event-btn')?.addEventListener('click', () => {
    resetForm()
    $maybe('event-form-section')?.classList.remove('hidden')
    $maybe<HTMLInputElement>('event-title')?.focus()
  })

  $maybe('cancel-event-btn')?.addEventListener('click', () => {
    $maybe('event-form-section')?.classList.add('hidden')
  })

  $maybe<HTMLFormElement>('event-form')?.addEventListener('submit', handleSubmit)
  ensureQuestionPicker()
}

export async function loadEvents() {
  const list = $maybe('events-list')
  if (!list) return
  list.innerHTML = '<p class="admin-loading-text">Завантаження…</p>'

  try {
    const data = await getAdminEvents(pager.range())
    events = data.events
    renderEvents(list, events)
    pager.apply(data.page)
    // The active-events tile counts the whole table, so it comes from
    // /api/admin/stats — one page could not answer it.
    deps.refreshStats?.()
  } catch (err) {
    pager.clear()
    list.innerHTML = `<p class="admin-list-error">${esc((err as Error).message)}</p>`
  }
}

async function handleSubmit(e: Event) {
  e.preventDefault()
  const errorEl  = $<HTMLElement>('event-form-error')
  const submitBtn = $<HTMLButtonElement>('event-submit-btn')
  errorEl.textContent = ''

  const title    = $<HTMLInputElement>('event-title').value
  const startsAt = $<HTMLInputElement>('event-from').value
  const endsAt   = $<HTMLInputElement>('event-to').value
  const questionsCount = Number($<HTMLInputElement>('event-questions').value)
  const timeMinutes = Number($<HTMLInputElement>('event-time').value)

  if (!title.trim()) { errorEl.textContent = 'Введіть назву події.'; return }
  if (!startsAt || !endsAt) { errorEl.textContent = 'Вкажіть початок і кінець події.'; return }
  if (new Date(startsAt) >= new Date(endsAt)) {
    errorEl.textContent = 'Дата завершення має бути пізніше дати початку.'
    return
  }
  if (!Number.isInteger(questionsCount) || questionsCount < 1 || questionsCount > 100) {
    errorEl.textContent = 'Кількість питань має бути від 1 до 100.'
    return
  }
  if (!Number.isInteger(timeMinutes) || timeMinutes < 1 || timeMinutes > 100) {
    errorEl.textContent = 'Час проходження має бути від 1 до 100 хвилин.'
    return
  }

  submitBtn.disabled    = true
  submitBtn.textContent = 'Збереження…'
  try {
    const { event } = await createEvent({
      ...buildEventPayload({ title, startsAt, endsAt }),
      questionsCount,
      timeMinutes,
    })
    $maybe('event-form-section')?.classList.add('hidden')
    resetForm()
    await loadEvents()
    deps.refreshStats?.()
    // Підсвітити нову подію і показати підказку
    highlightEvent(event.id)
    showModal(
      `✅ Подія «${title}» створена у статусі «Чернетка».\n\n` +
      `Щоб вчителі могли реєструватись — опублікуй подію (кнопка «Опублікувати» на картці).`
    )
  } catch (err) {
    errorEl.textContent = (err as Error).message
  } finally {
    submitBtn.disabled    = false
    submitBtn.textContent = 'Зберегти'
  }
}

function renderEvents(list: HTMLElement, items: OlympiadEvent[]) {
  if (!items.length) {
    list.innerHTML = `
      <div class="admin-empty-state">
        <div>
          <i class="fas fa-calendar-times admin-empty-state__icon" aria-hidden="true"></i>
          <p class="admin-empty-state__title">Олімпіадних подій ще немає</p>
          <p class="admin-empty-state__sub">Натисни «Нова олімпіада», щоб створити першу.</p>
        </div>
      </div>`
    return
  }

  list.innerHTML = ''
  items.forEach(event => list.appendChild(buildEventCard(event)))
}

function buildEventCard(event: OlympiadEvent): HTMLElement {
  const template = document.getElementById('event-card-template') as HTMLTemplateElement
  const node = template.content.firstElementChild!.cloneNode(true) as HTMLElement

  node.querySelector<HTMLElement>('.event-title')!.textContent = event.title
  const badge = node.querySelector<HTMLElement>('.event-status-badge')!
  badge.textContent = EVENT_STATUS_LABELS[event.status] ?? event.status
  badge.classList.add(`event-status-badge--${event.status}`)
  node.querySelector<HTMLElement>('.event-from')!.textContent = formatEventDate(event.startsAt)
  node.querySelector<HTMLElement>('.event-to')!.textContent   = formatEventDate(event.endsAt)
  node.querySelector<HTMLElement>('.event-questions')!.textContent = String(event.questionsCount)
  node.querySelector<HTMLElement>('.event-time')!.textContent = String(event.timeMinutes)

  wireStatusButton(node, event, '.btn-activate', 'active')
  wireStatusButton(node, event, '.btn-archive',  'archived')

  // Кнопка «Опублікувати» — тільки для draft
  if (event.status === 'draft') {
    const publishBtn = document.createElement('button')
    publishBtn.type      = 'button'
    publishBtn.className = 'btn-event-publish'
    publishBtn.innerHTML = '<i class="fas fa-globe" aria-hidden="true"></i> Опублікувати'
    publishBtn.title     = 'Зробити подію доступною для реєстрації вчителів'
    publishBtn.addEventListener('click', () => {
      showConfirm(
        `Опублікувати подію «${event.title}»?\n\nВчителі зможуть бачити її та реєструвати класи. Набори питань буде зафіксовано без повернення в чернетку.`,
        async () => {
          try {
            await updateEvent(event.id, { status: 'published' })
            await loadEvents()
            deps.refreshStats?.()
          } catch (err) {
            showModal((err as Error).message)
          }
        }
      )
    })
    node.querySelector<HTMLElement>('.event-card__actions')!.prepend(publishBtn)
  }

  const questionsBtn = document.createElement('button')
  questionsBtn.type      = 'button'
  questionsBtn.className = 'btn-event-questions'
  questionsBtn.innerHTML = '<i class="fas fa-tasks" aria-hidden="true"></i> Питання'
  questionsBtn.addEventListener('click', () => openQuestionPicker(event))
  node.querySelector<HTMLElement>('.event-card__actions')!.prepend(questionsBtn)

  if (event.status === 'published') node.querySelector<HTMLElement>('.btn-activate')?.classList.remove('hidden')
  if (event.status !== 'archived') node.querySelector<HTMLElement>('.btn-archive')?.classList.remove('hidden')

  return node
}

function highlightEvent(eventId: string) {
  // Знаходимо картку після рендеру і скролимо до неї
  setTimeout(() => {
    const list = $maybe('events-list')
    if (!list) return
    const cards = list.querySelectorAll<HTMLElement>('.event-card')
    // Перша картка — найновіша (список відсортований desc)
    if (cards.length) {
      cards[0].scrollIntoView({ behavior: 'smooth', block: 'center' })
      cards[0].classList.add('event-card--highlight')
      setTimeout(() => cards[0].classList.remove('event-card--highlight'), 3000)
    }
  }, 100)
}

const STATUS_CONFIRM_MSGS: Partial<Record<OlympiadEvent['status'], (title: string) => string>> = {
  active:   t => `Зробити подію «${t}» активною?\n\nУчні зможуть проходити олімпіаду за кодами.`,
  archived: t => `Архівувати подію «${t}»?\n\nУчні більше не зможуть проходити олімпіаду. Результати збережуться.`,
}

function wireStatusButton(node: HTMLElement, event: OlympiadEvent, selector: string, status: OlympiadEvent['status']) {
  node.querySelector<HTMLButtonElement>(selector)?.addEventListener('click', () => {
    const msgFn = STATUS_CONFIRM_MSGS[status]
    const msg = msgFn ? msgFn(event.title) : `Змінити статус на «${status}»?`
    showConfirm(msg, async () => {
      try {
        await updateEvent(event.id, { status })
        await loadEvents()
        deps.refreshStats?.()
      } catch (err) {
        showModal((err as Error).message)
      }
    })
  })
}

function resetForm() {
  $maybe<HTMLFormElement>('event-form')?.reset()
  const eqEl = $maybe<HTMLInputElement>('event-questions')
  if (eqEl) eqEl.value = '24'
  const etEl = $maybe<HTMLInputElement>('event-time')
  if (etEl) etEl.value = '45'
  const errEl = $maybe('event-form-error')
  if (errEl) errEl.textContent = ''
}

// ─── Question picker ──────────────────────────────────────────────────────────

function ensureQuestionPicker() {
  if (document.getElementById('event-question-picker')) return
  const list = $maybe('events-list')
  if (!list) return

  const picker = document.createElement('div')
  picker.id        = 'event-question-picker'
  picker.className = 'event-question-picker hidden'
  picker.innerHTML = `
    <div class="event-question-picker__head">
      <div>
        <p class="event-question-picker__label">Набір питань для події</p>
        <h3 id="eqp-title" class="event-question-picker__title"></h3>
      </div>
      <button id="eqp-close" class="btn-adm-slate" type="button">
        <i class="fas fa-times" aria-hidden="true"></i> Закрити
      </button>
    </div>
    <div class="event-question-picker__toolbar">
      <div class="selector-grid selector-grid--grade" role="group" aria-label="Клас для набору питань">
        <button type="button" data-eqp-grade="1" class="selector-btn" aria-pressed="true">1</button>
        <button type="button" data-eqp-grade="2" class="selector-btn" aria-pressed="false">2</button>
        <button type="button" data-eqp-grade="3" class="selector-btn" aria-pressed="false">3</button>
        <button type="button" data-eqp-grade="4" class="selector-btn" aria-pressed="false">4</button>
      </div>
      <button id="eqp-save" class="btn-adm-emerald" type="button">
        <i class="fas fa-save" aria-hidden="true"></i> Зберегти набір
      </button>
    </div>
    <p id="eqp-status" class="event-question-picker__status" role="status" aria-live="polite"></p>
    <div id="eqp-readiness" class="event-question-picker__readiness" aria-live="polite"></div>
    <div id="eqp-list" class="event-question-list"></div>`

  list.before(picker)

  document.getElementById('eqp-close')!.addEventListener('click', closeQuestionPicker)
  document.getElementById('eqp-save')!.addEventListener('click', saveQuestionPicker)
  picker.querySelectorAll<HTMLButtonElement>('[data-eqp-grade]').forEach(btn => {
    btn.addEventListener('click', async () => {
      picker.querySelectorAll<HTMLButtonElement>('[data-eqp-grade]').forEach(b => b.setAttribute('aria-pressed', 'false'))
      btn.setAttribute('aria-pressed', 'true')
      pickerGrade = Number(btn.dataset['eqpGrade'])
      if (selectedEvent) await loadQuestionPicker()
    })
  })
}

async function openQuestionPicker(event: OlympiadEvent) {
  ensureQuestionPicker()
  selectedEvent       = event
  pickerGrade         = 1
  selectedQuestionIds = new Set()
  document.getElementById('eqp-title')!.textContent = event.title
  const saveBtn = document.getElementById('eqp-save') as HTMLButtonElement
  const readOnly = event.status !== 'draft'
  saveBtn.disabled = readOnly
  saveBtn.innerHTML = readOnly
    ? '<i class="fas fa-lock" aria-hidden="true"></i> Набір зафіксовано'
    : '<i class="fas fa-save" aria-hidden="true"></i> Зберегти набір'
  document.getElementById('event-question-picker')!.classList.remove('hidden')
  document.querySelectorAll<HTMLButtonElement>('[data-eqp-grade]').forEach(btn => {
    btn.setAttribute('aria-pressed', btn.dataset['eqpGrade'] === '1' ? 'true' : 'false')
  })
  await loadQuestionPicker()
}

function closeQuestionPicker() {
  document.getElementById('event-question-picker')?.classList.add('hidden')
  selectedEvent       = null
  selectedQuestionIds = new Set()
}

async function loadQuestionPicker() {
  const list   = document.getElementById('eqp-list')!
  const status = document.getElementById('eqp-status')!
  list.innerHTML    = '<p class="admin-loading-text">Завантаження питань…</p>'
  status.textContent = ''

  try {
    // The picker must see every eligible question, so it walks all pages.
    const [allQuestions, { questions: selectedQuestions }, { readiness }] = await Promise.all([
      getAllAdminQuestions({ grade: pickerGrade, isOlympiad: true, status: 'published' }),
      getEventQuestions(selectedEvent!.id, pickerGrade),
      getEventReadiness(selectedEvent!.id),
    ])

    selectedQuestionIds = new Set(selectedQuestions.map((q: EventQuestion) => q.id))
    renderQuestionPickerList(allQuestions)
    updateQuestionPickerStatus()
    renderEventReadiness(readiness)
  } catch (err) {
    list.innerHTML = `<p class="admin-list-error">${esc((err as Error).message)}</p>`
  }
}

function renderQuestionPickerList(questions: Question[]) {
  const list = document.getElementById('eqp-list')!
  const readOnly = selectedEvent?.status !== 'draft'
  if (!questions.length) {
    list.innerHTML = `
      <div class="admin-empty-state">
        <div>
          <i class="fas fa-question-circle admin-empty-state__icon" aria-hidden="true"></i>
          <p class="admin-empty-state__title">Питань для цього класу ще немає</p>
          <p class="admin-empty-state__sub">Додайте олімпіадні питання в банку питань.</p>
        </div>
      </div>`
    return
  }

  list.innerHTML = ''
  questions.forEach(question => {
    const row = document.createElement('label')
    row.className  = `event-question-row${readOnly ? ' event-question-row--readonly' : ''}`
    const checked  = selectedQuestionIds.has(question.id)
    row.innerHTML  = `
      <input type="checkbox" ${checked ? 'checked' : ''} ${readOnly ? 'disabled' : ''} value="${esc(question.id)}">
      <span class="event-question-row__main">
        <span class="event-question-row__title">${esc(question.q)}</span>
        <span class="event-question-row__meta">${esc(question.difficulty ?? '—')} · ${esc(String(question.grade ?? pickerGrade))} клас</span>
      </span>`
    row.querySelector<HTMLInputElement>('input')!.addEventListener('change', e => {
      const cb = e.target as HTMLInputElement
      if (cb.checked) selectedQuestionIds.add(question.id)
      else            selectedQuestionIds.delete(question.id)
      updateQuestionPickerStatus()
    })
    list.appendChild(row)
  })
}

function updateQuestionPickerStatus() {
  const status = document.getElementById('eqp-status')
  if (!status) return
  status.textContent = selectedEvent?.status === 'draft'
    ? `Обрано: ${selectedQuestionIds.size} питань для ${pickerGrade} класу`
    : `Лише перегляд: зафіксовано ${selectedQuestionIds.size} питань для ${pickerGrade} класу`
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
    if (!METADATA_ISSUE_LABELS[issue.code]) {
      result.push(issue)
      continue
    }
    const existing = grouped.get(issue.code)
    if (existing) {
      existing.questionIds = [...new Set([...(existing.questionIds ?? []), ...(issue.questionIds ?? [])])]
    } else {
      const aggregated = { ...issue, questionIds: [...(issue.questionIds ?? [])] }
      grouped.set(issue.code, aggregated)
      result.push(aggregated)
    }
  }
  for (const issue of grouped.values()) {
    issue.message = `${METADATA_ISSUE_LABELS[issue.code]}: ${issue.questionIds?.length ?? 0} пит.`
  }
  return result
}

function renderReadinessIssue(issue: AdminOlympiadReadinessIssue): string {
  const questionId = issue.questionIds?.[0]
  const link = questionId
    ? ` <button type="button" class="btn-adm-ghost btn--sm" data-question-id="${esc(questionId)}">Відкрити${issue.questionIds!.length > 1 ? ` (+${issue.questionIds!.length - 1})` : ''}</button>`
    : ''
  return `<li class="${issue.severity === 'error' ? 'event-readiness__error' : ''}">${esc(issue.message)}${link}</li>`
}

function renderGradeReadiness(grade: AdminOlympiadSetReadiness): string {
  const errors = grade.issues.filter(issue => issue.severity === 'error')
  const warnings = groupReadinessIssues(grade.issues.filter(issue => issue.severity === 'warning'))
  const status = !grade.ready
    ? 'Заблоковано'
    : warnings.length
      ? 'Можна публікувати, є зауваження'
      : 'Відповідає стандарту'
  return `<section class="event-readiness-grade ${grade.ready ? 'event-readiness-grade--ready' : 'event-readiness-grade--blocked'}">
    <div class="event-readiness-grade__head">
      <strong>${grade.grade} клас — ${status}</strong>
      <span>${grade.metrics.questionCount}/${grade.policy.questionCount} пит. · ${grade.metrics.effortUnits} од. навантаження</span>
    </div>
    <p>${grade.metrics.mechanics.length} механік · ${grade.metrics.topics} тем · ${grade.metrics.essentialImages} потрібних зображень</p>
    ${errors.length ? `<ul>${errors.map(renderReadinessIssue).join('')}</ul>` : ''}
    ${warnings.length ? `<details><summary>Групи попереджень: ${warnings.length}</summary><ul>${warnings.map(renderReadinessIssue).join('')}</ul></details>` : ''}
  </section>`
}

function renderEventReadiness(readiness: AdminOlympiadEventReadiness) {
  const host = document.getElementById('eqp-readiness')
  if (!host) return
  const globalErrors = readiness.issues.filter(issue => issue.severity === 'error')
  const warningCount = groupReadinessIssues(readiness.issues.filter(issue => issue.severity === 'warning')).length
    + readiness.grades.reduce(
      (total, grade) => total + groupReadinessIssues(
        grade.issues.filter(issue => issue.severity === 'warning'),
      ).length,
      0,
    )
  host.innerHTML = `
    <div class="event-readiness-summary ${readiness.ready ? 'event-readiness-summary--ready' : 'event-readiness-summary--blocked'}">
      <strong>${readiness.ready
        ? warningCount
          ? `Можна публікувати, але лишилося зауважень: ${warningCount}`
          : 'Набір повністю відповідає стандарту'
        : 'Публікацію й активацію заблоковано'}</strong>
      <span>Подія: ${readiness.event.timeMinutes}/45 хв · ліміт ${readiness.event.questionsCount}/24</span>
    </div>
    ${globalErrors.length ? `<ul>${globalErrors.map(renderReadinessIssue).join('')}</ul>` : ''}
    <div class="event-readiness-grades">${readiness.grades.map(renderGradeReadiness).join('')}</div>`
  for (const button of host.querySelectorAll<HTMLButtonElement>('[data-question-id]')) {
    button.addEventListener('click', () => {
      const questionId = button.dataset.questionId
      if (!questionId) return
      closeQuestionPicker()
      focusQuestionInBank(questionId, 'main_round')
    })
  }
}

async function saveQuestionPicker() {
  if (!selectedEvent) return

  const btn    = document.getElementById('eqp-save') as HTMLButtonElement
  const status = document.getElementById('eqp-status')!
  btn.disabled    = true
  btn.innerHTML   = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Збереження…'

  try {
    const questionIds = [...selectedQuestionIds]
    const result = await setEventQuestions(selectedEvent.id, { grade: pickerGrade, questionIds })
    if (result.readiness) renderEventReadiness(result.readiness)
    status.textContent = `Збережено ${questionIds.length} питань для ${pickerGrade} класу`
  } catch (err) {
    showModal((err as Error).message)
  } finally {
    const readOnly = selectedEvent.status !== 'draft'
    btn.disabled  = readOnly
    btn.innerHTML = readOnly
      ? '<i class="fas fa-lock" aria-hidden="true"></i> Набір зафіксовано'
      : '<i class="fas fa-save" aria-hidden="true"></i> Зберегти набір'
  }
}
