# Database Migrations - Rozumko

_Updated: 2026-07-02_

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
| `0013_app_users_status_default_pending` | Default teacher/admin status to `pending` |
| `0014_add_school_sessions` | Anonymous classroom sessions |
| `0015_add_home_leads` | Home demo parent lead, child profile, attempt and report tables |
| `0016_add_question_track` | Nullable question track taxonomy for Home Demo directions |
| `0017_enable_home_rls` | Safety re-apply of RLS on Home tables (0015 was edited after merge) |
| `0018_add_home_entitlements` | Home paid-access entitlement + audit events (no provider yet) |
| `0019_add_home_mission_attempts` | Repeatable Club practice attempts gated by entitlement |
| `0020_add_home_payment_events` | Idempotent verified payment webhook events for future provider integration |
| `0021_add_question_taxonomy` | Question taxonomy: topic, concept_key, progression_band, version, meta jsonb (CHECK-constrained per track) |
| `0022_add_missions` | Missions registry (kind/track/grade/version/status/config); seeds 24 logical Home missions |
| `0023_add_sorting_game_mission` | Registers built-in game «Розумне сортування» (kind=sorting-game) |
| `0024_add_infosort_mission` | Registers built-in game «ІнфоСорт» (informatics/information) |
| `0025_add_multisort_mission` | Registers built-in game «Мульти-Сортування» (computational-thinking/abstraction) |
| `0026_add_puzzle_missions` | Registers 5 logic puzzles (sequence/machine/balance/magic/symbols) as kind=puzzle under computational-thinking |
| `0027_add_attempt_pause` | Olympiad attempt pause/heartbeat resilience columns |
| `0028_enable_rls_all_application_tables` | RLS enabled on every application table |
| `0029_add_home_parent_accounts` | Parent accounts (1:1 Supabase Auth identity) + nullable lead ownership |
| `0030_child_profiles_parent_owned` | Child profiles ownable by parent accounts (lead optional, fail-closed CHECK) |
| `0031_add_home_path_progress` | Home path progress snapshots + idempotent client-unverified events |
| `0032_add_micro_lessons` | Micro-lessons authoring table (admin CRUD; children read the static export) |

`0012` is intentionally idempotent: production received the columns manually
before the SQL was incorporated into Drizzle history.

The production database also received `0009`-`0011` manually before their
journal timestamps were corrected. Existing production therefore may not list
those three historical entries in `drizzle.__drizzle_migrations`, even though
the schema is present. New environments apply the full ordered history.

The migration history after `0003` is maintained as hand-written SQL plus
`meta/_journal.json` entries. Snapshot JSON files are intentionally not
maintained for every manual migration in this repo; review `schema.ts`, the SQL
file, and this document together when adding schema changes.

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
