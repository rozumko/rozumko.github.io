# Rozumko - Logic Missions For Grades 1-4

> Rozumko is an educational web platform for short logic missions, practice tasks
> and online events for younger schoolchildren.

[![License: Proprietary](https://img.shields.io/badge/license-Proprietary-red.svg)](./LICENSE)
[![GitHub Pages](https://img.shields.io/badge/hosted-GitHub%20Pages-blue.svg)](https://rozumko.github.io)

---

## License

**This is a commercial proprietary project.**
The public repository is provided for transparency and does not grant permission
to use, copy, modify or redistribute the code.

---

## About

**Rozumko** helps children in grades 1-4 practise attention, logic and
step-by-step thinking through short digital missions.

The public product is organized around two clear surfaces:

| Surface | Purpose |
|---|---|
| **Home missions** | Parent-led practice for useful screen time, progress and short logic activities. |
| **School mode** | A low-friction classroom surface for teachers and groups, kept separate from parent payments and child personal data. |

The existing platform also includes official event flows with access codes,
teacher/admin tools, server-side scoring and electronic certificates/diplomas.

### Key Principles

- **Useful screen time** - short tasks for attention, logic and confidence with problems.
- **Clean School/Home split** - classroom use does not transfer individual child results into parent accounts.
- **Server-side scoring** - official, paid or diploma-generating scoring belongs on the backend.
- **Minimal child data** - students do not use Supabase Auth accounts.
- **Backend-only database access** - frontend code calls the backend API, never Supabase tables directly.
- **App-ready direction** - the website, PWA and app clients share the same backend product rules.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Vite + TypeScript (allowJs) + Vanilla JS + CSS tokens |
| Backend | Node.js + Fastify v5 + TypeScript |
| Database | PostgreSQL (Supabase, portable) + Drizzle ORM |
| Auth | Supabase Auth for teachers/admins + JWKS verification |
| Frontend hosting | GitHub Pages via GitHub Actions |
| Backend hosting | Render |

---

## Project Structure

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

## Documentation

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

## Local Development

```bash
# Frontend
npm install
npm run dev

# Backend
cd backend
npm install
npm run dev
```

Backend requires `.env` with `DATABASE_URL`, `SUPABASE_URL`,
`ATTEMPT_SECRET`; `PORT` is optional.

The frontend uses the production API by default. For local smoke testing, copy
`.env.example` to `.env.local` and set:

```bash
VITE_API_URL=http://localhost:3000
```

---

*Copyright 2024-2026 Rozumko. All rights reserved.*
