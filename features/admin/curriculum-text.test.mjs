import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { lessonToText, parseLessonText, youtubeId } from './curriculum-text.ts'
import { LESSON_TEXT_EXAMPLE, LESSON_TEXT_PROMPT, LESSON_TEXT_TEMPLATES } from './curriculum-text-templates.ts'
import { newBlock, newLesson } from './curriculum-model.ts'
import { validateLessonAgainstPack, validateLessonDefinition } from '../../backend/src/lib/curriculum-lesson-schema.ts'
import { SCHOOL_ACTIVITIES } from '../../backend/src/lib/school-activities.ts'

const PILOT_OUTCOMES = JSON.parse(readFileSync(new URL('../../backend/src/lib/curriculum-fixtures/pilot-outcomes.json', import.meta.url), 'utf8'))
const GAMES = ['key-puzzle', 'maze', 'windows']
const PACK_INFO = {
  id: 'informatics-ua-primary',
  subject: 'informatics',
  gradeRange: { min: 1, max: 4 },
  tools: [{ key: 'itnauka-windows' }],
  games: GAMES.map(key => ({ key, levels: SCHOOL_ACTIVITIES[key].levels.map(l => l.id) })),
}
const SERVER_PACK = {
  ...PACK_INFO,
  title: { uk: 'Інформатика' },
  curriculumRefs: [],
  externalTools: { 'itnauka-windows': { url: 'https://itnauka.org/x', integration: 'launch-only', title: { uk: 'Вікна' } } },
  games: GAMES,
  outcomes: PILOT_OUTCOMES,
}
const OPTIONS = { pack: PACK_INFO, lessonId: grade => `g${grade}-new-l1` }

function assertValid(lesson, label) {
  const result = validateLessonDefinition(structuredClone(lesson))
  assert.ok(result.ok, `${label}: ${JSON.stringify(!result.ok && result.errors)}`)
  assert.deepEqual(validateLessonAgainstPack(result.lesson, SERVER_PACK), [], label)
}

const parse = text => parseLessonText(text, OPTIONS)
const heading = block => block.content.heading?.uk

test('the example lesson becomes a valid draft with steps, slides and scored tasks', () => {
  const { lesson, errors, warnings } = parse(LESSON_TEXT_EXAMPLE)
  assert.deepEqual(errors, [])
  assert.deepEqual(warnings, [])
  assertValid(lesson, 'example')
  assert.equal(lesson.id, 'g1-new-l1')
  assert.deepEqual([lesson.grade, lesson.durationMin, lesson.objectives.length], [1, 25, 2])
  assert.deepEqual(lesson.blocks.map(b => b.type), ['hero', 'canvas', 'canvas', 'activity', 'break', 'activity', 'activity', 'canvas'])

  const about = lesson.blocks[1]
  assert.equal(heading(about), 'Про урок')
  assert.deepEqual([about.audience.student, about.views.presentation, about.views.remote, about.runtime], [false, false, false, undefined])

  const explain = lesson.blocks[2]
  assert.equal(explain.content.teacher.length, 5)
  assert.equal(explain.content.student.length, 4, 'the teacher note stays with the teacher')
  assert.deepEqual(explain.content.board.map(i => i.type), ['image', 'paragraph'], 'only [слайд] lines reach the board')
  assert.match(explain.content.student[3].text.uk, /^💡 \*\*Підказка:\*\* /)
  assert.deepEqual([explain.views.presentation, explain.views.remote, explain.runtime?.step], [true, true, true])

  const sort = lesson.blocks[3].activity
  assert.equal(sort.mechanic, 'classify')
  assert.deepEqual(sort.scoring.key.placement, { i1: 'c1', i2: 'c1', i3: 'c2', i4: 'c2' })

  assert.equal(lesson.blocks[4].content.prompt.uk, 'Встаньте й покажіть руками, як ви малюєте на папері.')

  const choice = lesson.blocks[5].activity
  assert.deepEqual([choice.mechanic, choice.telemetry, choice.scoring.key.correctOptionId], ['choice', 'practice', 'c'])
  assert.equal(choice.scoring.key.explanation.uk, 'Класики: тут не потрібен жоден пристрій.')
  const truefalse = lesson.blocks[6].activity
  assert.deepEqual([truefalse.mechanic, truefalse.telemetry, truefalse.scoring.key.answers], ['truefalse', 'checkpoint', { s1: true, s2: false }])
  assert.equal(heading(lesson.blocks[6]), 'Перевір себе')

  const last = lesson.blocks[7]
  assert.deepEqual(last.content.student.map(i => i.type), ['paragraph', 'table'])
  assert.deepEqual(last.content.board.map(i => i.type), ['paragraph'], 'no marks: the first sentence is the slide')
})

test('a step without [слайд] shows its first picture, or else its first sentence', () => {
  const { lesson } = parse('Урок\n\n## Схема\nТекст до схеми.\n![Схема](/curriculum-lessons/assets/x.svg)\n\n## Лише текст\n- пункт\nПерше речення.')
  assert.deepEqual(lesson.blocks[1].content.board, [{ type: 'image', src: '/curriculum-lessons/assets/x.svg', alt: { uk: 'Схема' } }])
  assert.deepEqual(lesson.blocks[2].content.board, [{ type: 'paragraph', text: { uk: 'Перше речення.' } }])
  assertValid(lesson, 'auto slides')
})

