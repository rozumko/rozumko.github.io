/**
 * features/admin/ui.js
 * ─────────────────────────────────────────────────────────────
 * Спільні UI-утиліти для адмін-панелі.
 * Не залежать від конкретної вкладки — використовуються скрізь.
 * ─────────────────────────────────────────────────────────────
 */

import { createFocusTrap } from '../../utils/focus-trap.js';

// Посилання на глобальний модальний діалог (є в admin.html один раз)
const appModal = document.getElementById('app-modal');
let _appTrapRemove = null;

// Закриття модалі по кнопці OK
document.getElementById('modal-ok-btn').addEventListener('click', () => {
  _appTrapRemove?.();
  _appTrapRemove = null;
  appModal.classList.add('hidden');
});

/**
 * Показати інформаційну модаль з повідомленням.
 * Автоматично встановлює focus trap для доступності.
 * @param {string} msg — текст повідомлення
 */
export function showModal(msg) {
  document.getElementById('modal-message').textContent = msg;
  appModal.classList.remove('hidden');
  _appTrapRemove?.();
  _appTrapRemove = createFocusTrap(appModal, () => {
    _appTrapRemove?.();
    _appTrapRemove = null;
    appModal.classList.add('hidden');
  });
}

/**
 * Екранування HTML-спецсимволів для безпечного вставляння в innerHTML.
 * Захист від XSS — використовувати скрізь де user-data йде в innerHTML.
 * @param {*} str — будь-яке значення (конвертується в рядок)
 * @returns {string} безпечний HTML-рядок
 */
export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Перетворює Firebase Timestamp або рядок дати в читабельний вигляд.
 * Приклад виводу: «29.04.2026, 14:30»
 * @param {import('firebase/firestore').Timestamp|string|null} val
 * @returns {string}
 */
export function formatDate(val) {
  if (!val) return '—';
  const d = val?.toDate ? val.toDate() : new Date(val);
  return d.toLocaleString('uk-UA', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Перетворює технічне повідомлення Firebase Auth на зрозуміле для адміна.
 * @param {string} msg — err.message з Firebase
 * @returns {string} дружнє повідомлення
 */
export function friendlyError(msg) {
  if (msg.includes('invalid-credential') || msg.includes('wrong-password'))
    return 'Невірний email або пароль.';
  if (msg.includes('too-many-requests'))
    return 'Забагато спроб. Спробуй пізніше.';
  if (msg.includes('недостатньо прав'))
    return msg;
  return 'Помилка входу. Перевір дані.';
}
