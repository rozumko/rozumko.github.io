# Розумко — обчислювальне мислення та основи ШІ для 1–4 класів

> Розумко — освітня вебплатформа з короткими місіями, що розвивають
> обчислювальне мислення, логіку та вікову ШІ-грамотність у дітей молодшої
> школи.

[![License: Proprietary](https://img.shields.io/badge/license-Proprietary-red.svg)](./LICENSE)
[![GitHub Pages](https://img.shields.io/badge/hosted-GitHub%20Pages-blue.svg)](https://rozumko.github.io)

---

## Ліцензія

**Це комерційний проєкт із закритою ліцензією.**
Публічний репозиторій розміщений для прозорості та не надає прав на
використання, копіювання, зміну або поширення коду.

---

## Про Проєкт

**Розумко** допомагає дітям 1–4 класів тренувати обчислювальне мислення через
короткі цифрові місії: увагу, логіку, алгоритми, закономірності, інструкції,
основи ШІ, етику, безпеку та розв'язання задач крок за кроком.

Публічний продукт організований навколо двох поверхонь:

| Поверхня | Призначення |
|---|---|
| **Домашні місії** | Батьківський шлях для корисного екранного часу, обчислювального мислення, основ ШІ та поступового прогресу. |
| **Шкільний режим** | Простий класний режим для вчителів і груп, відокремлений від батьківських оплат і дитячих персональних даних. |

Платформа також підтримує події з кодами доступу, кабінети вчителя й
адміністратора, серверне оцінювання та електронні сертифікати/дипломи.

### Ключові Принципи

- **Обчислювальне мислення в центрі** - алгоритми, закономірності, логіка та задачі крок за кроком.
- **Основи ШІ без хайпу і страху** - прості поняття, етика й безпека перед інструментами.
- **Корисний екранний час** - короткі завдання для уваги, логіки й упевненості.
- **Чисте розділення School/Home** - класна активність не переносить індивідуальні результати дітей у батьківські акаунти.
- **Серверне оцінювання** - офіційні, платні або дипломні результати оцінюються на бекенді.
- **Мінімум дитячих даних** - учні не мають Supabase Auth акаунтів.
- **Доступ до БД тільки через бекенд** - фронтенд звертається до backend API, а не напряму до Supabase-таблиць.
- **App-ready напрям** - сайт, PWA і застосунки мають спиратися на ті самі backend-правила продукту.

---

## Стек

| Layer | Technology |
|---|---|
| Frontend | Vite + TypeScript (allowJs) + Vanilla JS + CSS tokens |
| Backend | Node.js + Fastify v5 + TypeScript |
| Database | PostgreSQL (Supabase, portable) + Drizzle ORM |
| Auth | Supabase Auth for teachers/admins + JWKS verification |
| Frontend hosting | GitHub Pages via GitHub Actions |
| Backend hosting | Render |

---

## Структура Проєкту

```text
index.html / home.html / school.html / student.html / teacher.html / admin.html
student.ts / teacher.ts / admin.ts
style.css / tokens.css
vite.config.ts / tsconfig.json

features/
  api/client.ts
  admin/
  olympiad/

utils/
  question-renderer.ts
  focus-trap.ts
  dom.ts

backend/
  src/routes/
  src/lib/auth.ts
  src/db/
  drizzle/
  render.yaml

public/
docs/
.github/workflows/
```

---

## Документація

- [Architecture](./docs/architecture.md)
- [Security model](./docs/security-model.md)
- [Security policy](./SECURITY.md)
- [Database migrations](./docs/migrations.md)
- [Smoke test](./docs/smoke-test.md)
- [Event day runbook](./docs/olympiad-day-runbook.md)
- [Load test](./docs/load-test.md)
- [Backup/restore](./docs/backup-restore.md)
- [Monitoring](./docs/monitoring.md)
- [Render operations](./docs/render-operations.md)
- [Deployment portability](./docs/deployment-portability.md)
- [VPS migration checklist](./docs/vps-migration-checklist.md)
- [Product direction](./docs/product-roadmap.md)

---

## Локальний Запуск

```bash
# Frontend
npm install
npm run dev

# Backend
cd backend
npm install
npm run dev
```

Backend потребує `.env` із `DATABASE_URL`, `SUPABASE_URL`, `ATTEMPT_SECRET`;
`PORT` необов'язковий.

Frontend за замовчуванням використовує production API. Для локального
smoke-тесту скопіюйте `.env.example` у `.env.local` і встановіть:

```bash
VITE_API_URL=http://localhost:3000
```

---

*Copyright 2024-2026 Розумко. Усі права захищені.*
