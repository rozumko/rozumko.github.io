import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import 'dotenv/config'
import { sql } from 'drizzle-orm'
import { db } from './db/index.js'
import { FASTIFY_SECURITY_OPTIONS } from './lib/security-config.js'
import { getFastifyRateLimitOptions } from './lib/rate-limit-config.js'

// ── Перевірка обов'язкових env-змінних при старті ────────────
const REQUIRED_ENV = ['DATABASE_URL', 'SUPABASE_URL', 'ATTEMPT_SECRET'] as const
const missing = REQUIRED_ENV.filter(k => !process.env[k])
if (missing.length) {
  console.error(`[startup] Відсутні обов'язкові змінні середовища: ${missing.join(', ')}`)
  process.exit(1)
}

// Render тримає застосунок за одним реверс-проксі. Довіряємо лише цьому hop:
// trustProxy: true дозволив би клієнту підробити X-Forwarded-For і обійти rate-limit.
const app = Fastify({ logger: true, ...FASTIFY_SECURITY_OPTIONS })

// CORS — дозволяємо тільки GitHub Pages та localhost для розробки
const allowedOrigins = [
  'https://rozumko.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
]
await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) {
      cb(null, true)
    } else {
      const err = Object.assign(new Error('Not allowed by CORS'), { statusCode: 403 })
      cb(err as Error, false)
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Attempt-Token'],
})

// Rate limiting — глобально: 100 запитів / хвилину з однієї IP
await app.register(rateLimit, getFastifyRateLimitOptions())

// Production error handler — не витікаємо stack traces
app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, _req, reply) => {
  const statusCode = err.statusCode ?? 500
  if (statusCode >= 500) {
    app.log.error(err)
    return reply.code(500).send({ error: 'Внутрішня помилка сервера' })
  }
  // Fastify schema validation errors — не розкриваємо FST_ERR_VALIDATION, code тощо
  if (statusCode === 400 && err.code?.startsWith('FST_ERR')) {
    return reply.code(400).send({ error: 'Невірний запит' })
  }
  // 404 — не розкриваємо структуру роутів
  if (statusCode === 404) {
    return reply.code(404).send({ error: 'Не знайдено' })
  }
  return reply.code(statusCode).send({ error: err.message })
})

// Security headers
app.addHook('onSend', async (_req, reply) => {
  reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  reply.header('X-Content-Type-Options', 'nosniff')
  reply.header('X-Frame-Options', 'DENY')
  reply.header('Referrer-Policy', 'no-referrer')
  reply.header('X-Permitted-Cross-Domain-Policies', 'none')
})

app.setNotFoundHandler((_req, reply) => {
  reply.code(404).send({ error: 'Не знайдено' })
})

app.get('/health', async () => ({ status: 'ok' }))

// /ping — пінгує БД щоб Supabase не засинав. Використовується UptimeRobot.
app.get('/ping', async (_req, reply) => {
  try {
    await db.execute(sql`SELECT 1`)
    return reply.send({ status: 'ok', db: 'ok' })
  } catch {
    return reply.code(503).send({ status: 'error', db: 'unreachable' })
  }
})

import { studentRoutes } from './routes/student.js'
import { attemptRoutes } from './routes/attempt.js'
import { teacherRoutes } from './routes/teacher.js'
import { questionsRoutes } from './routes/questions.js'
import { adminRoutes } from './routes/admin.js'
await app.register(studentRoutes,  { prefix: '/api/student' })
await app.register(attemptRoutes,  { prefix: '/api/attempt' })
await app.register(teacherRoutes,  { prefix: '/api/teacher' })
await app.register(questionsRoutes,{ prefix: '/api/questions' })
await app.register(adminRoutes,    { prefix: '/api/admin' })

const port = Number(process.env.PORT) || 3000

await app.listen({ port, host: '0.0.0.0' })
