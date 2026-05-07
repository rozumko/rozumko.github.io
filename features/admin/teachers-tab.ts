import { getAdminTeachers } from '../../features/api/client.js'
import { esc } from './ui.js'

export function initTeachersTab() {}

export async function loadTeachers() {
  const list = document.getElementById('teachers-list')
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
    teachers.forEach(t => {
      const el = document.createElement('div')
      el.className = 'admin-teacher-row'
      const date = t.createdAt ? new Date(t.createdAt).toLocaleDateString('uk-UA') : ''
      el.innerHTML = `
        <div class="admin-row__main">
          <p class="admin-row__title">${esc(t.email)}</p>
          <p class="admin-row__meta">${esc(t.name || '')}</p>
        </div>
        <div style="text-align:right">
          <p class="admin-row__meta" style="font-size:var(--font-size-xs)">${esc(date)}</p>
        </div>`
      list.appendChild(el)
    })
  } catch (err) {
    list.innerHTML = `<p style="color:var(--clr-danger);padding:var(--sp-4)">${err.message}</p>`
  }
}
