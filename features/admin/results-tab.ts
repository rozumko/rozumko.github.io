import { getAdminResults, type Attempt } from '../../features/api/client.js'
import { esc, showModal } from './ui.js'
import { $, $maybe } from '../../utils/dom.js'
import { openCertModal, awardLabel, getAward } from '../../utils/certificate.js'

export function initResultsTab() {}

export async function loadResults() {
  const list = $maybe('results-list')
  if (!list) return
  list.innerHTML = '<p class="admin-loading-text">Завантаження…</p>'

  try {
    const { results } = await getAdminResults()

    if (!results.length) {
      list.innerHTML = `
        <div class="admin-empty-state"><div>
          <i class="fas fa-poll admin-empty-state__icon"></i>
          <p class="admin-empty-state__title">Результатів ще немає</p>
          <p class="admin-empty-state__sub">З'являться після проведення олімпіади.</p>
        </div></div>`
      return
    }

    const exportBtn = $maybe<HTMLButtonElement>('export-results-btn')
    if (exportBtn) { exportBtn.disabled = false; exportBtn.onclick = () => exportCSV(results) }

    list.innerHTML = ''
    results.forEach(r => list.appendChild(buildResultRow(r)))
  } catch (err) {
    list.innerHTML = `<p style="color:var(--clr-danger);padding:var(--sp-4)">${esc((err as Error).message)}</p>`
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
      ${finished ? `<button class="btn-adm-slate btn-sm btn-cert">
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
