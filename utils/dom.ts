/**
 * utils/dom.ts
 * Типізовані DOM-хелпери — замінюють `getElementById` + `as HTMLInputElement` скрізь.
 */

/** Повертає елемент за id із потрібним типом. Кидає Error якщо не знайдено. */
export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Element #${id} not found`)
  return el as T
}

/** Тихий варіант — повертає null якщо не знайдено (для опціональних елементів). */
export function $maybe<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null
}
