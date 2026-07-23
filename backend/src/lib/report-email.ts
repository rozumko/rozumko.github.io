// Parent demo-report letter: the FULL analysis lives here; the web page after
// the gate shows only a short confirmation + summary line. Plain inline-styled
// HTML (email clients ignore stylesheets), UA copy for parents.

import type { DemoReport } from '../routes/home-validation.js'
import { TRACK_LABELS } from '../routes/home-validation.js'

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function section(title: string, items: string[]): string {
  if (!items.length) return ''
  const lis = items.map(i => `<li style="margin:0 0 6px;">${escapeHtml(i)}</li>`).join('')
  return `
    <h3 style="margin:20px 0 8px;font-size:16px;color:#0a0f1e;">${title}</h3>
    <ul style="margin:0;padding-left:20px;color:#4b5680;line-height:1.5;">${lis}</ul>`
}

export function buildDemoReportEmail(
  report: DemoReport,
  opts: { childName: string | null; grade: number },
): { subject: string; html: string; text: string } {
  const trackLabel = TRACK_LABELS[report.track] ?? report.track
  const child = opts.childName ? escapeHtml(opts.childName) : 'Ваша дитина'
  const subject = `Звіт Розумка · ${trackLabel}, ${opts.grade} клас: ${report.correct} з ${report.total} завдань`

  const html = `
  <div style="max-width:560px;margin:0 auto;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0a0f1e;">
    <h1 style="margin:0 0 4px;font-size:22px;color:#2563eb;">🤖 Розумко</h1>
    <p style="margin:0 0 20px;color:#4b5680;">Звіт для батьків · ${trackLabel} · ${opts.grade} клас</p>

    <div style="background:#eff6ff;border:2px solid #bfdbfe;border-radius:12px;padding:16px 20px;margin:0 0 4px;">
      <p style="margin:0;font-size:18px;font-weight:bold;">
        ${child}: виконано ${report.correct} з ${report.total} завдань
      </p>
    </div>

    ${section('💪 Що виходить добре', report.strengths)}
    ${section('🌱 Зона росту', report.struggles)}
    ${section('🔍 Що ми помітили', report.patterns.map(p => p.evidence))}

    <h3 style="margin:20px 0 8px;font-size:16px;color:#0a0f1e;">👉 Наступний крок</h3>
    <p style="margin:0;color:#4b5680;line-height:1.5;">${escapeHtml(report.nextMission.reason)}</p>

    <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #dde3f0;color:#5b6584;font-size:13px;line-height:1.5;">
      Ви отримали цей лист, бо погодилися на формування звіту на
      <a href="https://rozumko.com" style="color:#2563eb;">rozumko.com</a>.
      Це разовий лист — ми нічого не надсилатимемо без вашої дії.
    </p>
  </div>`

  const textLines = [
    `Розумко — звіт для батьків · ${trackLabel} · ${opts.grade} клас`,
    '',
    `${opts.childName ?? 'Ваша дитина'}: виконано ${report.correct} з ${report.total} завдань`,
  ]
  if (report.strengths.length) textLines.push('', 'Що виходить добре:', ...report.strengths.map(s => `- ${s}`))
  if (report.struggles.length) textLines.push('', 'Зона росту:', ...report.struggles.map(s => `- ${s}`))
  if (report.patterns.length) textLines.push('', 'Що ми помітили:', ...report.patterns.map(p => `- ${p.evidence}`))
  textLines.push('', `Наступний крок: ${report.nextMission.reason}`)

  return { subject, html, text: textLines.join('\n') }
}
