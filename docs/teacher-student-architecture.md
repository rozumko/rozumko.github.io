# Архітектура Teacher / Student / Olympiad — РОЗУМКО

_Останнє оновлення: 2026-04-29_

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
offline.html                      ← сторінка при відсутності інтернету

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
                                     (race condition захищений через runTransaction)
    results.js                    ← saveOlympiadResult (addDoc → унікальний ID)
    quiz-engine.js                ← loadQuestions (Firestore → JS fallback), getModeConfig
  admin/
    ui.js                         ← re-export utils/ui.js + formatDate
    events-tab.js                 ← loadEvents, buildEventCard, форма події
    teachers-tab.js               ← loadTeachers
    results-tab.js                ← loadResults, exportResultsCSV
    questions-tab.js              ← CRUD питань, форма, preview

utils/
  focus-trap.js                   ← createFocusTrap(el, onClose) → removeTrap
  question-renderer.js            ← renderQuestion(q, container, { onAnswer, preview })
  ui.js                           ← showModal, esc, friendlyError (спільне для всіх сторінок)

data/questions/informatics/
  grade1.js … grade4.js           ← тренувальний банк (fallback)
  grade1-olympiad.js … grade4-olympiad.js  ← олімпіадний банк (fallback)

docs/
  teacher-student-architecture.md ← цей файл
  task-format.md                  ← схеми всіх типів питань

manifest.json                     ← PWA manifest
sw.js                             ← Service Worker: precache, offline fallback
style.css                         ← глобальні стилі (Tailwind CDN + кастомні)
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
  retryAllowed: boolean,
  attemptCount: number,
  lastAnonymousUid: string
}
```
Запис захищений `runTransaction` — race condition неможливий.

### `olympiad_results/{autoId}`
ID генерується Firestore через `addDoc` (немає колізій).
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

### `olympiad_questions/{autoId}`
Основне джерело питань. JS-файли — fallback.
```js
{
  type: 'choice' | 'truefalse' | 'input' | 'sort' | 'sequence' | 'match',
  q: string,
  img: string,               // URL зображення (поле відсутнє якщо немає)
  code: string,              // псевдокод Равлика (поле відсутнє якщо немає)
  explanation: string,
  grade: number,             // 1–4
  difficulty: 'easy' | 'medium' | 'hard',
  isOlympiad: boolean,
  subject: 'informatics',
  // Поля залежно від type — див. docs/task-format.md
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

---

## Firestore Security Rules

- `users`: кожен читає/пише тільки свій профіль; адмін читає всі
- `students`: `get` — будь-який `isSignedIn()`; `list` — тільки вчитель/адмін
- `olympiad_events`: читання — `isSignedIn()`; запис — тільки адмін
- `olympiad_sessions`: читання — адмін/вчитель/анонім; анонім створює та оновлює тільки свою
- `olympiad_results`: читання — адмін або вчитель свої; запис — перевіряється сесія зі статусом `completed` та збіг `studentCode`
- `olympiad_questions`: читання — `isSignedIn()`; запис — тільки адмін

**App Check:** увімкнено (reCAPTCHA v3, site key зберігається в `services/firebase.js`).  
✅ Enforce активний — Secret Key зареєстровано в Firebase App Check.

---

## Безпека

| Загроза | Захист |
|---|---|
| XSS | `esc()` хелпер скрізь де user data → `innerHTML` |
| Race condition (подвійний старт сесії) | `runTransaction` в `session.js` |
| ID collision результатів | `addDoc` (Firestore auto-ID) |
| Code enumeration | Firestore rule: список кодів тільки для свого teacherUid |
| Підробка score | Firestore rule: результат приймається тільки якщо сесія `completed` |
| App Check | reCAPTCHA v3 Enforce ✅ |

---

## Доступність (WCAG 2.2)

- `skip-link` на всіх сторінках
- Focus trap у всіх модальних вікнах (`utils/focus-trap.js`)
- `aria-label` на інтерактивних елементах без видимого тексту (↑/↓, select у match)
- `prefers-reduced-motion` — анімації вимкнені
- `role="dialog" aria-modal="true"` на всіх модалях
- `aria-live="polite"` на feedback після відповіді

---

## PWA

- `manifest.json` підключено на `index.html` і `student.html`
- `theme_color`, іконки (192×192, 512×512)
- Service Worker: `sw.js` — precache shell, network-first навігація, offline.html fallback

---

## localStorage — Резервна копія квізу

Під час олімпіади після кожної відповіді зберігається:
```js
localStorage['rozumko_quiz_backup'] = {
  sessionId, mode, currentIdx, score, secondsLeft, startedAt, meta
}
```
Backup валідний 3 години. При успішному збереженні результату — видаляється.  
При невдачі збереження — учень бачить повідомлення з кодом і результатом для вчителя.

---

## Що реалізовано ✅

### Auth
- Admin, Teacher (вхід + реєстрація), Student (код → anonymous)

### Кабінет вчителя
- Створення класів, генерація кодів (`СЛОВО999`, 22 тварини)
- Деактивація/активація кодів кнопкою (toggle)
- Поле імені учня на чипі (автозбереження 800ms debounce)
- Результати з назвою події (не eventId)

### Адмін-панель
- Статистика (4 лічильники через `getCountFromServer`)
- Олімпіади: CRUD, статуси `draft → active → archived`
- Вчителі: список з email, школою, кількістю класів
- Результати: всі результати, CSV-експорт, назва події
- **Питання**: повний CRUD, фільтри (клас/тип/складність), дублювання, імпорт з JS-файлів
- **Preview питання**: кнопка «Переглянути» у формі → рендер через `question-renderer.js`
- **Рефакторинг**: `admin.js` (661 рядок) розбито на 5 feature-модулів у `features/admin/`

### Quiz — типи питань
- `choice` — 4 варіанти, підсвітка правильного/неправильного
- `truefalse` — кнопки «Так» / «Ні»
- `input` — текстове/числове поле, Enter для підтвердження
- `sort` — блоки з кнопками ↑/↓, перевірка повного порядку
- `sequence` — послідовність з «?» + 4 варіанти
- `match` — ліво→select (перемішаний правий стовпець)

### Quiz — загальне
- Три режими: `practice`, `demo`, `olympiad`
- Питання: Firestore (primary) → JS-модулі (fallback)
- Поле `img` — зображення праворуч від тексту, клік → lightbox
- Поле `code` — псевдокод Равлика в `<pre>` блоці
- Прогрес-бар, таймер, підсвітка відповідей, пояснення
- localStorage backup при олімпіаді

### Банк питань
- 15 питань × 4 класи (тренування) = 60
- 12 питань × 4 класи (олімпіада) = 48
- Всі 108 імпортовані у Firestore

---

## Що залишилось / Технічний борг

### 🔴 Безпека
- ✅ App Check Enforce активний

### 🟡 Функціонал
- ✅ `offline.html` — сторінка при відсутності інтернету
- ✅ Service Worker (`sw.js`) — кешує статику, network-first для HTML, cache-first для ресурсів
- ✅ Error boundary в `student.js` — `unhandledrejection` + `error` → overlay з даними для вчителя
- Fullscreen для олімпіади (`requestFullscreen` при старті)
- Firebase Storage для зображень (зараз тільки URL)

### 🟡 Стилі
- Централізовані CSS design tokens (CSS custom properties)
- Міграція з Tailwind CDN на власний `style.css` без зовнішніх залежностей

### 🟢 Майбутнє
- Cloudflare Pages + D1 міграція
- Сертифікати (PDF або друк)
- Голосовий ввід для типу `input`
- Fullscreen для олімпіади (`requestFullscreen` при старті)
