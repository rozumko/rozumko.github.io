// Web join panel in the run console (stage G1). The teacher opens joining,
// shows the code and QR, and maps each joined device (a pairing number on the
// child's screen) to a roster student. Devices are polled while the panel is
// alive; the server decides everything, this only renders and asks.

import { createFocusTrap } from '../../utils/focus-trap.js'
import { formatJoinCode, isOpenRun, mappingSummary, studentOptions } from './run-model.js'
import type { LessonRunDevice, LessonRunView } from './types.js'

export interface JoinPanelDeps {
  openJoin(): Promise<unknown>
  closeJoin(): Promise<unknown>
  listDevices(): Promise<{ devices: LessonRunDevice[] }>
  mapDevice(deviceId: string, lessonRunStudentId: string | null): Promise<unknown>
  revokeDevice(deviceId: string): Promise<unknown>
  /** Re-reads the run so the console shows the new join code. */
  refreshRun(): Promise<void>
}

export interface JoinPanel {
  element: HTMLElement
  update(view: LessonRunView): void
  destroy(): void
}

const POLL_MS = 3000

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function button(label: string, className = 'le-board__action'): HTMLButtonElement {
  const b = el('button', className, label)
  b.type = 'button'
  return b
}

export function joinUrl(code: string): string {
  return new URL(`lesson-join.html?code=${code}`, location.href).href
}

async function drawQr(canvas: HTMLCanvasElement, url: string, width: number) {
  const { default: QRCode } = await import('qrcode')
  await QRCode.toCanvas(canvas, url, { errorCorrectionLevel: 'Q', margin: 3, width, color: { dark: '#071226', light: '#ffffff' } })
  // The renderer sets fixed inline dimensions; CSS owns the responsive size.
  canvas.removeAttribute('style')
}

/** Full-screen code for the board: big digits + QR, Escape closes. */
function showJoinFullscreen(code: string) {
  const overlay = el('div', 'le-board le-join-full')
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', 'Код приєднання до уроку')
  const stage = el('div', 'le-board__stage le-join-full__stage')
  stage.append(
    el('p', 'le-join-full__hint', 'Відкрий сторінку і введи код:'),
    el('p', 'le-join-full__url', new URL('lesson-join.html', location.href).host + '/lesson-join.html'),
    el('p', 'le-join-full__code', formatJoinCode(code)),
  )
  const canvas = el('canvas', 'le-join-full__qr')
  canvas.setAttribute('role', 'img')
  canvas.setAttribute('aria-label', `QR-код для приєднання, код ${formatJoinCode(code)}`)
  stage.append(canvas)
  const bar = el('div', 'le-board__bar')
  const close = button('Закрити', 'le-board__close')
  bar.append(close)
  overlay.append(stage, bar)
  document.body.append(overlay)
  let removeTrap: () => void = () => {}
  const dismiss = () => {
    removeTrap()
    overlay.remove()
  }
  close.addEventListener('click', dismiss)
  removeTrap = createFocusTrap(overlay, dismiss)
  close.focus()
  void drawQr(canvas, joinUrl(code), 800).catch(() => canvas.remove())
}

