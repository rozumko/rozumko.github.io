// Сертифікати та дипломи — спільний модуль для кабінету вчителя й адмінки.
// ПІБ дитини вводиться локально перед друком і НЕ надсилається на сервер.

export interface CertAttempt {
  grade: number
  score: number | null
  totalQ: number | null
  finishedAt: string | null
  code?: string
}

export interface Award {
  kind: 'diploma' | 'certificate'
  /** Заголовок документа */
  title: string
  /** Підзаголовок під ПІБ (напр. «I місце») або порожній рядок для сертифіката */
  place: string
}

// ── Градації нагород за відсотком правильних відповідей ──────────────
// Межі: нижня включна, верхня виключна; 95–100 включно (бо 100 — максимум).
//   ≥95   → Диплом I місце
//   90–95 → Диплом II місце
//   80–90 → Диплом III місце
//   <80   → Сертифікат участі (зокрема 70–80)
// Пороги навмисно тримаються в одному місці; зміна = одна правка тут.
export const AWARD_THRESHOLDS = { first: 95, second: 90, third: 80 } as const

export function getAward(score: number | null, total: number | null): Award {
  const pct = percent(score, total)
  if (pct >= AWARD_THRESHOLDS.first)  return { kind: 'diploma',     title: 'Диплом',           place: 'I місце' }
  if (pct >= AWARD_THRESHOLDS.second) return { kind: 'diploma',     title: 'Диплом',           place: 'II місце' }
  if (pct >= AWARD_THRESHOLDS.third)  return { kind: 'diploma',     title: 'Диплом',           place: 'III місце' }
  return { kind: 'certificate', title: 'Сертифікат учасника', place: '' }
}

/** Короткий ярлик для списку результатів: «Диплом · I місце» або «Сертифікат участі». */
export function awardLabel(score: number | null, total: number | null): string {
  const a = getAward(score, total)
  return a.kind === 'diploma' ? `${a.title} · ${a.place}` : 'Сертифікат участі'
}

export function percent(score: number | null, total: number | null): number {
  const numericScore = Number(score ?? 0)
  if (!Number.isFinite(numericScore) || !Number.isFinite(total) || !total || total <= 0) return 0
  return Math.min(100, Math.max(0, Math.floor((numericScore / total) * 100)))
}