test('answers are never guessed: a task without one right answer is an error with its line', () => {
  const none = parse('Урок\n## Питання\n? Що обрати?\n- Перше\n- Друге')
  assert.equal(none.lesson, undefined)
  assert.equal(none.errors[0].line, 3)
  assert.match(none.errors[0].message, /знаком «\+»/)
  assert.match(parse('Урок\n## П\n? Що?\n+ А\n+ Б').errors[0].message, /має бути одна/)
  assert.match(parse('Урок\n## П\n? Що?\n+ А\nПравда: Б').errors[0].message, /змішано/)
  assert.match(parse('Урок\n## П\n? Що?\n\nЗвичайний текст').errors[0].message, /мають іти варіанти/)
})

test('HTML, non-https media and out-of-range grades are refused', () => {
  assert.match(parse('Урок\n## Крок\n<b>жирний</b>').errors[0].message, /HTML/)
  assert.equal(parse('Урок\n## Крок\n![Кіт](http://example.com/cat.png)').errors[0].line, 3)
  assert.match(parse('Урок\nКлас: 7\n## Крок\nТекст').errors[0].message, /1–4/)
  assert.equal(parse('   \n').errors[0].line, 0)
  assert.match(parse('## Крок\nТекст').errors[0].message, /назва уроку/)
})

test('media, tables and lists become their own items', () => {
  const { lesson, warnings } = parse([
    'Урок', '## Крок',
    'https://youtu.be/dQw4w9WgXcQ',
    '[Піксель Арт](https://itnauka.org/pixelart)',
    '1. перший', '2. другий',
    '| Одна колонка |', '| рядок |',
  ].join('\n'))
  const items = lesson.blocks[1].content.student
  assert.deepEqual(items.map(i => i.type), ['video', 'link', 'list', 'list'])
  assert.equal(items[0].videoId, 'dQw4w9WgXcQ')
  assert.equal(items[2].ordered, true)
  assert.ok(warnings.some(w => /одним стовпцем/.test(w.message)))
  assertValid(lesson, 'media')
  assert.equal(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
})

test('a long step is split into blocks of at most 20 items, all in the same step', () => {
  const lines = Array.from({ length: 45 }, (_, k) => `Речення ${k + 1}.`)
  const { lesson } = parse(`Урок\n## Довгий крок\n${lines.join('\n')}`)
  const canvases = lesson.blocks.filter(b => b.type === 'canvas')
  assert.deepEqual(canvases.map(b => b.content.teacher.length), [20, 20, 5])
  assert.deepEqual(canvases.map(b => b.content.board.length), [1, 0, 0], 'one slide per step')
  assert.ok(canvases.every(b => heading(b) === 'Довгий крок'))
  assertValid(lesson, 'long step')
})

test('an evidence task warns that it needs a learning outcome', () => {
  const { warnings, lesson } = parse('Урок\n## Перевірка\n? (оцінювання) Що?\n+ А\n- Б')
  assert.equal(lesson.blocks[1].activity.telemetry, 'evidence')
  assert.match(warnings.at(-1).message, /результатом навчання/)
})

test('text → lesson → text → lesson gives the same lesson', () => {
  const first = parse(LESSON_TEXT_EXAMPLE).lesson
  const exported = lessonToText(first)
  assert.deepEqual(exported.skipped, [])
  const second = parse(exported.text)
  assert.deepEqual(second.errors, [])
  assert.deepEqual(second.lesson, first)
})

test('export marks slides only when they differ from the automatic choice', () => {
  const text = lessonToText(parse('Урок\n## Крок\nПерше.\nДруге.').lesson).text
  assert.doesNotMatch(text, /\[слайд\]/)
  const marked = lessonToText(parse('Урок\n## Крок\nПерше.\n[слайд] Друге.').lesson).text
  assert.match(marked, /^\[слайд\] Друге\.$/m)
  assert.doesNotMatch(marked, /\[слайд\] Перше/)
})

test('export lists the blocks the text format cannot hold', () => {
  const lesson = newLesson({ id: 'g3-m1-l2', title: 'Алгоритми', grade: 3, pack: PACK_INFO })
  const practice = newBlock('practice', lesson, PACK_INFO)
  lesson.blocks.push(practice)
  const game = newBlock('activity', lesson, PACK_INFO)
  game.activity = { ...game.activity, mechanic: 'game', config: { gameKey: 'maze', level: 'x' }, scoring: { mode: 'client-unverified' } }
  lesson.blocks.push(game)
  const { text, skipped } = lessonToText(lesson)
  assert.deepEqual(skipped, [{ id: practice.id, type: 'practice' }, { id: game.id, type: 'activity:game' }])
  assert.match(text, /^# Алгоритми\nКлас: 3\nТривалість: 40 хв\n$/)
})

test('every lesson template becomes a valid draft without errors, and survives a round trip', () => {
  for (const template of LESSON_TEXT_TEMPLATES.filter(t => t.text)) {
    const { lesson, errors } = parse(template.text)
    assert.deepEqual(errors, [], template.id)
    assertValid(lesson, template.id)
    assert.ok(lesson.blocks.some(b => b.type === 'activity'), `${template.id} has a task`)
    assert.deepEqual(parse(lessonToText(lesson).text).lesson, lesson, `${template.id} round trip`)
  }
  assert.equal(LESSON_TEXT_TEMPLATES[0].text, '', 'the first choice is an empty field for the author’s own text')
})

test('the AI prompt carries the example, so the model sees the exact format', () => {
  assert.ok(LESSON_TEXT_PROMPT.endsWith(LESSON_TEXT_EXAMPLE))
  for (const marker of ['## ', '[слайд]', 'Для вчителя:', '? ', '+ ', 'Правда:', '[Назва групи]', 'Підказка:', 'Допомога:', 'Більше:']) {
    assert.ok(LESSON_TEXT_PROMPT.includes(marker), marker)
  }
})
