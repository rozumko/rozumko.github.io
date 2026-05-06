import { getAdminResults } from '../../features/api/client.js'
import { esc } from './ui.js'

export function initResultsTab() {}

export async function loadResults() {
  const list = document.getElementById('results-list')
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

    const exportBtn = document.getElementById('export-results-btn')
    exportBtn.disabled = false
    exportBtn.onclick = () => exportCSV(results)

    list.innerHTML = ''
    results.forEach(r => {
      const el = document.createElement('div')
      el.className = 'admin-result-row'
      const date = r.finishedAt ? new Date(r.finishedAt).toLocaleString('uk-UA', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }) : ''
      el.innerHTML = `
        <div class="admin-row__main">
          <p class="admin-row__title">${esc(r.code ?? r.codeId)}</p>
          <p class="admin-row__meta">${esc(String(r.grade))} клас</p>
          <p class="admin-row__meta" style="font-size:var(--font-size-xs);margin-top:2px">${esc(date)}</p>
        </div>
        <div style="text-align:right">
          <p class="admin-row__score">${esc(String(r.score ?? '?'))}<span>/${esc(String(r.totalQ ?? '?'))}</span></p>
        </div>`
      list.appendChild(el)
    })
  } catch (err) {
    list.innerHTML = `<p style="color:var(--clr-danger);padding:var(--sp-4)">${err.message}</p>`
  }
}

function exportCSV(results) {
  const rows = [['Код', 'Клас', 'Бали', 'Всього', 'Дата']]
  results.forEach(r => {
    const date = r.finishedAt ? new Date(r.finishedAt).toLocaleString('uk-UA') : ''
    rows.push([r.code ?? r.codeId, r.grade, r.score ?? '', r.totalQ ?? '', date])
  })
  const csv  = rows.map(r => r.join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const a    = document.createElement('a')
  a.href     = URL.createObjectURL(blob)
  a.download = 'results.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}
