import { getAdminParents, type AdminParentSummary } from '../../features/api/client.js'
import { $maybe } from '../../utils/dom.js'
import { createPager } from './pagination.js'

const pager = createPager({
  hostId: 'parents-pager',
  storageKey: 'admin:parents:page-size',
  noun: 'акаунтів',
  onChange: () => { void loadParents() },
})

export function initParentsTab() {}

export async function loadParents() {
  const list = $maybe('parents-list')
  if (!list) return
  list.replaceChildren(statusText('Завантаження…', 'admin-loading-text'))

  try {
    const { parents, page } = await getAdminParents(pager.range())
    if (!parents.length) {
      pager.apply(page)
      list.innerHTML = `
        <div class="admin-empty-state"><div>
          <i class="fas fa-user-friends admin-empty-state__icon" aria-hidden="true"></i>
          <p class="admin-empty-state__title">Батьківських акаунтів ще немає</p>
        </div></div>`
      return
    }
    list.replaceChildren(...parents.map(buildParentRow))
    pager.apply(page)
  } catch (error) {
    pager.clear()
    list.replaceChildren(statusText((error as Error).message, 'admin-list-error'))
  }
}

function statusText(text: string, className: string): HTMLParagraphElement {
  const element = document.createElement('p')
  element.className = className
  element.textContent = text
  return element
}

function buildParentRow(parent: AdminParentSummary): HTMLElement {
  const row = document.createElement('div')
  row.className = 'admin-parent-row'

  const main = document.createElement('div')
  main.className = 'admin-row__main'

  const title = document.createElement('p')
  title.className = 'admin-row__title'
  title.textContent = parent.email

  const meta = document.createElement('p')
  meta.className = 'admin-row__meta'
  const verification = parent.emailVerified ? 'email підтверджено' : 'email не підтверджено'
  meta.textContent = `${verification} · профілів дітей: ${parent.profileCount}`

  const details = document.createElement('div')
  details.className = 'admin-row__actions'

  const date = document.createElement('p')
  date.className = 'admin-row__meta admin-row__meta--compact'
  date.textContent = parent.createdAt ? new Date(parent.createdAt).toLocaleDateString('uk-UA') : 'Дата невідома'

  const badge = document.createElement('span')
  badge.className = parent.status === 'active' ? 'badge badge--active' : 'badge badge--blocked'
  badge.textContent = parent.status === 'active' ? 'Активний' : 'Вимкнений'

  main.append(title, meta)
  details.append(date, badge)
  row.append(main, details)
  return row
}
