// Projector window for Lesson Engine. Opened by the teacher's page
// (features/lesson-engine/board-window.ts) and dragged onto the projector.
// It has no session and calls no API: the lesson (slide blocks only) arrives
// over a BroadcastChannel, and a board check is proxied through the teacher's
// page. What reaches the screen still goes through presentationSlides().

import './frontend-security.js'
import { openPresentation, type PresentationHandle } from './features/lesson-engine/presentation-view.js'
import { BOARD_CHANNEL, parseBoardMessage, type BoardMessage } from './features/lesson-engine/board-protocol.js'
import type { BoardActivityDeps } from './features/lesson-engine/activity-board.js'

const CHECK_TIMEOUT_MS = 15_000

const waitingEl = document.getElementById('lb-waiting') as HTMLElement
const waitingText = document.getElementById('lb-waiting-text') as HTMLParagraphElement
const fullscreenButton = document.getElementById('lb-fullscreen') as HTMLButtonElement

let session: string | null = null
let handle: PresentationHandle | null = null
// Set while the board is replaced or ended from the teacher's side, so the
// overlay's own close does not report "closed" back.
let quietClose = false
const pendingChecks = new Map<string, { resolve: (value: unknown) => void; reject: (err: Error) => void; timer: number }>()

const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(BOARD_CHANNEL) : null

function post(message: BoardMessage) {
  channel?.postMessage(message)
}

function showWaiting(text: string) {
  waitingText.textContent = text
  waitingEl.hidden = false
}

function closeHandle() {
  if (!handle) return
  quietClose = true
  handle.close()
  quietClose = false
  handle = null
}

function failPendingChecks() {
  for (const [id, pending] of pendingChecks) {
    window.clearTimeout(pending.timer)
    pending.reject(new Error('Немає зв’язку з уроком.'))
    pendingChecks.delete(id)
  }
}

const check: BoardActivityDeps['check'] = (instanceId, answer) => {
  const current = session
  if (!current) return Promise.reject(new Error('Немає зв’язку з уроком.'))
  const requestId = crypto.randomUUID().replace(/-/g, '')
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pendingChecks.delete(requestId)
      reject(new Error('Вікно вчителя не відповідає. Перевірте, чи відкритий урок.'))
    }, CHECK_TIMEOUT_MS)
    pendingChecks.set(requestId, { resolve: resolve as (value: unknown) => void, reject, timer })
    post({ type: 'check', session: current, requestId, instanceId, answer })
  })
}

function onClaim(message: Extract<BoardMessage, { type: 'claim' }>) {
  closeHandle()
  failPendingChecks()
  session = message.session
  document.title = `${message.lesson.title.uk} — дошка`
  const claimed = message.session
  handle = openPresentation(message.lesson, {
    startBlockId: message.blockId,
    activities: { check },
    fullscreenButton: true,
    closeLabel: 'Закрити вікно',
    onSlideChange: blockId => post({ type: 'slide', session: claimed, blockId }),
    onClose: () => {
      if (quietClose) return
      handle = null
      post({ type: 'closed', session: claimed })
      session = null
      window.close()
      // A window the script did not open may refuse to close.
      showWaiting('Показ завершено. Це вікно можна закрити.')
    },
  })
  if (handle) waitingEl.hidden = true
  else showWaiting('У цьому уроці немає слайдів для дошки.')
}

channel?.addEventListener('message', event => {
  const message = parseBoardMessage(event.data)
  if (!message) return
  if (message.type === 'claim') {
    onClaim(message)
    return
  }
  if (!('session' in message) || message.session !== session) return
  if (message.type === 'show') {
    handle?.showBlock(message.blockId)
  } else if (message.type === 'end') {
    closeHandle()
    failPendingChecks()
    session = null
    window.close()
    showWaiting('Показ завершено. Це вікно можна закрити.')
  } else if (message.type === 'check-result') {
    const pending = pendingChecks.get(message.requestId)
    if (!pending) return
    pendingChecks.delete(message.requestId)
    window.clearTimeout(pending.timer)
    if (message.error !== undefined) pending.reject(new Error(message.error))
    else pending.resolve(message.result)
  }
})

fullscreenButton.addEventListener('click', () => {
  void document.documentElement.requestFullscreen?.().catch(() => {})
})

if (!channel) {
  showWaiting('Цей браузер не підтримує окреме вікно для проєктора. Покажіть урок на весь екран у вікні вчителя.')
} else {
  post({ type: 'hello' })
}
