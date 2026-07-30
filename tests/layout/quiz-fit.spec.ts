import { test, expect, type Page } from '@playwright/test'

// ─────────────────────────────────────────────────────────────────────────────
// Контракт quiz-fit (style.css): екран питання завжди влазить у вьюпорт.
//   1. Сторінка не скролиться, поки квіз відкритий (overflow: clip + фон off).
//   2. .quiz-body не має внутрішньої прокрутки для стандартних механік.
//   3. Після відповіді фідбек-панель і кнопка «Далі» повністю у вьюпорті.
// Питання підміняються route-фікстурами — по одній на кожну механіку.
// ─────────────────────────────────────────────────────────────────────────────

const VIEWPORTS = [
  { name: 'desktop-1920x870', width: 1920, height: 870 },  // FHD мінус хром браузера/таскбар
  { name: 'laptop-1366x625', width: 1366, height: 625 },   // типовий шкільний ноутбук
  { name: 'laptop-1280x800', width: 1280, height: 800 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'mobile-375x667', width: 375, height: 667 },
  { name: 'phone-landscape-667x375', width: 667, height: 375 }, // найкоротший екран
] as const

function makeFixture(difficulty: string) {
  const base = { code: null, img: null, grade: 3, track: 'computational-thinking', topic: 'algorithms', difficulty }
  return [
    {
      ...base, id: 'fx-code', type: 'choice',
      q: 'Що надрукує Равлик після виконання цієї програми?',
      code: 'повтори 3 рази:\n  крок уперед\n  поверни праворуч\n  скажи "крок"\nкінець\nскажи "фініш"',
      options: ['крок ×3, потім фініш', 'лише фініш', 'крок ×3 без фінішу', 'нічого не надрукує'],
      correct: 0,
      explanation: 'Цикл виконується тричі, після нього — останній рядок.',
    },
    {
      ...base, id: 'fx-img', type: 'choice',
      q: 'Подивись на картинку. Що робить Розумко?',
      img: '/images/half/rozumko_hulf_thinks.png',
      imageRole: 'essential',
      options: ['Думає', 'Спить', 'Біжить', 'Малює'],
      correct: 0,
      explanation: 'Розумко думає над задачею.',
    },
    {
      ...base, id: 'fx-choice', type: 'choice',
      q: 'Що станеться, якщо програмі дати мало прикладів для навчання, а потім попросити її розпізнати щось зовсім нове?',
      options: [
        'Нічого не зміниться, програма працюватиме як раніше',
        'Вона стане набагато швидшою за всі інші програми',
        'Вона частіше помилятиметься на нових прикладах',
        'Вона навчиться ідеально і не робитиме помилок',
      ],
      correct: 2,
      explanation: 'Замало прикладів — і програма погано впізнає нове. Якість залежить від кількості й різноманіття даних.',
    },
    {
      ...base, id: 'fx-multi', type: 'multi_select',
      q: 'Обери всі пристрої, якими можна ввести інформацію в комп’ютер.',
      options: {
        choices: ['Клавіатура', 'Принтер', 'Миша', 'Колонки'],
        correctAnswers: [0, 2],
      },
      correct: null,
      explanation: 'Клавіатура та миша допомагають вводити інформацію.',
    },
    // Реальне довге питання з банку: саме на таких стеблах вьюпортна шкала
    // роздувала картку і ховала варіанти під краєм екрана.
    {
      ...base, id: 'fx-long', type: 'choice',
      q: 'Алгоритм пошуку: «перевір першу полицю → знайшов? → так: бери книгу, ні: перевір другу полицю». Книга на другій полиці. Скільки перевірок зробив алгоритм?',
      options: ['1', '4', '3', '2'],
      correct: 3,
      explanation: 'Перша полиця — перевірка, друга полиця — друга перевірка.',
    },
    {
      ...base, id: 'fx-truefalse', type: 'truefalse',
      q: 'Алгоритм — це послідовність кроків для розв’язання задачі. Так чи ні?',
      options: null, correct: 0,
      explanation: 'Так, алгоритм — це впорядковані кроки.',
    },
    {
      ...base, id: 'fx-input', type: 'input',
      q: 'Робот робить 3 кроки за хвилину. Скільки кроків він зробить за 4 хвилини?',
      options: { answer: 12, inputType: 'number' },
      correct: null,
      explanation: '3 × 4 = 12.',
    },
    {
      ...base, id: 'fx-sort', type: 'sort',
      q: 'Розстав кроки приготування чаю у правильному порядку.',
      options: {
        items: ['Закип’ятити воду', 'Покласти пакетик у чашку', 'Налити воду в чашку', 'Почекати і вийняти пакетик'],
        correctOrder: [0, 1, 2, 3],
      },
      correct: null,
      explanation: 'Спочатку вода, потім пакетик, потім заварювання.',
    },
    {
      ...base, id: 'fx-sequence', type: 'sequence',
      q: 'Продовж послідовність фігур.',
      options: { given: ['🔵', '🔴', '🔵', '🔴'], choices: ['🔴', '🔵', '⭐'] },
      correct: 1,
      explanation: 'Чергування: синій, червоний, синій…',
    },
    {
      ...base, id: 'fx-match', type: 'match',
      q: 'З’єднай тварину з її домівкою.',
      options: {
        left: ['Собака', 'Пташка', 'Риба'],
        right: ['Будка', 'Гніздо', 'Акваріум'],
        pairs: [0, 1, 2],
      },
      correct: null,
      explanation: 'Кожна тварина живе у своїй домівці.',
    },
  ]
}

