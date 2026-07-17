import 'fastify'

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string
      authUserId: string
      role: string
      name: string | null
      email: string
    }
  }
}
