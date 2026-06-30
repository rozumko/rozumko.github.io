export type RateLimitStore = 'memory'

export type RateLimitConfig = {
  max: number
  timeWindow: string
  store: RateLimitStore
}

export function getRateLimitConfig(env: NodeJS.ProcessEnv = process.env): RateLimitConfig {
  const store = env.RATE_LIMIT_STORE ?? 'memory'
  if (store !== 'memory') {
    throw new Error(`Unsupported RATE_LIMIT_STORE=${store}. Shared rate limiting is not implemented yet.`)
  }

  return {
    max: 100,
    timeWindow: '1 minute',
    store,
  }
}

export function getFastifyRateLimitOptions(env: NodeJS.ProcessEnv = process.env) {
  const { max, timeWindow } = getRateLimitConfig(env)
  return { max, timeWindow }
}
