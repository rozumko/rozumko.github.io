# Database Migrations — MegaRozum

## Source of truth

Drizzle ORM schema files are the single source of truth for the database structure.
Supabase CLI may be used for local development convenience, but its migration
files are not authoritative. Never edit the database by hand without a
corresponding migration file.

## Tools

| Tool              | Purpose                                           |
|-------------------|---------------------------------------------------|
| `drizzle-kit`     | Generate SQL migration files from schema changes  |
| `drizzle-kit migrate` | Apply pending migrations to the database     |
| `drizzle-kit studio` | Visual schema browser (dev only)             |

## File structure

```
src/
  db/
    schema.ts        ← table definitions (source of truth)
    migrate.ts       ← migration runner (called on server start or manually)
    index.ts         ← db client (drizzle(pool))

drizzle/
  0000_initial_schema.sql
  0001_add_attempt_status.sql
  0002_access_codes_expires_at.sql
  meta/
    _journal.json    ← drizzle migration journal (do not edit manually)

drizzle.config.ts    ← drizzle-kit config
```

## Configuration

```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
```

`DATABASE_URL` is a standard PostgreSQL connection string. It works with
Supabase, Railway, Neon, Render, or a self-hosted PostgreSQL without changes.

## Workflow: adding or changing a table

1. Edit `src/db/schema.ts`.
2. Run `npx drizzle-kit generate` → creates a new `.sql` file in `drizzle/`.
3. Review the generated SQL. Make sure it is plain PostgreSQL (no Supabase extensions).
4. Run `npx drizzle-kit migrate` to apply it to the dev database.
5. Commit both `schema.ts` and the new migration file together.

Never run `drizzle-kit push` in production — it is for rapid prototyping only
and does not write migration files.

## Workflow: applying migrations in production

```bash
# On deploy (Railway, Fly.io, or VPS)
node -e "import('./src/db/migrate.ts').then(m => m.runMigrations())"
# or as a deploy step in railway.toml / fly.toml / Dockerfile CMD
```

`migrate.ts` example:

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

export async function runMigrations() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = drizzle(pool)
  await migrate(db, { migrationsFolder: './drizzle' })
  await pool.end()
}
```

## Rules

- **Never edit a migration file that has already been applied** to any shared
  database (dev, staging, production). Create a new migration instead.
- **No Supabase-specific SQL** in migration files: no `auth.users` references,
  no `storage` schema, no `pgcrypto` calls unless explicitly required and noted.
- **No irreversible destructive changes** without a data backup step documented
  in the migration PR description.
- **Column renames** require two migrations: add new column, backfill, drop old.
  Never rename a column in a single migration on a live database.
- **Every migration must be reviewed** before merging to main, even if small.

## Portability checklist

Before merging a migration, verify:

- [ ] Uses only standard PostgreSQL syntax
- [ ] No hardcoded Supabase project references
- [ ] `DATABASE_URL` is the only connection configuration
- [ ] Migration runs cleanly on a fresh empty PostgreSQL instance
- [ ] `drizzle-kit migrate` exits with code 0 in CI

## Migrating away from Supabase PostgreSQL

When moving to another PostgreSQL provider:

```bash
# 1. Export from Supabase
pg_dump "$SUPABASE_DATABASE_URL" \
  --no-owner --no-acl \
  --schema=public \
  -f backup.sql

# 2. Import to new provider
psql "$NEW_DATABASE_URL" < backup.sql

# 3. Update environment variable
DATABASE_URL=postgresql://user:pass@new-host:5432/dbname

# 4. Verify migration journal is intact
npx drizzle-kit migrate   # should report "No pending migrations"
```

Supabase Auth migration is a separate process (see `docs/architecture.md`).
The application database (all tables in `src/db/schema.ts`) is fully portable.

## Local development with Supabase CLI

Supabase CLI can run a local PostgreSQL + Auth stack via Docker:

```bash
supabase start          # starts local Supabase stack
supabase status         # shows local DATABASE_URL
```

Use the local `DATABASE_URL` from `supabase status` as your dev `DATABASE_URL`.
Run Drizzle migrations against it normally. Do not use `supabase db push` —
it bypasses Drizzle's migration journal.
