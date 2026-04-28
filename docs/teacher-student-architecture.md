# Архітектура Teacher / Student / Olympiad

## Інфраструктура та міграція

**Поточна:** GitHub Pages + Firebase Auth + Firestore (для розробки і тестування).

**Цільова:** Cloudflare Pages + Cloudflare D1.

Всі архітектурні рішення мають враховувати майбутню міграцію:
- Firebase-звернення ізолювати в окремому шарі даних (`services/db.js`), щоб при міграції міняти лише цей модуль
- Логіку сесій та автентифікації проєктувати як стандартні HTTP-операції (GET/POST), не як Firebase-специфіку
- Структуру колекцій Firestore проєктувати сумісно з реляційними таблицями D1
- Не використовувати Firebase Realtime Database або Firebase-специфічні підписки (onSnapshot) там, де можна обійтись одноразовим запитом

## Мета

Цей документ фіксує цільову структуру даних і потоки доступу для сайту онлайн-олімпіади РОЗУМКО.
Принцип проєкту: система зберігає мінімум персональних даних про дітей і чітко розділяє ролі вчителя та учня.

## Основні принципи

- Учень не створює персональний акаунт через email або Google.
- Учень входить за коротким кодом доступу, який видає вчитель.
- Вчитель працює через окремий кабінет з email/password.
- Дані учня мають бути псевдонімізовані: код, клас, належність до вчителя або класу.
- Олімпіада має окрему модель результатів і окрему політику повторного проходження.

## Ролі

### Admin (організатор олімпіади)

- Автентифікація: Firebase Auth `email/password` + перевірка `role === 'admin'` у Firestore
- Документ профілю: `users/{adminUid}` з `{ role: 'admin' }`
- Сторінка: `admin.html` (посилання не публікується публічно)
- Права:
  - читати і писати все (`users`, `students`, `olympiad_events`, `olympiad_sessions`, `olympiad_results`)
  - створювати і архівувати олімпіадні події
  - завантажувати завдання до події
  - переглядати всіх вчителів і всі результати
  - експортувати результати в CSV

### Teacher

- Автентифікація: Firebase Auth `email/password`
- Документ профілю: `users/{teacherUid}`
- Права:
  - бачити лише свої класи, свої коди, свої результати
  - створювати і деактивувати учнівські коди
  - скидати спробу або дозволяти повторний запуск

### Student

- Автентифікація: `signInAnonymously()`
- Ідентифікатор сесії: анонімний Firebase `uid`
- Код доступу: зберігається в `sessionStorage`
- Права:
  - прочитати власний запис за кодом
  - записати лише власний результат олімпіади
  - не мати доступу до чужих результатів або кабінету вчителя

## Колекції Firestore

### `users/{teacherUid}`

