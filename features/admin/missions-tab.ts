import { getAdminMissions, type Mission } from '../../features/api/client.js'
import { esc } from './ui.js'
import { $ } from '../../utils/dom.js'

const TRACK_LABELS: Record<string, string> = {
  informatics: 'Інформатика',
  'computational-thinking': 'Обчислювальне мислення',
  'ai-basics': 'Основи ШІ',
}
const KIND_LABELS: Record<string, string> = {
  'question-set': 'Набір питань',
  'sorting-game': 'Гра-сортування',
}
const STATUS_LABELS: Record<string, string> = {
  draft:    'Чернетка',
  active:   'Активна',
  archived: 'Архів',
}

let allMissions: Mission[] = []

export function initMissionsTab() {
  $<HTMLSelectElement>('m-filter-track').addEventListener('change', renderMissions)
  $<HTMLSelectElement>('m-filter-grade').addEventListener('change', renderMissions)
}

export async function loadMissionsTab() {
  const list = $('missions-list')
  list.innerHTML = '<p class="admin-loading-text">Завантаження…</p>'
  try {
    const { missions } = await getAdminMissions()
    allMissions = missions
    renderMissions()
  } catch (err) {
    list.innerHTML = ''
    const error = document.createElement('p')
    error.style.cssText = 'color:var(--clr-danger);padding:var(--sp-4)'
    error.textContent = (err as Error).message
    list.appendChild(error)
  }
}

function renderMissions() {
  const list  = $('missions-list')
  const track = $<HTMLSelectElement>('m-filter-track').value
  const grade = $<HTMLSelectElement>('m-filter-grade').value

  const filtered = allMissions.filter(m =>
    (!track || m.track === track) && (!grade || m.grade === Number(grade))
  )
  $('m-count').textContent = `${filtered.length} місій`

  if (!filtered.length) {
    list.innerHTML = `
      <div class="admin-empty-state"><div>
        <i class="fas fa-rocket admin-empty-state__icon" aria-hidden="true"></i>
        <p class="admin-empty-state__title">Місій не знайдено</p>
      </div></div>`
    return
  }

  list.innerHTML = ''
  for (const m of filtered) {
    const el = document.createElement('div')
    el.className = 'question-item'
    el.innerHTML = `
      <div class="question-item__left">
        <div style="display:flex;flex-wrap:wrap;gap:var(--sp-2);margin-bottom:var(--sp-2)">
          <span class="qi-badge qi-badge--grade">${esc(String(m.grade))} клас</span>
          <span class="qi-badge qi-badge--practice">${esc(TRACK_LABELS[m.track] ?? m.track)}</span>
          <span class="qi-badge qi-badge--type">${esc(KIND_LABELS[m.kind] ?? m.kind)}</span>
          <span class="qi-badge ${m.status === 'active' ? 'qi-badge--easy' : 'qi-badge--medium'}">${esc(STATUS_LABELS[m.status] ?? m.status)}</span>
        </div>
        <p class="question-item__text">${esc(m.title)}</p>
        <p class="question-item__meta">${esc(m.id)} · v${esc(String(m.version))}</p>
      </div>`
    list.appendChild(el)
  }
}
