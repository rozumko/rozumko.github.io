export type AuthSurface = 'teacher' | 'parent'
export type AuthRedirectFlow = 'signup' | 'recovery' | 'oauth'

interface PendingPkce {
  verifier: string
  flow: AuthRedirectFlow
  createdAt: number
}

const PKCE_KEY_PREFIX = 'rozumko_auth_pkce_'
const EMAIL_FLOW_TTL_MS = 24 * 60 * 60 * 1000
const OAUTH_FLOW_TTL_MS = 15 * 60 * 1000
const VERIFIER_RE = /^[A-Za-z0-9_-]{43,128}$/

function storageKey(surface: AuthSurface): string {
  return `${PKCE_KEY_PREFIX}${surface}`
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function flowTtl(flow: AuthRedirectFlow): number {
  return flow === 'oauth' ? OAUTH_FLOW_TTL_MS : EMAIL_FLOW_TTL_MS
}

/**
 * Starts a fail-closed S256 PKCE flow. localStorage contains only the temporary
 * verifier so an email confirmation opened in another tab can complete; access
 * and refresh tokens remain tab-scoped in sessionStorage.
 */
export async function beginPkce(
  surface: AuthSurface,
  flow: AuthRedirectFlow,
): Promise<{ codeChallenge: string; codeChallengeMethod: 's256' }> {
  if (!globalThis.crypto?.getRandomValues || !globalThis.crypto?.subtle) {
    throw new Error('Цей браузер не підтримує безпечний вхід. Оновіть браузер і спробуйте ще раз.')
  }

  const verifier = toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(48)))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const codeChallenge = toBase64Url(new Uint8Array(digest))
  const pending: PendingPkce = { verifier, flow, createdAt: Date.now() }

  try {
    localStorage.setItem(storageKey(surface), JSON.stringify(pending))
  } catch {
    throw new Error('Браузер заблокував безпечний вхід. Дозвольте зберігання даних для цього сайту.')
  }

  return { codeChallenge, codeChallengeMethod: 's256' }
}

export function readPendingPkce(surface: AuthSurface): PendingPkce | null {
  try {
    const raw = localStorage.getItem(storageKey(surface))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PendingPkce>
    const validFlow = parsed.flow === 'signup' || parsed.flow === 'recovery' || parsed.flow === 'oauth'
    const valid = typeof parsed.verifier === 'string'
      && VERIFIER_RE.test(parsed.verifier)
      && validFlow
      && typeof parsed.createdAt === 'number'
      && Number.isFinite(parsed.createdAt)
      && parsed.createdAt <= Date.now()
      && Date.now() - parsed.createdAt <= flowTtl(parsed.flow as AuthRedirectFlow)
    if (!valid) {
      localStorage.removeItem(storageKey(surface))
      return null
    }
    return parsed as PendingPkce
  } catch {
    try { localStorage.removeItem(storageKey(surface)) } catch { /* unavailable */ }
    return null
  }
}

export function clearPendingPkce(surface: AuthSurface): void {
  try { localStorage.removeItem(storageKey(surface)) } catch { /* unavailable */ }
}
