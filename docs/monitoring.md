# Monitoring Runbook - Rozumko

_Updated: 2026-06-30_

Rozumko has two backend health endpoints:

- `GET /health` checks that the HTTP process is alive.
- `GET /ping` checks that the backend can also reach PostgreSQL.

For live olympiads, monitor `/ping`. It catches more useful failures than
`/health` because a running backend without database access cannot start or
finish attempts safely.

## Recommended Check

Monitor:

```text
https://rozumko-github-io.onrender.com/ping
```

Expected response:

```json
{ "status": "ok", "db": "ok" }
```

Use any uptime service that supports HTTPS checks and notifications. UptimeRobot
is enough for pilots.

## Pilot Settings

- Interval: 1 minute if available; otherwise the shortest free interval.
- Timeout: 10-15 seconds.
- Alert after: 2 consecutive failures.
- Recovery notification: enabled.
- Notification targets: event owner and technical operator.

Keep alert recipients in the monitoring service, not in the public repository.

## Pre-Event Check

- [ ] Monitoring is enabled for `/ping`.
- [ ] The check is green.
- [ ] A manual browser request to `/ping` returns `db: ok`.
- [ ] Alert recipients received a test notification.
- [ ] The operator knows where to view recent failures.

## During Event

If monitoring alerts:

1. Open `/ping` manually.
2. Check whether teachers are reporting real failures.
3. If `/ping` is down or slow for more than 2 minutes, follow
   `docs/olympiad-day-runbook.md`.
4. Record start time, recovery time and visible symptoms.

Do not rely on monitoring alone. Teacher reports are part of the signal.

## After Event

- [ ] Review downtime and latency history for the event window.
- [ ] Add incidents to the private operational note.
- [ ] Create follow-up issues for repeated failures or slow recovery.
- [ ] Confirm monitoring remains enabled for future pilots.

## Readiness Standard

Before a pilot, this statement should be true:

> `/ping` is monitored, alerts reach the operator, and a test alert has been
> received before students start.
