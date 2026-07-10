import test from 'node:test'
import assert from 'node:assert/strict'

import { validateScenario } from './simulator-engine.ts'
import { HARDWARE_SCENARIO, SOFTWARE_SCENARIO } from './simulator-data.ts'

for (const scenario of [HARDWARE_SCENARIO, SOFTWARE_SCENARIO]) {
  test(`${scenario.id}: граф без переходів у неіснуючі вузли`, () => {
    assert.deepEqual(validateScenario(scenario), [])
  })

}

/** Проходить сценарій за списком підрядків текстів виборів; повертає фінальний вузол. */
function walk(scenario, steps) {
  const s = scenario.initialState()
  let node = scenario.startNode
  for (const step of steps) {
    const def = scenario.nodes[node]
    const choices = typeof def.choices === 'function' ? def.choices(s) : def.choices
    const picked = choices.find(ch => {
      const text = typeof ch.text === 'function' ? ch.text(s) : ch.text
      return text.includes(step)
    })
    assert.ok(picked, `у вузлі «${node}» немає вибору з текстом «${step}»`)
    picked.action?.(s)
    node = typeof picked.next === 'function' ? picked.next(s) : picked.next
  }
  return node
}

test('hardware: щасливий шлях доходить до win', () => {
  const final = walk(HARDWARE_SCENARIO, [
    'Подивитися на материнську плату',
    'Місце для Процесора', 'встановити процесор', 'вентилятор охолодження', 'Повернутися назад',
    'Місце для Памʼяті', 'Зіставити виріз', 'Повернутися назад',
    'Розʼєм для Накопичувача', 'Вставити SSD', 'гвинтиком', 'Повернутися назад',
    'Довгий розʼєм для Відеокарти', 'Вставити відеокарту', 'Повернутися назад',
    'Блок живлення', 'Увімкнути живлення', 'Повернутися назад',
    'Натиснути кнопку «Увімкнення»!',
  ])
  assert.equal(final, 'win')
})

test('software: щасливий шлях доходить до win', () => {
  const final = walk(SOFTWARE_SCENARIO, [
    'Вставити завантажувальну USB-флешку',
    'Увімкнути компʼютер',
    'Почати встановлення ОС',
    'Завершити встановлення та перезавантажити',
    'Продовжити',
    'Підключитися до мережі', 'Повернутися на Робочий стіл',
    'встановити драйвери', 'Перезавантажити після встановлення',
    'Встановити базові програми', 'Завершити встановлення програм',
    'Завершити налаштування',
  ])
  assert.equal(final, 'win')
})

test('hardware: установка деталі під напругою веде у fail_safety без установки', () => {
  const s = HARDWARE_SCENARIO.initialState()
  s.power_on = true
  const cpu = HARDWARE_SCENARIO.nodes.cpu
  const choices = typeof cpu.choices === 'function' ? cpu.choices(s) : cpu.choices
  const install = choices[0]
  install.action?.(s)
  const next = typeof install.next === 'function' ? install.next(s) : install.next
  assert.equal(next, 'fail_safety')
  assert.equal(s.cpu_installed, false)
})

test('software: драйвери без мережі не встановлюються', () => {
  const s = SOFTWARE_SCENARIO.initialState()
  const drivers = SOFTWARE_SCENARIO.nodes.drivers
  const choices = typeof drivers.choices === 'function' ? drivers.choices(s) : drivers.choices
  assert.equal(choices.length, 1)
  const next = typeof choices[0].next === 'function' ? choices[0].next(s) : choices[0].next
  assert.equal(next, 'desktop')
  assert.equal(s.drivers_installed, false)
})
