# Operations

Operations runbook for deploying and maintaining the Docker Compose stack on a single host or demo server. The same stack is what'll run on Northwind internal infrastructure post-greenlight; this doc tracks both for now.

## Deployment targets

- **POC / demo**: Docker Compose on a single host on the LAN. Browser access from any device on the same network. This is what these instructions cover.
- **Production** (post-greenlight): same Docker Compose stack on a Northwind internal server. Differences documented inline.

## Source code remotes

Deployment servers clone the app from your Git remote (e.g. `git@github.com:your-org/tracker.git`). Pin deployments to a tagged release rather than tracking a branch.

## Demo deploy — first time

Assumes the server already has Docker + Compose v2 installed and SSH access.

### 1. Clone + checkout the demo tag

```sh
cd /srv
sudo git clone /srv/git/tracker.git tracker
sudo chown -R $USER:$USER /srv/tracker
cd /srv/tracker
git fetch --tags
git checkout v0.1.0   # or whichever tag is being demoed
```

Adjust the clone source if the remote isn't reachable from the server. For a host pulled over SSH, replace `/srv/git/tracker.git` with the SSH URL.

### 2. Configure `.env`

```sh
cp .env.example .env
$EDITOR .env
```

Required edits for a LAN deploy:

| Variable | Set to | Why |
|---|---|---|
| `SESSION_SECRET` | output of `python3 -c "import secrets; print(secrets.token_urlsafe(64))"` | Signs the session cookie. Must NOT stay `changeme`. |
| `POSTGRES_PASSWORD` | a real password | Default `changeme` is fine on a LAN but rotate before exposing further. |
| `ALLOWED_ORIGINS` | `http://<server-lan-ip>:5181` (or your DNS name) | CSRF gate — comma-separated; the frontend's origin MUST be in this list. |
| `VITE_ALLOWED_HOSTS` | `<server-lan-ip>,<your-dns-name>` if accessing via something other than `localhost` | Comma-separated allowlist for Vite's Host-header filter. Leave blank to allow any host (fine for LAN demos). |
| `BOOTSTRAP_ADMIN_EMAIL` | your real email | Used once by `make seed` to create the first admin. |
| `BOOTSTRAP_ADMIN_PASSWORD` | ≥ 12-char password | Used once by `make seed`. **Change in the UI immediately after first login** via `/admin/users` → reset-password. |

Leave the others at their defaults unless you have a reason.

`.env` is gitignored and lives at `/srv/tracker/.env`. Lock it down: `chmod 600 .env`.

### 3. Build + start the stack

```sh
make up           # builds images, starts postgres + backend + frontend
make logs        # follow logs until backend reports "Application startup complete"
```

If `make` isn't installed on the server, the equivalent is `docker compose up -d --build`.

### 4. Apply migrations + seed the admin

```sh
docker compose exec backend alembic upgrade head
docker compose exec backend python -m backend.app.seed
```

The container already has `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` from `.env` via `docker-compose.yml`. The seed is idempotent — if the admin already exists it no-ops.

### 5. Verify

From the server:
```sh
curl -s http://localhost:8011/api/health
# → {"status":"ok"}
```

From another machine on the LAN:
- Browse to `http://<server-lan-ip>:5181`
- Log in as the bootstrap admin
- Confirm the dashboard renders the four default widgets

