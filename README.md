# 🧠 Розумко — Онлайн-олімпіада з інформатики

> Онлайн-платформа для проведення олімпіад та тренувань з інформатики для учнів 1–4 класів.

[![License: Proprietary](https://img.shields.io/badge/license-Proprietary-red.svg)](./LICENSE)
[![GitHub Pages](https://img.shields.io/badge/hosted-GitHub%20Pages-blue.svg)](https://rozumko.github.io)

---

## ⚠️ Ліцензія

**Це комерційний проєкт з закритою ліцензією.**  
Публічний репозиторій розміщений виключно для прозорості та не надає жодних прав на використання коду.

---

## Про проєкт

**Розумко** — освітня платформа для проведення онлайн-олімпіад і тренувань з інформатики для учнів початкової школи.

| Роль | Можливості |
|---|---|
| 👨‍🏫 **Вчитель** | Кабінет: класи, реєстрації на події, генерація кодів за реєстраціями, перегляд результатів |
| 🧒 **Учень** | Вхід за кодом без реєстрації, тренування або олімпіада |
| 🔧 **Адмін** | Банк питань (CRUD), події олімпіад, добір питань для подій, результати, список вчителів |

### Ключові особливості

- **Без реєстрації для учнів** — вхід тільки за кодом (`КІТ247`)
- **Безпека** — відповіді та оцінювання тільки на сервері, ключі відповідей ніколи не надходять у браузер
- **Події олімпіад** — адмін створює подію, визначає дати та питання для кожного класу
- **Реєстрації без ПІБ дітей** — вчитель створює клас, реєструє кількість учасників на подію і генерує коди
- **3 режими** — тренування (з поясненнями), демо, олімпіада (таймер, fullscreen)
- **Захист від збоїв** — відновлення персональної спроби після F5 через повторне введення коду
- **Доступність** — WCAG 2.2, focus trap, prefers-reduced-motion

---

## Стек

| Шар | Технологія |
|---|---|
| Frontend | Vite + TypeScript (allowJs) + Vanilla JS + CSS tokens |
| Backend | Node.js + Fastify v5 + TypeScript |
| База даних | PostgreSQL (Supabase, портабельний) + Drizzle ORM |
| Auth | Supabase Auth (тільки вчитель/адмін) + JWKS верифікація |
| Хостинг Frontend | GitHub Pages (деплой через GitHub Actions) |
| Хостинг Backend | Render (free tier) |

---

## Структура проєкту

```
├── index.html / student.html / teacher.html / admin.html
├── student.ts / teacher.ts / admin.ts   ← точки входу
├── style.css / tokens.css               ← стилі (без фреймворків)
├── vite.config.ts / tsconfig.json
│
├── features/
│   ├── api/client.ts     ← всі запити до backend (типізовані)
│   ├── admin/            ← вкладки адмін-панелі
│   └── olympiad/         ← quiz-engine, getModeConfig
│
├── utils/
│   ├── question-renderer.ts
│   ├── focus-trap.ts
│   └── dom.ts
│
├── backend/              ← окремий Node.js + Fastify сервер
│   ├── src/
│   │   ├── routes/       ← student, attempt, teacher, admin, questions
│   │   ├── lib/auth.ts   ← JWT middleware (JWKS)
│   │   └── db/           ← Drizzle schema + migration runner
│   ├── drizzle/          ← SQL-міграції
│   └── render.yaml
│
├── public/               ← статичні assets (sw.js, manifest, favicon)
├── docs/                 ← технічна документація
└── .github/workflows/    ← frontend deploy + backend CI
```

---

## Документація

- [Архітектура](./docs/architecture.md)
- [Модель безпеки](./docs/security-model.md)
- [Політика повідомлення про вразливості](./SECURITY.md)
- [Міграції БД](./docs/migrations.md)
- [Smoke-тест перед пілотом](./docs/smoke-test.md)
- [Продуктовий план](./docs/product-roadmap.md)

---

## Локальний запуск

```bash
# Frontend (dev server)
npm install
npm run dev

# Backend
cd backend
npm install
npm run dev
```

Backend потребує `.env` з `DATABASE_URL`, `SUPABASE_URL`, `ATTEMPT_SECRET`; `PORT` необов'язковий.

---

*© 2024–2026 Розумко. Всі права захищені.*
