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
