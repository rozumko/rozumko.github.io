import { getAdminResults, type Attempt } from '../../features/api/client.js'
import { esc, showModal } from './ui.js'
import { $, $maybe } from '../../utils/dom.js'

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

  el.innerHTML = `
    <div class="admin-row__main">
      <p class="admin-row__title">${esc(r.code ?? r.id)}</p>
      <p class="admin-row__meta">${esc(String(r.grade))} клас · ${esc(date)}</p>
    </div>
    <div class="admin-row__actions">
      <p class="admin-row__score">${esc(String(r.score ?? '?'))}<span>/${esc(String(r.totalQ ?? '?'))}</span></p>
      <button class="btn-adm-slate btn-sm btn-cert">
        <i class="fas fa-certificate"></i> Сертифікат
      </button>
    </div>`

  el.querySelector<HTMLButtonElement>('.btn-cert')!.addEventListener('click', () => openCertModal(r))
  return el
}

// ─── Certificate modal ────────────────────────────────────────────────────────

function openCertModal(r: Attempt) {
  // Видаляємо попередній модал якщо є
  document.getElementById('cert-modal')?.remove()

  const modal = document.createElement('div')
  modal.id        = 'cert-modal'
  modal.className = 'cert-modal-overlay'
  modal.innerHTML = `
    <div class="cert-modal">
      <h3 class="cert-modal__title"><i class="fas fa-certificate"></i> Сертифікат участника</h3>
      <p class="cert-modal__hint">Введи ім'я учня — воно не зберігається на сервері.</p>
      <div class="cert-modal__field">
        <label for="cert-name-input">Прізвище та ім'я</label>
        <input id="cert-name-input" type="text" class="cert-modal__input"
               placeholder="Наприклад: Коваленко Марія" autocomplete="off" />
      </div>
      <div class="cert-modal__actions">
        <button id="cert-print-btn" class="btn-adm-emerald">
          <i class="fas fa-print"></i> Друкувати / Зберегти PDF
        </button>
        <button id="cert-cancel-btn" class="btn-adm-slate">Скасувати</button>
      </div>
    </div>`

  document.body.appendChild(modal)

  const nameInput = document.getElementById('cert-name-input') as HTMLInputElement
  nameInput.focus()

  document.getElementById('cert-cancel-btn')!.addEventListener('click', () => modal.remove())
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove() })

  document.getElementById('cert-print-btn')!.addEventListener('click', () => {
    const name = nameInput.value.trim()
    if (!name) { nameInput.style.borderColor = 'var(--clr-danger)'; nameInput.focus(); return }
    modal.remove()
    printCertificate(r, name)
  })

  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('cert-print-btn')!.click()
    if (e.key === 'Escape') modal.remove()
  })
}

function printCertificate(r: Attempt, studentName: string) {
  const date  = r.finishedAt
    ? new Date(r.finishedAt).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
  const score = r.score ?? 0
  const total = r.totalQ ?? 0
  const pct   = total > 0 ? Math.round((score / total) * 100) : 0

  const html = `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <title>Сертифікат — ${studentName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      background: #fff;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; padding: 24px;
    }
    .cert {
      border: 6px double #7c3aed;
      border-radius: 12px;
      padding: 48px 56px;
      max-width: 720px;
      width: 100%;
      text-align: center;
      position: relative;
    }
    .cert::before {
      content: '';
      position: absolute; inset: 8px;
      border: 1px solid #ddd6fe;
      border-radius: 8px;
      pointer-events: none;
    }
    .cert__logo { font-size: 48px; margin-bottom: 8px; }
    .cert__org  { font-size: 13px; letter-spacing: 3px; text-transform: uppercase; color: #7c3aed; margin-bottom: 32px; }
    .cert__head { font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #6b7280; margin-bottom: 16px; }
    .cert__name { font-size: 36px; font-weight: 700; color: #1e1b4b; margin-bottom: 24px; border-bottom: 2px solid #ede9fe; padding-bottom: 16px; }
    .cert__body { font-size: 16px; color: #374151; line-height: 1.8; margin-bottom: 28px; }
    .cert__score {
      display: inline-block;
      background: #f5f3ff; border: 2px solid #7c3aed;
      border-radius: 8px; padding: 12px 32px;
      font-size: 24px; font-weight: 700; color: #7c3aed;
      margin-bottom: 28px;
    }
    .cert__score span { font-size: 14px; font-weight: 400; color: #6b7280; display: block; }
    .cert__footer { font-size: 13px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 16px; }
    @media print {
      body { padding: 0; }
      .cert { border-color: #7c3aed; }
    }
  </style>
</head>
<body>
  <div class="cert">
    <div class="cert__logo">🏆</div>
    <div class="cert__org">МегаРозум · Олімпіада з інформатики</div>
    <div class="cert__head">Сертифікат учасника</div>
    <div class="cert__name">${studentName}</div>
    <div class="cert__body">
      взяв(ла) участь в олімпіаді з інформатики<br>
      для учнів <strong>${r.grade} класу</strong>
    </div>
    <div class="cert__score">
      ${score} / ${total} балів
      <span>${pct}% правильних відповідей</span>
    </div>
    <div class="cert__footer">
      ${date} · Код участника: ${r.code ?? '—'}
    </div>
  </div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`

  const win = window.open('', '_blank')
  if (!win) { showModal('Браузер заблокував відкриття вікна. Дозволь спливаючі вікна для цього сайту.'); return }
  win.document.write(html)
  win.document.close()
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
