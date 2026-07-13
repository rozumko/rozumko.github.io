// Ситуації «як вчинити» для гри scenarios (1–2 клас). Контент дистильовано
// з посібника temp/new_lessons (private-info, kind-online). Рівно один
// правильний варіант на ситуацію; фідбек показується після вибору.

export interface ScenarioOption {
  label: string
  correct: boolean
  feedback: string
}

export interface ScenarioItem {
  id: string
  emoji: string
  text: string
  options: ScenarioOption[]
}

// Цифрова безпека + чемне онлайн-спілкування (informatics/digital-safety).
export const SCENARIOS_DIGITAL_SAFETY: ScenarioItem[] = [
  {
    id: 'password-request',
    emoji: '📨',
    text: 'У повідомленні просять написати твій пароль.',
    options: [
      { label: 'Не надсилати пароль і сказати дорослому.', correct: true, feedback: 'Так, пароль треба берегти.' },
      { label: 'Одразу надіслати, не думаючи.', correct: false, feedback: 'Так робити не можна: пароль — приватна інформація.' },
      { label: 'Написати ще й адресу дому.', correct: false, feedback: 'Адреса — це теж особиста інформація.' },
    ],
  },
  {
    id: 'phone-request',
    emoji: '📞',
    text: 'Хтось онлайн просить твій номер телефону.',
    options: [
      { label: 'Спершу звернутися до дорослого.', correct: true, feedback: 'Так, у такій ситуації дитина не вирішує сама.' },
      { label: 'Одразу написати номер.', correct: false, feedback: 'Номер телефону треба берегти.' },
      { label: 'Вигадати чужий номер і надіслати.', correct: false, feedback: 'Краще взагалі не відповідати без дорослого.' },
    ],
  },
  {
    id: 'favorite-color',
    emoji: '🎨',
    text: 'У шкільному завданні просять назвати улюблений колір.',
    options: [
      { label: 'Це можна сказати спокійно.', correct: true, feedback: 'Так, улюблений колір — не чутлива інформація.' },
      { label: 'Приховати це, як пароль.', correct: false, feedback: 'Не все про себе однаково приватне.' },
      { label: 'Завжди мовчати про все.', correct: false, feedback: 'Достатньо розрізняти безпечне і приватне.' },
    ],
  },
  {
    id: 'polite-request',
    emoji: '💌',
    text: 'Хочеш попросити однокласника ще раз надіслати фото вправи.',
    options: [
      { label: 'Написати чемно: «Будь ласка, надішли ще раз».', correct: true, feedback: 'Так, це ввічливе прохання.' },
      { label: 'Написати різко: «Швидко скинь!».', correct: false, feedback: 'Краще обрати поважну форму.' },
      { label: 'Надіслати образу.', correct: false, feedback: 'Так спілкуватися не можна.' },
    ],
  },
  {
    id: 'different-tastes',
    emoji: '🌈',
    text: 'У чаті хтось написав, що любить іншу гру, ніж ти.',
    options: [
      { label: 'Поставитися спокійно: вподобання бувають різні.', correct: true, feedback: 'Так, це повага до відмінностей.' },
      { label: 'Почати насміхатися.', correct: false, feedback: 'Насмішки принижують інших.' },
      { label: 'Написати, що людина дивна.', correct: false, feedback: 'Таке повідомлення може образити.' },
    ],
  },
  {
    id: 'harsh-reply',
    emoji: '⏸',
    text: 'Тобі захотілося написати щось різке у відповідь.',
    options: [
      { label: 'Зупинитися і переформулювати думку чемно.', correct: true, feedback: 'Так, спершу подумай, як це прочитає інша людина.' },
      { label: 'Одразу надіслати різкі слова.', correct: false, feedback: 'Образливі повідомлення не допомагають.' },
      { label: 'Додати ще насмішок.', correct: false, feedback: 'Так ситуація лише погіршиться.' },
    ],
  },
]
