/**
 * Focus trap — утримує Tab/Shift+Tab всередині модального елемента.
 * Закривається на Escape.
 *
 * @param el      — контейнер модалі
 * @param onClose — функція що викликається при Escape
 * @returns removeTrap — виклик знімає слухачів
 */
export function createFocusTrap(el: HTMLElement, onClose?: () => void): () => void {
  const previouslyFocused = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null

  const FOCUSABLE = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',')

  function getFocusable(): HTMLElement[] {
    return [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      n => !n.closest('[hidden]') && getComputedStyle(n).display !== 'none'
    )
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') { onClose?.(); return }
    if (e.key !== 'Tab') return

    const nodes = getFocusable()
    if (!nodes.length) { e.preventDefault(); return }

    const first = nodes[0]
    const last  = nodes[nodes.length - 1]

    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus() }
    } else {
      if (document.activeElement === last)  { e.preventDefault(); first.focus() }
    }
  }

  const nodes = getFocusable()
  if (nodes.length) nodes[0].focus()

  el.addEventListener('keydown', onKeyDown)
  return () => {
    el.removeEventListener('keydown', onKeyDown)
    // Return focus to the opener when it still exists after the modal closes.
    if (previouslyFocused?.isConnected) previouslyFocused.focus()
  }
}
