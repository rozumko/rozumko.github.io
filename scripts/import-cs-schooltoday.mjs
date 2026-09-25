// One-off import of the CS_SchoolToday lessons (temp/CS_SchoolToday) into
// Lesson Engine lessons. Each lesson HTML (+ its teacher note) is rewritten
// into the plain-text lesson format (docs/lesson-engine/lesson-text-format.md)
// and parsed by the same code as «Створити урок», so the result is exactly
// what an author would get by pasting that text.
//
// - Inline SVG diagrams become files in public/curriculum-lessons/assets/.
// - A <select> self-check becomes a scored task only when its revealed answer
//   names exactly one option (answer letter, «Так»/«Ні», or the option's own
//   words). Otherwise the question stays as text with the answer for the
//   teacher: a wrong key is worse than none.
// - Revealed answers elsewhere go to the teacher only; help, hint and
//   extension folds become «Допомога:», «Підказка:», «Більше:» lines.
//
// Run from the repository root (needs the Playwright Chromium for the DOM):
//   node scripts/import-cs-schooltoday.mjs --out <dir> [--grade 1] [--module 1] [--no-assets] [--skip id,id]
// --skip lists lesson ids to leave out.
// Writes <dir>/text/<id>.txt, <dir>/lessons/<id>.json and <dir>/report.md.
// Publish the JSON files with backend/scripts/publish-curriculum-lesson.ts.