function makeSanitizedFixture(difficulty: string) {
  return makeFixture(difficulty).map(question => {
    const sanitized = structuredClone(question) as Record<string, unknown>
    delete sanitized.correct
    delete sanitized.explanation
    if (sanitized.options && typeof sanitized.options === 'object' && !Array.isArray(sanitized.options)) {
      const options = { ...(sanitized.options as Record<string, unknown>) }
      delete options.answer
      delete options.correctOrder
      delete options.pairs
      delete options.correctAnswers
      sanitized.options = options
    }
    return sanitized
  })
}

function makeTwelveQuestionDemoFixture(difficulty: string, suffix: string) {
  const base = makeSanitizedFixture(difficulty)
  return [
    ...base,
    ...base.slice(0, Math.max(0, 12 - base.length))
      .map((question, index) => ({ ...question, id: `fx-${suffix}-${index}` })),
  ]
}

async function routeDemoApi(
  page: Page,
  demoQuestions: ReturnType<typeof makeSanitizedFixture>,
  options: { tokenExpiresAt?: number; tokenTtlMs?: number } = {},
) {
  const tokenTtlMs = options.tokenTtlMs ?? 60 * 60 * 1000
  await page.route('**/api/questions/demo/start', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        demoToken: 'layout-test-demo-token',
        tokenExpiresAt: options.tokenExpiresAt ?? Date.now() + tokenTtlMs,
        tokenTtlMs,
        questions: demoQuestions,
        questionsCount: demoQuestions.length,
        timeMinutes: 20,
      }),
    }),
  )
  await page.route('**/api/questions/demo/finish', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ score: 0, total: demoQuestions.length }),
    }),
  )
}

async function routeQuestions(page: Page, difficulty: string) {
  const demoQuestions = makeSanitizedFixture(difficulty)

  await page.route('**/questions/grade-*.json', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(makeFixture(difficulty)) }),
  )
  await routeDemoApi(page, demoQuestions)
}

