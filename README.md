# reachinbox-email-scheduler

A production-grade full-stack email scheduling service and dashboard powered by Node.js, BullMQ, Redis, PostgreSQL, Elasticsearch, and Ethereal Email.

Phase 1–3 are implemented: API, workers, and the Vite dashboard.

## Local data plane

Host PostgreSQL/Redis are remapped to avoid colliding with common local installs:

| Service | Host port |
|---|---|
| PostgreSQL | `5433` |
| Redis (AOF) | `6380` |
| Elasticsearch | `9200` |

```bash
cp .env.example backend/.env
# set GOOGLE_* and SLACK_* in backend/.env
docker compose up -d
cd backend && npx prisma migrate deploy
```

## Run the API, worker, and dashboard

```bash
npm run dev          # Express API on http://localhost:3001
npm run dev:worker   # BullMQ workers (separate process)
npm run dev:web      # Vite dashboard on http://localhost:5173
```

Open `http://localhost:5173` and sign in with Google. The SPA calls the API at `http://localhost:3001` with session cookies (`VITE_API_URL`).

Useful endpoints:

- `GET /health` — liveness
- `GET /ready` — Postgres + Redis required; Elasticsearch is reported and may be degraded
- `GET /auth/google` — Google OAuth
- `GET /admin/queues` — Bull Board (requires a logged-in session)
- `POST /api/campaigns` — schedule a campaign (session + CSV/JSON leads)

## Tests

```bash
npm test
npm run typecheck
```
