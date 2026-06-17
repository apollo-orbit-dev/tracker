# Production backend image.
#
# Differs from the dev shell (../backend.Dockerfile + docker-compose.yml
# bind-mounts) in three ways: no editable install, no --reload, and an
# entrypoint that runs Alembic migrations against the live DB before
# starting uvicorn. The container is intended for use with
# docker-compose.prod.yml (which does NOT bind-mount source).

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Non-root user. Defense-in-depth: even if the app is compromised,
# container privilege escalation is harder.
RUN groupadd --gid 1000 tracker && \
    useradd  --uid 1000 --gid tracker --create-home --shell /sbin/nologin tracker

WORKDIR /app

# Build context is the repo root (see docker-compose.prod.yml). That
# lets us pull pyproject.toml + alembic.ini + the backend source from
# their canonical locations.
COPY pyproject.toml ./
COPY alembic.ini ./
COPY backend/ ./backend/

RUN pip install --upgrade pip && \
    pip install . && \
    chmod +x backend/entrypoint.sh && \
    cp backend/entrypoint.sh /app/entrypoint.sh && \
    chown -R tracker:tracker /app

USER tracker
EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
# Production CMD: no --reload. --proxy-headers + --forwarded-allow-ips=*
# tells uvicorn to honor X-Forwarded-For from the trusted Caddy reverse
# proxy so request.client.host reflects the real client IP (relevant for
# the login rate limiter). Safe under "everything goes through Caddy";
# unsafe if the container is ever exposed directly to the internet.
CMD ["uvicorn", "backend.app.main:app", \
     "--host", "0.0.0.0", "--port", "8000", \
     "--proxy-headers", "--forwarded-allow-ips=*"]
