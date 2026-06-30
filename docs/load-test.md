# Load Test Scaffold - Rozumko

_Updated: 2026-06-30_

This is a lightweight load-test procedure for the official student attempt
flow. Run it only against staging or a deliberately prepared pilot environment.
Do not run it against production during a live event.

## What It Covers

The script exercises the same critical endpoints a classroom uses:

1. `POST /api/student/exchange-code`
2. `POST /api/attempt/:id/answer`
3. `POST /api/attempt/:id/finish`

Each test code behaves like one student. For realistic results, use personal
codes generated for a staging event with the same question count and duration
as the planned olympiad.

## Prepare A Staging Event

- [ ] Deploy the intended backend commit to staging.
- [ ] Use a staging database, not production data.
- [ ] Create an active event with realistic timing and question count.
- [ ] Assign questions for the target grade.
- [ ] Register a test class with enough participants.
- [ ] Generate personal codes (`maxUses = 1`) for every simulated student.
- [ ] Save the generated codes in a local file that is not committed.

Example `codes.txt`:

```text
ABC123
DEF456
GHI789
```

## Run A Small Smoke Load

```bash
node scripts/load-test-attempt-flow.mjs ^
  --base-url https://your-staging-backend.example.com ^
  --codes-file codes.txt ^
  --concurrency 5 ^
  --answers-per-attempt 3
```

Expected result:

- no failed requests;
- `exchange`, `answer` and `finish` p95 values are stable;
- teacher/admin results show finished attempts.

## Run A Pilot-Sized Load

Start below the expected class size, then increase:

```bash
node scripts/load-test-attempt-flow.mjs ^
  --base-url https://your-staging-backend.example.com ^
  --codes-file codes.txt ^
  --concurrency 25 ^
  --answers-per-attempt 10
```

Then repeat with `--concurrency 50` and `--concurrency 100` if enough codes
exist.

## Useful Environment Variables

```bash
set ROZUMKO_LOAD_BASE_URL=https://your-staging-backend.example.com
set ROZUMKO_LOAD_CODES_FILE=codes.txt
set ROZUMKO_LOAD_CONCURRENCY=50
set ROZUMKO_LOAD_ANSWERS_PER_ATTEMPT=10
node scripts/load-test-attempt-flow.mjs
```

## Reading Results

The script prints:

- total students attempted;
- successful and failed flows;
- p50, p95 and max latency for the whole flow;
- p50, p95 and max latency per step;
- first failure messages.

Treat these as pilot readiness signals:

- `failed = 0` for the planned concurrency;
- no repeated `429` responses for legitimate test students;
- no repeated `5xx` responses;
- `/ping` remains healthy during the run;
- result rows appear after finishing.

## Safety Rules

- Use staging codes only.
- Do not commit generated code lists.
- Do not use real student data.
- Do not run the load test while a live class is using the same backend.
- Keep Render on one instance while rate limiting is process-local.
- If a run produces repeated `5xx`, stop and inspect backend logs before
  increasing concurrency.

## Known Limits

- The script is an HTTP-level load test, not a browser E2E test.
- It sends simple placeholder answers; it does not verify scoring correctness.
- It consumes personal codes. Regenerate codes before every full run.
- It does not create events, registrations or codes; those remain explicit
  operator setup steps.
