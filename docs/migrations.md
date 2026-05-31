# Database Migrations - Rozumko

_Updated: 2026-05-31_

## Source Of Truth

- Schema: `backend/src/db/schema.ts`
- SQL migrations: `backend/drizzle/*.sql`
- Runner: `backend/src/db/migrate.ts`
- Journal: `backend/drizzle/meta/_journal.json`

Never make an untracked manual schema change. If an emergency SQL change is
applied first, add an idempotent migration immediately afterward so new
environments receive the same schema.

## Current Migration History

| Migration | Purpose |
|---|---|
| `0000`-`0003` | Initial schema |
| `0004_add_olympiad_events` | Event model |
| `0005_add_event_questions` | Event question selection |
| `0006_add_attempt_questions` | Immutable attempt question IDs |
| `0007_add_teacher_classes_registrations` | Teacher classes and registrations |
| `0008_add_access_codes_registration_id` | Registration-linked codes |
| `0009_add_class_students` | Optional student labels |
| `0010_drop_dead_columns` | Remove obsolete columns |
| `0011_add_question_type` | Six question types and nullable `correct` |
| `0012_add_olympiad_event_limits` | Event duration and question count |

`0012` is intentionally idempotent: production received the columns manually
before the SQL was incorporated into Drizzle history.

The production database also received `0009`-`0011` manually before their
journal timestamps were corrected. Existing production therefore may not list
those three historical entries in `drizzle.__drizzle_migrations`, even though
the schema is present. New environments apply the full ordered history.

## Development Workflow

```powershell
cd backend
npm run db:generate
npm run db:migrate
npm test
npm run build
```

Review generated SQL before applying it. Do not use `drizzle-kit push` in
production.

## Production Workflow

Migrations do not run automatically on Render deploy. Apply them deliberately
before deploying backend code:

```powershell
cd backend
$env:DATABASE_URL = "postgresql://..."
npm run db:migrate
```

Use a direct or session-mode Supabase connection on port `5432`, not PgBouncer
transaction mode on port `6543`, because Drizzle migrations use advisory locks.

## Rules

- Never edit a migration already applied to a shared database.
- Commit schema and migration changes together.
- Review destructive SQL and take a backup first.
- Keep SQL portable PostgreSQL where practical.
- Enable RLS immediately for every new Supabase table.

## RLS Verification

All current application tables had RLS enabled when checked on 2026-05-31.
For a new table:

```sql
ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;
```

## Portability

`DATABASE_URL` is the database abstraction boundary. Moving PostgreSQL providers
requires a dump, restore and environment update. Supabase Auth migration is a
separate project because JWT issuance is provider-specific.
