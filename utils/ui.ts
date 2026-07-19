/**
 * utils/ui.ts
 * ─────────────────────────────────────────────────────────────
 * Спільні UI-утиліти для всіх сторінок: student, teacher, admin.
 *
 *   showModal(msg)              — інформаційна модаль (#app-modal / #modal-message)
 *   showConfirm(msg, onConfirm) — модаль підтвердження з двома кнопками
 *   esc(str)                    — XSS-захист для innerHTML
 *   friendlyError(msg)          — API помилки → зрозумілий текст для користувача
 * ─────────────────────────────────────────────────────────────
 */

import { createFocusTrap } from './focus-trap.js'

// ─── Модаль ───────────────────────────────────────────────────────────────────

let _appModal:        HTMLElement | null = null
let _trapRemove:      (() => void) | null = null
let _pendingConfirm:  (() => void) | null = null  // callback для showConfirm; null = info-режим

function closeModal() {
  _trapRemove?.()
  _trapRemove = null
  _pendingConfirm = null   // завжди скидаємо при будь-якому закритті (OK / Cancel / Escape)
  _appModal?.classList.add('hidden')
  const cancelBtn = document.getElementById('modal-cancel-btn')
  if (cancelBtn) cancelBtn.classList.add('hidden')
}

function getModal(): HTMLElement | null {
  if (!_appModal) {
    _appModal = document.getElementById('app-modal')
    const okBtn     = document.getElementById('modal-ok-btn')
    const cancelBtn = document.getElementById('modal-cancel-btn')

    // Один статичний обробник OK — перевіряє _pendingConfirm у момент кліку.
    // Це унеможливлює витік старого callback після Cancel/Escape.
    if (okBtn) okBtn.addEventListener('click', () => {
      const cb = _pendingConfirm  // читаємо до closeModal(), яка скидає його
      closeModal()
      cb?.()
    })
    if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal())
  }
  return _appModal
}

/**
 * Показати інформаційну модаль з текстовим повідомленням.
 * Автоматично встановлює focus trap (Tab/Shift+Tab, Escape). WCAG 2.2.
 *
 * Вимога до розмітки: #app-modal, #modal-message, #modal-ok-btn на сторінці.
 */
export function showModal(msg: string): void {
  const modal = getModal()
  if (!modal) { alert(msg); return }
  _pendingConfirm = null   // info-режим: OK просто закриває
  const msgEl = document.getElementById('modal-message')
  if (msgEl) msgEl.textContent = msg
  modal.classList.remove('hidden')

  _trapRemove?.()
  _trapRemove = createFocusTrap(modal, closeModal)
}

/**
 * Показати модаль підтвердження з двома кнопками: «OK» / «Скасувати».
 * onConfirm викликається лише якщо натиснуто OK.
 * Cancel / Escape — закриває без дії, callback не зберігається.
 *
 * Вимога до розмітки: #app-modal, #modal-message, #modal-ok-btn, #modal-cancel-btn.
 */
export function showConfirm(msg: string, onConfirm: () => void): void {
  const modal = getModal()
  if (!modal) { if (confirm(msg)) onConfirm(); return }

  _pendingConfirm = onConfirm   // буде викликано лише при натисканні OK
  const msgEl     = document.getElementById('modal-message')
  const cancelBtn = document.getElementById('modal-cancel-btn')
  if (msgEl)     msgEl.textContent = msg
  if (cancelBtn) cancelBtn.classList.remove('hidden')

  modal.classList.remove('hidden')
  _trapRemove?.()
  _trapRemove = createFocusTrap(modal, closeModal)
}

// ─── XSS-захист ───────────────────────────────────────────────────────────────

/**
 * Екранує HTML-спецсимволи для безпечного вставляння у innerHTML.
 * Для textContent не потрібно — він безпечний без esc.
 *
 * @example
 * el.innerHTML = `<p>${esc(data.name)}</p>` // ✅
 * el.textContent = data.name               // ✅ без esc теж ок
 * el.innerHTML = data.name                 // ❌ XSS-ризик
 */
export function esc(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ─── Дружні помилки ───────────────────────────────────────────────────────────

/**
 * Перетворює технічне повідомлення API на зрозумілий текст для користувача.
 */
export function friendlyError(msg: string): string {
  if (msg.includes('Invalid login credentials') || msg.includes('invalid_grant'))
    return 'Невірна електронна пошта або пароль.'
  if (msg.includes('Email not confirmed'))
    return 'Підтвердьте email перед входом.'
  if (msg.includes('Немає тренувальних питань'))
    return msg
  if (msg.includes('429') || msg.includes('Too Many'))
    return 'Забагато спроб. Спробуй за хвилину.'
  if (msg.includes('401') || msg.includes('авторизован'))
    return 'Сесія завершилась. Увійди знову.'
  if (msg.includes('403'))
    return 'Немає доступу.'
  if (msg.includes('404'))
    return 'Не знайдено.'
  if (msg.includes('Невірний формат') || msg.includes('Код не знайдено') ||
      msg.includes('Код застарів')    || msg.includes('вже використано'))
    return msg
  if (/captcha/i.test(msg))
    return 'Перевірка «я не робот» не пройшла. Оновіть сторінку та спробуйте ще раз.'
  // Network failures and a mid-deploy 404 (route not on the old instance yet)
  // are transient — tell the user to retry instead of "check your input".
  if (/Failed to fetch|NetworkError|load failed/i.test(msg))
    return 'Немає зʼєднання із сервером. Зачекайте кілька секунд і спробуйте ще раз.'
  if (msg.includes('Not Found'))
    return 'Сервер оновлюється. Зачекайте хвилину і спробуйте ще раз.'
  return 'Помилка. Перевір дані і спробуй знову.'
}

/**
 * Password-recovery errors: GoTrue messages are English and the generic
 * friendlyError fallback hides the actual cause. Map the known ones,
 * otherwise show the raw message so the user can report it.
 */
export function recoveryErrorMessage(msg: string): string {
  if (/security purposes|only request this/i.test(msg))
    return 'Зачекайте хвилину і спробуйте ще раз.'
  if (/captcha/i.test(msg))
    return 'Перевірка «я не робот» не пройшла. Оновіть сторінку та спробуйте ще раз.'
  if (/error sending|recovery email|smtp/i.test(msg))
    return 'Не вдалося надіслати лист — поштовий сервіс відхилив запит. Спробуйте пізніше.'
  if (/rate limit|429|too many/i.test(msg))
    return 'Вичерпано ліміт листів. Спробуйте за годину.'
  return msg
}