export function mountJoinPanel(initial: LessonRunView, deps: JoinPanelDeps): JoinPanel {
  let view = initial
  let devices: LessonRunDevice[] = []
  let timer: number | null = null
  let destroyed = false
  let qrCode: string | null = null

  const root = el('section', 'le-join')
  root.setAttribute('aria-labelledby', 'le-join-title')
  const title = el('h2', 'le-join__title', 'Приєднання учнів')
  title.id = 'le-join-title'
  const codeArea = el('div', 'le-join__code-area')
  const deviceArea = el('div', 'le-join__devices')
  const message = el('p', 'le-join__message')
  message.setAttribute('role', 'status')
  root.append(title, codeArea, message, deviceArea)

  async function act(task: () => Promise<unknown>, thenRefreshRun = false) {
    message.textContent = ''
    try {
      await task()
      if (thenRefreshRun) await deps.refreshRun()
      await pollDevices(true)
    } catch (err) {
      message.textContent = (err as Error).message || 'Не вдалося виконати дію.'
    }
  }

  function renderCode() {
    const code = view.run.joinCode
    if (!code) {
      qrCode = null
      const hint = el('p', undefined, 'Учні відкривають сторінку lesson-join.html на своїх пристроях і вводять код. Імена вводити не потрібно: ви самі призначите, хто за яким пристроєм.')
      const open = button('Відкрити приєднання', 'le-board__action le-board__action--primary')
      open.addEventListener('click', () => void act(deps.openJoin, true))
      codeArea.replaceChildren(hint, open)
      return
    }
    if (qrCode === code) return
    qrCode = code
    const codeText = el('p', 'le-join__code', formatJoinCode(code))
    codeText.setAttribute('aria-label', `Код приєднання ${code.split('').join(' ')}`)
    const url = el('p', 'le-join__url', joinUrl(code))
    const canvas = el('canvas', 'le-join__qr')
    canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-label', 'QR-код для приєднання')
    const actions = el('div', 'le-join__actions')
    const full = button('На весь екран')
    full.addEventListener('click', () => showJoinFullscreen(code))
    const rotate = button('Новий код')
    rotate.addEventListener('click', () => void act(deps.openJoin, true))
    const close = button('Закрити приєднання')
    close.addEventListener('click', () => void act(deps.closeJoin, true))
    actions.append(full, rotate, close)
    codeArea.replaceChildren(codeText, url, canvas, actions)
    void drawQr(canvas, joinUrl(code), 200).catch(() => canvas.remove())
  }

  function renderDevices() {
    if (devices.length === 0) {
      deviceArea.replaceChildren(view.run.joinCode ? el('p', 'le-join__empty', 'Поки ніхто не приєднався.') : el('span'))
      return
    }
    const summary = el('p', 'le-join__summary', mappingSummary(view.students, devices))
    const list = el('ul', 'le-join__device-list')
    for (const device of devices) {
      const item = el('li', 'le-join__device')
      const selectId = `le-device-${device.id}`
      const label = el('label', 'le-join__device-number', `№ ${device.pairingNumber}`)
      label.htmlFor = selectId
      const select = el('select', 'le-launcher__select')
      select.id = selectId
      const none = el('option', undefined, '— не призначено —')
      none.value = ''
      select.append(none)
      for (const option of studentOptions(view.students, devices, device.id)) {
        const opt = el('option', undefined, option.label)
        opt.value = option.value
        select.append(opt)
      }
      select.value = device.lessonRunStudentId ?? ''
      select.addEventListener('change', () => void act(() => deps.mapDevice(device.id, select.value || null), true))
      const revoke = button('Відключити', 'le-join__revoke')
      revoke.setAttribute('aria-label', `Відключити пристрій № ${device.pairingNumber}`)
      revoke.addEventListener('click', () => void act(() => deps.revokeDevice(device.id), true))
      item.append(label, select, revoke)
      list.append(item)
    }
    deviceArea.replaceChildren(summary, list)
  }

  async function pollDevices(force = false) {
    if (destroyed || !isOpenRun(view.run.status)) return
    try {
      devices = (await deps.listDevices()).devices
      // A select the teacher is using is not yanked away mid-choice.
      const choosing = deviceArea.contains(document.activeElement) && document.activeElement?.tagName === 'SELECT'
      if (force || !choosing) renderDevices()
    } catch {
      /* transient: the next poll retries */
    }
  }

  function schedule() {
    if (timer !== null) window.clearInterval(timer)
    timer = isOpenRun(view.run.status)
      ? window.setInterval(() => { if (document.visibilityState === 'visible') void pollDevices() }, POLL_MS)
      : null
  }

  function update(next: LessonRunView) {
    view = next
    root.hidden = !isOpenRun(view.run.status)
    renderCode()
    renderDevices()
    schedule()
  }

  update(initial)
  void pollDevices()

  return {
    element: root,
    update,
    destroy() {
      destroyed = true
      if (timer !== null) window.clearInterval(timer)
    },
  }
}
