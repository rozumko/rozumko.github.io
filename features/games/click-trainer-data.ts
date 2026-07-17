// Click-trainer content: "find and click the right card" rounds ported from
// temp/new_lessons (computer-parts-1-2). Bundled copy is the offline/legacy
// fallback; the editable source of truth lives in the missions registry and
// ships as /content-packs/click-trainer-<gameKey>.json.

export interface ClickTrainerOption {
  label: string
  emoji: string
  correct: boolean
  feedback: string
}

export interface ClickTrainerRound {
  lead: string
  target: { label: string; emoji: string }
  options: ClickTrainerOption[]
}

export const CLICK_TRAINER_COMPUTER_PARTS: ClickTrainerRound[] = [
  {
    lead: 'Знайди частину, на якій ми бачимо зображення.',
    target: { label: 'Покажи монітор', emoji: '🖥️' },
    options: [
      { label: 'монітор', emoji: '🖥️', correct: true, feedback: 'Так, саме монітор показує зображення.' },
      { label: 'клавіатура', emoji: '⌨️', correct: false, feedback: 'Клавіатура не показує зображення, а допомагає вводити.' },
      { label: 'миша', emoji: '🖱️', correct: false, feedback: 'Миша допомагає обирати, але не показує.' },
      { label: 'навушники', emoji: '🎧', correct: false, feedback: 'Навушники допомагають слухати.' },
    ],
  },
  {
    lead: 'Знайди частину, якою натискають букви.',
    target: { label: 'Покажи клавіатуру', emoji: '⌨️' },
    options: [
      { label: 'принтер', emoji: '🖨️', correct: false, feedback: 'Принтер друкує на папері.' },
      { label: 'клавіатура', emoji: '⌨️', correct: true, feedback: 'Правильно, клавіатура допомагає вводити букви.' },
      { label: 'монітор', emoji: '🖥️', correct: false, feedback: 'Монітор показує, а не вводить.' },
      { label: 'колонки', emoji: '🔊', correct: false, feedback: 'Колонки відтворюють звук.' },
    ],
  },
  {
    lead: 'Знайди частину, яка допомагає слухати звук тихо і близько.',
    target: { label: 'Покажи навушники', emoji: '🎧' },
    options: [
      { label: 'миша', emoji: '🖱️', correct: false, feedback: 'Миша не передає звук.' },
      { label: 'навушники', emoji: '🎧', correct: true, feedback: 'Так, навушники допомагають слухати звук.' },
      { label: 'мікрофон', emoji: '🎤', correct: false, feedback: 'Мікрофон допомагає говорити в пристрій.' },
      { label: 'тачпад', emoji: '👆', correct: false, feedback: 'Тачпад допомагає керувати, а не слухати.' },
    ],
  },
  {
    lead: 'Знайди частину, яка друкує на папері.',
    target: { label: 'Покажи принтер', emoji: '🖨️' },
    options: [
      { label: 'принтер', emoji: '🖨️', correct: true, feedback: 'Так, принтер переносить результат на папір.' },
      { label: 'монітор', emoji: '🖥️', correct: false, feedback: 'Монітор лише показує зображення.' },
      { label: 'клавіатура', emoji: '⌨️', correct: false, feedback: 'Клавіатура допомагає вводити.' },
      { label: 'навушники', emoji: '🎧', correct: false, feedback: 'Навушники допомагають слухати.' },
    ],
  },
]