If the login fails with "Invalid email or password", check `docker compose logs backend` for an Origin-check 403 (means `ALLOWED_ORIGINS` doesn't include the URL you opened).

## Updating a deployed instance

```sh
cd /srv/tracker
git fetch --tags
git checkout v0.2.0           # the new tag
docker compose up -d --build   # rebuild images, restart containers
docker compose exec backend alembic upgrade head
```

The Postgres volume (`tracker-postgres-data`) is preserved across rebuilds. The frontend `node_modules` named volume is also preserved.

## Rolling back

```sh
cd /srv/tracker
git checkout v0.0.x            # previous tag
docker compose up -d --build
# Down-migrate if the rollback drops a column the old code doesn't know about:
docker compose exec backend alembic downgrade <prev_revision>
```

Each migration has a `downgrade()` body — non-destructive ones run cleanly. Destructive ones (drops a column, etc.) lose data, so back up first.

## Backups

The Postgres data lives in the `tracker-postgres-data` Docker volume.

### One-off snapshot

```sh
mkdir -p /srv/tracker/backups
docker compose exec -T postgres pg_dump -U tracker -d tracker --no-owner \
  > /srv/tracker/backups/tracker-$(date +%F-%H%M).sql
```

Compress and rotate as needed. Restoring:

```sh
cat backup.sql | docker compose exec -T postgres psql -U tracker -d tracker
```

For a destructive restore, drop+recreate the DB first or use `pg_restore --clean`.

### Scheduled (cron on the host)

```cron
# /etc/cron.d/tracker-backup — daily at 02:00
0 2 * * *  deploy  cd /srv/tracker && docker compose exec -T postgres \
  pg_dump -U tracker -d tracker --no-owner | \
  gzip > /srv/tracker/backups/tracker-$(date +\%F).sql.gz && \
  find /srv/tracker/backups -name 'tracker-*.sql.gz' -mtime +14 -delete
```

Adjust the user and retention window to taste.

## Where things live on the server

| Thing | Path |
|---|---|
| Repo checkout | `/srv/tracker/` |
| `.env` (real secrets) | `/srv/tracker/.env` — owned by deploy user, mode 600 |
| Postgres data | Docker named volume `tracker-postgres-data` |
| Backups | `/srv/tracker/backups/` |
| Backend logs | `docker compose logs backend` |
| Frontend logs | `docker compose logs frontend` |

## Audit log table

Phase 3.1 added the `audit_log` table: one row per mutating operation on projects / milestones / CORs / notes / role grants / project-level access grants. Grows unbounded by design (no retention policy this phase). At pilot scale (50–150 concurrent peak, low write volume per user) this is comfortably under a million rows/year; revisit when storage becomes a real concern. Admin viewer at `/admin/audit-log`. Backups via the standard Postgres dump (see Backups above) capture audit history along with everything else.

## Demo deploy is NOT production

Sharp edges that don't matter for a LAN-only demo but would matter if the box ever became internet-accessible:

- **Postgres port 5432 is bind-published on 127.0.0.1 only** (since the docker-ready fixes). Reachable from the host for local `psql` / `pytest`, NOT from other machines on the LAN. Remove the host-side mapping entirely (drop the `ports:` line) if you don't even want loopback access.
- **Frontend uses the Vite dev server** with hot reload, not a production static build behind nginx. It's functional but heavier than needed and exposes Vite's dev surface.
- **No HTTPS / TLS termination.** A reverse proxy (caddy / nginx / Traefik) is the right move before any cross-network access.
- **`APP_ENV=development`** keeps the dev-default `SESSION_SECRET` check loose. The backend hard-refuses to boot if `APP_ENV=production` AND `SESSION_SECRET` is still the dev value; flip both together when moving to a real environment.

For an environment that closes most of these (production-style images, baked SPA behind Caddy, no host-port exposure on Postgres), use the production stack below.

## Production stack — `docker-compose.prod.yml`

A second Compose file at the repo root brings up the production shape: built SPA served by Caddy, backend runs from baked-in source (no bind-mounts, no `--reload`), Postgres has no host-port exposure. The entrypoint runs `alembic upgrade head` before starting uvicorn, so migrations apply automatically on each container recreate.

Same source tree, different chrome:

| Layer | Dev stack (`docker-compose.yml`) | Production stack (`docker-compose.prod.yml`) |
|---|---|---|
| Backend image | `backend.Dockerfile` (repo root), editable install + `--reload`, source bind-mounted | `backend/Dockerfile`, non-editable install, source baked in, entrypoint runs Alembic |
| Frontend | Vite dev server with HMR | Caddy serving a built `dist`; reverse-proxies `/api/*` to the backend |
| Postgres host port | `127.0.0.1:5432` (for local `psql` / `pytest`) | Not published — backend reaches it over the Docker network only |
| Public port | Backend `:8011`, Vite `:5181` | Caddy `:${HOST_PORT:-8080}` (single ingress for both SPA and API) |

### First-time production deploy

```sh
cd /srv/tracker
git fetch --tags
git checkout v0.4.5  # or whichever tag you're deploying

cp .env.example .env
$EDITOR .env
chmod 600 .env
```

Production-relevant `.env` values:

| Variable | Required | Notes |
|---|---|---|
| `SESSION_SECRET` | yes | Output of `python3 -c "import secrets; print(secrets.token_urlsafe(64))"`. Compose refuses to start if unset or empty. |
| `POSTGRES_PASSWORD` | yes | Real password. Compose refuses to start if unset. |
| `ALLOWED_ORIGINS` | yes | The URL Caddy is reached at (e.g. `http://tracker.lan:8080` or `https://tracker.example.com` if behind a TLS proxy). Compose refuses to start if unset. |
| `APP_ENV` | recommended | Set to `production`. The backend refuses to boot in production mode while `SESSION_SECRET` is the dev placeholder. |
| `HOST_PORT` | optional | Defaults to `8080`. Change if 8080 is taken. |
| `BOOTSTRAP_ADMIN_EMAIL` / `_PASSWORD` | optional | Used once by `make seed-prod` to create the first admin. |

Bring the stack up:

```sh
make up-prod                                # docker compose -f docker-compose.prod.yml up -d --build
make logs-prod                              # follow until Caddy + backend are up
make seed-prod                              # create the bootstrap admin (idempotent)
```

Verify:

```sh
curl -s http://localhost:${HOST_PORT:-8080}/api/health
# → {"status":"ok"}
```

Then browse to `http://<server>:${HOST_PORT:-8080}` and sign in.

### Updating the production stack

```sh
cd /srv/tracker
git fetch --tags
git checkout v0.4.6   # the new tag
make up-prod          # rebuilds images, recreates containers
                      # entrypoint.sh runs `alembic upgrade head` automatically
```

The Postgres data volume (`tracker-postgres-data`) and the Caddy state volumes survive recreate. The frontend image rebuilds on every `up-prod` because Caddy serves a baked SPA — there's no way to update the SPA without a rebuild.

### Rolling back the production stack

```sh
cd /srv/tracker
git checkout v0.4.5    # previous tag
make up-prod           # rebuild + recreate
# Down-migrate only if the rollback drops a column the older code expects:
docker compose -f docker-compose.prod.yml exec backend alembic downgrade <prev_revision>
```

Back up the Postgres volume first if the rollback crosses a destructive migration (column drop, type change). See the **Backups** section above — the `docker compose exec` commands work the same against the prod stack, just substitute `-f docker-compose.prod.yml`.

### TLS / HTTPS

Caddy in this stack listens on plain `:80` (inside the container). For HTTPS:

- **Behind another reverse proxy** (the recommended path on a self-hosted or Northwind server): point that proxy at `http://<host>:${HOST_PORT:-8080}` and have it terminate TLS. `ALLOWED_ORIGINS` in `.env` should be the outer proxy's URL (e.g. `https://tracker.example.com`), not the internal `:8080`.
- **Direct Caddy TLS**: edit `caddy/Caddyfile` to replace `:80` with the public hostname (e.g. `tracker.example.com {`) and add a `tls` directive. Caddy will obtain a certificate via ACME on startup. Requires public DNS pointing at the host and ports 80/443 reachable for the ACME challenge.

The Caddyfile is bind-mounted from the repo (`./caddy/Caddyfile`), so changes take effect on `docker compose -f docker-compose.prod.yml restart caddy` — no image rebuild needed.

## Troubleshooting

- **"Invalid email or password" on login but the seed claims to have created the admin**: check the password was 12+ chars (seed exits non-zero otherwise), and that `ALLOWED_ORIGINS` includes the URL you're browsing from. The latter shows up in backend logs as `403 Forbidden` on the POST.
- **Migrations refuse to run** with a `StringDataRightTruncation` error: revision IDs cap at 32 chars in `alembic_version.version_num`. Check the new migration file's `revision: str = "..."` is ≤ 32 chars (caught us in 1.9.2).
- **Frontend container restart-loops after `docker compose up --build`**: usually a stale anonymous `node_modules` volume. `docker compose down -v` drops named volumes (including the DB — back up first) and starts clean.
- **Backend reports "address already in use"**: another process on 8011 is up. `docker compose down` then `make up` again.
- **`uq_user_dashboard_widgets_user_type_unconfigured` 409 when adding a widget**: the user already has that single-instance widget. Only `field_aggregate` is multi-instance.
