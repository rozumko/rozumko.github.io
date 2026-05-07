// TODO: додати типи HTMLElement до DOM-запитів під час наступного UI-рефакторингу
// @ts-nocheck
import { createEvent, getAdminEvents, updateEvent } from '../api/client.js'
import {
  EVENT_STATUS_LABELS,
  buildEventPayload,
  countActiveEvents,
  formatEventDate,
} from './event-utils.mjs'
import { esc, showModal } from './ui.js'

let deps = { refreshStats: () => {} }
let events = []

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
