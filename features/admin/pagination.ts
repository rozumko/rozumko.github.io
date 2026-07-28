/**
 * features/admin/pagination.ts
 * Shared pager for admin lists. Every list here answers with one page, so the
 * control below the list is what makes the rest reachable — and what keeps the
 * browser from drawing thousands of rows at once.
 */
import type { PageInfo } from '../api/client.js'
import { $maybe } from '../../utils/dom.js'

export const PAGE_SIZES = [20, 50, 100, 200] as const
export const DEFAULT_PAGE_SIZE = 50

export interface Pager {
  /** Range to send with the next list request. */
  range(): { limit: number; offset: number }
  /** Draws the control from what the server actually returned. */
  apply(page: PageInfo): void
  /** Back to the first page — call whenever filters change. */
  reset(): void
  /** Hides the control while the list is loading or has failed. */
  clear(): void
}

interface PagerOptions {
  /** Container placed right after the list; missing container disables the pager. */
  hostId: string
  /** Reloads the list with the new range. */
  onChange: () => void
  /** Remembers the chosen page size across sessions. */
  storageKey?: string
  /** Row noun for the summary line: "310 питань". */
  noun?: string
}

export function createPager(options: PagerOptions): Pager {
  let limit = readStoredSize(options.storageKey)
  let offset = 0

  function host(): HTMLElement | null {
    return $maybe(options.hostId)
  }

  function goTo(nextOffset: number): void {
    offset = Math.max(0, nextOffset)
    options.onChange()
  }

  function setSize(nextLimit: number): void {
    limit = nextLimit
    offset = 0
    if (options.storageKey) {
      try { localStorage.setItem(options.storageKey, String(nextLimit)) } catch { /* storage can be blocked */ }
    }
    options.onChange()
  }

  return {
    range: () => ({ limit, offset }),

    apply(page: PageInfo): void {
      limit = page.limit
      // A page can vanish under the editor — a bulk delete, or a filter that now
      // matches fewer rows. Fall back to the last page that still has rows.
      if (page.offset > 0 && page.offset >= page.total) {
        const lastOffset = Math.max(0, (Math.ceil(page.total / page.limit) - 1) * page.limit)
        if (lastOffset !== offset) { goTo(lastOffset); return }
      }
      offset = page.offset
      render(host(), page, options.noun ?? 'записів', goTo, setSize)
    },

    reset(): void {
      offset = 0
    },

    clear(): void {
      host()?.replaceChildren()
    },
  }
}

function readStoredSize(storageKey?: string): number {
  if (!storageKey) return DEFAULT_PAGE_SIZE
  let stored = ''
  try { stored = localStorage.getItem(storageKey) ?? '' } catch { /* storage can be blocked */ }
  const size = Number(stored)
  return (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE
}

function render(
  host: HTMLElement | null,
  page: PageInfo,
  noun: string,
  goTo: (offset: number) => void,
  setSize: (limit: number) => void,
): void {
  if (!host) return
  host.replaceChildren()
  // Nothing to page through and nothing to resize: keep the screen quiet.
  if (page.total <= PAGE_SIZES[0] && page.offset === 0) return

  const nav = document.createElement('nav')
  nav.className = 'admin-pager'
  nav.setAttribute('aria-label', 'Сторінки списку')

  const first = page.total === 0 ? 0 : page.offset + 1
  const last  = Math.min(page.offset + page.limit, page.total)
  const pageNumber = Math.floor(page.offset / page.limit) + 1
  const pageCount  = Math.max(1, Math.ceil(page.total / page.limit))

  const prev = navButton('← Назад', page.offset <= 0, () => goTo(page.offset - page.limit))
  const next = navButton('Далі →', last >= page.total, () => goTo(page.offset + page.limit))

  const status = document.createElement('p')
  status.className = 'admin-pager__status'
  status.setAttribute('aria-live', 'polite')
  status.textContent = `${first}–${last} з ${page.total} ${noun} · сторінка ${pageNumber} з ${pageCount}`

  const sizeLabel = document.createElement('label')
  sizeLabel.className = 'admin-pager__size'
  sizeLabel.textContent = 'На сторінці:'
  const select = document.createElement('select')
  select.className = 'adm-input adm-input--sm adm-input--auto'
  for (const size of PAGE_SIZES) {
    const option = document.createElement('option')
    option.value = String(size)
    option.textContent = String(size)
    select.appendChild(option)
  }
  select.value = String(page.limit)
  select.addEventListener('change', () => setSize(Number(select.value)))
  sizeLabel.appendChild(select)

  nav.append(prev, status, next, sizeLabel)
  host.appendChild(nav)
}

function navButton(label: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'btn-adm-ghost btn--sm'
  button.textContent = label
  button.disabled = disabled
  button.addEventListener('click', onClick)
  return button
}
