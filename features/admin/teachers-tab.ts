import { getAdminTeachers, setTeacherStatus } from '../../features/api/client.js'
import { esc, showModal } from './ui.js'
import { $, $maybe } from '../../utils/dom.js'

interface Teacher {
  id: string
  email: string
  name: string | null
  status: string
  createdAt: string
}

export function initTeachersTab() {}

export async function loadTeachers() {
  const list = $maybe('teachers-list')
  if (!list) return
  list.innerHTML = '<p class="admin-loading-text">Завантаження…</p>'

  try {
    const { teachers } = await getAdminTeachers()

    if (!teachers.length) {
      list.innerHTML = `
        <div class="admin-empty-state"><div>
          <i class="fas fa-users admin-empty-state__icon"></i>
          <p class="admin-empty-state__title">Вчителів ще немає</p>
        </div></div>`
      return
    }

    list.innerHTML = ''
    teachers.forEach(t => list.appendChild(buildTeacherRow(t)))
  } catch (err) {
    list.innerHTML = `<p style="color:var(--clr-danger);padding:var(--sp-4)">${esc((err as Error).message)}</p>`
  }
}

function buildTeacherRow(t: Teacher): HTMLElement {
  const el   = document.createElement('div')
  el.className = 'admin-teacher-row'
  const date = t.createdAt ? new Date(t.createdAt).toLocaleDateString('uk-UA') : ''
  const isBlocked = t.status === 'blocked'

  el.innerHTML = `
    <div class="admin-row__main">
      <p class="admin-row__title">${esc(t.email)}</p>
      <p class="admin-row__meta">${esc(t.name ?? '')}${isBlocked ? ' · <span class="badge badge--blocked">Заблоковано</span>' : ''}</p>
    </div>
    <div class="admin-row__actions">
      <p class="admin-row__meta" style="font-size:var(--font-size-xs)">${esc(date)}</p>
      <button class="btn-adm-${isBlocked ? 'emerald' : 'danger'} btn-sm btn-teacher-status">
        ${isBlocked ? '<i class="fas fa-unlock"></i> Розблокувати' : '<i class="fas fa-ban"></i> Заблокувати'}
      </button>
    </div>`

  el.querySelector<HTMLButtonElement>('.btn-teacher-status')!.addEventListener('click', async () => {
    const newStatus = isBlocked ? 'active' : 'blocked'
    const label     = isBlocked ? 'розблокувати' : 'заблокувати'
    if (!confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} вчителя ${t.email}?`)) return
    try {
      await setTeacherStatus(t.id, newStatus)
      await loadTeachers()
    } catch (err) {
      showModal((err as Error).message)
    }
  })

  return el
}
