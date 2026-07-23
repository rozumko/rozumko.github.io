// Transactional email via the Resend HTTP API (no SDK dependency).
// Fail-open by design: report creation must never break because a letter
// didn't go out — callers get a boolean and decide what to tell the client.
// Env: RESEND_API_KEY (secret), EMAIL_FROM (verified sender, e.g.
// "Розумко <zvit@rozumko.com>"). Both unset → sending is silently disabled.

const RESEND_API_URL = 'https://api.resend.com/emails'
const SEND_TIMEOUT_MS = 8000

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
}

interface EmailLogger {
  warn: (obj: unknown, msg?: string) => void
  error: (obj: unknown, msg?: string) => void
}

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

/** @returns true — прийнято Resend-ом; false — вимкнено або помилка (залоговано). */
export async function sendEmail(msg: EmailMessage, log: EmailLogger): Promise<boolean> {
  if (!emailEnabled()) {
    log.warn('email skipped: RESEND_API_KEY / EMAIL_FROM not configured')
    return false
  }
  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    })
    if (!res.ok) {
      // Response body is Resend's error JSON — safe to log, no PII beyond ours.
      log.error({ status: res.status, body: await res.text().catch(() => '') }, 'resend send failed')
      return false
    }
    return true
  } catch (err) {
    log.error({ err }, 'resend send failed')
    return false
  }
}
