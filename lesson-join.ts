// Student side of Lesson Engine web join (stage G1). No account and no name:
// the child types the teacher's code, gets a pairing number, and waits for the
// teacher to say who they are. The device token lives in sessionStorage only.

import './frontend-security.js'
import { getLessonDeviceState, joinLessonRun, type ApiError } from './features/api/client.js'
import { formatJoinCode } from './features/lesson-engine/run-model.js'
import type { LessonDeviceJoin, LessonDeviceState } from './features/lesson-engine/types.js'

const STORAGE_KEY = 'rozumko_lesson_device'
const POLL_MS = 3000

const joinSection = document.getElementById('lj-join') as HTMLElement
const waitSection = document.getElementById('lj-wait') as HTMLElement
const form = document.getElementById('lj-form') as HTMLFormElement
const input = document.getElementById('lj-code') as HTMLInputElement
const errorEl = document.getElementById('lj-error') as HTMLParagraphElement
const lessonEl = document.getElementById('lj-lesson') as HTMLParagraphElement
const numberEl = document.getElementById('lj-number') as HTMLParagraphElement
const statusEl = document.getElementById('lj-status') as HTMLParagraphElement

type StoredDevice = Pick<LessonDeviceJoin, 'deviceId' | 'deviceToken' | 'pairingNumber'>

let timer: number | null = null

function readDevice(): StoredDevice | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) as StoredDevice : null
    return parsed && typeof parsed.deviceId === 'string' && typeof parsed.deviceToken === 'string' ? parsed : null
  } catch {
    return null
  }
}

function storeDevice(device: StoredDevice | null) {
  try {
    if (device) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(device))
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch { /* sessionStorage unavailable: the child re-joins after a reload */ }
}

function showJoin(message = '') {
  if (timer !== null) window.clearInterval(timer)
  timer = null
  waitSection.hidden = true
  joinSection.hidden = false
  errorEl.textContent = message
}

function renderState(state: LessonDeviceState) {
  joinSection.hidden = true
  waitSection.hidden = false
  lessonEl.textContent = state.lessonTitle.uk
  numberEl.textContent = `№ ${state.pairingNumber}`
  if (state.runStatus === 'finished' || state.runStatus === 'cancelled') {
    statusEl.textContent = 'Урок завершено. Дякуємо!'
    if (timer !== null) window.clearInterval(timer)
    timer = null
    storeDevice(null)
    return
  }
  statusEl.textContent = state.mapped && state.studentLabel
    ? `Привіт, ${state.studentLabel}! Чекай на завдання від учителя.`
    : 'Покажи свій номер учителю і чекай.'
}

async function refresh(device: StoredDevice) {
  try {
    renderState(await getLessonDeviceState(device.deviceId, device.deviceToken))
  } catch (err) {
    if ((err as ApiError).status === 401 || (err as ApiError).status === 404) {
      storeDevice(null)
      showJoin('Приєднайся до уроку ще раз.')
    }
    // Other errors are transient: keep the screen and retry on the next poll.
  }
}

function startPolling(device: StoredDevice) {
  void refresh(device)
  if (timer !== null) window.clearInterval(timer)
  timer = window.setInterval(() => {
    if (document.visibilityState === 'visible') void refresh(device)
  }, POLL_MS)
}

form.addEventListener('submit', async event => {
  event.preventDefault()
  const code = input.value.replace(/\D/g, '')
  if (code.length !== 6) {
    errorEl.textContent = 'Введи 6 цифр коду.'
    input.focus()
    return
  }
  const submit = form.querySelector('button') as HTMLButtonElement
  submit.disabled = true
  errorEl.textContent = ''
  try {
    const joined = await joinLessonRun(code)
    const device = { deviceId: joined.deviceId, deviceToken: joined.deviceToken, pairingNumber: joined.pairingNumber }
    storeDevice(device)
    // Keep the code out of the address bar and history once used.
    history.replaceState(null, '', location.pathname)
    startPolling(device)
  } catch (err) {
    errorEl.textContent = (err as Error).message || 'Не вдалося приєднатися.'
  } finally {
    submit.disabled = false
  }
})

input.addEventListener('input', () => {
  const digits = input.value.replace(/\D/g, '').slice(0, 6)
  const formatted = digits.length > 3 ? formatJoinCode(digits.padEnd(6, ' ')).trimEnd() : digits
  if (input.value !== formatted) input.value = formatted
})

const stored = readDevice()
if (stored) {
  startPolling(stored)
} else {
  const fromLink = new URLSearchParams(location.search).get('code')?.replace(/\D/g, '').slice(0, 6) ?? ''
  if (fromLink) input.value = fromLink.length === 6 ? formatJoinCode(fromLink) : fromLink
  input.focus()
}
