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

async function routeQuestions(page: Page, difficulty: string) {
  await page.route('**/questions/grade-*.json', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(makeFixture(difficulty)) }),
  )
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
  if (await opts.locator('input.quiz-input').count()) {
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

    test('тренування: всі механіки без прокрутки', async ({ page }) => {
      await routeQuestions(page, 'medium')
      await page.goto('/student.html')
      await page.locator('#show-practice-btn').click()
      await page.locator('#practice-grade-buttons [data-grade="3"]').click()
      await page.locator('#practice-difficulty-buttons [data-difficulty="medium"]').click()
      await page.locator('#start-practice-btn').click()
      await expect(page.locator('#quiz-overlay')).toHaveClass(/active/)
      await runQuiz(page, 8)
    })
  })
}

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

// Демо-олімпіада: інший стан фідбек-зони (кнопка «Пропустити» + навігатор чипів)
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
