import { fetchAllPages, getAdminResults, type Attempt } from '../../features/api/client.js'
import { esc, showModal } from './ui.js'
import { $, $maybe } from '../../utils/dom.js'
import { createPager } from './pagination.js'
import { openCertModal, awardLabel, getAward } from '../../utils/certificate.js'

const pager = createPager({
  hostId: 'results-pager',
  storageKey: 'admin:results:page-size',
  noun: 'результатів',
  onChange: () => { void loadResults() },
})

export function initResultsTab() {}

export async function loadResults() {
  const list = $maybe('results-list')
  if (!list) return
  list.innerHTML = '<p class="admin-loading-text">Завантаження…</p>'

  try {
    const { results, page } = await getAdminResults(pager.range())

    if (!results.length) {
      pager.apply(page)
      list.innerHTML = `
        <div class="admin-empty-state"><div>
          <i class="fas fa-poll admin-empty-state__icon"></i>
          <p class="admin-empty-state__title">Результатів ще немає</p>
          <p class="admin-empty-state__sub">З'являться після проведення олімпіади.</p>
        </div></div>`
      return
    }

    const exportBtn = $maybe<HTMLButtonElement>('export-results-btn')
    // The export covers every result, not the page on screen — a CSV missing
    // rows would be worse than a slow one.
    if (exportBtn) { exportBtn.disabled = false; exportBtn.onclick = () => { void exportAllCSV(exportBtn) } }

    list.innerHTML = ''
    results.forEach(r => list.appendChild(buildResultRow(r)))
    pager.apply(page)
  } catch (err) {
    pager.clear()
    list.innerHTML = `<p class="admin-list-error">${esc((err as Error).message)}</p>`
  }
}

async function exportAllCSV(button: HTMLButtonElement): Promise<void> {
  button.disabled = true
  try {
    exportCSV(await fetchAllPages(async range => {
      const { results, page } = await getAdminResults(range)
      return { items: results, page }
    }))
  } catch (err) {
    showModal((err as Error).message)
  } finally {
    button.disabled = false
  }
}

function buildResultRow(r: Attempt): HTMLElement {
  const el   = document.createElement('div')
  el.className = 'admin-result-row'
  const date = r.finishedAt ? new Date(r.finishedAt).toLocaleString('uk-UA', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) : ''

  const finished = r.status === 'finished'
  const award = finished ? getAward(r.score, r.totalQ) : null
  const resultLabel = finished ? awardLabel(r.score, r.totalQ) : 'Строк вичерпано'
  el.innerHTML = `
    <div class="admin-row__main">
      <p class="admin-row__title">${esc(r.code ?? r.id)}</p>
      <p class="admin-row__meta">${esc(String(r.grade))} клас · ${esc(date)} · ${esc(resultLabel)}</p>
    </div>
    <div class="admin-row__actions">
      <p class="admin-row__score">${esc(String(r.score ?? '?'))}<span>/${esc(String(r.totalQ ?? '?'))}</span></p>
      ${finished ? `<button class="btn-adm-slate btn--sm btn-cert">
        <i class="fas fa-certificate"></i> ${award?.kind === 'diploma' ? 'Диплом' : 'Сертифікат'}
      </button>` : ''}
    </div>`

  if (finished) {
    el.querySelector<HTMLButtonElement>('.btn-cert')!.addEventListener('click', () => openCertModal(r, showModal))
  }
  return el
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCSV(results: Attempt[]) {
  const rows: (string | number)[][] = [['Код', 'Клас', 'Бали', 'Всього', 'Дата']]
  results.forEach(r => {
    const date = r.finishedAt ? new Date(r.finishedAt).toLocaleString('uk-UA') : ''
    rows.push([r.code ?? r.id, r.grade, r.score ?? '', r.totalQ ?? '', date])
  })
  const csv  = rows.map(r => r.join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const a    = document.createElement('a')
  a.href     = URL.createObjectURL(blob)
  a.download = 'results.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}
