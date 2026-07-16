import {
  createAdminContentPublication,
  getAdminContentPublications,
  type AdminContentPublication,
} from '../api/client.js'
import { $, $maybe } from '../../utils/dom.js'
import { esc, formatDate, showConfirm, showModal } from './ui.js'

const STATUS_LABELS: Record<AdminContentPublication['status'], string> = {
  queued: 'У черзі',
  running: 'Публікується',
  succeeded: 'Опубліковано',
  failed: 'Помилка',
}

let pollTimer: ReturnType<typeof setTimeout> | undefined

export function initPublicationTab() {
  $('publish-content-btn').addEventListener('click', () => {
    showConfirm(
      'Опублікувати всі перевірені версії питань, уроків, місій і карт шляху для дітей?',
      () => { void startPublication() },
    )
  })
}

export async function loadPublicationTab() {
  if (pollTimer) clearTimeout(pollTimer)
  const list = $('publication-list')
  list.innerHTML = '<p class="admin-loading-text">Завантаження…</p>'
  try {
    const { publications } = await getAdminContentPublications()
    renderPublications(publications)
    const active = publications.some(item => item.status === 'queued' || item.status === 'running')
    $<HTMLButtonElement>('publish-content-btn').disabled = active
    $('publication-status').textContent = active
      ? 'Публікація виконується. Статус оновлюється автоматично.'
      : 'Готово до нової публікації.'
    if (active && !$maybe('tab-publication')?.classList.contains('hidden')) {
      pollTimer = setTimeout(() => { void loadPublicationTab() }, 8000)
    }
  } catch (err) {
    list.innerHTML = `<p class="admin-list-error">${esc((err as Error).message)}</p>`
    $('publication-status').textContent = 'Не вдалося отримати стан публікацій.'
  }
}

async function startPublication() {
  const button = $<HTMLButtonElement>('publish-content-btn')
  button.disabled = true
  $('publication-status').textContent = 'Фіксуємо перевірені версії та запускаємо публікацію…'
  try {
    await createAdminContentPublication()
    await loadPublicationTab()
  } catch (err) {
    button.disabled = false
    showModal((err as Error).message)
    await loadPublicationTab()
  }
}

function renderPublications(publications: AdminContentPublication[]) {
  const list = $('publication-list')
  if (!publications.length) {
    list.innerHTML = '<div class="admin-empty-state"><div><p class="admin-empty-state__title">Публікацій ще немає</p><p class="admin-empty-state__sub">Перша публікація створить повний перевірений набір контенту для дитячих сторінок.</p></div></div>'
    return
  }
  list.innerHTML = ''
  for (const publication of publications) {
    const manifest = publication.expectedManifest
    const total = (manifest.practiceQuestions?.length ?? 0) + (manifest.lessons?.length ?? 0)
      + (manifest.gamePacks?.length ?? 0) + (manifest.paths?.length ?? 0)
    const badge = publication.status === 'succeeded' ? 'qi-badge--easy'
      : publication.status === 'failed' ? 'qi-badge--hard' : 'qi-badge--medium'
    const card = document.createElement('article')
    card.className = 'question-item'
    card.innerHTML = `
      <div class="question-item__left">
        <div class="question-item__badges">
          <span class="qi-badge ${badge}">${esc(STATUS_LABELS[publication.status])}</span>
          <span class="qi-badge qi-badge--type">об'єктів: ${total}</span>
        </div>
        <p class="question-item__text">Публікація від ${esc(formatDate(publication.createdAt))}</p>
        <p class="question-item__meta publication-meta">manifest ${esc(publication.expectedManifestSha256.slice(0, 12))} · ${esc(publication.sourceSha?.slice(0, 8) ?? 'очікує commit')}</p>
        ${publication.failureReason ? `<p class="admin-list-error">${esc(publication.failureReason)}</p>` : ''}
      </div>
      <div class="question-item__actions"></div>`
    if (publication.workflowUrl) {
      const link = document.createElement('a')
      link.className = 'btn-adm-ghost'
      link.href = publication.workflowUrl
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.textContent = 'Журнал GitHub'
      card.querySelector('.question-item__actions')!.appendChild(link)
    }
    list.appendChild(card)
  }
}
