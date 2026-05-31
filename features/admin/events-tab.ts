import {
  createEvent, getAdminEvents, getAdminQuestions, getEventQuestions, setEventQuestions, updateEvent,
  type OlympiadEvent, type EventQuestion, type Question,
} from '../api/client.js'
import { EVENT_STATUS_LABELS, buildEventPayload, countActiveEvents, formatEventDate } from './event-utils.js'
import { esc, showModal, showConfirm } from './ui.js'
import { $, $maybe } from '../../utils/dom.js'

interface Deps { refreshStats?: () => void }

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
    const data = await getAdminEvents()
    events = data.events
    renderEvents(list, events)
    updateEventsStat(events)
  } catch (err) {
    list.innerHTML = `<p style="color:var(--clr-danger);padding:var(--sp-4)">${esc((err as Error).message)}</p>`
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
  wireStatusButton(node, event, '.btn-draft',    'draft')

  // Кнопка «Опублікувати» — тільки для draft
  if (event.status === 'draft') {
    const publishBtn = document.createElement('button')
    publishBtn.type      = 'button'
    publishBtn.className = 'btn-event-publish'
    publishBtn.innerHTML = '<i class="fas fa-globe" aria-hidden="true"></i> Опублікувати'
    publishBtn.title     = 'Зробити подію доступною для реєстрації вчителів'
    publishBtn.addEventListener('click', () => {
      showConfirm(
        `Опублікувати подію «${event.title}»?\n\nВчителі зможуть бачити її та реєструвати класи. Назад у чернетку можна повернути.`,
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

  if (event.status !== 'active')   node.querySelector<HTMLElement>('.btn-activate')?.classList.remove('hidden')
  if (event.status !== 'archived') node.querySelector<HTMLElement>('.btn-archive')?.classList.remove('hidden')
  if (event.status !== 'draft')    node.querySelector<HTMLElement>('.btn-draft')?.classList.remove('hidden')

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
  draft:    t => `Повернути подію «${t}» у чернетку?\n\nВона стане недоступною для вчителів та учнів.`,
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

function updateEventsStat(items: OlympiadEvent[]) {
  const el = $maybe('stat-events')
  if (el) el.textContent = String(countActiveEvents(items))
}

function resetForm() {
  $maybe<HTMLFormElement>('event-form')?.reset()
  const eqEl = $maybe<HTMLInputElement>('event-questions')
  if (eqEl) eqEl.value = '10'
  const etEl = $maybe<HTMLInputElement>('event-time')
  if (etEl) etEl.value = '15'
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
    const [{ questions: allQuestions }, { questions: selectedQuestions }] = await Promise.all([
      getAdminQuestions({ grade: pickerGrade, isOlympiad: true }),
      getEventQuestions(selectedEvent!.id, pickerGrade),
    ])

    selectedQuestionIds = new Set(selectedQuestions.map((q: EventQuestion) => q.id))
    renderQuestionPickerList(allQuestions)
    updateQuestionPickerStatus()
  } catch (err) {
    list.innerHTML = `<p style="color:var(--clr-danger);padding:var(--sp-4)">${esc((err as Error).message)}</p>`
  }
}

function renderQuestionPickerList(questions: Question[]) {
  const list = document.getElementById('eqp-list')!
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
    row.className  = 'event-question-row'
    const checked  = selectedQuestionIds.has(question.id)
    row.innerHTML  = `
      <input type="checkbox" ${checked ? 'checked' : ''} value="${esc(question.id)}">
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
  if (status) status.textContent = `Обрано: ${selectedQuestionIds.size} питань для ${pickerGrade} класу`
}

async function saveQuestionPicker() {
  if (!selectedEvent) return

  const btn    = document.getElementById('eqp-save') as HTMLButtonElement
  const status = document.getElementById('eqp-status')!
  btn.disabled    = true
  btn.innerHTML   = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Збереження…'

  try {
    const questionIds = [...selectedQuestionIds]
    await setEventQuestions(selectedEvent.id, { grade: pickerGrade, questionIds })
    status.textContent = `Збережено ${questionIds.length} питань для ${pickerGrade} класу`
  } catch (err) {
    showModal((err as Error).message)
  } finally {
    btn.disabled  = false
    btn.innerHTML = '<i class="fas fa-save" aria-hidden="true"></i> Зберегти набір'
  }
}