```js
{
  role: 'teacher',
  email: 'teacher@example.com',
  school: 'Ліцей №1',
  classes: [
    { id: '4-a', grade: 4, name: '4-А' }
  ],
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### `students/{studentCode}`

Ідентифікатор документа дорівнює коду доступу, наприклад `ОРЕЛ-47`.

```js
{
  code: 'ОРЕЛ-47',
  grade: 4,
  classId: '4-a',
  teacherUid: 'teacherUid123',
  isActive: true,
  retryAllowed: false,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### `olympiad_sessions/{sessionId}`

Окрема колекція для керування правом на один запуск.

Рекомендований `sessionId`:

```txt
{studentCode}_{eventId}
```

Приклад:

```js
{
  eventId: 'spring-2026',
  studentCode: 'ОРЕЛ-47',
  teacherUid: 'teacherUid123',
  grade: 4,
  startedAt: Timestamp,
  finishedAt: Timestamp | null,
  status: 'started' | 'completed' | 'blocked',
  attemptCount: 1,
  lastAnonymousUid: 'firebase-anon-uid'
}
```

### `olympiad_results/{resultId}`

Результат не повинен перезаписуватися випадково. Краще зберігати окремий результат і посилання на сесію.

Рекомендований `resultId`:

```txt
{studentCode}_{eventId}_{timestamp}
```

```js
{
  eventId: 'spring-2026',
  studentCode: 'ОРЕЛ-47',
  teacherUid: 'teacherUid123',
  grade: 4,
  score: 8,
  totalQuestions: 10,
  timeSpentSeconds: 731,
  penalizedCount: 1,
  mode: 'olympiad',
  completedAt: Timestamp,
  sessionId: 'ОРЕЛ-47_spring-2026'
}
```

## Події та конфігурація

Щоб не зашивати параметри олімпіади в клієнтський код, бажано винести їх у Firestore.

### `olympiad_events/{eventId}`

```js
{
  title: 'Весняна олімпіада 2026',
  subject: 'informatics',
  difficulty: 'hard',
  questionsCount: 10,
  timeMinutes: 15,
  allowRetry: false,
  status: 'draft' | 'active' | 'archived',
  activeFrom: Timestamp,
  activeTo: Timestamp
}
```

Тоді клієнт не вгадує правила, а читає активну подію.

## Потоки користувача

### Teacher flow

1. Вчитель входить через email/password.
2. Система читає `users/{teacherUid}` і перевіряє `role === 'teacher'`.
3. Вчитель бачить список класів, коди доступу та результати.
4. Вчитель створює нові записи в `students`.

### Student flow

1. Учень відкриває сторінку учнівського входу.
2. Учень вводить код доступу.
3. Клієнт знаходить `students/{studentCode}`.
4. Система запускає `signInAnonymously()`.
5. Код зберігається тільки в `sessionStorage`.
6. Перед стартом олімпіади клієнт перевіряє `olympiad_sessions/{studentCode}_{eventId}`.
7. Якщо статус уже `completed` і `allowRetry === false`, повторний запуск блокується.
8. Після завершення записуються `olympiad_results` і `olympiad_sessions`.

## Що має змінитися в клієнтській архітектурі

### Поточна проблема

Зараз один і той самий сценарій намагається обслуговувати:

- гостьовий вхід
- анонімний вхід
- email/password
- Google sign-in
- тренування
- іспит

Для олімпіади це занадто змішано.

### Цільовий поділ

Потрібно виділити окремі модулі:

- `features/auth/teacher-auth.js`
- `features/auth/student-code-auth.js`
- `features/olympiad/session.js`
- `features/olympiad/results.js`
- `features/teacher/dashboard.js`

Також стан тесту краще перевести на декларативну конфігурацію:

```js
const MODE_CONFIG = {
  practice: {
    difficulty: null,
    questionsCount: 5,
    timeMinutes: null,
    requiresFullscreen: false
  },
  exam: {
    difficulty: null,
    questionsCount: 5,
    timeMinutes: 5,
    requiresFullscreen: true
  },
  olympiad: {
    difficulty: 'hard',
    questionsCount: 10,
    timeMinutes: 15,
    requiresFullscreen: true,
    singleAttempt: true,
    saveCollection: 'olympiad_results'
  }
};
```

## Мінімальний набір Firestore rules

Нижче не фінальні правила, а каркас, від якого варто відштовхуватися.

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    match /students/{studentCode} {
      allow read: if request.auth != null;
      allow write: if false;
    }

    match /olympiad_sessions/{sessionId} {
      allow read, write: if request.auth != null;
    }

    match /olympiad_results/{resultId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Для продакшену ці правила треба деталізувати через:

- перевірку ролі вчителя
- перевірку `teacherUid`
- валідацію полів документа
- обмеження на створення результату лише для дозволеного `studentCode`

## Рекомендований порядок впровадження

1. Завершити Фазу 1 стабілізації.
2. Додати `MODE_CONFIG` і третій режим `olympiad` без UI кабінету вчителя.
3. Додати структуру `olympiad_events`, `olympiad_sessions`, `olympiad_results`.
4. Реалізувати вхід учня за кодом.
5. Додати кабінет вчителя для генерації кодів і перегляду результатів.
6. Написати і перевірити `firestore.rules`.

## Критерій готовності архітектури

Архітектура вважається готовою до запуску, коли:

- учень може пройти олімпіаду без email і пароля
- вчитель бачить тільки свої результати
- повторний запуск контролюється серверною моделлю, а не лише клієнтом
- результат олімпіади зберігається окремо від тренувального прогресу
- у системі немає ПІБ, email або інших зайвих даних про дитину
