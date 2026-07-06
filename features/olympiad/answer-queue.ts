/**
 * features/olympiad/answer-queue.ts
 * ─────────────────────────────────────────────────────────────
 * Offline-стійка черга відповідей олімпіади.
 *
 * Навіщо: під час блекауту (типовий сценарій в Україні — роутер піднімається
 * від генератора за 5–10 хв) відповіді учня не мають губитися. Черга зберігає
 * СИРІ відповіді (індекс / текст / масив) у localStorage і дошилає їх на сервер,
 * коли зʼявляється звʼязок (подія `online`, періодичний таймер, явний flush
 * перед завершенням). Переживає перезавантаження сторінки.
 *
 * Безпека: у чергу потрапляють лише власні відповіді учня — це НЕ ключі
 * відповідей і НЕ серверні бали (див. docs/security-model.md, «Offline or
 * cached app state … must not include answer keys … or server-trusted scores»).
 * Токен спроби навмисно не зберігається: sender читає актуальний токен ззовні.
 */

export type QueuedAnswerValue = number | string | number[]
interface QueueItem { questionId: string; answer: QueuedAnswerValue }

const STORAGE_KEY = 'rozumko_answer_queue'

export interface AnswerQueueDeps {
  /** Надсилач: кидає при невдачі (мережа/сервер), резолвиться при 2xx. */
  send: (questionId: string, answer: QueuedAnswerValue) => Promise<void>
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  /** Затримка між ретраями — інʼєктується в тестах, щоб не чекати реально. */
  sleep?: (ms: number) => Promise<void>
  /** Період автофлашу (мс). 0 → вимкнено (для тестів). */
  autoFlushMs?: number
}

export interface AnswerQueue {
  enqueue(questionId: string, answer: QueuedAnswerValue): void
  flushOnce(): Promise<void>
  flushAll(retries?: number, delayMs?: number): Promise<number>
  pendingCount(): number
  clear(): void
  destroy(): void
}

function sameAnswer(a: QueuedAnswerValue, b: QueuedAnswerValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function createAnswerQueue(attemptId: string, deps: AnswerQueueDeps): AnswerQueue {
  const storage = deps.storage
    ?? (typeof localStorage !== 'undefined' ? localStorage : undefined)
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))

  let items: QueueItem[] = load()
  let flushing = false

  function load(): QueueItem[] {
    if (!storage) return []
    try {
      const raw = storage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      // Черга від іншої спроби нас не стосується — ігноруємо.
      if (parsed?.attemptId !== attemptId || !Array.isArray(parsed.items)) return []
      return parsed.items as QueueItem[]
    } catch { return [] }
  }

  function persist(): void {
    if (!storage) return
    try { storage.setItem(STORAGE_KEY, JSON.stringify({ attemptId, items })) }
    catch { /* localStorage недоступний/переповнений — не критично */ }
  }

  function enqueue(questionId: string, answer: QueuedAnswerValue): void {
    // Upsert: остання відповідь на питання перекриває попередню (сервер робить
    // JSONB-merge за questionId — узгоджено).
    items = items.filter(i => i.questionId !== questionId)
    items.push({ questionId, answer })
    persist()
    void flushOnce()
  }

  async function flushOnce(): Promise<void> {
    if (flushing || !items.length) return
    flushing = true
    try {
      for (const item of [...items]) {
        try {
          await deps.send(item.questionId, item.answer)
          // Видаляємо лише якщо відповідь не змінилася під час надсилання.
          items = items.filter(i => !(i.questionId === item.questionId && sameAnswer(i.answer, item.answer)))
          persist()
        } catch {
          // Мережа/сервер недоступні — лишаємо в черзі до наступного разу.
        }
      }
    } finally {
      flushing = false
    }
  }

  /** Дочищає чергу з обмеженими ретраями. Повертає скільки лишилось недоставленим. */
  async function flushAll(retries = 3, delayMs = 1200): Promise<number> {
    for (let attempt = 0; attempt <= retries && items.length; attempt++) {
      if (attempt > 0) await sleep(delayMs)
      await flushOnce()
    }
    return items.length
  }

  function pendingCount(): number { return items.length }

  function clear(): void {
    items = []
    if (storage) { try { storage.removeItem(STORAGE_KEY) } catch { /* ігноруємо */ } }
  }

  // ── Автотригери (лише в браузері) ──────────────────────────────────────────
  const onOnline = () => { void flushOnce() }
  const autoMs = deps.autoFlushMs ?? 20_000
  let interval: ReturnType<typeof setInterval> | null = null

  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline)
    if (autoMs > 0) interval = setInterval(() => { if (items.length) void flushOnce() }, autoMs)
  }

  function destroy(): void {
    if (typeof window !== 'undefined') window.removeEventListener('online', onOnline)
    if (interval) clearInterval(interval)
  }

  return { enqueue, flushOnce, flushAll, pendingCount, clear, destroy }
}
