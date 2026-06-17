#!/bin/sh
# Production entrypoint: apply migrations against the configured DB,
# then hand off to the CMD (uvicorn by default).
#
# If alembic fails the container exits non-zero and Docker's
# restart-policy decides what to do — the previous version (still
# running until we recreate) keeps serving traffic. This is the same
# pattern Symmachia uses.
set -e

alembic upgrade head

exec "$@"
