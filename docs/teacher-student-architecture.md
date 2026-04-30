# Архітектура Розумко — Повна технічна документація

_Останнє оновлення: 2026-04-30_

---

## 🔑 Для наступного AI-агента — читай спочатку

### Контекст проєкту
Розумко — онлайн-олімпіада з інформатики для учнів 1–4 класів. Статичний сайт: HTML + CSS + vanilla JS + Firebase. **Без фреймворків навмисно** — аудиторія молодші школярі, потрібна максимальна простота і швидкість.

### Що щойно було зроблено (великий рефакторинг + аудит CSS)
1. **Видалено Tailwind CDN** з усіх 4 сторінок (`index.html`, `student.html`, `teacher.html`, `admin.html`)
2. **CSS design tokens** винесено в окремий `tokens.css` — єдине місце для всіх `--clr-*`, `--sp-*`, `--r-*`, `--adm-*`
3. **Усі Tailwind utility-рядки у JS** замінені на семантичні BEM-класи
4. **`utils/ui.js`** — централізований `showModal`, `esc`, `friendlyError`
5. **`admin.js` → 5 feature-модулів** у `features/admin/`
6. **Error boundary** в `student.js` + **offline.html** + **sw.js** Service Worker
7. **Loading overlay** при старті квізу (`#quiz-loading-overlay`)
8. **CSS аудит:** видалено aliases-блок (~110 рядків), мертвий код (~120 рядків), дубліти — style.css: 2800 → 2368 рядків
9. **Уніфіковано картки:** `.class-form-card`, `.class-card`, `.empty-state`, `.result-row` — спільна база; аналогічно для dark-карток admin
10. **Видалено JS fallback** у `quiz-engine.js` і папку `data/questions/informatics/` (8 файлів — старі типи `choice`/`truefalse`, несумісні з новими типами Firestore)
11. **Видалено кнопку "Імпорт з JS"** в адмін-панелі (небезпечно — дублювало б Firestore дані)
12. **Fullscreen** при старті олімпіади (`requestFullscreen` + `exitFullscreen`)
13. **Захист від повторного проходження** — localStorage `rozumko_done_{code}_{eventId}` + Firestore session check як другий рубіж

### Критичні правила роботи з цим проєктом
- **НЕ додавай Tailwind** — він видалений навмисно
- **НЕ додавай `:root {}` в `style.css`** — всі токени живуть виключно в `tokens.css`
- **НЕ використовуй фреймворки** — React, Vue тощо тут надлишок
- **Зміни CSS через токени** — не хардкодь кольори/відступи, використовуй `var(--clr-*)`, `var(--sp-*)`
- **НЕ повертай JS fallback** у `quiz-engine.js` — він видалений навмисно (JS файли мали старі типи, несумісні з Firestore-питаннями)
- **Читай тільки файли, які потрібні для задачі** — проєкт має обмеження по токенах

### Патерни, які використовуються скрізь
```js
// Показ/приховання overlay — через клас .active (НЕ .hidden + .flex)
function showOverlay(el) { el.classList.add('active'); }
function hideOverlay(el) { el.classList.remove('active'); }

// Кнопки вибору (grade/difficulty) — через aria-pressed + CSS
btn.setAttribute('aria-pressed', 'true');  // CSS: [aria-pressed="true"] { background: ... }

// Loading state при async-операціях
showLoading();   // показує #quiz-loading-overlay
// ... await ...
hideLoading();   // ховає overlay
```

