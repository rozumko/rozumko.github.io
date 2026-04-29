/**
 * Focus trap — утримує Tab/Shift+Tab всередині модального елемента.
 * Закривається на Escape.
 *
 * @param {HTMLElement} el       — контейнер модалі
 * @param {Function}    onClose  — функція що викликається при Escape
 * @returns {Function}  removeTrap — виклик знімає слухачів
 */
export function createFocusTrap(el, onClose) {
  const FOCUSABLE = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  function getFocusable() {
    return [...el.querySelectorAll(FOCUSABLE)].filter(
      n => !n.closest('[hidden]') && getComputedStyle(n).display !== 'none'
    );
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { onClose?.(); return; }
    if (e.key !== 'Tab') return;

    const nodes = getFocusable();
    if (!nodes.length) { e.preventDefault(); return; }

    const first = nodes[0];
    const last  = nodes[nodes.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
    }
  }

  // Фокус на першому доступному елементі
  const nodes = getFocusable();
  if (nodes.length) nodes[0].focus();

  el.addEventListener('keydown', onKeyDown);
  return () => el.removeEventListener('keydown', onKeyDown);
}
