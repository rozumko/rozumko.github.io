import type { FastifyRequest } from 'fastify'

export const RATE_LIMIT_WINDOW = '1 minute'

export const RATE_LIMIT_MAX = {
  classroomStart: 60,
  attemptAnswer: 60,
  attemptFinish: 10,
  attemptHeartbeat: 12,
  schoolParticipantSession: 60,
  schoolParticipantAvatar: 20,
  schoolParticipantAnswer: 60,
  // One final result per run; the low ceiling keeps a scripted client from
  // hammering the endpoint while a legitimate retry after a network blip works.
  schoolParticipantActivityResult: 10,
  // Lesson Engine devices, per verified device: polling every 2 s is 30/min.
  lessonDeviceState: 90,
  lessonDeviceAttempt: 30,
  // Joining has no device yet: a whole class joins from one NAT address, and
  // failed codes are capped separately by the code throttle.
  lessonJoin: 120,
  // A lab laptop on a class link waits for the next lesson (one call per 15 s).
  lessonClassJoin: 20,
} as const

type VerifiedResourceRateLimitOptions = {
  scope: string
  headerName: string
  max: number
  verifyToken: (resourceId: string, token: string) => boolean
}

type RateLimitRequest = Pick<FastifyRequest, 'headers' | 'ip' | 'params'>

/**
 * Isolates legitimate authenticated resources behind one NAT address while
 * keeping missing or forged tokens in a shared IP bucket.
 */
export function createVerifiedResourceRateLimit({
  scope,
  headerName,
  max,
  verifyToken,
}: VerifiedResourceRateLimitOptions) {
  return {
    max,
    timeWindow: RATE_LIMIT_WINDOW,
    keyGenerator(req: RateLimitRequest): string {
      const resourceId = (req.params as { id?: unknown } | null)?.id
      const token = req.headers[headerName]

      if (typeof resourceId === 'string' && typeof token === 'string' && verifyToken(resourceId, token)) {
        return `${scope}:resource:${resourceId}`
      }

      return `${scope}:ip:${req.ip}`
    },
  }
}

type VerifiedBodyRateLimitOptions = {
  scope: string
  max: number
  /** The verified resource the body proves it holds, or null. Must not touch the DB. */
  resource: (body: unknown) => string | null
}

type BodyRateLimitRequest = Pick<FastifyRequest, 'body' | 'ip'>

/**
 * createVerifiedResourceRateLimit for routes whose credential travels in the
 * JSON body (Lesson Engine devices keep tokens out of URLs and headers). It
 * runs at preValidation so the body is parsed; the body is not yet
 * schema-checked, so `resource` must treat it as untrusted input.
 */
export function createVerifiedBodyRateLimit({ scope, max, resource }: VerifiedBodyRateLimitOptions) {
  return {
    max,
    timeWindow: RATE_LIMIT_WINDOW,
    hook: 'preValidation' as const,
    keyGenerator(req: BodyRateLimitRequest): string {
      let id: string | null = null
      try {
        id = resource(req.body)
      } catch {
        id = null
      }
      return id ? `${scope}:resource:${id}` : `${scope}:ip:${req.ip}`
    },
  }
}