/** Інваріанти quiz-fit у поточному стані екрана. */
async function assertNoScroll(page: Page, ctx: string) {
  const m = await page.evaluate(() => {
    const se = document.scrollingElement!
    window.scrollTo(0, 300)
    const scrollY = window.scrollY
    window.scrollTo(0, 0)
    const body = document.querySelector('.quiz-body')!
    return {
      pageOverflow: se.scrollHeight - se.clientHeight,
      scrollY,
      bodyOverflow: body.scrollHeight - body.clientHeight,
    }
  })
  expect(m.pageOverflow, `${ctx}: сторінка має overflow ${m.pageOverflow}px`).toBeLessThanOrEqual(0)
  expect(m.scrollY, `${ctx}: сторінку можна прокрутити`).toBe(0)
  expect(m.bodyOverflow, `${ctx}: .quiz-body скролиться на ${m.bodyOverflow}px`).toBeLessThanOrEqual(1)
}

// Desktop olympiad content must be discoverable without scrolling inside the
// stem, code or answer area. This catches the competitor failure where the last
// subquestion existed below a subtle inner scrollbar.
async function assertDesktopQuestionFitsWithoutInnerScroll(page: Page, ctx: string) {
  const viewport = page.viewportSize()!
  if (viewport.width < 1024 || viewport.height < 600) return

  const metrics = await page.evaluate(() => {
    const selectors = ['.quiz-question-card', '#quiz-code:not(.hidden)', '#quiz-options']
    const regions = selectors.flatMap(selector => {
      const element = document.querySelector<HTMLElement>(selector)
      if (!element) return []
      return [{
        selector,
        overflow: element.scrollHeight - element.clientHeight,
      }]
    })
    const question = document.querySelector<HTMLElement>('#quiz-question-text')
    return {
      regions,
      questionFontPx: question ? Number.parseFloat(getComputedStyle(question).fontSize) : 0,
    }
  })

  for (const region of metrics.regions) {
    expect(region.overflow, `${ctx}: ${region.selector} hides ${region.overflow}px behind inner scroll`).toBeLessThanOrEqual(1)
  }
  expect(metrics.questionFontPx, `${ctx}: question font is below the 15px readability floor`).toBeGreaterThanOrEqual(15)
}

/** Елемент повністю видимий у вьюпорті. */
async function assertInViewport(page: Page, selector: string, ctx: string) {
  const box = await page.locator(selector).boundingBox()
  const vp = page.viewportSize()!
  expect(box, `${ctx}: ${selector} відсутній`).not.toBeNull()
  expect(box!.y, `${ctx}: ${selector} вилазить угору`).toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height, `${ctx}: ${selector} нижче краю екрана`).toBeLessThanOrEqual(vp.height + 1)
  expect(box!.x, `${ctx}: ${selector} вилазить уліво`).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width, `${ctx}: ${selector} правіше краю екрана`).toBeLessThanOrEqual(vp.width + 1)
}

/** Відповідає на поточне питання відповідно до його механіки. */
async function answerCurrentQuestion(page: Page) {
  const opts = page.locator('#quiz-options')
  if (await opts.locator('[role="checkbox"]').count()) {
    await opts.locator('[role="checkbox"]').nth(0).click()
    await opts.locator('[role="checkbox"]').nth(1).click()
    await opts.locator('.quiz-check').click()
  } else if (await opts.locator('input.quiz-input').count()) {
    await opts.locator('input.quiz-input').fill('12')
    await opts.locator('.quiz-check').click()
  } else if (await opts.locator('select.quiz-select').count()) {
    const selects = opts.locator('select.quiz-select')
    const n = await selects.count()
    for (let i = 0; i < n; i++) await selects.nth(i).selectOption({ index: 1 })
    await opts.locator('.quiz-check').click()
  } else if (await opts.locator('.quiz-sort-row').count()) {
    await opts.locator('.quiz-check').click()
  } else {
    await opts.locator('.quiz-option').first().click()
  }
}

