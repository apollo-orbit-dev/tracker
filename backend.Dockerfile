FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

COPY pyproject.toml ./
# alembic.ini lives at the repo root; without it the container can't
# resolve migration scripts when `alembic upgrade head` runs inside.
COPY alembic.ini ./
COPY backend/ ./backend/

RUN pip install --upgrade pip && \
    pip install -e ".[dev]"

EXPOSE 8000

CMD ["uvicorn", "backend.app.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"]
