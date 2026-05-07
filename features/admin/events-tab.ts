// TODO: додати типи HTMLElement до DOM-запитів під час наступного UI-рефакторингу
// @ts-nocheck
import { createEvent, getAdminEvents, getAdminQuestions, getEventQuestions, setEventQuestions, updateEvent } from '../api/client.js'
import {
  EVENT_STATUS_LABELS,
  buildEventPayload,
  countActiveEvents,
  formatEventDate,
} from './event-utils.mjs'
import { esc, showModal } from './ui.js'

let deps = { refreshStats: () => {} }
let events = []
let selectedEvent = null
let pickerGrade = 1
let selectedQuestionIds = new Set()

export function initEventsTab(nextDeps = {}) {
  deps = { ...deps, ...nextDeps }

  document.getElementById('create-event-btn')?.addEventListener('click', () => {
    resetForm()
    document.getElementById('event-form-section').classList.remove('hidden')
    document.getElementById('event-title')?.focus()
  })

  document.getElementById('cancel-event-btn')?.addEventListener('click', () => {
    document.getElementById('event-form-section').classList.add('hidden')
  })

  document.getElementById('event-form')?.addEventListener('submit', handleSubmit)
  ensureQuestionPicker()
}

export async function loadEvents() {
  const list = document.getElementById('events-list')
  if (!list) return
  list.innerHTML = '<p class="admin-loading-text">Завантаження…</p>'

  try {
    const data = await getAdminEvents()
    events = data.events
    renderEvents(list, events)
    updateEventsStat(events)
  } catch (err) {
    list.innerHTML = `<p style="color:var(--clr-danger);padding:var(--sp-4)">${esc(err.message)}</p>`
  }
}

async function handleSubmit(e) {
  e.preventDefault()
  const errorEl = document.getElementById('event-form-error')
  const submitBtn = document.getElementById('event-submit-btn')
  errorEl.textContent = ''

  const title = document.getElementById('event-title').value
  const startsAt = document.getElementById('event-from').value
  const endsAt = document.getElementById('event-to').value

  if (!title.trim()) { errorEl.textContent = 'Введіть назву події.'; return }
  if (!startsAt || !endsAt) { errorEl.textContent = 'Вкажіть початок і кінець події.'; return }
  if (new Date(startsAt) >= new Date(endsAt)) {
    errorEl.textContent = 'Дата завершення має бути пізніше дати початку.'
    return
  }

  submitBtn.disabled = true
  submitBtn.textContent = 'Збереження…'
  try {
    await createEvent(buildEventPayload({ title, startsAt, endsAt }))
    document.getElementById('event-form-section').classList.add('hidden')
    resetForm()
    await loadEvents()
    deps.refreshStats?.()
  } catch (err) {
    errorEl.textContent = err.message
  } finally {
    submitBtn.disabled = false
    submitBtn.textContent = 'Зберегти'
  }
}

