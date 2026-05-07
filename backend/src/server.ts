import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import 'dotenv/config'

const app = Fastify({ logger: true })

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
})

// Rate limiting — глобально: 100 запитів / хвилину з однієї IP
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
})

app.get('/health', async () => ({ status: 'ok' }))

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
