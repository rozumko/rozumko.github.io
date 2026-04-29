/**
 * utils/ui.js
 * ─────────────────────────────────────────────────────────────
 * Спільні UI-утиліти для всіх сторінок: student, teacher, admin.
 *
 * Що тут:
 *   showModal(msg)      — інформаційна модаль (#app-modal / #modal-message)
 *   esc(str)            — XSS-захист для innerHTML
 *   friendlyError(msg)  — Firebase помилки → зрозумілий текст
 *
 * Використання:
 *   import { showModal, esc, friendlyError } from './utils/ui.js';
 *   import { showModal, esc, friendlyError } from '../../utils/ui.js'; // з підпапок
 * ─────────────────────────────────────────────────────────────
 */

import { createFocusTrap } from './focus-trap.js';

// ─── Модаль ───────────────────────────────────────────────────────────────────

// Кожна сторінка має один #app-modal і #modal-ok-btn у розмітці.
// Ці елементи ініціалізуються при першому імпорті модуля.
let _appModal   = null;
let _trapRemove = null;

function getModal() {
  if (!_appModal) {
    _appModal = document.getElementById('app-modal');
    const okBtn = document.getElementById('modal-ok-btn');
    if (okBtn) {
      okBtn.addEventListener('click', () => {
        _trapRemove?.();
        _trapRemove = null;
        _appModal?.classList.add('hidden');
      });
    }
  }
  return _appModal;
}

/**
 * Показати інформаційну модаль з текстовим повідомленням.
 * Автоматично встановлює focus trap — Tab/Shift+Tab тримає фокус всередині,
 * Escape закриває модаль. Відповідає WCAG 2.2.
 *
 * Вимога до розмітки: #app-modal, #modal-message, #modal-ok-btn на сторінці.
 *
 * @param {string} msg — текст повідомлення для користувача
 */
export function showModal(msg) {
  const modal = getModal();
  if (!modal) { alert(msg); return; }
  document.getElementById('modal-message').textContent = msg;
  modal.classList.remove('hidden');

  _trapRemove?.();
  _trapRemove = createFocusTrap(modal, () => {
    _trapRemove?.();
    _trapRemove = null;
    modal.classList.add('hidden');
  });
}

// ─── XSS-захист ───────────────────────────────────────────────────────────────

/**
 * Екранує HTML-спецсимволи для безпечного вставляння у innerHTML.
 * Використовувати СКРІЗЬ де user-data або дані з Firestore йдуть в innerHTML.
 *
 * Не потрібно для textContent — він і так безпечний.
 *
 * @param {*} str — будь-яке значення (null/undefined → порожній рядок)
 * @returns {string} безпечний HTML-рядок
 *
 * @example
 * el.innerHTML = `<p>${esc(user.name)}</p>`; // ✅
 * el.textContent = user.name;                 // ✅ без esc теж ок
 * el.innerHTML = user.name;                   // ❌ XSS-ризик
 */
export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Дружні помилки Firebase ──────────────────────────────────────────────────

/**
 * Перетворює технічне повідомлення Firebase Auth на зрозумілий текст.
 * Охоплює всі ролі: admin, teacher, student.
 *
 * @param {string} msg — err.message з Firebase
 * @returns {string} повідомлення для відображення користувачу
 */
export function friendlyError(msg) {
  if (msg.includes('invalid-credential') || msg.includes('wrong-password'))
    return 'Невірний email або пароль.';
  if (msg.includes('email-already-in-use'))
    return 'Цей email вже зареєстровано.';
  if (msg.includes('too-many-requests'))
    return 'Забагато спроб. Спробуй пізніше.';
  // Кастомні повідомлення з Firestore rules — повертаємо як є
  if (msg.includes('недостатньо прав') || msg.includes('Акаунт вчителя'))
    return msg;
  return 'Помилка. Перевір дані і спробуй знову.';
}
