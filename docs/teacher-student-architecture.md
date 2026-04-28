# Архітектура Teacher / Student / Olympiad — РОЗУМКО

_Останнє оновлення: 2026-04-28_

---

## Інфраструктура

| Зараз (розробка) | Ціль (продакшен) |
|---|---|
| GitHub Pages | Cloudflare Pages |
| Firebase Auth + Firestore | Cloudflare D1 + власний auth або Firebase |

**Принципи портабельності для майбутньої міграції:**
- Firebase-звернення ізольовані в `services/` — при міграції міняється тільки цей шар
- `onSnapshot` не використовується — тільки одноразові запити (GET-сумісно)
- Структури колекцій Firestore проєктовані як плоскі таблиці (сумісно з D1)
- Логіка auth і сесій не прив'язана до Firebase SDK у UI-коді

---

## Ролі та сторінки

| Роль | Сторінка | Auth |
|---|---|---|
| Admin | `admin.html` | email/password + перевірка `role==='admin'` у Firestore |
| Teacher | `teacher.html` | email/password + перевірка `role==='teacher'` |
| Student | `student.html` | код доступу → `signInAnonymously()` |
| Гість | `student.html` | без коду — тільки тренування |
| — | `index.html` | лендінг, вибір ролі |

---

## Структура файлів (реалізовано)

```
index.html                        ← лендінг
student.html + student.js         ← учень: код, тренування, quiz
teacher.html + teacher.js         ← вчитель: класи, коди, результати
admin.html + admin.js             ← адмін: події, вчителі, статистика

services/
  firebase.js                     ← ініціалізація Firebase, re-export
  stats.js                        ← getCountFromServer по колекціях
  events.js                       ← CRUD olympiad_events
  teacher-data.js                 ← класи, генерація кодів, результати вчителя

features/
  auth/
    admin-auth.js                 ← loginAdmin, logoutAdmin, onAdminAuthChanged
    teacher-auth.js               ← loginTeacher, registerTeacher, onTeacherAuthChanged
    student-code-auth.js          ← validateStudentCode, startAnonymousSession
  olympiad/
    session.js                    ← findActiveEvent, checkSession, startSession, finishSession
    results.js                    ← saveOlympiadResult
    quiz-engine.js                ← loadQuestions, getModeConfig

data/questions/informatics/
  grade1.js … grade4.js           ← { q, a[], correct, explanation, difficulty }
```

---

## Колекції Firestore (фінальна схема)

### `users/{uid}`
```js
{
  role: 'admin' | 'teacher',
  email: string,
  school: string,          // тільки для teacher
  classes: [               // тільки для teacher
    { id: string, grade: number, name: string }
  ],
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### `students/{code}`
Ідентифікатор = код доступу, наприклад `КІТ247`.
Без ПІБ, email або будь-яких персональних даних дитини.
```js
{
  code: 'КІТ247',
  grade: 3,
  classId: 'uid_1234567890',
  teacherUid: 'uid...',
  isActive: true,
  retryAllowed: false,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### `olympiad_events/{eventId}`
```js
{
  title: 'Весняна олімпіада 2026',
  subject: 'informatics',
  questionsCount: 10,
  timeMinutes: 15,
  allowRetry: false,
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
  penalizedCount: number,
  mode: 'olympiad',
  completedAt: Timestamp,
  sessionId: string
}
```

---

## Поточні Firestore rules (тимчасові — НЕ для продакшену)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAdmin() {
      return request.auth != null
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    function isTeacher() {
      return request.auth != null
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'teacher';
    }

    match /{document=**} {
      allow read, write: if isAdmin();
    }

    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    match /students/{studentCode} {
      allow read: if request.auth != null;
      allow write: if isTeacher();
    }

    match /olympiad_sessions/{sessionId} {
      allow read, write: if request.auth != null;
    }

    match /olympiad_results/{resultId} {
      allow read, write: if request.auth != null;
    }

    match /olympiad_events/{eventId} {
      allow read: if request.auth != null;
      allow write: if isAdmin();
    }
  }
}
```

---

## Що реалізовано (станом на 2026-04-28)

### ✅ Фаза 1 — структура сторінок
- `index.html` — лендінг з вибором ролі
- `student.html` — вхід за кодом + тренування
- `teacher.html` — кабінет вчителя
- `admin.html` — адмін-панель
- Firebase підключено, конфіг в `services/firebase.js`

### ✅ Auth (всі три ролі)
- Admin: вхід + перевірка ролі в Firestore
- Teacher: вхід + реєстрація + запис профілю
- Student: код → `validateStudentCode` → `signInAnonymously` → `sessionStorage`

### ✅ Кабінет вчителя
- Створення класів (назва + клас 1–4)
- Генерація кодів учнів: формат `СЛОВО999` (22 українські тварини ≤4 букв, число 100–999)
- Список кодів з бейджем активності, кнопка «Копіювати всі»
- Перегляд результатів олімпіади по своїх учнях

### ✅ Фаза 2 — Олімпіадний режим
- `quiz-engine.js`: завантаження питань з grade-файлів, перемішування, `getModeConfig`
- `session.js`: пошук активної події, перевірка/створення/завершення сесії
- `results.js`: збереження в `olympiad_results`
- Quiz UI: прогрес-бар, таймер (червоніє на останній хвилині), підсвітка відповідей, пояснення в тренуванні
- Захист від повторного запуску через `olympiad_sessions`
- Три режими: `practice` (тренування), `demo` (без збереження), `olympiad` (з записом)

### ✅ Адмін-панель
- Статистика: 4 лічильники через `getCountFromServer` (не читає документи)
- Олімпіадні події: створення форми, збереження в Firestore, статуси `draft → active → archived`
- Вкладки: Огляд / Олімпіади / Вчителі / Результати

---

## Що залишилось (наступні фази)

### 🔴 Критично (безпека)
1. **Firestore rules — продакшен версія**
   - Обмежити запис результату: тільки анонімний uid з активною сесією
   - Обмежити читання результатів: вчитель бачить тільки `teacherUid == uid`
   - Валідація полів при записі

### 🟡 Важливо (функціонал)
2. **Quiz параметри з Firestore**
   - Зараз `getModeConfig()` повертає hardcoded значення
   - Треба брати `questionsCount` і `timeMinutes` з активної `olympiad_events` події
3. **Деактивація кодів у кабінеті вчителя**
   - `toggleStudentActive()` є в сервісі — треба додати кнопку в UI чіпі коду
4. **Адмін: вкладка Вчителі**
   - Завантажити список з Firestore (`role === 'teacher'`), показати школу, кількість класів
5. **Адмін: вкладка Результати**
   - Таблиця всіх результатів з фільтром по події та класу
   - Експорт CSV

### 🟢 Бажано (UX та надійність)
6. **Fullscreen для олімпіади** — `requestFullscreen()` при старті, вихід = попередження
7. **Платіжні посилання** — генерація унікального токена на кожен код учня
8. **Офлайн-стійкість** — показ зрозумілої помилки якщо Firebase недоступний
9. **Підготовка до Cloudflare** — замінити `services/firebase.js` на `services/db.js` з абстрактним інтерфейсом

---

## Критерій готовності до першого запуску олімпіади

- [ ] Firestore rules — продакшен версія
- [ ] Quiz читає параметри з `olympiad_events`
- [ ] Вчитель може деактивувати код
- [ ] Адмін бачить всі результати
- [ ] Протестований повний flow: вчитель → код → учень → результат → адмін бачить
