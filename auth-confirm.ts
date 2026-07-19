import './frontend-security.js'
import './register-sw.js'
import { buildAuthConfirmationUrl, type AuthEmailActionType } from './features/api/client.js'

const TOKEN_HASH_RE = /^[A-Za-z0-9_-]{20,512}$/
const ALLOWED_TYPES = new Set(['signup', 'recovery'])
const ALLOWED_PATHS = new Set(['/teacher.html', '/parent.html'])

const message = document.getElementById('auth-confirm-message')
const confirmButton = document.getElementById('auth-confirm-button') as HTMLButtonElement | null

function fail(): void {
  if (message) message.textContent = 'Посилання недійсне або пошкоджене. Запросіть новий лист у кабінеті.'
  if (confirmButton) {
    confirmButton.hidden = true
    confirmButton.classList.add('hidden')
  }
}

function allowedRedirect(raw: string | null): URL | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    const clean = url.origin === window.location.origin
      && ALLOWED_PATHS.has(url.pathname)
      && !url.search
      && !url.hash
    return clean ? url : null
  } catch {
    return null
  }
}

const params = new URLSearchParams(window.location.search)
const tokenHash = params.get('token_hash')
const type = params.get('type')
const redirect = allowedRedirect(params.get('redirect_to'))

// Remove the one-time token from browser history before showing any action.
history.replaceState(null, '', window.location.pathname)

if (!tokenHash || !TOKEN_HASH_RE.test(tokenHash) || !type || !ALLOWED_TYPES.has(type) || !redirect) {
  fail()
} else {
  const verificationUrl = buildAuthConfirmationUrl(tokenHash, type as AuthEmailActionType, redirect.href)

  if (message) {
    message.textContent = type === 'recovery'
      ? 'Підтвердьте перехід до безпечної зміни пароля.'
      : 'Підтвердьте електронну адресу, щоб завершити створення акаунта.'
  }
  if (confirmButton) {
    confirmButton.textContent = type === 'recovery' ? 'Змінити пароль' : 'Підтвердити email'
    confirmButton.hidden = false
    confirmButton.classList.remove('hidden')
    confirmButton.addEventListener('click', () => window.location.assign(verificationUrl), { once: true })
  }
}
