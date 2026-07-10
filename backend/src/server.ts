import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import 'dotenv/config'
import { FASTIFY_SECURITY_OPTIONS, CORS_OPTIONS } from './lib/security-config.js'
import { getFastifyRateLimitOptions } from './lib/rate-limit-config.js'
import { healthRoutes } from './routes/health.js'

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

// CORS-конфіг спільний із security-regression тестами — див. lib/security-config.ts
await app.register(cors, CORS_OPTIONS)

// Rate limiting — глобально: 100 запитів / хвилину з однієї IP.
// ⚠ Лічильник живе в памʼяті процесу → коректний ЛИШЕ на одному інстансі.
// Горизонтальне масштабування потребує shared store (Redis/Valkey).
// Див. docs/security-model.md та numInstances: 1 у backend/render.yaml.
await app.register(rateLimit, getFastifyRateLimitOptions())
app.log.info('rate-limit: in-memory store active — requires a single backend instance')

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

await app.register(healthRoutes)

import { studentRoutes } from './routes/student.js'
import { attemptRoutes } from './routes/attempt.js'
import { teacherRoutes } from './routes/teacher.js'
import { questionsRoutes } from './routes/questions.js'
import { adminRoutes } from './routes/admin.js'
import { schoolRoutes } from './routes/school.js'
import { homeRoutes } from './routes/home.js'
import { homePaymentWebhookRoutes } from './routes/home-payment-webhook.js'
import { parentRoutes } from './routes/parent.js'
await app.register(studentRoutes,  { prefix: '/api/student' })
await app.register(attemptRoutes,  { prefix: '/api/attempt' })
await app.register(teacherRoutes,  { prefix: '/api/teacher' })
await app.register(questionsRoutes,{ prefix: '/api/questions' })
await app.register(adminRoutes,    { prefix: '/api/admin' })
await app.register(schoolRoutes,   { prefix: '/api/school' })
await app.register(homeRoutes,     { prefix: '/api/home' })
await app.register(homePaymentWebhookRoutes, { prefix: '/api/home' })
await app.register(parentRoutes,   { prefix: '/api/parent' })

const port = Number(process.env.PORT) || 3000

await app.listen({ port, host: '0.0.0.0' })