/** Проходить квіз до кінця, перевіряючи інваріанти на кожному питанні. */
async function runQuiz(page: Page, questionCount: number) {
  for (let i = 0; i < questionCount; i++) {
    const ctx = `питання ${i + 1}`
    await expect(page.locator('#quiz-question-text')).not.toHaveText('')
    await assertNoScroll(page, ctx)
    await assertDesktopQuestionFitsWithoutInnerScroll(page, ctx)

    await answerCurrentQuestion(page)

    await expect(page.locator('#quiz-overlay')).toHaveClass(/quiz-answered/)
    await assertNoScroll(page, `${ctx} (після відповіді)`)
    await assertInViewport(page, '.quiz-feedback-wrap', `${ctx} (панель фідбеку)`)
    await assertInViewport(page, '#quiz-next-btn', `${ctx} (кнопка Далі)`)

    await page.locator('#quiz-next-btn').click()
  }
  // Після останнього питання — результат, теж без прокрутки
  await expect(page.locator('#result-overlay')).toHaveClass(/active/)
  const overflow = await page.evaluate(() => {
    const se = document.scrollingElement!
    return se.scrollHeight - se.clientHeight
  })
  expect(overflow, 'екран результату дав прокрутку').toBeLessThanOrEqual(0)
}

for (const vp of VIEWPORTS) {
  test.describe(`quiz-fit @ ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test('демо: всі механіки без прокрутки', async ({ page }) => {
      await routeQuestions(page, 'medium')
      await page.goto('/student.html')
      await page.locator('#show-demo-btn').click()
      await page.locator('#demo-grade-buttons [data-demo-grade="3"]').click()
      await page.locator('#start-demo-free-btn').click()
      await expect(page.locator('#quiz-overlay')).toHaveClass(/active/)
      await runQuiz(page, 10)
    })
  })
}

test.describe('quiz recovery runtime', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('restores a valid demo backup into the quiz overlay', async ({ page }) => {
    const questions = makeTwelveQuestionDemoFixture('medium', 'recovery')
    const now = Date.now()
    await page.addInitScript(({ questions, now }) => {
      sessionStorage.setItem('rozumko_demo_backup', JSON.stringify({
        demoToken: 'layout-test-recovery-token',
        recoveryExpiresAt: now + 60 * 60 * 1000,
        grade: 3,
        questions,
        questionsCount: questions.length,
        currentIdx: 2,
        answeredIds: [questions[0].id, questions[1].id],
        savedAnswers: [[questions[0].id, 0], [questions[1].id, 0]],
        startedAt: now - 60 * 1000,
        deadlineAt: now + 10 * 60 * 1000,
        savedAt: now,
      }))
    }, { questions, now })

    await page.goto('/student.html')

    await expect(page.locator('#quiz-overlay')).toHaveClass(/active/)
    await expect(page.locator('#quiz-mode-badge')).toHaveText('Демо')
    await expect(page.locator('#quiz-progress-text')).toHaveText('3 / 12')
    await expect(page.locator('#quiz-loading-overlay')).not.toHaveClass(/active/)
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('rozumko_demo_backup') !== null)).toBe(true)
  })

  test('rejects an expired demo recovery window before starting a timer', async ({ page }) => {
    const questions = makeTwelveQuestionDemoFixture('medium', 'expired')
    const now = Date.now()
    await page.addInitScript(({ questions, now }) => {
      sessionStorage.setItem('rozumko_demo_backup', JSON.stringify({
        demoToken: 'layout-test-expired-token',
        recoveryExpiresAt: now - 1,
        grade: 3,
        questions,
        questionsCount: questions.length,
        currentIdx: 2,
        answeredIds: [],
        savedAnswers: [],
        startedAt: now - 60 * 1000,
        deadlineAt: now + 10 * 60 * 1000,
        savedAt: now,
      }))
    }, { questions, now })

    await page.goto('/student.html')

    await expect(page.locator('#quiz-overlay')).not.toHaveClass(/active/)
    await expect(page.locator('#quiz-progress-text')).toHaveText('')
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('rozumko_demo_backup'))).toBeNull()
  })

  test('restores a demo with a stable device clock skew using relative TTL', async ({ page }) => {
    const questions = makeTwelveQuestionDemoFixture('medium', 'clock-skew')
    const realNow = Date.now()
    const tokenTtlMs = 2 * 60 * 60 * 1000
    const skewMs = 3 * 60 * 60 * 1000
    await page.addInitScript(offset => {
      const nativeNow = Date.now.bind(Date)
      Date.now = () => nativeNow() + offset
    }, skewMs)
    await routeDemoApi(page, questions, {
      tokenExpiresAt: realNow + tokenTtlMs,
      tokenTtlMs,
    })

    await page.goto('/student.html')
    await page.locator('#show-demo-btn').click()
    await page.locator('#demo-grade-buttons [data-demo-grade="3"]').click()
    await page.locator('#start-demo-free-btn').click()
    await expect(page.locator('#quiz-overlay')).toHaveClass(/active/)
    await expect.poll(() => page.evaluate(() => {
      const raw = sessionStorage.getItem('rozumko_demo_backup')
      if (!raw) return false
      const backup = JSON.parse(raw)
      return backup.recoveryExpiresAt > Date.now()
        && backup.questionsCount === 12
    })).toBe(true)

    await page.reload()

    await expect(page.locator('#quiz-overlay')).toHaveClass(/active/)
    await expect(page.locator('#quiz-progress-text')).toHaveText('1 / 12')
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('rozumko_demo_backup') !== null)).toBe(true)
  })

  test('keeps a selected demo answer when reloaded before Next', async ({ page }) => {
    const questions = makeTwelveQuestionDemoFixture('medium', 'answer-recovery')
    await routeDemoApi(page, questions)

    await page.goto('/student.html')
    await page.locator('#show-demo-btn').click()
    await page.locator('#demo-grade-buttons [data-demo-grade="3"]').click()
    await page.locator('#start-demo-free-btn').click()
    await expect(page.locator('#quiz-overlay')).toHaveClass(/active/)
    await page.locator('#quiz-options .quiz-option').first().click()
    await expect(page.locator('#quiz-overlay')).toHaveClass(/quiz-answered/)
    await expect.poll(() => page.evaluate(() => {
      const raw = sessionStorage.getItem('rozumko_demo_backup')
      return raw ? JSON.parse(raw).savedAnswers.length : 0
    })).toBe(1)

    await page.reload()

    await expect(page.locator('#quiz-overlay')).toHaveClass(/active/)
    await expect(page.locator('#quiz-progress-text')).toHaveText('1 / 12')
    await expect(page.locator('.quiz-nav-chip').first()).toHaveClass(/quiz-nav-chip--answered/)
    await expect(page.locator('#quiz-options .quiz-option[aria-checked="true"]')).toHaveCount(1)
  })

  test('opens a pending official attempt instead of swallowing it', async ({ page }) => {
    const questions = makeSanitizedFixture('hard')
    await page.route('**/api/attempt/*/heartbeat', route =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ pausedSeconds: 0, remainingSeconds: 40 * 60 }),
      }),
    )
    await page.addInitScript(questions => {
      sessionStorage.setItem('pendingOlympiad', JSON.stringify({
        attemptId: '20000000-0000-4000-8000-000000000001',
        attemptToken: 'layout-test-attempt-token',
        code: 'ABCD-1234',
        grade: 3,
        questions,
        answeredQuestionIds: [],
        remainingSeconds: 40 * 60,
        timeMinutes: 45,
        questionsCount: questions.length,
      }))
    }, questions)

    await page.goto('/student.html')

    await expect(page.locator('#quiz-overlay')).toHaveClass(/active/)
    await expect(page.locator('#quiz-mode-badge')).toHaveText('Олімпіада')
    await expect(page.locator('#quiz-progress-text')).toHaveText(`1 / ${questions.length}`)
    await expect(page.locator('#quiz-loading-overlay')).not.toHaveClass(/active/)
  })

  test('starts an official attempt directly from the olympiad landing code form', async ({ page }) => {
    const questions = makeSanitizedFixture('hard')
    let submittedCode = ''
    await page.route('**/api/student/exchange-code', async route => {
      submittedCode = (await route.request().postDataJSON()).code
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          attemptId: '20000000-0000-4000-8000-000000000002',
          attemptToken: 'layout-test-direct-code-token',
          grade: 3,
          questions,
          answeredQuestionIds: [],
          remainingSeconds: 45 * 60,
          timeMinutes: 45,
          questionsCount: questions.length,
        }),
      })
    })

    await page.goto('/student.html')
    await page.locator('#olympiad-code-input').fill('abc 247')
    await page.locator('#olympiad-code-submit').click()

    await expect(page.locator('#quiz-overlay')).toHaveClass(/active/)
    await expect(page.locator('#quiz-mode-badge')).toHaveText('Олімпіада')
    await expect(page.locator('#quiz-progress-text')).toHaveText(`1 / ${questions.length}`)
    await expect(page.locator('#quiz-loading-overlay')).not.toHaveClass(/active/)
    expect(submittedCode).toBe('АВС247')
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pendingOlympiad'))).toBeNull()
  })
})

test.describe('olympiad landing layout', () => {
  for (const viewport of [
    { name: 'desktop', width: 1366, height: 625 },
    { name: 'mobile', width: 375, height: 667 },
  ]) {
    test(`${viewport.name}: direct code and demo entry stay usable without horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/student.html')

      await expect(page.locator('#olympiad-code-input')).toBeVisible()
      await expect(page.locator('#olympiad-code-submit')).toBeVisible()
      await expect(page.locator('#show-demo-btn')).toBeVisible()
      const overflow = await page.evaluate(() => {
        const root = document.scrollingElement!
        return root.scrollWidth - root.clientWidth
      })
      expect(overflow).toBeLessThanOrEqual(1)
    })
  }
})

