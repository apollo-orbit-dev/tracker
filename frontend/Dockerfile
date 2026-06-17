# Production frontend image.
#
# Multi-stage: Node builds the Vite SPA, then a Caddy image serves the
# resulting dist + reverse-proxies /api/* to the backend container. The
# Caddyfile is bind-mounted at runtime (see docker-compose.prod.yml) so
# routing tweaks don't require a rebuild; the SPA bundle itself is baked
# in. Matches Symmachia's pattern.

FROM node:24-alpine AS builder
WORKDIR /app

# Install deps first so the layer caches when only source changes.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

FROM caddy:2-alpine
COPY --from=builder /app/dist /srv/static
