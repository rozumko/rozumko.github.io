import { getAdminTeachers, setTeacherStatus, type AdminTeacher } from '../../features/api/client.js'
import { esc, showModal, showConfirm } from './ui.js'
import { $, $maybe } from '../../utils/dom.js'
import { createPager } from './pagination.js'

type Teacher = AdminTeacher

const pager = createPager({
  hostId: 'teachers-pager',
  storageKey: 'admin:teachers:page-size',
  noun: 'вчителів',
  onChange: () => { void loadTeachers() },
})

export function initTeachersTab() {}

export async function loadTeachers() {
  const list = $maybe('teachers-list')
  if (!list) return
  list.innerHTML = '<p class="admin-loading-text">Завантаження…</p>'

  try {
    const { teachers, page } = await getAdminTeachers(pager.range())

    if (!teachers.length) {
      pager.apply(page)
      list.innerHTML = `
        <div class="admin-empty-state"><div>
          <i class="fas fa-users admin-empty-state__icon"></i>
          <p class="admin-empty-state__title">Вчителів ще немає</p>
        </div></div>`
      return
    }

    list.innerHTML = ''
    teachers.forEach(t => list.appendChild(buildTeacherRow(t)))
    pager.apply(page)
  } catch (err) {
    pager.clear()
    list.innerHTML = `<p class="admin-list-error">${esc((err as Error).message)}</p>`
  }
}

function buildTeacherRow(t: Teacher): HTMLElement {
  const el   = document.createElement('div')
  el.className = 'admin-teacher-row'
  const date     = t.createdAt ? new Date(t.createdAt).toLocaleDateString('uk-UA') : ''
  const isPending = t.status === 'pending'
  const isBlocked = t.status === 'blocked'

  const statusBadge = isPending
    ? ' · <span class="badge badge--pending">Очікує підтвердження</span>'
    : isBlocked
      ? ' · <span class="badge badge--blocked">Заблоковано</span>'
      : ''

  const actionBtn = isPending
    ? `<button class="btn-adm-emerald btn--sm btn-teacher-status" data-action="active">
         <i class="fas fa-check"></i> Підтвердити
       </button>`
    : isBlocked
      ? `<button class="btn-adm-emerald btn--sm btn-teacher-status" data-action="active">
           <i class="fas fa-unlock"></i> Розблокувати
         </button>`
      : `<button class="btn-adm-danger btn--sm btn-teacher-status" data-action="blocked">
           <i class="fas fa-ban"></i> Заблокувати
         </button>`

  el.innerHTML = `
    <div class="admin-row__main">
      <p class="admin-row__title">${esc(t.email)}</p>
      <p class="admin-row__meta">${esc(t.name ?? '')}${statusBadge}</p>
    </div>
    <div class="admin-row__actions">
      <p class="admin-row__meta admin-row__meta--compact">${esc(date)}</p>
      ${actionBtn}
    </div>`

  el.querySelector<HTMLButtonElement>('.btn-teacher-status')!.addEventListener('click', () => {
    const btn       = el.querySelector<HTMLButtonElement>('.btn-teacher-status')!
    const newStatus = btn.dataset['action'] as 'active' | 'blocked'
    const confirmMsg = isPending
      ? `Підтвердити вчителя ${t.email}?\n\nПісля підтвердження він зможе увійти до кабінету та реєструвати класи.`
      : isBlocked
        ? `Розблокувати вчителя ${t.email}?\n\nВін знову зможе входити до системи.`
        : `Заблокувати вчителя ${t.email}?\n\nВін більше не зможе входити до системи. Його дані збережуться.`
    showConfirm(confirmMsg, async () => {
      try {
        await setTeacherStatus(t.id, newStatus)
        await loadTeachers()
      } catch (err) {
        showModal((err as Error).message)
      }
    })
  })

  return el
}