import { mkdirSync, readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { parseLessonText } from '../features/admin/curriculum-text.ts'
import { validateLessonAgainstPack, validateLessonDefinition } from '../backend/src/lib/curriculum-lesson-schema.ts'
import { findSubjectPack, withOutcomes } from '../backend/src/lib/subject-packs.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SOURCE = join(ROOT, 'temp', 'CS_SchoolToday')
const ASSETS = join(ROOT, 'public', 'curriculum-lessons', 'assets')
const ASSET_BASE = '/curriculum-lessons/assets'
const PACK_ID = 'informatics-ua-primary'

const args = process.argv.slice(2)
const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const outDir = option('--out')
if (!outDir) {
  console.error('usage: node scripts/import-cs-schooltoday.mjs --out <dir> [--grade N] [--module N] [--no-assets]')
  process.exit(1)
}
const onlyGrade = option('--grade')
const onlyModule = option('--module')
const writeAssets = !args.includes('--no-assets')
// Lessons to leave as they are on the platform (none by default).
const skip = new Set((option('--skip') ?? '').split(',').filter(Boolean))

// ── Source files ────────────────────────────────────────────────────────────

const lessons = []
for (const grade of readdirSync(SOURCE).filter(name => /^Grade_\d$/.test(name)).sort()) {
  const g = Number(grade.slice(6))
  if (onlyGrade && Number(onlyGrade) !== g) continue
  for (const module of readdirSync(join(SOURCE, grade)).filter(name => /^Module_\d+$/.test(name))) {
    const m = Number(module.slice(7))
    if (onlyModule && Number(onlyModule) !== m) continue
    for (const file of readdirSync(join(SOURCE, grade, module)).filter(name => /^\d+_\d+\.html$/.test(name))) {
      // Ids follow the lesson's number within the grade («Клас 2 • Модуль 2 •
      // Урок 8» → g2-m2-l8), as the existing Lesson Engine lessons do.
      const html = readFileSync(join(SOURCE, grade, module, file), 'utf8')
      const kicker = /Клас\s*\d+\s*(?:&bull;|•)\s*Модуль\s*\d+\s*(?:&bull;|•)\s*Урок\s*(\d+)/u.exec(html)
      const l = kicker ? Number(kicker[1]) : Number(file.split('_')[1].replace('.html', ''))
      const notes = join(SOURCE, grade, 'Teacher_notes', module, file.replace('.html', '.teacher.html'))
      const id = `g${g}-m${m}-l${l}`
      if (skip.has(id)) continue
      lessons.push({
        id, grade: g, module: m, number: l,
        path: join(SOURCE, grade, module, file),
        notes: existsSync(notes) ? notes : null,
      })
    }
  }
}
lessons.sort((a, b) => a.grade - b.grade || a.module - b.module || a.number - b.number)

// ── HTML → lesson text (runs in the browser page, so it must be self-contained) ──

function convertLesson({ html, notes, id, assetBase }) {
  const INLINE = new Set(['a', 'abbr', 'b', 'br', 'cite', 'code', 'em', 'font', 'i', 'kbd', 'mark', 'q', 's', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var'])
  const SKIP = new Set(['script', 'style', 'template', 'noscript', 'input', 'textarea', 'button', 'option', 'hr'])
  const PLACEHOLDER = /^(--\s*)?(обери|оберіть|зроби вибір|вибери)/iu
  const GENERIC_LABEL = /^(обери|оберіть|вибери|твій вибір)/iu
  const ANSWER = /^(👉\s*|🔍\s*)?(перевірити|звірити|подивитися правильну відповідь)/iu
  const GOALS = /(чого я навчуся|сьогодні я (дізнаюся|навчуся))/iu

  const squash = s => s.replace(/\s+/g, ' ').trim()
  const text = n => squash(n?.textContent ?? '')
  const inline = node => {
    if (node.nodeType === 3) return node.textContent
    if (node.nodeType !== 1) return ''
    const tag = node.localName
    if (tag === 'br') return ' '
    if (!INLINE.has(tag) && tag !== 'label' && tag !== 'p' && tag !== 'div' && tag !== 'li' && tag !== 'td' && tag !== 'th' && tag !== 'figcaption' && tag !== 'summary') return ''
    const inner = [...node.childNodes].map(inline).join('')
    const trimmed = squash(inner)
    if ((tag === 'b' || tag === 'strong') && trimmed && !trimmed.includes('**')) {
      return `${/^\s/.test(inner) ? ' ' : ''}**${trimmed}**${/\s$/.test(inner) ? ' ' : ''}`
    }
    if (tag === 'code' && trimmed && !trimmed.includes('`')) return `\`${trimmed}\``
    return inner
  }
  const rich = node => squash(inline(node)).replace(/\*\*\s*\*\*/g, '').replace(/\s+([,.;:!?])/g, '$1')
  const https = href => { try { return new URL(href).protocol === 'https:' } catch { return false } }
  const linkLabel = a => squash(text(a).replace(/↗/g, '')) || a.getAttribute('href')

  const header = []
  const body = []
  const objectives = []
  const svgs = []
  const stats = { tasks: 0, questionsAsText: 0, svgs: 0, images: 0 }
  const meta = { title: '', titleEn: '', lessonNumber: null, duration: null }
  let inSection = false
  let collectGoals = false
  let goalsInStep = false
  const handled = new Set()

  const emit = line => {
    if (!inSection) {
      body.push('', '## 👋 Вступ')
      inSection = true
    }
    body.push(line)
  }
  let slideTaken = false
  const section = heading => {
    body.push('', `## ${heading}`)
    inSection = true
    slideTaken = false
  }

  // Which revealed answer belongs to which select: the first answer fold after
  // it. A fold shared by several selects answers them all at once.
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const folds = [...doc.querySelectorAll('details')]
  const answerOf = new Map()
  const answerUse = new Map()
  const answerLeft = new Map()
  for (const select of doc.querySelectorAll('select')) {
    const fold = folds.find(d => (select.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING) && ANSWER.test(text(d.querySelector('summary'))))
    if (!fold) continue
    answerOf.set(select, fold)
    answerUse.set(fold, (answerUse.get(fold) ?? 0) + 1)
  }

  const words = s => s.toLowerCase().match(/[\p{L}\d]+/gu) ?? []
  const stems = s => [...new Set(words(s).filter(w => w.length >= 3).map(w => w.slice(0, 5)))]
  function matchAnswer(options, answer, shared, label) {
    const a = answer.replace(/\*\*|`/g, '').replace(/^(правильн\S*\s+відповід\S*|найкращ\S*\s+(відповід\S*|варіант)|правильно|відповідь)\s*[:—–-]?\s*/iu, '')
    // One revealed text for several questions: which part answers which is not reliable.
    if (shared) return -1
    const letter = /^([АБВГДЕ])[).:\s,]/u.exec(a)
    if (letter) return options.findIndex(o => new RegExp(`^${letter[1]}[).:\\s]`, 'u').test(o))
    const first = a.split(/(?<=[.!?])\s|\s[—–]\s|:\s/u)[0].replace(/[.!?]+$/, '')
    const yesNo = /^(так|ні)$/iu.exec(first.trim())
    if (yesNo) {
      const hits = options.map((o, i) => [i, words(o)[0] === yesNo[1].toLowerCase()]).filter(x => x[1])
      return hits.length === 1 ? hits[0][0] : -1
    }
    // Words of the question itself say nothing about which option is right.
    const topic = new Set(stems(label))
    const s = stems(first).filter(w => !topic.has(w))
    if (!s.length || s.length > 12) return -1
    const shares = options.map(o => { const os = new Set(stems(o)); return s.filter(w => os.has(w)).length / s.length })
    const best = Math.max(...shares)
    if (best >= 0.6 && shares.filter(x => x >= 0.6).length === 1 && shares.filter(x => x >= 0.4).length === 1) return shares.indexOf(best)
    return -1
  }

  const foldText = fold => {
    const summary = fold.querySelector('summary')
    const parts = []
    for (const child of fold.children) {
      if (child === summary) continue
      const items = child.matches('ul, ol') ? [...child.children].map(li => rich(li)) : [rich(child)]
      parts.push(...items.filter(Boolean))
    }
    if (!parts.length) {
      const all = squash(fold.textContent ?? '')
      const s = text(summary)
      return squash(all.slice(all.indexOf(s) + s.length))
    }
    return parts.join(' ')
  }

  function question(select) {
    const options = [...select.options].map(o => text(o)).filter(o => o && !PLACEHOLDER.test(o))
      .map(o => o.replace(/\s*\((правильно|неправильно)\)\s*$/iu, ''))
    let label = text(select.labels?.[0]).replace(/^\d+\.\s*/, '')
    if (!label || GENERIC_LABEL.test(label)) {
      // The question sits in the text just before the select.
      let node = select
      let found = ''
      for (let depth = 0; node && depth < 4 && !found; depth++, node = node.parentElement) {
        let prev = node.previousElementSibling
        while (prev && !found) {
          if (prev.matches('p, h3, h4, label') && text(prev) && !GENERIC_LABEL.test(text(prev))) found = rich(prev)
          prev = prev.previousElementSibling
        }
      }
      label = found || label || 'Обери правильну відповідь.'
      if (body[body.length - 1] === label) body.pop()
    }
    const fold = answerOf.get(select)
    const answer = fold ? foldText(fold) : ''
    if (fold) handled.add(fold)
    const shared = fold ? answerUse.get(fold) > 1 : false
    const index = fold && options.length >= 2 && options.length <= 6 ? matchAnswer(options, answer, shared, label) : -1
    if (index >= 0) {
      stats.tasks++
      emit('')
      emit(`? ${label}`)
      options.forEach((o, i) => emit(`${i === index ? '+' : '-'} ${o}`))
      if (answer) emit(`= ${answer}`)
      emit('')
      return
    }
    stats.questionsAsText++
    emit(label)
    for (const o of options) emit(`- ${o}`)
    // A fold shared by several questions is written once, after the last of them.
    if (!answer) return
    if (shared) {
      const left = (answerLeft.get(fold) ?? answerUse.get(fold)) - 1
      answerLeft.set(fold, left)
      if (left > 0) return
    }
    emit(`Для вчителя: Відповідь: ${answer}`)
  }

  // A table becomes table rows; a key–value table, a one-column table or one
  // with cells too long for a table cell (200 characters) becomes a list.
  function tableLines(el, skipRow = () => false) {
    const rows = [...el.rows].map(r => [...r.cells].map(c => rich(c).replace(/\|/g, '/'))).filter(r => !skipRow(r))
    if (!rows.length) return []
    const width = Math.max(...rows.map(r => r.length))
    const hasHead = Boolean(el.querySelector('th'))
    if (width === 1) return rows.filter(r => r[0]).map(r => `- ${r[0]}`)
    if (!hasHead && width === 2) return rows.map(r => `- ${r[0]} — ${r[1] ?? ''}`)
    if (rows.some(r => r.some(c => c.length > 190))) {
      if (!hasHead) return rows.map(r => `- ${r.filter(Boolean).join(' — ')}`)
      const [head, ...data] = rows
      return data.map(r => `- ${r.map((c, i) => (head[i] ? `**${head[i].replace(/\*\*/g, '')}:** ${c}` : c)).filter(Boolean).join('; ')}`)
    }
    return rows.map(r => `| ${[...r, ...Array(width - r.length).fill('—')].map(c => c || '—').join(' | ')} |`)
  }
  const table = el => tableLines(el).forEach(emit)

  function svg(el) {
    stats.svgs++
    const name = `${id}-s${stats.svgs}.svg`
    const clone = el.cloneNode(true)
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    // The page styled the inline SVG (width:100%, margin:16px 0 …). In a file of
    // its own a margin on the root shifts the drawing and crops its bottom, so
    // the file keeps only its own size, taken from the viewBox.
    clone.removeAttribute('style')
    const box = (clone.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)
    if (box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0) {
      if (!clone.hasAttribute('width') || /%/.test(clone.getAttribute('width'))) clone.setAttribute('width', String(box[2]))
      if (!clone.hasAttribute('height') || /%|auto/.test(clone.getAttribute('height'))) clone.setAttribute('height', String(box[3]))
    }
    svgs.push({ name, markup: new XMLSerializer().serializeToString(clone) })
    const alt = text(el.querySelector('title')) || el.getAttribute('aria-label') || 'Схема'
    // A step's first diagram is its slide: it carries the idea better than a photo.
    const slide = slideTaken ? '' : '[слайд] '
    slideTaken = true
    emit(`${slide}![${alt.slice(0, 200)}](${assetBase}/${name})`)
  }

  function paragraph(el) {
    const line = rich(el)
    const anchors = [...el.querySelectorAll('a')].filter(a => https(a.getAttribute('href')))
    const kicker = /^Клас\s*\d+\s*•\s*Модуль\s*\d+\s*•\s*Урок\s*(\d+)(?:\s*•\s*(.+))?$/u.exec(text(el))
    if (kicker) {
      meta.lessonNumber = Number(kicker[1])
      if (kicker[2] && !/[а-яіїєґ]/iu.test(kicker[2])) meta.titleEn = kicker[2].trim()
      return
    }
    const essential = /^(🤔\s*)?Питання уроку:\s*(.+)$/u.exec(line)
    if (essential) {
      section('❓ Питання уроку')
      // «Питання уроку: як …» — on its own slide the question starts a sentence.
      emit(essential[2].charAt(0).toUpperCase() + essential[2].slice(1))
      return
    }
    if (!line || (!inSection && /^UGS Informatics/u.test(line))) return
    const onlyLinks = anchors.length && squash(anchors.map(a => text(a)).join(' ')) === text(el)
    if (!onlyLinks) emit(line)
    for (const a of anchors) emit(`[${linkLabel(a)}](${a.getAttribute('href')})`)
  }

  function fold(el) {
    const summary = text(el.querySelector('summary'))
    if (handled.has(el)) return
    // A fold becomes one line; its pictures follow it as their own lines.
    const callout = line => {
      emit(line)
      el.querySelectorAll('svg, img').forEach(media => block(media))
    }
    if (ANSWER.test(summary)) return callout(`Для вчителя: Відповідь: ${foldText(el)}`)
    if (/потрібна допомога|допомога у деталях/iu.test(summary)) return callout(`Допомога: ${foldText(el)}`)
    if (/^💡\s*підказка/iu.test(summary)) return callout(`Підказка: ${foldText(el)}`)
    if (/хочеш більше|розширення|extension/iu.test(summary)) return callout(`Більше: ${foldText(el)}`)
    emit(`### ${summary}`)
    for (const child of el.children) if (child.localName !== 'summary') block(child)
  }

  function block(el) {
    const tag = el.localName
    if (SKIP.has(tag)) return
    if (tag === 'label' && el.control?.localName === 'select') return
    if (tag === 'h1') {
      meta.title ||= text(el)
      const next = el.nextElementSibling
      if (next?.localName === 'p' && !/[а-яіїєґ]/iu.test(text(next))) meta.titleEn = text(next)
      return
    }
    if (tag === 'p' && meta.titleEn && text(el) === meta.titleEn && !inSection) return
    if (/^h[2-6]$/.test(tag)) {
      const heading = text(el)
      collectGoals = GOALS.test(heading)
      goalsInStep = collectGoals && tag === 'h2'
      if (tag === 'h2') section(heading)
      else if (!collectGoals) emit(`### ${heading}`)
      return
    }
    if (tag === 'p') return paragraph(el)
    if (tag === 'ul' || tag === 'ol') {
      const items = [...el.children].filter(li => li.localName === 'li')
      items.forEach((li, i) => {
        const own = li.cloneNode(true)
        own.querySelectorAll('ul, ol').forEach(n => n.remove())
        const line = rich(own)
        if (!line) return
        if (collectGoals) objectives.push(line)
        if (!collectGoals || goalsInStep) emit(tag === 'ol' ? `${i + 1}. ${line}` : `- ${line}`)
        li.querySelectorAll(':scope > ul > li, :scope > ol > li').forEach(sub => emit(`- — ${rich(sub)}`))
      })
      collectGoals = false
      return
    }
    if (tag === 'table') return table(el)
    if (tag === 'svg') return svg(el)
    if (tag === 'img') {
      const src = el.getAttribute('src') ?? ''
      if (!https(src)) return
      stats.images++
      return emit(`![${(el.getAttribute('alt') || 'Ілюстрація').slice(0, 200)}](${src})`)
    }
    if (tag === 'figure') {
      for (const child of el.children) {
        if (child.localName === 'figcaption') paragraph(child)
        else block(child)
      }
      return
    }
    if (tag === 'select') return question(el)
    if (tag === 'details') return fold(el)
    if (tag === 'pre') {
      for (const line of (el.textContent ?? '').split('\n').map(l => l.trim()).filter(Boolean)) emit(line.includes('`') ? line : `\`${line}\``)
      return
    }
    if (tag === 'a') {
      if (https(el.getAttribute('href'))) emit(`[${linkLabel(el)}](${el.getAttribute('href')})`)
      return
    }
    if ((el.getAttribute('style') ?? '').includes('grid') && [...el.children].every(c => c.localName === 'div')) {
      for (const card of el.children) {
        const parts = [...card.children].length ? [...card.children].map(c => rich(c)).filter(Boolean) : [rich(card)]
        if (parts.length) emit(`- ${parts.join(' ')}`)
        card.querySelectorAll('svg, img').forEach(media => block(media))
      }
      return
    }
    container(el)
  }

  function container(el) {
    let run = []
    // Loose inline content is a paragraph too, so its links are kept.
    const flush = () => {
      if (!run.some(node => squash(node.textContent ?? ''))) { run = []; return }
      const wrapper = doc.createElement('p')
      for (const node of run) wrapper.append(node.cloneNode(true))
      run = []
      paragraph(wrapper)
    }
    for (const child of el.childNodes) {
      if (child.nodeType === 8) {
        const comment = squash(child.textContent ?? '')
        const teacher = /^Для вчителя[^:]*:\s*(.+)$/u.exec(comment)
        if (teacher) {
          let rest = teacher[1]
          const time = /Час\s*(\d+)\s*хв\S*;?\s*/u.exec(rest)
          if (time) { meta.duration = Number(time[1]); rest = rest.replace(time[0], '') }
          rest = rest.replace(/\s*Як працюю\S*\s*/u, '. Як працюємо: ').replace(/\s*Що потрібно\s*/u, '. Що потрібно: ')
          rest = squash(rest.replace(/^[.\s]+/, ''))
          if (rest) header.push(rest.charAt(0).toUpperCase() + rest.slice(1))
        }
        continue
      }
      if (child.nodeType === 3 || (child.nodeType === 1 && INLINE.has(child.localName) && !child.querySelector('svg, img, table, ul, ol, details, select'))) {
        run.push(child)
        continue
      }
      flush()
      if (child.nodeType === 1) block(child)
    }
    flush()
  }

  container(doc.body)

  // Teacher note: all of it goes to the teacher-only description before the steps.
  if (notes) {
    const nd = new DOMParser().parseFromString(notes, 'text/html')
    const lines = []
    let skipping = false
    const put = line => { if (line && !skipping) lines.push(line) }
    const walk = el => {
      for (const child of el.children) {
        const tag = child.localName
        if (tag === 'h1') continue
        if (tag === 'h2') {
          skipping = /Що змінено за аудитом/u.test(text(child))
          put(`### ${text(child)}`)
          continue
        }
        if (tag === 'p') {
          if (/не показувати учням/u.test(text(child))) continue
          put(rich(child))
          continue
        }
        if (tag === 'ul' || tag === 'ol') { [...child.children].forEach(li => put(`- ${rich(li)}`)); continue }
        if (tag === 'table') {
          for (const r of child.rows) {
            const [key, value] = [...r.cells].map(c => text(c))
            if (key === 'Час' && /(\d+)\s*хв/u.test(value ?? '')) meta.duration ??= Number(/(\d+)\s*хв/u.exec(value)[1])
          }
          tableLines(child, r => /^\*{0,2}(Версія|Дата)\*{0,2}$/u.test(r[0] ?? '')).forEach(put)
          continue
        }
        walk(child)
      }
    }
    walk(nd.body)
    header.push(...lines)
  }

  const out = [meta.title || id, `Клас: ${id.slice(1, 2)}`]
  if (meta.duration) out.push(`Тривалість: ${meta.duration} хв`)
  if (objectives.length) out.push('Цілі:', ...objectives.slice(0, 20).map(o => `- ${o}`))
  // Header lines are the teacher-only description: keep them from looking like header keys.
  out.push(...header.map(line => (/^(клас|тривалість|час|хвилин|цілі)\s*[:：]/iu.test(line) ? `Для вчителя: ${line}` : line)))
  out.push(...body)
  // Tag names mentioned in notes («`<select>` не перевіряє…») are words, not markup.
  const joined = out.join('\n').replace(/<\/?([a-z][a-z0-9-]*)[^<>\n]*>/giu, '$1').replace(/\n{3,}/g, '\n\n')
  return { text: joined, svgs, stats, meta }
}

// ── Run ─────────────────────────────────────────────────────────────────────

const packEntry = findSubjectPack(PACK_ID)
const serverPack = withOutcomes(packEntry, {})
const packInfo = {
  id: packEntry.id, subject: packEntry.subject, gradeRange: packEntry.gradeRange,
  tools: Object.keys(packEntry.externalTools ?? {}).map(key => ({ key })), games: [],
}

mkdirSync(join(outDir, 'text'), { recursive: true })
mkdirSync(join(outDir, 'lessons'), { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage()
const report = []
const keys = []
let ok = 0
for (const lesson of lessons) {
  const html = readFileSync(lesson.path, 'utf8')
  const notes = lesson.notes ? readFileSync(lesson.notes, 'utf8') : null
  const converted = await page.evaluate(convertLesson, { html, notes, id: lesson.id, assetBase: ASSET_BASE })
  writeFileSync(join(outDir, 'text', `${lesson.id}.txt`), converted.text)
  const parsed = parseLessonText(converted.text, { pack: packInfo, lessonId: () => lesson.id })
  const source = relative(join(ROOT, 'temp'), lesson.path).replace(/\\/g, '/')
  const row = { id: lesson.id, source, ...converted.stats, notes: Boolean(notes), errors: parsed.errors, warnings: parsed.warnings.length, blocks: 0 }
  report.push(row)
  if (!parsed.lesson) continue
  const definition = parsed.lesson
  definition.moduleId = `g${lesson.grade}-m${lesson.module}`
  if (converted.meta.lessonNumber) definition.lessonNumber = converted.meta.lessonNumber
  if (converted.meta.titleEn) definition.title = { uk: definition.title.uk, en: converted.meta.titleEn.slice(0, 200) }
  definition.metadata = { ...definition.metadata, source: 'html-import', sourceRef: source.slice(0, 200) }
  const checked = validateLessonDefinition(structuredClone(definition))
  const issues = checked.ok ? validateLessonAgainstPack(checked.lesson, serverPack) : checked.errors
  if (issues.length) {
    row.errors = issues.map(i => ({ line: 0, message: `${i.path}: ${i.message}` }))
    continue
  }
  row.blocks = definition.blocks.length
  for (const block of definition.blocks) {
    const activity = block.activity
    if (activity?.mechanic !== 'choice') continue
    const right = activity.config.options.find(o => o.id === activity.scoring.key.correctOptionId)
    keys.push(`| ${lesson.id} | ${activity.config.prompt.uk} | ${right.text.uk} | ${(activity.scoring.key.explanation?.uk ?? '').slice(0, 160)} |`.replace(/\n/g, ' '))
  }
  writeFileSync(join(outDir, 'lessons', `${lesson.id}.json`), `${JSON.stringify(definition, null, 2)}\n`)
  if (writeAssets) for (const file of converted.svgs) writeFileSync(join(ASSETS, file.name), `${file.markup}\n`)
  ok++
}
await browser.close()

const sum = key => report.reduce((a, r) => a + (r[key] ?? 0), 0)
const lines = [
  `# CS_SchoolToday → Керовані уроки`, '',
  `Уроків: ${report.length}, перенесено: ${ok}, з помилками: ${report.length - ok}.`,
  `Завдань з ключем: ${sum('tasks')}; питань, що лишилися текстом (відповідь — для вчителя): ${sum('questionsAsText')}; схем SVG: ${sum('svgs')}; фото: ${sum('images')}.`, '',
  '| Урок | Джерело | Блоків | Завдань | Питань текстом | Схем | Нотатка | Попереджень | Помилки |',
  '|---|---|---|---|---|---|---|---|---|',
  ...report.map(r => `| ${r.id} | ${r.source} | ${r.blocks} | ${r.tasks} | ${r.questionsAsText} | ${r.svgs} | ${r.notes ? 'так' : '—'} | ${r.warnings} | ${r.errors.map(e => `${e.line ? `рядок ${e.line}: ` : ''}${e.message}`).join('<br>')} |`),
]
writeFileSync(join(outDir, 'report.md'), `${lines.join('\n')}\n`)
writeFileSync(join(outDir, 'keys.md'), [
  '# Ключі відповідей, знайдені автоматично', '',
  'Правильний варіант узято з відкритої відповіді уроку. Перегляньте перед публікацією.', '',
  '| Урок | Питання | Правильна відповідь | Пояснення |', '|---|---|---|---|', ...keys, '',
].join('\n'))
console.log(lines.slice(2, 4).join('\n'))
for (const r of report.filter(r => r.errors.length)) console.log(`✗ ${r.id}: ${r.errors.slice(0, 3).map(e => `${e.line ? `L${e.line} ` : ''}${e.message}`).join(' | ')}`)
