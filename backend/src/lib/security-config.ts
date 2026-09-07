import proxyAddr from '@fastify/proxy-addr'

// Render connects to the app through an internal reverse proxy. Trust only
// that immediate private-network peer; forwarded addresses never gain trust.
const isInternalProxyAddress = proxyAddr.compile(['loopback', 'linklocal', 'uniquelocal'])

export const FASTIFY_SECURITY_OPTIONS = {
  trustProxy: (address: string, hop: number) => (
    hop === 0 && isInternalProxyAddress(address, hop)
  ),
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
