# reachinbox-email-scheduler

Full-stack email scheduler and dashboard for the Outbox Labs / ReachInbox assignment: accept campaign send requests, store them in PostgreSQL, schedule with **BullMQ delayed jobs** (no cron), send through **Ethereal SMTP**, and operate them from a React dashboard.

Scheduling is not done with OS cron, `node-cron`, Agenda, or interval polling of the database. Send times live in Postgres (`email.scheduledAt`) and as BullMQ delayed jobs in Redis.

## Setup

Host ports for Postgres and Redis are remapped so they do not collide with typical local installs:

| Service | Host port | Notes |
|---|---|---|
| PostgreSQL 16 | `5433` | User/db `reachinbox` / `reachinbox` |
| Redis 7 (AOF) | `6380` | Persistence for queues, sessions, and rate-limit counters |
| Elasticsearch 8 | `9200` | Security disabled in Compose; search falls back to Postgres if it is down |

```bash
npm install
cp .env.example backend/.env
# set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL (and optionally SLACK_*)
# optional: cp frontend/.env.example frontend/.env   # VITE_API_URL, default http://localhost:3001

docker compose up -d
# or: npm run docker:up

cd backend && npx prisma migrate deploy && cd ..
```

Google OAuth must be real (not mocked). For local login, register `http://localhost:3001/auth/google/callback` as the authorized redirect URI and put the same URL in `GOOGLE_CALLBACK_URL`. Slack OAuth is optional; if `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` are empty, Connect Slack is disabled and rate-limit hits do not notify.

Run three processes:

```bash
npm run dev          # Express API — http://localhost:3001
npm run dev:worker   # BullMQ workers (email-send, search-index, slack-notify)
npm run dev:web      # Vite dashboard — http://localhost:5173
```

The API starts with `WORKER_ENABLED=false` by default so local sending happens in the dedicated worker process. Set `WORKER_ENABLED=true` only when the API process should also run workers (single-process deploy).

Open `http://localhost:5173` and sign in with Google. The SPA calls the API with `credentials: "include"` (`VITE_API_URL`).

Useful endpoints:

- `GET /health` — process liveness
- `GET /ready` — Postgres and Redis required; Elasticsearch is reported and may be degraded
- `GET /auth/google` — Google OAuth start
- `GET /admin/queues` — Bull Board (logged-in session; read-only)
- `POST /api/campaigns` — schedule a campaign (session + CSV/text/JSON leads)

## Architecture

```
Vite React (Tailwind)  --cookie session-->  Express API
                                              |  Prisma / PostgreSQL  (users, senders, campaigns, emails, Slack webhook)
                                              |  express-session + Redis store (`sid`)
                                              |  enqueue delayed jobs
                                              v
                                         Redis + BullMQ
                                              |
                                    workers (email-send, search-index, slack-notify)
                                              |
                         Ethereal SMTP   Elasticsearch (optional)   Slack incoming webhook
```

- **Backend:** TypeScript, Express, Prisma, PostgreSQL.
- **Queues:** three BullMQ queues on Redis — `email-send`, `search-index`, `slack-notify`. Job ids are stable (`send-<emailId>`, Slack notify per user/sender/UTC hour).
- **Search:** emails are indexed to Elasticsearch (`emails`). List/search APIs fall back to Postgres if ES is down; sending does not depend on ES.
- **Auth:** real Google OAuth; session cookie `sid` in Redis. Locally the cookie is `httpOnly`, `SameSite=Lax`, `secure=false`. When `NODE_ENV=production` or `FRONTEND_URL` is public HTTPS, it is `SameSite=None; Secure` so a separate SPA origin can make credentialed API calls. CORS allows only `FRONTEND_URL` with `credentials: true`.

## Implemented features

- Google login, dashboard redirect, name / email / avatar, logout.
- Compose campaign: subject, body, CSV or pasted leads (count shown), start time, delay between emails, hourly limit, sender picker. `POST /api/campaigns`.
- Scheduled and sent lists with loading, empty, and error states; scheduled list refreshes every 5s.
- Search over to-address, subject, and body (Elasticsearch, Postgres fallback).
- Multiple Ethereal senders per user (three are created on first login / bootstrap).
- Live Bull Board at `/admin/queues`.
- Slack Connect / Disconnect; a real webhook message when a sender’s hourly cap is hit. If Slack is not connected, notify is skipped (no crash). Connecting later does not require a restart.
- Configurable worker concurrency, min inter-send delay, and hourly caps via env (see below).

## Rate limiting, delay, and concurrency

Defaults from `.env.example` / `backend/src/config/env.ts`:

| Variable | Default | Role |
|---|---|---|
| `WORKER_CONCURRENCY` | `5` | BullMQ `email-send` worker concurrency |
| `MIN_INTER_EMAIL_MS` | `2000` | Floor between sends **per sender** (2 seconds). Campaign `delayMs` is `max(requested, this)` |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | `200` | Per-sender hourly cap. Campaign `hourlyLimit` is `min(requested, this)` |
| `MAX_EMAILS_PER_HOUR` | `1000` | Global hourly cap across senders |
| `MAX_LEADS_PER_CAMPAIGN` | `5000` | Reject larger lead lists |
| `WORKER_LOCK_DURATION_MS` | `30000` | BullMQ lock / stalled recovery |

