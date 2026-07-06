# Onboarding — перший день розробника

_Мета: підняти проєкт локально, зрозуміти межі й зробити першу зміну безпечно.
Читай згори вниз. Якщо застряг — дивись розділ «Типові граблі» внизу._

Спершу прочитай два документи, щоб зрозуміти «чому так»:

- [architecture.md](./architecture.md) — три сутності (Школа / Дім / Олімпіада),
  потік даних, межа довіри, ключові таблиці.
- [security-model.md](./security-model.md) — що НЕ можна ламати. Обовʼязково
  перед будь-якою зміною auth, API, оцінювання, деплою чи БД.

---

## 0. Вимоги

- **Node.js 20+** (бекенд і фронтенд на одному `@types/node` 25).
- **Git** з налаштованим GitHub-доступом до приватного репозиторію.
- Доступ до **Supabase-проєкту** (URL + ключі) — попроси в мейнтейнера.
- Редактор: VS Code рекомендований (TypeScript, ESLint із коробки).

> **Windows-нюанс:** проєкт розробляється під Windows + PowerShell. Дивись
> «BOM-пастку» нижче — вона ламає збірку тихо й боляче.

---

## 1. Клон і залежності

```bash
git clone <repo-url> rozumko.github.io
cd rozumko.github.io

# Frontend (корінь)
npm install

# Backend
cd backend
npm install
cd ..
```

---

## 2. Змінні оточення

**Frontend** — за замовчуванням фронт бʼє в production API. Для локальної
розробки проти локального бекенду:

```bash
cp .env.example .env.local
# у .env.local встанови:
# VITE_API_URL=http://localhost:3000
```

**Backend** — створи `backend/.env` за зразком `backend/.env.example`:

```bash
cd backend
cp .env.example .env
```

Обовʼязкові поля:

| Змінна | Що це | Як отримати |
|---|---|---|
| `DATABASE_URL` | Postgres-конекшн Supabase | Supabase → Project Settings → Database → Connection string |
| `SUPABASE_URL` | URL проєкту (для JWKS-верифікації JWT) | Supabase → Project Settings → API |
| `ATTEMPT_SECRET` | HMAC-ключ для attempt-токенів | згенеруй: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

`PORT` (за замовчуванням 3000), `NODE_ENV`, `RATE_LIMIT_STORE=memory` —
необовʼязкові.

> Ключі відповідей, оцінювання й доступ живуть **тільки** на бекенді. Фронтенд
> ніколи не має service-role ключа Supabase.

---

## 3. База даних

Схема — Drizzle, міграції — SQL-файли в `backend/drizzle/`.

```bash
cd backend
npm run db:migrate        # застосувати всі міграції до БД з DATABASE_URL
npm run db:seed           # (опційно) демо-дані
npm run db:studio         # Drizzle Studio — переглянути таблиці в браузері
```

Детально про порядок і продакшн-міграції — [migrations.md](./migrations.md).
Ніколи не редагуй уже застосований міграційний файл — додавай новий.

---

## 4. Запуск

Два процеси в двох терміналах:

```bash
# Термінал 1 — backend (tsx watch, автоперезапуск)
cd backend
npm run dev               # http://localhost:3000

# Термінал 2 — frontend (Vite)
npm run dev               # http://localhost:5173
```

Перевір, що бекенд живий: `GET http://localhost:3000/health` (liveness),
`GET /ready` (перевіряє БД). Якщо `/ready` дає 503 — БД недоступна, дивись
`DATABASE_URL`.

---

## 5. Обовʼязкові гейти перед комітом

Це не рекомендація — це умова, яку перевіряє CI (`.github/workflows/`).
Прогони локально перед push:

```bash
# Frontend (корінь)
npm run typecheck && npm test && npm run build

# Backend
cd backend && npm run build && npm test
```

