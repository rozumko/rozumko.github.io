import {
  createAdminContentPublication,
  getAdminContentPublications,
  type AdminContentPublication,
  type AdminContentDeliveryState,
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
let refreshInFlight = false
let refreshQueued = false

export function initPublicationTab() {
  for (const buttonId of ['publish-content-btn', 'content-delivery-action']) {
    $(buttonId).addEventListener('click', () => {
      showConfirm(
        'Оновити відкритий сайт одним запуском? До нього увійдуть усі накопичені зміни опублікованого контенту.',
        () => { void startPublication() },
      )
    })
  }
}

export async function refreshContentDeliveryBanner() {
  // Coalesce bursts of content edits into at most one trailing refresh: the
  // server rebuilds the manifest on each GET, so overlapping calls would waste
  // work. The trailing pass guarantees we still render the latest state.
  if (refreshInFlight) { refreshQueued = true; return }
  refreshInFlight = true
  try {
    do {
      refreshQueued = false
      if (pollTimer) clearTimeout(pollTimer)
      try {
        const { deliveryState } = await getAdminContentPublications()
        renderDeliveryBanner(deliveryState)
        scheduleRefresh(deliveryState)
      } catch {
        const banner = $('content-delivery-banner')
        banner.classList.remove('hidden')
        $('content-delivery-title').textContent = 'Не вдалося перевірити стан відкритого сайту'
        $('content-delivery-detail').textContent = 'Відкрий журнал сайту та повтори перевірку.'
        $<HTMLButtonElement>('content-delivery-action').classList.add('hidden')
      }
    } while (refreshQueued)
  } finally {
    refreshInFlight = false
  }
}

function renderDeliveryBanner(state: AdminContentDeliveryState) {
  const banner = $('content-delivery-banner')
  const action = $<HTMLButtonElement>('content-delivery-action')
  if (state.activePublicationStatus) {
    banner.classList.remove('hidden')
    action.classList.add('hidden')
    $('content-delivery-title').textContent = state.activePublicationStatus === 'running'
      ? 'Відкритий сайт оновлюється'
      : 'Оновлення відкритого сайту в черзі'
    $('content-delivery-detail').textContent = state.activeMatchesCurrent
      ? 'Усі накопичені зміни входять до поточного запуску.'
      : 'Поточний запуск завершується; новіші зміни залишаться для наступного оновлення.'
    return
  }
  if (state.pendingChanges) {
    banner.classList.remove('hidden')
    action.classList.remove('hidden')
    action.disabled = false
    $('content-delivery-title').textContent = 'Є зміни для відкритого сайту'
    $('content-delivery-detail').textContent = 'Опубліковані зміни накопичено. Онови статичний сайт один раз, коли завершиш редагування.'
    return
  }
  banner.classList.add('hidden')
}

function scheduleRefresh(state: AdminContentDeliveryState) {
  if (!state.activePublicationStatus || $maybe('admin-panel')?.classList.contains('hidden')) return
  pollTimer = setTimeout(() => {
    if ($maybe('tab-publication')?.classList.contains('hidden')) void refreshContentDeliveryBanner()
    else void loadPublicationTab()
  }, 8000)
}

function setPublicationControlsDisabled(disabled: boolean) {
  $<HTMLButtonElement>('publish-content-btn').disabled = disabled
  $<HTMLButtonElement>('content-delivery-action').disabled = disabled
}

export async function loadPublicationTab() {
  if (pollTimer) clearTimeout(pollTimer)
  const list = $('publication-list')
  list.innerHTML = '<p class="admin-loading-text">Завантаження…</p>'
  try {
    const { publications, deliveryState } = await getAdminContentPublications()
    renderDeliveryBanner(deliveryState)
    renderPublications(publications)
    const active = Boolean(deliveryState.activePublicationStatus)
    setPublicationControlsDisabled(active)
    $('publication-status').textContent = active
      ? 'Публікація виконується. Статус оновлюється автоматично.'
      : deliveryState.pendingChanges
        ? 'Є накопичені зміни, які ще не доставлені на відкритий сайт.'
        : 'Відкритий сайт має актуальну версію контенту.'
    scheduleRefresh(deliveryState)
  } catch (err) {
    list.innerHTML = `<p class="admin-list-error">${esc((err as Error).message)}</p>`
    $('publication-status').textContent = 'Не вдалося отримати стан публікацій.'
  }
}

async function startPublication() {
  setPublicationControlsDisabled(true)
  $('publication-status').textContent = 'Фіксуємо перевірені версії та запускаємо публікацію…'
  try {
    await createAdminContentPublication()
    await loadPublicationTab()
  } catch (err) {
    setPublicationControlsDisabled(false)
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