This is **not** BullMQ’s built-in queue limiter. That limiter is process/queue-global and cannot reschedule overflow into the next hour while keeping per-sender gaps. Enforcement is custom Redis Lua so it stays correct with multiple workers:

1. **Schedule time (`packSlots`):** given existing `scheduled`/`sending` rows, pack lead slots from `startAt` with the campaign delay, per-sender cap, and global cap. If the pack would exceed a **48 hour** horizon, the API rejects the campaign. Jobs are bulk-enqueued in chunks of 250 as delayed BullMQ jobs.
2. **Send time (`tryAcquireSendPermit`):** a Lua script atomically checks (a) min delay vs `lastsend:<senderId>`, (b) hourly counters `rl:s:<senderId>:<utcHour>` and `rl:g:<utcHour>`, (c) a per-email `permit:<emailId>` so retries do not double-count. Safe across workers because the counters live in Redis, not memory.
3. **Min delay miss:** `job.moveToDelayed(now + waitMs)` — the job is not failed or dropped.
4. **Hourly cap hit:** `reserveNextSlot` finds the next UTC hour (up to 48 hours ahead) with capacity, updates `email.scheduledAt`, delays the same job, and enqueues a Slack notify job. Jobs are **not** dropped or marked failed for hitting the cap.
5. **1000+ emails at the same start time:** they are packed across hours using delay + caps, then enqueued as delayed jobs. Ethereal is not expected to deliver thousands in a demo; the scheduler still accepts and spaces them.

Trade-off: Redis counters expire (~3 hours) and are the live throttle; Postgres remains the source of truth for *which* emails exist and *when* they should send. After a Redis wipe, counters reset (more sends could pass in that hour) but jobs and rows are not lost if Postgres and BullMQ AOF are intact. Campaign create takes a short per-sender Redis lock to avoid two overlapping packs.

## Persistence, restarts, and idempotency

- Redis is started with AOF (`everysec`) plus RDB snapshots so delayed jobs survive a Redis process restart.
- On worker boot, `reconcileScheduledEmails` scans `scheduled`/`sending` rows and re-adds any missing `send-<emailId>` job from Postgres (same job id, delay from `scheduledAt`). Completed/failed queue copies of still-open rows are replaced. Future mail still fires at the stored time; the worker does not replay already-`sent` rows.
- Duplicate enqueue of the same job id is rejected by BullMQ.
- `(campaignId, toEmail)` is unique; CSV duplicates are skipped at parse time.
- Before SMTP, the row CAS-transitions `scheduled` → `sending`. After SMTP accepts, a Redis `smtp-receipt:<emailId>` is written, then the row becomes `sent` with `providerMessageId`. If the process dies after SMTP but before the DB write, the next attempt sees the receipt (or an existing `providerMessageId`) and **does not send again**.
- SMTP failures release the hourly permit and retry (5 attempts, exponential backoff). Exhausted jobs are `failed`. Stalled `sending` rows without a message id can be taken over after the lock duration.

## Ethereal

Sends use Nodemailer against Ethereal (`smtp.ethereal.email` by default). If `ETHEREAL_USER` and `ETHEREAL_PASS` are unset, each of the three senders is a `nodemailer.createTestAccount()` inbox. If those env vars are set, all bootstrapped senders share that inbox.

Successful sends store Ethereal’s `messageId` and `getTestMessageUrl` preview link on the email row; the dashboard links **Preview** when present.

## Frontend

Vite + React + TypeScript + Tailwind. After Google login:

- Sidebar: user name, email, avatar, logout, Scheduled / Sent counts, Compose, Slack, link to Bull Board.
- Compose modal: subject, body, file upload or paste, detected address count, start time, delay (seconds, minimum 2 in the UI), hourly limit, schedule.
- Tables: recipient, subject, scheduled time (scheduled tab), status (`scheduled` / `sending` / `sent` / `failed`), preview and failure text when present.
- Toasts and query errors for API failures. Session cookie is sent on every `fetch`.

## Assumptions and trade-offs

- PostgreSQL (Prisma) rather than MySQL.
- Docker Compose for the data plane; not required if you point `DATABASE_URL` / `REDIS_URL` / `ELASTICSEARCH_URL` at existing services (use the host ports above when using Compose).
- Elasticsearch is best-effort: `/ready` can be 200 with ES down; index jobs retry.
- Hour buckets and Slack’s “hour window” are **UTC**.
- Slack uses an incoming webhook from OAuth (`incoming-webhook` scope), not a bot posting API.
- SMTP passwords are stored for Ethereal senders but omitted from public sender JSON.
- Local development uses two Node processes (API + worker). A single process is supported with `WORKER_ENABLED=true`.
- No production SMTP provider; Ethereal only.

## Tests

Needs the Compose data plane (and `backend/.env`) the same way as `dev`.

```bash
npm test
npm run typecheck
```
