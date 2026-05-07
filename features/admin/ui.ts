/**
 * features/admin/ui.js
 * ─────────────────────────────────────────────────────────────
 * UI-утиліти специфічні для адмін-панелі.
 *
 * showModal, esc, friendlyError — спільні утиліти, живуть в utils/ui.js.
 * Тут тільки те що потрібне виключно адмінці.
 * ─────────────────────────────────────────────────────────────
 */

// Re-export спільних утиліт — admin-модулі імпортують все з одного місця
export { showModal, esc, friendlyError } from '../../utils/ui.js';

/**
 * Перетворює Firebase Timestamp або рядок дати в читабельний вигляд.
 * Приклад виводу: «29.04.2026, 14:30»
 *
 * Специфічна для адмінки — в student/teacher не потрібна.
 *
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
