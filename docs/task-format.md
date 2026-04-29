# Формат завдань — РОЗУМКО

_Останнє оновлення: 2026-04-29_

## Принцип

Питання зберігаються в `olympiad_questions` (Firestore, основне джерело).  
JS-файли в `data/questions/informatics/` — fallback якщо Firestore порожній для класу.

| JS-файл | Призначення | Режими |
|---|---|---|
| `grade{N}.js` | Тренування і демо | `practice`, `demo` |
| `grade{N}-olympiad.js` | Олімпіада | `olympiad` |

Кожен елемент має поле `type`. Зворотна сумісність: `type: 'choice'` можна не писати.

Рендеринг і оцінювання всіх типів — `utils/question-renderer.js`.  
Адмін управляє питаннями через `admin.html` (CRUD + preview).

---

## Типи завдань

### 1. `choice` — одиночний вибір ✅

```js
{
  type: 'choice',           // default, можна не писати
  difficulty: 'easy',
  q: 'Яке з цих пристроїв — пристрій виведення?',
  img: 'https://...',       // URL зображення (необов'язково)
  code: null,               // псевдокод Равлика (необов'язково)
  a: ['Клавіатура', 'Монітор', 'Мишка', 'Сканер'],
  correct: 1,               // індекс правильної відповіді в a[]
  explanation: '...'
}
```

---

### 2. `truefalse` — Так / Ні ✅

```js
{
  type: 'truefalse',
  difficulty: 'easy',
  q: 'Монітор — пристрій введення?',
  img: null,
  correct: false,           // true або false
  explanation: '...'
}
```

---

### 3. `input` — введення відповіді ✅

```js
{
  type: 'input',
  difficulty: 'medium',
  q: 'Скільки байт в одному кілобайті?',
  img: null,
  correct: 1024,            // рядок або число
  inputType: 'number',      // 'text' | 'number'
  explanation: '...'
}
```

Для `inputType: 'number'` допускається похибка ±0.001.  
Для `inputType: 'text'` порівняння без урахування регістру.

---

### 4. `sort` — розстав у правильному порядку ✅

```js
{
  type: 'sort',
  difficulty: 'medium',
  q: 'Розстав кроки збереження файлу у правильному порядку:',
  img: null,
  items: [
    'Натисни Ctrl+S',
    'Відкрий програму',
    'Набери текст',
    'Введи назву файлу'
  ],
  correctOrder: [1, 2, 3, 0],
  // correctOrder[pos] = індекс у items, який стоїть на позиції pos
  explanation: '...'
}
```

Учень переміщує блоки кнопками ↑/↓. Аліас `algorithm` підтримується для зворотної сумісності.

---

### 5. `sequence` — продовж послідовність ✅

```js
{
  type: 'sequence',
  difficulty: 'easy',
  q: 'Що стоїть наступним?',
  img: null,
  given: ['🟥', '🟦', '🟥', '🟦'],
  choices: ['🟥', '🟩', '🟦', '🟨'],
  correct: 0,               // індекс правильної відповіді в choices[]
  explanation: '...'
}
```

---

### 6. `match` — з'єднай пари ✅

```js
{
  type: 'match',
  difficulty: 'medium',
  q: "З'єднай пристрій із його призначенням:",
  img: null,
  left:  ['Клавіатура', 'Принтер', 'Монітор'],
  right: ['Виводить зображення', 'Вводить текст', 'Друкує на папері'],
  pairs: [1, 2, 0],
  // pairs[i] = індекс у right[] для left[i]
  explanation: '...'
}
```

---

## Спільні поля

| Поле | Тип | Обов'язкове | Опис |
|---|---|---|---|
| `type` | string | ні (default: `'choice'`) | Тип завдання |
| `difficulty` | `'easy'`\|`'medium'`\|`'hard'` | так | Рівень складності |
| `q` | string | так | Текст запитання |
| `img` | string\|null | ні | URL зображення до питання |
| `code` | string\|null | ні | Псевдокод Равлика (тільки `choice`, `sort`) |
| `explanation` | string | рекомендовано | Пояснення після відповіді |
| `grade` | number | так (1–4) | Клас |
| `isOlympiad` | boolean | так | Тільки для олімпіади чи і для тренування |

Поля `img` та `code` зі значенням `null` або `''` **не зберігаються** в Firestore (умовний spread при записі).

---

## Оцінювання

| Тип | Логіка |
|---|---|
| `choice` | 1 бал якщо `answerIndex === correct` |
| `truefalse` | 1 бал якщо `value === correct` |
| `input` | 1 бал за точний збіг (рядок без регістру / число ±0.001) |
| `sequence` | 1 бал якщо `answerIndex === correct` |
| `sort` | 1 бал за повністю правильний порядок |
| `match` | 1 бал за всі правильні пари |

---

## Зображення

- Поле `img` — URL зовнішнього або власного зображення
- Відображається праворуч від тексту питання (`flex-row`)
- Клік → lightbox (повноекранний перегляд, закривається Escape або кліком на фон)
- Майбутнє: Firebase Storage для завантаження файлів

---

## Архітектура рендерингу

```
utils/question-renderer.js
  └── renderQuestion(q, container, { onAnswer, preview })
        ├── renderChoice
        ├── renderTrueFalse
        ├── renderInput
        ├── renderSort   (+ аліас algorithm)
        ├── renderSequence
        └── renderMatch
```

`student.js` — інтерактивний режим (`onAnswer` callback → score++, showFeedback)  
`admin.js` — preview режим (`preview: true` → підсвічена правильна відповідь, без кліків)
