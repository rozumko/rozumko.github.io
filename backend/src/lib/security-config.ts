// Render додає рівно один reverse-proxy hop перед застосунком.
// Не змінювати на true: тоді клієнт зможе підробити X-Forwarded-For
// і отримувати новий rate-limit bucket для кожного фейкового IP.
export const FASTIFY_SECURITY_OPTIONS = {
  trustProxy: 1,
} as const

// CORS — дозволяємо тільки GitHub Pages та localhost для розробки
export const CORS_ALLOWED_ORIGINS = [
  'https://rozumko.com',
  'https://www.rozumko.com',
  'https://rozumko.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
] as const

// Кожен кастомний заголовок клієнта МУСИТЬ бути тут, інакше браузерний
// preflight заблокує запит у продакшені, хоча inject-тести пройдуть.
export const CORS_OPTIONS = {
  origin: (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => {
    if (!origin || (CORS_ALLOWED_ORIGINS as readonly string[]).includes(origin)) {
      cb(null, true)
    } else {
      const err = Object.assign(new Error('Not allowed by CORS'), { statusCode: 403 })
      cb(err as Error, false)
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Attempt-Token', 'X-Participant-Token', 'X-Lead-Token'],
}
