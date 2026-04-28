# Архітектура Teacher / Student / Olympiad — РОЗУМКО

_Останнє оновлення: 2026-04-28_

---

## Інфраструктура

| Зараз | Ціль (майбутнє) |
|---|---|
| GitHub Pages + Firebase Auth + Firestore | Cloudflare Pages + D1 |

**Принципи портабельності:**
- Firebase-звернення ізольовані в `services/` — при міграції міняється тільки цей шар
- `onSnapshot` не використовується — тільки одноразові запити (GET-сумісно)
- Структури колекцій Firestore проєктовані як плоскі таблиці (сумісно з D1)

---

## Ролі та сторінки

| Роль | Сторінка | Auth |
|---|---|---|
| Admin | `admin.html` | email/password + перевірка `role==='admin'` у Firestore |
| Teacher | `teacher.html` | email/password + перевірка `role==='teacher'` |
| Student | `student.html` | код доступу → `signInAnonymously()` |
| Гість | `student.html` | без коду — тільки тренування |

---

## Структура файлів

```
index.html                        ← лендінг
student.html + student.js         ← учень: код, тренування, quiz
teacher.html + teacher.js         ← вчитель: класи, коди, результати
admin.html + admin.js             ← адмін: події, питання, вчителі, результати

services/
  firebase.js                     ← ініціалізація Firebase + App Check (reCAPTCHA v3)
  stats.js                        ← getCountFromServer по колекціях
  events.js                       ← CRUD olympiad_events
  teacher-data.js                 ← класи, генерація кодів, результати, toggle/name
  questions.js                    ← CRUD olympiad_questions (Firestore)
  admin-data.js                   ← getAllTeachers, getAllResults

features/
  auth/
    admin-auth.js                 ← loginAdmin, logoutAdmin, onAdminAuthChanged
    teacher-auth.js               ← loginTeacher, registerTeacher, onTeacherAuthChanged
    student-code-auth.js          ← validateStudentCode, startAnonymousSession
  olympiad/
    session.js                    ← findActiveEvent, checkSession, startSession, finishSession
    results.js                    ← saveOlympiadResult
    quiz-engine.js                ← loadQuestions (Firestore → JS fallback), getModeConfig

data/questions/informatics/
  grade1.js … grade4.js           ← тренувальний банк (fallback)
  grade1-olympiad.js … grade4-olympiad.js  ← олімпіадний банк (fallback)
```

---

## Колекції Firestore

### `users/{uid}`
```js
{
  role: 'admin' | 'teacher',
  email: string,
  school: string,          // тільки для teacher
  classes: [{ id, grade, name }],
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### `students/{code}`
Ідентифікатор = код доступу (`КІТ247`). Без ПІБ або email дитини.
```js
{
  code: string,
  grade: number,
  classId: string,
  teacherUid: string,
  eventId: string,           // прив'язка до олімпіади при генерації
  isActive: boolean,
  studentName: string,       // необов'язково, вчитель вписує для сертифіката
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### `olympiad_events/{eventId}`
```js
{
  title: string,
  subject: 'informatics',
  questionsCount: number,
  timeMinutes: number,
  allowRetry: boolean,
  status: 'draft' | 'active' | 'archived',
  activeFrom: Timestamp,
  activeTo: Timestamp,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### `olympiad_sessions/{studentCode}_{eventId}`
```js
{
  eventId: string,
  studentCode: string,
  teacherUid: string,
  grade: number,
  startedAt: Timestamp,
  finishedAt: Timestamp | null,
  status: 'started' | 'completed' | 'blocked',
  attemptCount: number,
  lastAnonymousUid: string
}
```

### `olympiad_results/{studentCode}_{eventId}_{timestamp}`
```js
{
  eventId: string,
  studentCode: string,
  teacherUid: string,
  grade: number,
  score: number,
  totalQuestions: number,
  timeSpentSeconds: number,
  mode: 'olympiad',
  completedAt: Timestamp,
  sessionId: string
}
```

### `olympiad_questions/{id}`
Основне джерело питань (керується адміном). JS-файли — fallback.
```js
{
  q: string,
  code: string | null,       // псевдокод Равлика
  a: string[],               // 4 варіанти
  correct: number,           // індекс правильного
  explanation: string,
  grade: number,             // 1–4
  difficulty: 'easy' | 'medium' | 'hard',
  isOlympiad: boolean,
  subject: 'informatics',
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

---

## Firestore Security Rules (продакшен)

- `users`: кожен читає/пише тільки свій профіль; адмін читає всі
- `students`: `get` — будь-який `isSignedIn()`; `list` — тільки вчитель/адмін
- `olympiad_events`: читання — `isSignedIn()`; запис — тільки адмін
- `olympiad_sessions`: читання — адмін/вчитель/анонім; анонім створює та оновлює тільки свою
- `olympiad_results`: читання — адмін або вчитель свої; запис — перевіряється сесія зі статусом `completed` та збіг `studentCode`
- `olympiad_questions`: читання — `isSignedIn()`; запис — тільки адмін

**App Check:** увімкнено Enforce для Firestore через reCAPTCHA v3.

---

## Що реалізовано ✅

### Auth
- Admin, Teacher (вхід + реєстрація), Student (код → anonymous)

### Кабінет вчителя
- Створення класів, генерація кодів (`СЛОВО999`, 22 тварини)
- Деактивація/активація кодів кнопкою (toggle)
- Поле імені учня на чипі (автозбереження, для сертифікатів)
- Результати з назвою події (не eventId)

### Адмін-панель
- Статистика (4 лічильники через `getCountFromServer`)
- Олімпіади: CRUD, статуси `draft → active → archived`
- Вчителі: список з email, школою, кількістю класів
- Результати: всі результати, CSV-експорт, назва події
- **Питання**: повний CRUD, фільтри (клас/тип/складність), дублювання, імпорт з JS-файлів

### Quiz
- Три режими: `practice`, `demo`, `olympiad`
- Питання: Firestore (primary) → JS-модулі (fallback)
- Поле `code` — псевдокод Равлика в `<pre>` блоці
- Прогрес-бар, таймер, підсвітка відповідей, пояснення

### Банк питань
- 15 питань × 4 класи (тренування) = 60
- 12 питань × 4 класи (олімпіада) = 48
- Всі 108 імпортовані у Firestore

### Безпека
- XSS: `esc()` хелпер скрізь де user data → `innerHTML`
- Firestore rules: валідація запису результату через сесію
- App Check (reCAPTCHA v3): Enforced

---

## Що залишилось

### 🟡 Функціонал
- Fullscreen для олімпіади (`requestFullscreen` при старті)
- Нові типи питань: `sort`, `sequence`, `match` (рендерери + оцінювання)
- Офлайн-помилка якщо Firebase недоступний

### 🟢 Майбутнє
- Cloudflare Pages + D1 міграція
- Сертифікати (PDF або друк)