Серед тестів є **security regression tests** (стрипінг ключів відповідей,
розділення Школа/Дім/Олімпіада, `isOlympiad` тощо). Якщо такий тест почервонів
після твоєї зміни — це не «поправ тест», а «ти щойно послабив захист». Спершу
зрозумій чому, і читай [security-model.md](./security-model.md).

---

## 6. Карта коду (куди дивитись)

| Хочу змінити… | Дивись |
|---|---|
| HTTP-запит із фронтенду | `features/api/client.ts` — **єдина** точка всіх запитів |
| Рендер питання (choice/sort/match/…) | `utils/question-renderer.ts` |
| Логіку місій / відбір питань | `features/missions/` (`pickMissionQuestions`) |
| Ігри (сортування, головоломки) | `features/games/` → `games.html` |
| Квіз-рушій олімпіади | `features/olympiad/` |
| Вкладки адмінки | `features/admin/` |
| Роут бекенду | `backend/src/routes/` (student, attempt, teacher, admin, questions, school, home) |
| Auth-middleware | `backend/src/lib/auth.ts` (`requireAuth`, `requireAdmin`) |
| Валідацію таксономії | `backend/src/lib/taxonomy.ts` (`TOPICS_BY_TRACK`, fail-closed) |
| Схему/міграції БД | `backend/src/db/`, `backend/drizzle/` |

Таксономія контенту (дві осі — `track`+`topic`, окремо `concept_key`):
[content-taxonomy.md](./content-taxonomy.md).

---

## 7. Незламні правила (чому — в security-model.md)

- Оцінювання й ключі відповідей — **тільки на сервері**. Ключі ніколи не йдуть
  у браузер (стрипаються навіть усередині `options`).
- Авторизація (`role`, `status`) — завжди через `GET /api/teacher/me`, ніколи з
  JWT-claims.
- Студенти не мають Supabase Auth. Вхід тільки через
  `POST /api/student/exchange-code`.
- Весь доступ до БД — через бекенд. Прямих запитів фронтенду до Supabase-таблиць
  немає.
- Публічний `GET /api/questions` віддає лише тренувальні питання. Олімпіадні —
  тільки через обмін коду.
- Для нових ID у params/body/query додавай UUID-валідацію **до** звернення до БД.
- Не чіпай `trustProxy: 1` → `true`. Не перейменовуй `isOlympiad`.

---

## 8. Типові граблі

- **BOM-пастка (Windows/PowerShell).** `Set-Content` / `Out-File` у PowerShell 5.1
  пишуть UTF-8 **з BOM**, що ламає Vite (`control-character-in-input-stream`) і
  псує кирилицю. Редагуй файли лише редактором / інструментами, які пишуть чистий
  UTF-8. Щоб перезапустити CI без змін коду — `git commit --allow-empty`.
- **`/ready` дає 503.** БД недоступна: перевір `DATABASE_URL` і що Supabase не
  «заснув».
- **Фронт бʼє в прод замість localhost.** Немає `.env.local` або в ньому не
  виставлено `VITE_API_URL=http://localhost:3000`.
- **Rate-limit дивно спрацьовує локально.** Він у памʼяті процесу й розрахований
  на один інстанс — це нормально для дев-режиму.
- **Практика працює без бекенду.** Так і задумано: `student.html` і `/school`
  тягнуть статичний бандл із `public/questions/` (згенерований
  `npm run export:questions`), щоб діти не чекали холодний старт Render.

---

## 9. Робочий процес

1. Гілка від `main`.
2. Зміни — маленькими комітами, стиль conventional (`feat:`, `fix:`, `docs:`).
3. Прогони всі гейти з розділу 5.
4. Якщо змінював auth/API/оцінювання/деплой/БД — перечитай `security-model.md`
   і переконайся, що security-тести зелені.
5. Pull request у `main`.

Питання «а чому саме так зроблено?» — дивись
[architecture.md](./architecture.md), [product-roadmap.md](./product-roadmap.md)
і [Architecture Decision Records](./adr/README.md) (рішення + відхилені
альтернативи).
