# Backup And Restore Runbook - Rozumko

_Updated: 2026-06-30_

This runbook describes how to prove that PostgreSQL backups can be restored
before a pilot or paid olympiad. Keep real database URLs, passwords and backup
files outside the public repository.

## Goals

- A recent backup exists before every live event.
- Restore is tested on a non-production database.
- The restored database can answer the core backend health and results queries.
- No restore test can accidentally overwrite production.

## Safety Rules

- Never paste `DATABASE_URL` values into committed files, screenshots or public
  issue comments.
- Never restore into production unless the event owner explicitly declares an
  incident and approves the action.
- Use a staging or temporary Supabase project for restore tests.
- Use a direct or session-mode PostgreSQL connection on port `5432` for Drizzle
  migrations and dump/restore work.
- Run restore tests outside live event hours.

## What To Back Up

The database is the operational source of truth for:

- olympiad events and question assignments;
- teacher accounts and approval state;
- class registrations and generated codes;
- attempts, saved answers and final scores;
- optional teacher-side student labels.

Frontend assets and backend code are recovered from Git and deployments, not
from the database backup.

## 24 Hours Before A Live Event

- [ ] Confirm automated Supabase/Postgres backups are enabled for the database.
- [ ] Create or identify a fresh backup snapshot.
- [ ] Confirm the backup timestamp is after final event setup.
- [ ] Confirm access to a non-production restore target.
- [ ] Run the restore drill below.
- [ ] Record the backup timestamp, restore target and result in a private
      operational note.

## Manual Dump Option

Use this only from a trusted machine. Do not commit the dump.

```powershell
New-Item -ItemType Directory -Force .\private-backups
$env:PGPASSWORD = "<password>"
pg_dump `
  --format=custom `
  --no-owner `
  --no-privileges `
  --file ".\private-backups\rozumko-YYYYMMDD-HHMM.dump" `
  "postgresql://<user>@<host>:5432/<database>"
Remove-Item Env:\PGPASSWORD
```

Prefer provider-managed backups for routine operations; use manual dumps as an
extra checkpoint before risky migrations or pilots.

## Restore Drill

1. Create or choose a non-production PostgreSQL database.
2. Confirm the target is not production.
3. Set environment variables only in the current shell:

```powershell
$env:RESTORE_DATABASE_URL = "postgresql://..."
$env:BACKUP_FILE = ".\private-backups\rozumko-YYYYMMDD-HHMM.dump"
```

4. Restore the dump:

```powershell
pg_restore `
  --clean `
  --if-exists `
  --no-owner `
  --no-privileges `
  --dbname "$env:RESTORE_DATABASE_URL" `
  "$env:BACKUP_FILE"
```

5. Point a local or staging backend at the restored database.
6. Run backend migrations to confirm schema compatibility:

```powershell
cd backend
$env:DATABASE_URL = $env:RESTORE_DATABASE_URL
npm run db:migrate
```

7. Start or deploy the backend against the restored database.
8. Verify:

- [ ] `GET /ping` returns `db: ok`.
- [ ] Admin can see events.
- [ ] Teacher/admin results route returns without `500`.
- [ ] A known restored event has expected question assignments.
- [ ] Attempt rows and finished scores are present when expected.

9. Remove local environment variables when finished:

```powershell
Remove-Item Env:\RESTORE_DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:\BACKUP_FILE -ErrorAction SilentlyContinue
Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
```

## Production Restore Decision

Use production restore only for real data loss or corruption. Before restoring:

- [ ] Stop or pause live event usage if possible.
- [ ] Record the incident time and suspected cause.
- [ ] Identify the most recent safe backup.
- [ ] Estimate data loss between backup timestamp and incident time.
- [ ] Tell affected teachers that results may be delayed or reviewed.
- [ ] Get explicit event owner approval.

After restore:

- [ ] Run `/ping`.
- [ ] Run the relevant sections of `docs/smoke-test.md`.
- [ ] Check teacher/admin results.
- [ ] Record what was restored and what data may be missing.
- [ ] Create follow-up issues for the root cause.

## Pilot Readiness Standard

Before a pilot, this statement should be true:

> We have a backup from after event setup, and we restored it successfully into a
> non-production database within the last 7 days.

If that statement is false, the event is operationally risky even if the code
builds and tests pass.
