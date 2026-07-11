# Розумко — обчислювальне мислення та основи ШІ для 1-4 класів

> Розумко — освітня вебплатформа з короткими місіями для інформатики,
> обчислювального мислення та вікової ШІ-грамотності дітей молодшої школи.
> Продукт перетворює екранний час на 10-15 хвилин корисної практики уваги,
> логіки, алгоритмів, закономірностей, інструкцій, етики й безпеки.

[![License: Proprietary](https://img.shields.io/badge/license-Proprietary-red.svg)](./LICENSE)
[![GitHub Pages](https://img.shields.io/badge/hosted-GitHub%20Pages-blue.svg)](https://rozumko.github.io)

---

## Ліцензія

**Це комерційний проєкт із закритою ліцензією.**
Публічний репозиторій розміщений для прозорості та не надає прав на
використання, копіювання, зміну або поширення коду.

---

## Розробка за допомогою ШІ

Розумко розробляється за допомогою ШІ-агентів (інструментів для написання коду)
у ролі помічників розробника. ШІ пропонує й пише код, але **кожну зміну
переглядає, тестує й затверджує людина**, яка несе відповідальність за продукт.

- ШІ використовується лише для *розробки* сайту, не всередині продукту. Діти
  ніколи не взаємодіють з ШІ-ботом; завдання й правильні відповіді готують люди,
  а оцінювання детермінерне на сервері.
- ШІ-інструменти не отримують дитячих персональних даних, секретів чи доступу до
  бази даних; дані користувачів не використовуються для тренування моделей
  (`robots.txt`: `ai-train=no`).

Публічна сторінка для користувачів: [Прозорість](https://rozumko.com/transparency.html).

---

## Про проєкт

**Розумко** допомагає дітям 1-4 класів тренувати обчислювальне мислення через
короткі цифрові місії: увагу, логіку, алгоритми, закономірності, інструкції,
основи ШІ, етику, безпеку та розв'язання задач крок за кроком.

Архітектура продукту розділена на три автономні сутності:

| Сутність | Призначення | Стан |
|---|---|---|
| **Шкільний режим** | Безкоштовна класна активність для вчителів і груп. Це канал довіри й охоплення, а не точка монетизації. | ✅ Працює: самостійні місії + анонімна класна гра за кодом |
| **Домашній режим / Rozumko Club** | Батьківський шлях: коротке демо, згода дорослого, зрозумілий звіт, регулярна домашня практика й підписка. | ✅ Працює: `/home`, батьківський кабінет, профілі дітей, звіти, entitlement і карти 1–4 класів із серверним прогресом; provider checkout — planned |
| **Олімпіада / сезонні події** | Подієвий формат із дедлайном, офіційним результатом, дипломами та сезонною мотивацією. | ✅ Працює базовий official event flow; інтеграція з підпискою — planned |

**Що вже працює сьогодні:** офіційні онлайн-події з кодами доступу, кабінети
вчителя й адміністратора, серверне оцінювання, браузерні сертифікати/дипломи,
самостійні шкільні місії на `/school`, класна гра в стилі Kahoot, а також
перший Home/Rozumko Club зріз: демо-місія, згода дорослого, parent-readable
звіт, backend entitlement і повторювані Club practice-місії, закриті активним
доступом. Для майбутньої платіжної інтеграції вже є backend webhook-boundary:
подія провайдера має бути підписана і проходить через entitlement audit.

### Ключові принципи

- **Обчислювальне мислення в центрі** — алгоритми, закономірності, логіка та
  задачі крок за кроком.
- **Основи ШІ без хайпу і страху** — прості поняття, етика й безпека перед
  інструментами.
- **Корисний екранний час** — короткі завдання для уваги, логіки й упевненості.
- **Чисте розділення Школа / Дім / Олімпіада** — класна активність не переносить
  індивідуальні результати дітей у батьківські акаунти.
- **Серверне оцінювання** — офіційні, платні або дипломні результати оцінюються
  на бекенді.
- **Мінімум дитячих даних** — учні не мають Supabase Auth акаунтів.
- **Доступ до БД тільки через бекенд** — фронтенд звертається до backend API, а
  не напряму до Supabase-таблиць.
- **AIG JSON-Templates у планах** — параметризовані item models мають
  масштабувати контент, але не переносити довірене оцінювання в браузер.

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

## Структура проєкту

```text
index.html / home.html / school.html / student.html / teacher.html / admin.html
student.ts / teacher.ts / admin.ts
style.css / tokens.css
vite.config.ts / tsconfig.json

features/
  api/client.ts
  admin/
  missions/
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

- [Onboarding (перший день розробника)](./docs/onboarding.md)
- [Architecture](./docs/architecture.md)
- [Architecture Decision Records (чому так вирішили)](./docs/adr/README.md)
- [Security model](./docs/security-model.md)
- [Security policy](./SECURITY.md)
- [Product direction](./docs/product-roadmap.md)
- [Accessibility and inclusion baseline](./docs/accessibility-inclusion-baseline.md)
- [Responsible EdTech evidence portfolio](./docs/responsible-edtech-evidence.md)
- [Database migrations](./docs/migrations.md)
- [Smoke test](./docs/smoke-test.md)
- [Event day runbook](./docs/olympiad-day-runbook.md)
- [Load test](./docs/load-test.md)
- [Backup/restore](./docs/backup-restore.md)
- [Monitoring](./docs/monitoring.md)
- [Render operations](./docs/render-operations.md)
- [Deployment portability](./docs/deployment-portability.md)
- [VPS migration checklist](./docs/vps-migration-checklist.md)

---

## Локальний запуск

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

## Перевірки

```bash
npm run typecheck
npm test
npm run build
npm run test:layout
```

`npm test` включає швидкі accessibility guardrails для HTML-сторінок.
`npm run test:layout` запускає Playwright + axe для WCAG A/AA smoke-перевірки
публічних сторінок і зрендерених типів питань.

---

*Copyright 2024-2026 Розумко. Усі права захищені.*
