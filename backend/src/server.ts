import Fastify from 'fastify'
import cors from '@fastify/cors'
import 'dotenv/config'

const app = Fastify({ logger: true })

await app.register(cors, { origin: true })

app.get('/health', async () => ({ status: 'ok' }))

import { studentRoutes } from './routes/student.js'
import { attemptRoutes } from './routes/attempt.js'
import { teacherRoutes } from './routes/teacher.js'
import { questionsRoutes } from './routes/questions.js'
await app.register(studentRoutes, { prefix: '/api/student' })
await app.register(attemptRoutes, { prefix: '/api/attempt' })
await app.register(teacherRoutes, { prefix: '/api/teacher' })
await app.register(questionsRoutes, { prefix: '/api/questions' })

const port = Number(process.env.PORT) || 3000

await app.listen({ port, host: '0.0.0.0' })