### Відомі тонкощі (де легко зламати)
1. **`.hidden { display: none !important; }`** — є в style.css Reset. Якщо елемент не ховається, перевір чи не конфліктує з `.active` або inline style
2. **`utils/ui.js` — lazy init** `showModal` використовує `getModal()` замість прямого `document.getElementById` бо модуль може завантажуватись на сторінках без `#app-modal`
3. **teacher.html + teacher.js:** при показі дашборду JS додає `teacher-dashboard-active` на `body` — це скасовує flex-центрування auth-сторінки. Якщо дашборд виглядає стиснутим — шукай тут
4. **Шаблони в teacher.html:** querySelector в JS використовує **обидва** класи — старий (`class-card-header`) і BEM (`class-card__header`). В шаблоні мають бути обидва. Якщо класи не рендеряться — перевір що querySelector знаходить елемент
5. **`btn-next` в квізі:** базово `display: inline-block`, ховається через `.hidden`. НЕ через `.visible` — цей клас видалений
6. **Селектори grade/diff кнопок:** `[data-grade]` і `[data-difficulty]` (НЕ `.grade-btn` / `.diff-btn` — такі класи не існують)
7. **`quizFeedback.className`** — встановлюється як `'quiz-feedback quiz-feedback--correct'` або `'quiz-feedback quiz-feedback--incorrect'`. НЕ Tailwind-рядки
8. **Fullscreen:** `enterFullscreen()` / `exitFullscreen()` в `student.js` — викликаються тільки для режиму `olympiad`. Браузер може відхилити запит якщо не було user gesture — це не критично, `try/catch` є
9. **Захист від повтору:** ключ localStorage `rozumko_done_{code}_{eventId}` встановлюється після `finishSession` + `clearQuizBackup`. Якщо збереження в Firestore не вдалось — ключ НЕ встановлюється (щоб учень міг спробувати ще раз коли з'явиться мережа)

---

## Інфраструктура

| Зараз | Ціль (майбутнє) |
|---|---|
| GitHub Pages + Firebase Auth + Firestore | Cloudflare Pages + D1 |

**Принципи портабельності:**
- Firebase-звернення ізольовані в `services/` — при міграції міняється тільки цей шар
- `onSnapshot` не використовується — тільки одноразові запити (GET-сумісно з REST)
- Структури Firestore проєктовані як плоскі таблиці (сумісно з SQL/D1)

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
index.html                        ← лендінг (Tailwind видалено ✅)
student.html + student.js         ← учень: код, тренування, quiz (Tailwind видалено ✅)
teacher.html + teacher.js         ← вчитель: класи, коди, результати (Tailwind видалено ✅)
admin.html + admin.js             ← адмін: події, питання, вчителі, результати (Tailwind видалено ✅)
offline.html                      ← сторінка при відсутності інтернету ✅

tokens.css                        ← ВСІ CSS custom properties (єдине місце!)
                                     - Спільні: --clr-*, --sp-*, --r-*, --shadow-*, --transition-*, --font-*
                                     - Student: --student-bg-from/to, --clr-violet-*, --clr-amber-*
                                     - Teacher: --clr-sky-*, --clr-emerald-*
                                     - Admin: --adm-* (dark theme)
                                     Підключається ПЕРЕД style.css у всіх 9 HTML файлах

style.css                         ← ~2368 рядків, БЕЗ Tailwind, БЕЗ :root блоків, 8 секцій:
                                     1. (посилання на tokens.css)
                                     2. Reset/Base (.hidden, scroll)
                                     3. Accessibility (skip-link, sr-only, prefers-reduced-motion)
                                     4. Shared UI (.btn, .app-modal-overlay, @keyframes)
                                     5. Index page
                                     6. Student page (quiz, overlays, loading)
                                     7. Teacher page (auth, dashboard, class cards, codes)
                                     8. Admin page (dark theme, stats, question form)
                                     Групові базові селектори для карток:
                                       .class-form-card,.class-card,.empty-state,.result-row { спільна база }
                                       .event-card,.question-item,.admin-result-row,.admin-teacher-row { спільна база }

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
    quiz-engine.js                ← loadQuestions (тільки Firestore, БЕЗ fallback), getModeConfig
  admin/
    ui.js                         ← re-export utils/ui.js + formatDate (специфічна для адміна)
    events-tab.js                 ← loadEvents, buildEventCard, форма події
    teachers-tab.js               ← loadTeachers
    results-tab.js                ← loadResults, exportResultsCSV
    questions-tab.js              ← CRUD питань, форма, preview, applyTypeUI

utils/
  focus-trap.js                   ← createFocusTrap(el, onClose) → removeTrap
  question-renderer.js            ← renderQuestion(q, container, { onAnswer, preview })
                                     CLS: quiz-option, quiz-option--correct/--incorrect
  ui.js                           ← showModal (lazy init!), esc, friendlyError

sw.js                             ← Service Worker: precache, network-first nav, offline fallback
manifest.json                     ← PWA manifest
```

---

## CSS Design Tokens (`tokens.css`)

Всі токени — в одному файлі `tokens.css`, підключається першим у всіх HTML.  
**Щоб змінити колір або відступ — правь тільки `tokens.css`.**

```css
:root {
  /* Бренд і ролі */
  --clr-brand: #3b82f6;
  --clr-student: #10b981;  --clr-teacher: #0ea5e9;

  /* Нейтральна палітра */
  --clr-surface: #fff; --clr-surface-muted: #f8fafc; --clr-surface-subtle: #f1f5f9;
  --clr-border: #e2e8f0; --clr-text: #0f172a;
  --clr-text-muted: #64748b; --clr-text-faint: #94a3b8;

  /* Статуси */
  --clr-success: #22c55e; --clr-danger: #ef4444; --clr-warning: #f59e0b;

  /* Spacing: --sp-1 … --sp-12 (4px–48px) */
  /* Radius:  --r-sm … --r-2xl, --r-full */
  /* Тіні:   --shadow-sm, --shadow-btn, --shadow-card */
  /* Типографіка: --font-size-xs … --font-size-5xl, --font-family */
  /* Transitions: --transition-fast(150ms), --transition-base(200ms), --transition-slow(300ms) */

  /* Акценти student.html */
  --student-bg-from: #4c1d95; --student-bg-to: #1e40af;
  --clr-violet: #7c3aed; --clr-amber: #fbbf24;

  /* Акценти teacher.html */
  --clr-sky: #0ea5e9; --clr-sky-dark: #0284c7; --clr-sky-light: #e0f2fe;
  --clr-emerald: #10b981; --clr-emerald-dark: #059669; --clr-emerald-light: #d1fae5;

  /* Admin dark theme */
  --adm-bg: #0f172a; --adm-surface: #1e293b; --adm-border: #334155;
  --adm-text: #f1f5f9; --adm-text-muted: #94a3b8; --adm-sky: #38bdf8;
}
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
  code, grade, classId, teacherUid, eventId,
  isActive: boolean,
  studentName: string,       // необов'язково
  createdAt, updatedAt
}
```

### `olympiad_events/{eventId}`
```js
{
  title, subject: 'informatics', questionsCount, timeMinutes,
  allowRetry: boolean,
  status: 'draft' | 'active' | 'archived',
  activeFrom: Timestamp, activeTo: Timestamp,
  createdAt, updatedAt
}
```

### `olympiad_sessions/{studentCode}_{eventId}`
```js
{
  eventId, studentCode, teacherUid, grade,
  startedAt, finishedAt,
  status: 'started' | 'completed' | 'blocked',
  retryAllowed, attemptCount, lastAnonymousUid
}
```
⚠️ Захищений `runTransaction` — подвійний старт сесії неможливий.

### `olympiad_results/{autoId}`
```js
{
  eventId, studentCode, teacherUid, grade,
  score, totalQuestions, timeSpentSeconds,
  mode: 'olympiad', completedAt, sessionId
}
```

### `olympiad_questions/{autoId}`
```js
{
  type: 'choice' | 'truefalse' | 'input' | 'sort' | 'sequence' | 'match',
  q, img?, code?, explanation,
  grade: 1|2|3|4, difficulty: 'easy'|'medium'|'hard',
  isOlympiad: boolean, subject: 'informatics',
  // type-specific fields → docs/task-format.md
  createdAt, updatedAt
}
```

---

## Безпека

| Загроза | Захист |
|---|---|
| XSS | `esc()` скрізь де user data → `innerHTML` |
| Race condition (подвійний старт) | `runTransaction` в `session.js` |
| ID collision результатів | `addDoc` (Firestore auto-ID) |
| Code enumeration | Firestore rule: список кодів тільки для свого teacherUid |
| Підробка score | Firestore rule: результат тільки якщо сесія `completed` |
| App Check | reCAPTCHA v3 Enforce ✅ активний |

---

## PWA / Offline

- `sw.js` — Service Worker: precache shell, network-first для навігації, cache-first для статики
- При відсутності мережі → `offline.html` (показує backup з localStorage якщо є)
- `localStorage['rozumko_quiz_backup']` — зберігається після кожної відповіді під час олімпіади, TTL 3 год

---

## Доступність (WCAG 2.2)

- `skip-link` на всіх сторінках
- Focus trap у всіх модалях (`utils/focus-trap.js`)
- `aria-pressed` для toggle-кнопок (grade/diff селектори в тренуванні)
- `aria-live="polite"` на feedback після відповіді
- `prefers-reduced-motion` — анімації вимкнені
- `role="dialog" aria-modal="true"` на всіх модалях

---

## Quiz — режими та конфіг

```js
// features/olympiad/quiz-engine.js → getModeConfig(mode, event)
practice:  { count: 10, timeMinutes: null, showExplanation: true,  saveResult: false }
demo:      { count: 5,  timeMinutes: 15,   showExplanation: false, saveResult: false }
olympiad:  { count: event.questionsCount, timeMinutes: event.timeMinutes, ... }
```

**Важливо:** у тренуванні після фільтру за складністю може бути менше 10 питань — це нормально, в банку мало записів. Треба наповнювати `olympiad_questions` в Firestore через адмін-панель.

---

## Стан реалізації ✅

### Завершено
- Auth для всіх ролей (Admin, Teacher, Student/Anonymous)
- Кабінет вчителя: класи, генерація кодів, toggle, поле імені, результати
- Адмін-панель: статистика, CRUD олімпіад, вчителі, результати (CSV), банк питань
- Quiz: 6 типів питань, 3 режими, таймер, progress bar, lightbox, feedback
- Error boundary в student.js
- offline.html + Service Worker
- Loading overlay при старті квізу
- Повна міграція з Tailwind на CSS design tokens (всі 4 сторінки)
- **CSS аудит:** tokens.css виокремлено, aliases-блок видалено, мертвий код вичищено (2800→2368 рядків)
- **Fullscreen** при старті олімпіади (`requestFullscreen` / `exitFullscreen`)
- **Захист від повтору:** localStorage `rozumko_done_{code}_{eventId}` + Firestore session як резерв
- **Уніфікація карток:** спільний базовий селектор для light і dark карток
- **Видалено JS fallback** і `data/questions/informatics/` (8 файлів)

### Незавершено / Технічний борг

**🔴 Критично для запуску:**
- Наповнення банку питань (зараз ~3–5 на клас/складність → потрібно 15+)
  Додавати через адмін-панель → вкладка "Питання"

**🟡 Функціонал:**
- Firebase Storage для зображень (зараз тільки зовнішній URL)

**🟢 Майбутнє:**
- Cloudflare Pages + D1 міграція (всі сервіси ізольовані в `services/`)
- Сертифікати для переможців (PDF або CSS print)
- Голосовий ввід для типу `input`

---

## Прийняті архітектурні рішення та їх причини

### Чому без фреймворку
Аудиторія — діти 7–10 років. Кожен зайвий KB уповільнює завантаження. React/Vue + bundler + node_modules для 4 статичних сторінок — оверхед. Vanilla JS + ES modules = нульова збірка, простий деплой через GitHub Pages.

### Чому Tailwind видалено
CDN-версія Tailwind (play CDN) генерує стилі в runtime через JS — це 98KB JS + затримка рендеру. Крім того, `className = 'bg-slate-800 border...'` у JS-рядках — це нечитабельно і ламається при рефакторингу. CSS design tokens дають те саме (консистентність через змінні) без залежності від CDN.

### Чому tokens.css окремо від style.css
Токени — єдина частина CSS яку потрібно змінювати при rebrand або зміні теми. Виокремлення в `tokens.css` дає: (1) одне місце для правок, (2) легко підключити кілька тем, (3) style.css не містить жодного `:root` — завжди чисто. Два HTTP-запити замість одного — прийнятно, обидва файли кешуються.

### Чому видалено JS fallback у quiz-engine.js
JS-файли `data/questions/informatics/*.js` містили лише старі типи `choice` і `truefalse`. Нові типи (`sort`, `sequence`, `match`, `input`) існують тільки в Firestore. Fallback тихо показував неправильні типи питань — це гірше за чесне повідомлення "питань немає, зверніться до вчителя".

### Чому localStorage + Firestore для захисту від повтору
localStorage — миттєва перевірка без мережевого запиту (UX). Firestore session — надійний захист навіть якщо учень очистив localStorage або зайшов з іншого браузера. Два рубежі, різна вартість — разом покривають 99% сценаріїв.

### Чому `.active` замість `.hidden`/`.flex` для overlays
Tailwind-підхід: `classList.remove('hidden'); classList.add('flex')` — два класи, два рядки, легко десинхронізуватись. CSS `.active { display: flex }` — один клас, одна операція, CSS повністю контролює display-тип.

### Чому `aria-pressed` для grade/diff кнопок
Семантично правильно для toggle buttons. CSS `[aria-pressed="true"] { background: ... }` — нуль зайвих класів в JS. Бонус: скринридери автоматично озвучують "натиснуто/не натиснуто".

### Чому lazy init у utils/ui.js
`showModal` потрібен на student, teacher, admin сторінках. Але не всі мають `#app-modal` при завантаженні модуля. `document.getElementById` при імпорті на сторінці без елементу = `null` = крах. Lazy init (`getModal()` при першому виклику) вирішує це елегантно.

### Чому dependency injection у features/admin/*.js
`admin.js` → `initEventsTab({ refreshStats })` — `refreshStats` передається як параметр, а не імпортується напряму. Це дозволяє feature-модулям не знати про `admin.js`, уникає циклічних імпортів, і робить модулі тестабельними.
