import { getAdminHomeFunnel, type AdminFunnelStep, type HomeFunnelStep } from '../api/client.js'
import { $, $maybe } from '../../utils/dom.js'
import { esc } from './ui.js'

// Воронка Домашнього режиму на вкладці «Огляд». Джерело — знеособлені
// агрегати (backend/src/routes/home-funnel.ts): рядка на відвідувача не існує,
// тож панель свідомо говорить «подій», а не «людей».

const STEP_LABELS: Record<HomeFunnelStep, string> = {
  home_open:         'Відкрив сторінку',
  path_start:        'Пішов на карту',
  practice_start:    'Почав тренування',
  practice_complete: 'Завершив тренування',
  parent_gate_view:  'Побачив батьківський гейт',
  parent_lead:       'Батько дав згоду',
}

const STEP_ORDER: HomeFunnelStep[] = [
  'home_open', 'path_start', 'practice_start',
  'practice_complete', 'parent_gate_view', 'parent_lead',
]

function formatConversion(value: number | null): string {
  if (value === null) return ''
  return `<span class="funnel-row__conv">${Math.round(value * 100)}% від попереднього</span>`
}

function renderRows(steps: AdminFunnelStep[]): string {
  const byStep = new Map(steps.map(s => [s.step, s]))
  // Масштаб від найбільшого кроку, а не від першого: якщо воронка десь росте
  // (карта і тренування — паралельні гілки), смуга не має вилазити за 100%.
  const peak = Math.max(1, ...steps.map(s => s.count))

  return STEP_ORDER.map(step => {
    const row = byStep.get(step) ?? { step, count: 0, conversionFromPrev: null }
    const width = Math.round((row.count / peak) * 100)
    return `
      <div class="funnel-row${row.count === 0 ? ' funnel-row--empty' : ''}">
        <span class="funnel-row__label">${esc(STEP_LABELS[step])}</span>
        <span class="funnel-row__bar"><span class="funnel-row__fill" style="width:${width}%"></span></span>
        <span class="funnel-row__value">${row.count}${formatConversion(row.conversionFromPrev)}</span>
      </div>`
  }).join('')
}

async function refreshFunnel() {
  const body = $maybe('funnel-body')
  if (!body) return
  body.innerHTML = '<p class="funnel-note">Завантажуємо…</p>'

  try {
    const days = Number($maybe<HTMLSelectElement>('funnel-days')?.value ?? '30')
    const data = await getAdminHomeFunnel(days)
    const total = data.steps.reduce((sum, s) => sum + s.count, 0)
    body.innerHTML = total === 0
      ? '<p class="funnel-note">За цей період подій ще немає.</p>'
      : renderRows(data.steps)
  } catch (err) {
    body.innerHTML = `<p class="funnel-note">${esc((err as Error).message)}</p>`
  }
}

export function initFunnelPanel() {
  $maybe<HTMLSelectElement>('funnel-days')?.addEventListener('change', () => { void refreshFunnel() })
}

export function loadFunnelPanel() {
  void refreshFunnel()
}