function renderEvents(list, items) {
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

function buildEventCard(event) {
  const template = document.getElementById('event-card-template')
  const node = template.content.firstElementChild.cloneNode(true)

  node.querySelector('.event-title').textContent = event.title
  const badge = node.querySelector('.event-status-badge')
  badge.textContent = EVENT_STATUS_LABELS[event.status] ?? event.status
  badge.classList.add(`event-status-badge--${event.status}`)
  node.querySelector('.event-from').textContent = formatEventDate(event.startsAt)
  node.querySelector('.event-to').textContent = formatEventDate(event.endsAt)
  node.querySelector('.event-questions').textContent = '—'
  node.querySelector('.event-time').textContent = '—'
  node.querySelector('.event-retry').textContent = 'Набір питань буде додано наступним кроком.'

  wireStatusButton(node, event, '.btn-activate', 'active')
  wireStatusButton(node, event, '.btn-archive', 'archived')
  wireStatusButton(node, event, '.btn-draft', 'draft')

  const questionsBtn = document.createElement('button')
  questionsBtn.type = 'button'
  questionsBtn.className = 'btn-event-questions'
  questionsBtn.innerHTML = '<i class="fas fa-tasks" aria-hidden="true"></i> Питання'
  questionsBtn.addEventListener('click', () => openQuestionPicker(event))
  node.querySelector('.event-card__actions').prepend(questionsBtn)

  if (event.status !== 'active') node.querySelector('.btn-activate').classList.remove('hidden')
  if (event.status !== 'archived') node.querySelector('.btn-archive').classList.remove('hidden')
  if (event.status !== 'draft') node.querySelector('.btn-draft').classList.remove('hidden')

  return node
}

function wireStatusButton(node, event, selector, status) {
  node.querySelector(selector).addEventListener('click', async () => {
    try {
      await updateEvent(event.id, { status })
      await loadEvents()
      deps.refreshStats?.()
    } catch (err) {
      showModal(err.message)
    }
  })
}

function updateEventsStat(items) {
  const el = document.getElementById('stat-events')
  if (el) el.textContent = String(countActiveEvents(items))
}

function resetForm() {
  document.getElementById('event-form')?.reset()
  document.getElementById('event-questions').value = '10'
  document.getElementById('event-time').value = '15'
  document.getElementById('event-form-error').textContent = ''
}

function ensureQuestionPicker() {
  if (document.getElementById('event-question-picker')) return

  const list = document.getElementById('events-list')
  if (!list) return

  const picker = document.createElement('div')
  picker.id = 'event-question-picker'
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

  document.getElementById('eqp-close').addEventListener('click', closeQuestionPicker)
  document.getElementById('eqp-save').addEventListener('click', saveQuestionPicker)
  picker.querySelectorAll('[data-eqp-grade]').forEach(btn => {
    btn.addEventListener('click', async () => {
      picker.querySelectorAll('[data-eqp-grade]').forEach(item => item.setAttribute('aria-pressed', 'false'))
      btn.setAttribute('aria-pressed', 'true')
      pickerGrade = Number(btn.dataset.eqpGrade)
      if (selectedEvent) await loadQuestionPicker()
    })
  })
}

async function openQuestionPicker(event) {
  ensureQuestionPicker()
  selectedEvent = event
  pickerGrade = 1
  selectedQuestionIds = new Set()
  document.getElementById('eqp-title').textContent = event.title
  document.getElementById('event-question-picker').classList.remove('hidden')
  document.querySelectorAll('[data-eqp-grade]').forEach(btn => {
    btn.setAttribute('aria-pressed', btn.dataset.eqpGrade === '1' ? 'true' : 'false')
  })
  await loadQuestionPicker()
}

function closeQuestionPicker() {
  document.getElementById('event-question-picker')?.classList.add('hidden')
  selectedEvent = null
  selectedQuestionIds = new Set()
}

async function loadQuestionPicker() {
  const list = document.getElementById('eqp-list')
  const status = document.getElementById('eqp-status')
  list.innerHTML = '<p class="admin-loading-text">Завантаження питань…</p>'
  status.textContent = ''

  try {
    const [{ questions: allQuestions }, { questions: selectedQuestions }] = await Promise.all([
      getAdminQuestions({ grade: pickerGrade, isOlympiad: true }),
      getEventQuestions(selectedEvent.id, pickerGrade),
    ])

    selectedQuestionIds = new Set(selectedQuestions.map(question => question.id))
    renderQuestionPickerList(allQuestions)
    updateQuestionPickerStatus()
  } catch (err) {
    list.innerHTML = `<p style="color:var(--clr-danger);padding:var(--sp-4)">${esc(err.message)}</p>`
  }
}

function renderQuestionPickerList(questions) {
  const list = document.getElementById('eqp-list')
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
    row.className = 'event-question-row'
    const checked = selectedQuestionIds.has(question.id)
    row.innerHTML = `
      <input type="checkbox" ${checked ? 'checked' : ''} value="${esc(question.id)}">
      <span class="event-question-row__main">
        <span class="event-question-row__title">${esc(question.q)}</span>
        <span class="event-question-row__meta">${esc(question.difficulty ?? '—')} · ${esc(String(question.grade ?? pickerGrade))} клас</span>
      </span>`
    row.querySelector('input').addEventListener('change', e => {
      if (e.target.checked) selectedQuestionIds.add(question.id)
      else selectedQuestionIds.delete(question.id)
      updateQuestionPickerStatus()
    })
    list.appendChild(row)
  })
}

function updateQuestionPickerStatus() {
  const status = document.getElementById('eqp-status')
  status.textContent = `Обрано: ${selectedQuestionIds.size} питань для ${pickerGrade} класу`
}

async function saveQuestionPicker() {
  if (!selectedEvent) return

  const btn = document.getElementById('eqp-save')
  const status = document.getElementById('eqp-status')
  btn.disabled = true
  btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Збереження…'

  try {
    const questionIds = [...selectedQuestionIds]
    await setEventQuestions(selectedEvent.id, { grade: pickerGrade, questionIds })
    status.textContent = `Збережено ${questionIds.length} питань для ${pickerGrade} класу`
  } catch (err) {
    showModal(err.message)
  } finally {
    btn.disabled = false
    btn.innerHTML = '<i class="fas fa-save" aria-hidden="true"></i> Зберегти набір'
  }
}
