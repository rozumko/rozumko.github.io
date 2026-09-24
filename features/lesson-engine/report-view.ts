// Lesson report (stage H): outcome summaries per student, each opening to the
// evidence behind it (activity, attempt, score, trust), activity statistics
// and a factual comment draft. The rule is printed on the page — no hidden
// mastery score.

import { appendRichText } from './rich-text.js'
import type { LessonReport, OutcomeStatus, ReportEvidence } from './types.js'

export const OUTCOME_ICONS: Readonly<Record<OutcomeStatus, string>> = {
  'demonstrated': '✓',
  'progressing': '↗',
  'needs-support': '!',
  'not-enough-evidence': '?',
}

const TRUST_LABELS: Readonly<Record<ReportEvidence['trust'], string>> = {
  'server-verified': 'перевірено сервером',
  'client-unverified': 'дані гри (не перевірено)',
  'teacher-observed': 'спостереження вчителя',
}

const TELEMETRY_LABELS: Readonly<Record<string, string>> = {
  practice: 'Тренування',
  checkpoint: 'Перевірка розуміння',
  evidence: 'Навчальний доказ',
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function time(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
}

/** "Перевір себе · спроба 1 · 1/1 · перевірено сервером · основний · 10:20" */
export function evidenceLine(e: ReportEvidence): string {
  return [
    e.activityTitle ?? 'Активність',
    e.attemptNo ? `спроба ${e.attemptNo}` : null,
    e.correct !== null && e.total !== null ? `${e.correct}/${e.total}` : `${Math.round(e.score * 100)}%`,
    TRUST_LABELS[e.trust],
    e.evidenceRole === 'primary' ? 'основний доказ' : 'допоміжний',
    time(e.observedAt),
  ].filter(Boolean).join(' · ')
}

export function renderLessonReport(report: LessonReport, runHref: string): HTMLElement {
  const root = el('article', 'le-report')
  root.setAttribute('aria-labelledby', 'le-report-title')

  const toolbar = el('div', 'le-toolbar le-report__toolbar')
  const back = el('a', 'le-toolbar__back', '← До уроку')
  back.href = runHref
  const print = el('button', 'btn btn--secondary', 'Друкувати')
  print.type = 'button'
  print.addEventListener('click', () => {
    // Closed <details> do not print their content; open them all first.
    for (const details of root.querySelectorAll('details')) details.open = true
    window.print()
  })
  toolbar.append(back, print)

  const header = el('header', 'le-document__header')
  const h1 = el('h1', 'le-document__title', `Звіт уроку: ${report.run.lessonTitle.uk}`)
  h1.id = 'le-report-title'
  header.append(
    el('p', 'le-document__meta', `${report.run.className} · версія уроку ${report.run.lessonPublishedVersion} · ${time(report.run.startedAt)}–${time(report.run.finishedAt)}`),
    h1,
    el('p', 'le-report__rule',
      `Як рахується: «Продемонстровано» — останній основний перевірений доказ ≥ ${report.rule.demonstratedAt * 100}%; `
      + `«Прогрес» — ${report.rule.progressingAt * 100}–${report.rule.demonstratedAt * 100 - 1}%; нижче — «Потрібна підтримка». `
      + 'Допоміжні й неперевірені дані (ігри) показано, але вони самі нічого не вирішують.'),
  )
  root.append(toolbar, header)

  // Students × outcomes overview.
  if (report.outcomes.length > 0) {
    const table = el('table', 'le-live__table le-report__table')
    table.append(el('caption', 'le-live__caption', 'Навчальні результати'))
    const head = el('tr')
    head.append(el('th', undefined, 'Учень'))
    for (const outcome of report.outcomes) {
      const th = el('th', undefined, `${outcome.code}: ${outcome.title}`)
      th.scope = 'col'
      head.append(th)
    }
    const thead = el('thead')
    thead.append(head)
    const tbody = el('tbody')
    for (const student of report.students) {
      const row = el('tr')
      const th = el('th', undefined, student.label)
      th.scope = 'row'
      row.append(th)
      for (const outcome of student.outcomes) {
        row.append(el('td', `le-report__status le-report__status--${outcome.status}`, `${OUTCOME_ICONS[outcome.status]} ${outcome.label}`))
      }
      tbody.append(row)
    }
    table.append(thead, tbody)
    root.append(table)
  }

  // Activity statistics.
  if (report.activities.length > 0) {
    const section = el('section', 'le-report__section')
    section.append(el('h2', undefined, 'Завдання на пристроях'))
    const list = el('ul', 'le-report__activities')
    for (const activity of report.activities) {
      const item = el('li')
      const avg = activity.averageScore === null ? '—' : `${Math.round(activity.averageScore * 100)}%`
      item.append(el('strong', undefined, activity.title))
      item.append(` · ${TELEMETRY_LABELS[activity.telemetry ?? ''] ?? ''} · відповіли ${activity.answered} з ${activity.of} · середній результат ${avg}`)
      if (activity.pattern) {
        const pattern = el('p', 'le-live__pattern')
        pattern.append(`${activity.pattern.count} з ${activity.pattern.of} обрали однакову неправильну відповідь: «`)
        appendRichText(pattern, activity.pattern.optionText.uk)
        pattern.append('».')
        item.append(pattern)
      }
      list.append(item)
    }
    section.append(list)
    root.append(section)
  }

  // Per student: trace and comment.
  const studentsSection = el('section', 'le-report__section')
  studentsSection.append(el('h2', undefined, 'Учні'))
  for (const student of report.students) {
    const details = el('details', 'le-report__student')
    const summary = el('summary', undefined, `${student.label}${student.participated ? '' : ' — не був(ла) на пристрої'}`)
    details.append(summary)
    for (const outcome of student.outcomes) {
      const title = report.outcomes.find(o => o.id === outcome.outcomeId)
      const block = el('div', 'le-report__outcome')
      block.append(el('p', 'le-report__outcome-title', `${OUTCOME_ICONS[outcome.status]} ${outcome.label}: ${title?.title ?? outcome.outcomeId}`))
      block.append(el('p', 'le-report__basis', outcome.basis))
      if (outcome.evidence.length > 0) {
        const evidence = el('ul', 'le-report__evidence')
        evidence.setAttribute('aria-label', 'Докази')
        for (const e of outcome.evidence) evidence.append(el('li', undefined, evidenceLine(e)))
        block.append(evidence)
      }
      details.append(block)
    }
    const done = student.activities.filter(a => a.attempts > 0)
    if (done.length) {
      details.append(el('p', 'le-report__basis', `Завдання: ${done.map(a => `${a.title} (${a.correct ?? '—'}/${a.total ?? '—'}, спроб: ${a.attempts})`).join('; ')}`))
    }
    if (student.missing.length) details.append(el('p', 'le-report__basis', `Без відповіді: ${student.missing.join(', ')}`))

    const comment = el('div', 'le-report__comment')
    const text = el('p', undefined, student.comment)
    const copy = el('button', 'btn btn--secondary', 'Копіювати коментар')
    copy.type = 'button'
    copy.setAttribute('aria-label', `Копіювати коментар про ${student.label}`)
    copy.addEventListener('click', () => {
      void navigator.clipboard?.writeText(student.comment).then(() => { copy.textContent = 'Скопійовано ✓' }, () => {})
    })
    comment.append(el('p', 'le-report__comment-label', 'Чернетка коментаря (перевірте перед використанням):'), text, copy)
    details.append(comment)
    studentsSection.append(details)
  }
  root.append(studentsSection)
  return root
}