// Домашня місія (home.html, #mission-quiz + body.mission-active) — той самий
// контракт, але інша розмітка (fixed-секція замість оверлея) і mission-runner.
for (const vp of [VIEWPORTS[0], VIEWPORTS[1], VIEWPORTS[4], VIEWPORTS[5]]) {
  test.describe(`quiz-fit місія @ ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test('перше питання і фідбек-панель без прокрутки', async ({ page }) => {
      await routeQuestions(page, 'medium')
      await page.goto('/home.html')
      await page.locator('.home-grade-btn[data-grade="3"]').click()
      await page.locator('.home-track-btn[data-track="computational-thinking"]').click()
      await expect(page.locator('body')).toHaveClass(/mission-active/)
      await expect(page.locator('#quiz-question-text')).not.toHaveText('')

      const m = await page.evaluate(() => {
        const se = document.scrollingElement!
        window.scrollTo(0, 300)
        const scrollY = window.scrollY
        window.scrollTo(0, 0)
        const mq = document.querySelector('#mission-quiz')!
        return { pageScrollY: scrollY, mqOverflow: mq.scrollHeight - mq.clientHeight, pageOverflow: se.scrollHeight - se.clientHeight }
      })
      expect(m.pageScrollY, 'місія: сторінку можна прокрутити').toBe(0)
      expect(m.pageOverflow, 'місія: сторінка має overflow').toBeLessThanOrEqual(0)
      expect(m.mqOverflow, 'місія: #mission-quiz скролиться').toBeLessThanOrEqual(1)

      await answerCurrentQuestion(page)
      await expect(page.locator('body')).toHaveClass(/mission-answered/)
      await assertInViewport(page, '.quiz-feedback-wrap', 'місія (панель фідбеку)')
      await assertInViewport(page, '#quiz-next-btn', 'місія (кнопка Далі)')
    })
  })
}

// Вихід із домашнього тренування: дитина не має бути замкнена в місії.
// Контракт — підтвердження лише тоді, коли є що втрачати.
test.describe('home practice exit', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  async function openPractice(page: Page) {
    await routeQuestions(page, 'medium')
    await page.goto('/home.html')
    await page.locator('.home-grade-btn[data-grade="3"]').click()
    await page.locator('.home-track-btn[data-track="computational-thinking"]').click()
    await expect(page.locator('body')).toHaveClass(/mission-active/)
    await expect(page.locator('#quiz-question-text')).not.toHaveText('')
  }

  test('exit before the first answer leaves without a confirmation step', async ({ page }) => {
    await openPractice(page)
    await page.locator('#quiz-exit-btn').click()
    await expect(page.locator('#quiz-exit-confirm')).not.toHaveClass(/active/)
    await expect(page.locator('body')).not.toHaveClass(/mission-active/)
    await expect(page.locator('#demo-intro')).toBeVisible()
    // Фокус повертається на кнопку, з якої дитина зайшла в місію.
    await expect(page.locator('.home-track-btn[data-track="computational-thinking"]')).toBeFocused()
  })

  test('exit after an answer confirms first and can be cancelled', async ({ page }) => {
    await openPractice(page)
    await answerCurrentQuestion(page)
    await expect(page.locator('body')).toHaveClass(/mission-answered/)

    await page.locator('#quiz-exit-btn').click()
    const dialog = page.locator('#quiz-exit-confirm')
    await expect(dialog).toHaveClass(/active/)
    // Безпечна дія тримає фокус — випадковий Enter не викидає з місії.
    await expect(page.locator('#quiz-exit-stay')).toBeFocused()

    await page.locator('#quiz-exit-stay').click()
    await expect(dialog).not.toHaveClass(/active/)
    await expect(page.locator('body')).toHaveClass(/mission-active/)

    await page.locator('#quiz-exit-btn').click()
    await page.locator('#quiz-exit-yes').click()
    await expect(dialog).not.toHaveClass(/active/)
    await expect(page.locator('body')).not.toHaveClass(/mission-active/)
    await expect(page.locator('#demo-intro')).toBeVisible()
  })

  test('Escape opens the exit dialog and a second Escape closes it for good', async ({ page }) => {
    await openPractice(page)
    await answerCurrentQuestion(page)

    await page.keyboard.press('Escape')
    const dialog = page.locator('#quiz-exit-confirm')
    await expect(dialog).toHaveClass(/active/)

    // Той самий Escape не має закрити і одразу відкрити діалог знову.
    await page.keyboard.press('Escape')
    await expect(dialog).not.toHaveClass(/active/)
    await expect(page.locator('body')).toHaveClass(/mission-active/)
  })

  test('the exit control sits above the practice overlay and holds a child-sized tap target', async ({ page }) => {
    await openPractice(page)
    await assertInViewport(page, '#quiz-exit-btn', 'кнопка виходу')
    const box = (await page.locator('#quiz-exit-btn').boundingBox())!
    expect(box.width, 'тап-зона виходу вужча за дитячий мінімум').toBeGreaterThanOrEqual(44)
    expect(box.height, 'тап-зона виходу нижча за дитячий мінімум').toBeGreaterThanOrEqual(44)

    await answerCurrentQuestion(page)
    await page.locator('#quiz-exit-btn').click()
    const layered = await page.evaluate(() => {
      const dialog = document.querySelector('#quiz-exit-confirm') as HTMLElement
      const quiz = document.querySelector('#mission-quiz') as HTMLElement
      const card = dialog.querySelector('.quit-card')!.getBoundingClientRect()
      return {
        dialogZ: Number(getComputedStyle(dialog).zIndex),
        quizZ: Number(getComputedStyle(quiz).zIndex),
        topmost: document.elementFromPoint(card.x + card.width / 2, card.y + card.height / 2)?.closest('.quit-card') !== null,
      }
    })
    expect(layered.dialogZ, 'діалог виходу нижче за оверлей місії').toBeGreaterThan(layered.quizZ)
    expect(layered.topmost, 'картка діалогу перекрита місією').toBe(true)
  })
})

// Демо-олімпіада: інший стан фідбек-зони (кнопка «Пропустити» + навігатор чипів)
test.describe('school answer layout stability', () => {
  test.use({ viewport: { width: 1920, height: 870 } })

  test('answer cards keep their height while the server checks the response', async ({ page }) => {
    await page.addInitScript(() => {
      const originalFetch = window.fetch.bind(window)
      window.fetch = async (input, init) => {
        const url = input instanceof Request ? input.url : String(input)
        if (url.includes('/api/school/join')) {
          return new Response(JSON.stringify({
            participantId: '00000000-0000-4000-8000-0000000000a2',
            participantToken: 'token-1',
            status: 'active',
            grade: 3,
            questions: [{
              id: '00000000-0000-4000-8000-0000000000a3',
              q: 'Which tool is used to point and click on the screen?',
              code: null,
              type: 'choice',
              options: ['A pencil', 'A mouse or finger', 'A fork', 'A spoon'],
              img: null,
              imageAlt: null,
            }],
            questionsCount: 1,
          }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        if (url.includes('/api/school/participants/') && url.endsWith('/answer')) {
          await new Promise(resolve => window.setTimeout(resolve, 600))
          return new Response(JSON.stringify({ correct: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return originalFetch(input, init)
      }
    })

    await page.goto('/school.html')
    await page.locator('#join-code').fill('123456')
    await page.locator('#join-nickname').fill('Tester')
    await page.locator('#join-btn').click()
    await expect(page.locator('body')).toHaveClass(/mission-active/)

    const options = page.locator('#quiz-options')
    const firstOption = options.locator('.quiz-option').first()
    const before = await options.boundingBox()
    const fontSize = await firstOption.evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize))
    expect(fontSize).toBeGreaterThanOrEqual(24)

    await firstOption.click()
    await expect(page.locator('#quiz-feedback')).toHaveText('Перевіряємо…')
    const checking = await options.boundingBox()
    expect(checking!.height).toBeCloseTo(before!.height, 0)

    await expect(page.locator('#quiz-next-btn')).toBeVisible()
    const answered = await options.boundingBox()
    expect(answered!.height).toBeCloseTo(before!.height, 0)
  })
})

test.describe('quiz-fit @ демо-олімпіада 1366x625', () => {
  test.use({ viewport: { width: 1366, height: 625 } })

  test('скіп-кнопка і панель «збережено» без прокрутки', async ({ page }) => {
    await routeQuestions(page, 'hard')
    await page.goto('/student.html')
    await page.locator('#show-demo-btn').click()
    await page.locator('#demo-grade-buttons [data-demo-grade="3"]').click()
    await page.locator('#start-demo-free-btn').click()
    await expect(page.locator('#quiz-overlay')).toHaveClass(/active/)

    // До відповіді: навігатор і «Пропустити» на екрані, прокрутки немає
    await expect(page.locator('#quiz-nav')).toBeVisible()
    await assertNoScroll(page, 'демо, до відповіді')
    await assertInViewport(page, '#quiz-skip-btn', 'демо (кнопка Пропустити)')

    // Після відповіді: панель поверх варіантів, «Далі» у вьюпорті
    await answerCurrentQuestion(page)
    await expect(page.locator('#quiz-overlay')).toHaveClass(/quiz-answered/)
    await assertNoScroll(page, 'демо, після відповіді')
    await assertInViewport(page, '#quiz-next-btn', 'демо (кнопка Далі)')
  })
})