function escapeHtml(str: string): string {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Відкриває нове вікно з документом і запускає друк. Повертає false, якщо вікно заблоковано. */
export function printAward(r: CertAttempt, studentName: string): boolean {
  const award = getAward(r.score, r.totalQ)
  const name  = escapeHtml(studentName)
  const date  = r.finishedAt
    ? new Date(r.finishedAt).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
  const score = r.score ?? 0
  const total = r.totalQ ?? 0
  const pct   = percent(r.score, r.totalQ)
  const isDiploma = award.kind === 'diploma'
  const accent = isDiploma ? '#b45309' : '#7c3aed'   // золото для диплома, фіолет для сертифіката
  const accentSoft = isDiploma ? '#fef3c7' : '#f5f3ff'
  const accentBorder = isDiploma ? '#fcd34d' : '#ddd6fe'

  const placeLine = award.place
    ? `<div class="cert__place">${escapeHtml(award.place)}</div>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(award.title)} — ${name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      background: #fff;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; padding: 24px;
    }
    .cert {
      border: 6px double ${accent};
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
      border: 1px solid ${accentBorder};
      border-radius: 8px;
      pointer-events: none;
    }
    .cert__logo  { font-size: 48px; margin-bottom: 8px; }
    .cert__org   { font-size: 13px; letter-spacing: 3px; text-transform: uppercase; color: ${accent}; margin-bottom: 32px; }
    .cert__head  { font-size: 15px; letter-spacing: 2px; text-transform: uppercase; color: #6b7280; margin-bottom: 16px; }
    .cert__place { font-size: 22px; font-weight: 700; letter-spacing: 1px; color: ${accent}; margin-bottom: 16px; }
    .cert__name  { font-size: 36px; font-weight: 700; color: #1e1b4b; margin-bottom: 24px; border-bottom: 2px solid ${accentBorder}; padding-bottom: 16px; }
    .cert__body  { font-size: 16px; color: #374151; line-height: 1.8; margin-bottom: 28px; }
    .cert__score {
      display: inline-block;
      background: ${accentSoft}; border: 2px solid ${accent};
      border-radius: 8px; padding: 12px 32px;
      font-size: 24px; font-weight: 700; color: ${accent};
      margin-bottom: 28px;
    }
    .cert__score span { font-size: 14px; font-weight: 400; color: #6b7280; display: block; }
    .cert__footer { font-size: 13px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 16px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="cert">
    <div class="cert__logo">${isDiploma ? '🏅' : '🎓'}</div>
    <div class="cert__org">Розумко · Олімпіада з інформатики</div>
    <div class="cert__head">${escapeHtml(award.title)}</div>
    ${placeLine}
    <div class="cert__name">${name}</div>
    <div class="cert__body">
      ${isDiploma ? 'нагороджується за результати в олімпіаді з інформатики' : 'взяв(ла) участь в олімпіаді з інформатики'}<br>
      для учнів <strong>${escapeHtml(String(r.grade))} класу</strong>
    </div>
    <div class="cert__score">
      ${escapeHtml(String(score))} / ${escapeHtml(String(total))} балів
      <span>${pct}% правильних відповідей</span>
    </div>
    <div class="cert__footer">
      ${escapeHtml(date)} · Код учасника: ${escapeHtml(r.code ?? '—')}
    </div>
  </div>
</body>
</html>`

  const win = window.open('', '_blank')
  if (!win) return false
  win.document.write(html)
  win.document.close()
  win.setTimeout(() => {
    win.focus()
    win.print()
  }, 0)
  return true
}

/**
 * Модалка вводу ПІБ → друк нагороди. Самодостатня; інжектиться в document.body.
 * onError — необов'язковий колбек для повідомлення про заблоковане вікно.
 */
export function openCertModal(r: CertAttempt, onError?: (msg: string) => void): void {
  document.getElementById('cert-modal')?.remove()

  const award = getAward(r.score, r.totalQ)
  const docWord = award.kind === 'diploma' ? `${award.title} (${award.place})` : 'Сертифікат учасника'

  const modal = document.createElement('div')
  modal.id        = 'cert-modal'
  modal.className = 'cert-modal-overlay'
  modal.setAttribute('role', 'dialog')
  modal.setAttribute('aria-modal', 'true')
  modal.setAttribute('aria-labelledby', 'cert-modal-title')
  modal.innerHTML = `
    <div class="cert-modal">
      <h3 id="cert-modal-title" class="cert-modal__title"><i class="fas fa-certificate" aria-hidden="true"></i> ${escapeHtml(docWord)}</h3>
      <p class="cert-modal__hint">Введи ім'я учня — воно не зберігається на сервері.</p>
      <div class="cert-modal__field">
        <label for="cert-name-input">Прізвище та ім'я</label>
        <input id="cert-name-input" type="text" class="cert-modal__input"
               placeholder="Наприклад: Коваленко Марія" autocomplete="off" />
      </div>
      <div class="cert-modal__actions">
        <button id="cert-print-btn" class="btn btn--success">
          <i class="fas fa-print" aria-hidden="true"></i> Друкувати / Зберегти PDF
        </button>
        <button id="cert-cancel-btn" class="btn btn--secondary">Скасувати</button>
      </div>
    </div>`

  document.body.appendChild(modal)

  const nameInput = document.getElementById('cert-name-input') as HTMLInputElement
  nameInput.focus()

  const close = () => modal.remove()
  document.getElementById('cert-cancel-btn')!.addEventListener('click', close)
  modal.addEventListener('click', e => { if (e.target === modal) close() })

  document.getElementById('cert-print-btn')!.addEventListener('click', () => {
    const name = nameInput.value.trim()
    if (!name) { nameInput.classList.add('cert-modal__input--invalid'); nameInput.focus(); return }
    close()
    if (!printAward(r, name)) {
      onError?.('Браузер заблокував відкриття вікна. Дозволь спливаючі вікна для цього сайту.')
    }
  })
  nameInput.addEventListener('input', () => nameInput.classList.remove('cert-modal__input--invalid'))

  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('cert-print-btn')!.click()
    if (e.key === 'Escape') close()
  })
}
