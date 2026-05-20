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

let _appModal:   HTMLElement | null = null
let _trapRemove: (() => void) | null = null

function closeModal() {
  _trapRemove?.()
  _trapRemove = null
  _appModal?.classList.add('hidden')
  // Скидаємо cancel-кнопку назад у прихований стан
  const cancelBtn = document.getElementById('modal-cancel-btn')
  if (cancelBtn) cancelBtn.classList.add('hidden')
}

function getModal(): HTMLElement | null {
  if (!_appModal) {
    _appModal = document.getElementById('app-modal')
    const okBtn     = document.getElementById('modal-ok-btn')
    const cancelBtn = document.getElementById('modal-cancel-btn')
    if (okBtn)     okBtn.addEventListener('click',     () => closeModal())
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
  const msgEl = document.getElementById('modal-message')
  if (msgEl) msgEl.textContent = msg
  modal.classList.remove('hidden')

  _trapRemove?.()
  _trapRemove = createFocusTrap(modal, closeModal)
}

/**
 * Показати модаль підтвердження з двома кнопками: «Підтвердити» / «Скасувати».
 * onConfirm викликається лише якщо користувач натиснув «Підтвердити».
 * Escape / «Скасувати» — закриває без дії.
 *
 * Вимога до розмітки: #app-modal, #modal-message, #modal-ok-btn, #modal-cancel-btn.
 */
export function showConfirm(msg: string, onConfirm: () => void): void {
  const modal = getModal()
  if (!modal) { if (confirm(msg)) onConfirm(); return }

  const msgEl     = document.getElementById('modal-message')
  const okBtn     = document.getElementById('modal-ok-btn')
  const cancelBtn = document.getElementById('modal-cancel-btn')

  if (msgEl) msgEl.textContent = msg
  if (cancelBtn) cancelBtn.classList.remove('hidden')

  // Замінюємо обробник OK — одноразовий, щоб не накопичувати
  const handleOk = () => {
    okBtn?.removeEventListener('click', handleOk)
    closeModal()
    onConfirm()
  }
  okBtn?.removeEventListener('click', closeModal) // прибираємо дефолтний
  okBtn?.addEventListener('click', handleOk, { once: true })

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
}

// ─── Дружні помилки ───────────────────────────────────────────────────────────

/**
 * Перетворює технічне повідомлення API на зрозумілий текст для користувача.
 */
export function friendlyError(msg: string): string {
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
  return 'Помилка. Перевір дані і спробуй знову.'
}
