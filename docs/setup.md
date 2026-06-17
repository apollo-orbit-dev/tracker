# Setup

Run the project from a fresh clone.

## Prerequisites

- **Python 3.12+** — backend runtime
- **Node 24+** and **npm** — frontend tooling (`npm` ships with Node)
- **Docker** with the **Compose v2** plugin — for the full stack
- **GNU make** — orchestrates dev commands
- A POSIX shell (the Makefile uses `cd ...`)

Verify with:
```sh
python3 --version
node --version
docker compose version
make --version
```

## First-time setup

```sh
# 1. Create local .env from the template (edit values as needed)
cp .env.example .env

# 2. Install backend (venv + pip) and frontend (npm) deps for native dev workflow
make install
```

`make install` does:
- `python3 -m venv .venv` at repo root
- `.venv/bin/pip install -e ".[dev]"` (FastAPI, SQLAlchemy, Alembic, Pydantic, argon2-cffi, psycopg, plus pytest/httpx/ruff)
- `cd frontend && npm install` (React 19, Vite, Tailwind v4, TanStack Query, Vitest, testing-library)

Note: `make install` is only needed for the native dev workflow and `make test`. The dockerised stack (`make up`) builds its own image-side venv and node_modules.

## Running the full stack (recommended)

```sh
make up      # builds and starts postgres + backend + frontend
make logs    # follow logs from all three services
make down    # stop and remove containers
```

Services and URLs:

| Service | URL |
|---|---|
| Frontend (Vite dev server) | http://localhost:5181 |
| Backend (FastAPI / uvicorn) | http://localhost:8011 |
| Backend health endpoint | http://localhost:8011/api/health |
| Postgres | localhost:5432 (user: `tracker`, db: `tracker`) |

The frontend proxies `/api/*` to the backend, so the same health URL works through the frontend host: http://localhost:5181/api/health.

Source is bind-mounted into both backend and frontend containers, so edits to `backend/app/...` hot-reload via uvicorn `--reload`, and edits under `frontend/src/...` hot-reload via Vite HMR.

## Running natively (no Docker)

```sh
make db-up           # Postgres only, in Docker
make dev-backend     # FastAPI on http://127.0.0.1:8011
make dev-frontend    # Vite dev server on http://localhost:5173
```

The Vite dev server's API proxy reads `VITE_API_PROXY_TARGET` if set; otherwise it defaults to `http://localhost:8011` (the native `make dev-backend` port).

## Running tests

**Backend tests must be run from the repo root** (not from `backend/`): Alembic reads `script_location` relative to `alembic.ini`, which lives at the repo root.

```sh
make test            # both suites
make test-backend    # just pytest
make test-frontend   # just vitest

# Single backend test:
.venv/bin/pytest backend/tests/test_health.py::test_health_returns_ok

# Single frontend test:
cd frontend && npx vitest run -t "renders backend status"
```

## Database migrations

Alembic is the migration tool. `alembic.ini` is at the repo root; migrations live under `backend/migrations/`.

```sh
make migrate                          # alembic upgrade head
make migrate-down                     # alembic downgrade base (drops everything)
make migration name="add foo to bar"  # autogenerate a new revision from model diffs
make seed                             # run backend/app/seed.py (Phase 1.2 stub)
```

Migrations run from the host venv against the URL in `DATABASE_URL` (defaults to `localhost:5432` from `.env`). To run inside the compose backend container instead:

```sh
docker compose exec backend alembic upgrade head
```

Run order for a clean dev DB:

```sh
make db-up         # postgres
make migrate       # creates the schema, seeds the four system roles
# Set bootstrap admin creds in .env first:
#   BOOTSTRAP_ADMIN_EMAIL=admin@example.com
#   BOOTSTRAP_ADMIN_PASSWORD=somethinglongenough  (>= 12 chars)
make seed          # idempotent: creates the bootstrap admin or no-ops
make up            # (or whatever subset of services you want)
```

The seed reads `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` from the environment. It exits non-zero if either is missing or if the password is shorter than 12 characters. Subsequent runs no-op if a user with that email already exists.

## Tests and the test database

`backend/tests/conftest.py` creates `tracker_test` (DB name configurable via `TEST_DATABASE_URL`) at the start of each pytest session by connecting to the `postgres` maintenance DB, then runs `alembic upgrade head` against the fresh DB. Each test runs inside a transaction that rolls back at teardown — data never leaks between tests. The test DB is dropped at session end.

This means you need a running Postgres for backend tests (`make db-up` is sufficient).

## Environment variables

See `.env.example` for the full list.

Compose-side overrides honoured by `docker-compose.yml`:
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` — Postgres credentials and DB name
- `SESSION_SECRET` — signs the session cookie. Backend refuses to boot when `APP_ENV=production` and this is still the dev default.
- `APP_ENV`, `LOG_LEVEL` — passed into the backend service
- `ALLOWED_ORIGINS` — comma-separated allowlist for the CSRF Origin check on unsafe API requests

The backend's `DATABASE_URL` inside compose is built from `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` automatically and points at the `postgres` service hostname.

## Auth

Local auth uses Argon2 password hashing and signed-cookie sessions (8 hour fixed TTL). Endpoints:

- `POST /api/auth/login` — body `{email, password}`; sets `tracker_session` cookie on success
- `POST /api/auth/logout` — requires session cookie; clears it
- `GET /api/auth/me` — returns current user `{id, email, display_name, roles}` or 401

Registration is disabled — only the bootstrap admin can create users (admin endpoints arrive in Phase 1.4+).

Rate limit: 5 failed login attempts per `(IP, email)` per 15 minutes → 429. Success resets the counter.

CSRF defense: any POST/PUT/PATCH/DELETE under `/api/*` must carry an `Origin` (or `Referer`) header whose origin is in `ALLOWED_ORIGINS`. Missing or mismatched → 403.

## Troubleshooting

- **Port already in use** — adjust the host-side port in `docker-compose.yml` for the affected service.
- **`make install` fails on argon2-cffi build** — install build deps: `sudo apt-get install build-essential libffi-dev`.
- **Frontend container restarts loop** — usually means the anonymous `node_modules` volume got out of sync after a `package.json` change. Run `docker compose down -v` to drop volumes and re-run `make up` (this only removes the named volumes for this project).
- **Vite "Failed to resolve import \<package\>" after adding a frontend dependency** — `npm install` on the host doesn't reach the container's `tracker-frontend-node-modules` volume. Run `docker compose exec frontend npm install && docker compose exec frontend rm -rf /app/node_modules/.vite && docker compose restart frontend` (the `.vite` optimizer cache must be cleared too, or it serves stale pre-bundles). (Frontend twin of the backend's container-rebuild-after-dep-change rule; hit with `recharts` in Phase 7.7.)
- **500s mentioning `relation "..." does not exist` after pulling new phases** — a phase shipped a migration the dev DB hasn't run. `make migrate` (host) or `docker compose exec backend alembic upgrade head`. The pytest suite migrates its own throwaway DB automatically, so green tests don't prove the dev DB is current.
- **Backend changes not reloading** — saving via `mv`/inode-swap doesn't always trigger WatchFiles. Editor-driven saves work; `touch backend/app/<file>.py` forces a reload.
