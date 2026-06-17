"""Seed-script harness.

Reads BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD from the environment,
creates the bootstrap admin user (User + UserRole + AuthProvider rows) on
first run, and is idempotent on subsequent runs (no-ops if a user with that
email already exists).

Invoke: python -m backend.app.seed
"""
import os
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.auth.passwords import hash_password
from backend.app.db.models import AuthProvider, User, UserRole
from backend.app.db.session import SessionLocal

MIN_PASSWORD_LEN = 12


def bootstrap_admin(db: Session, email: str, password: str) -> str:
    email = email.lower().strip()
    existing = db.execute(
        select(User).where(User.email == email)
    ).scalar_one_or_none()
    if existing is not None:
        return f"bootstrap admin already exists: {email}"

    user = User(email=email, display_name="Admin")
    db.add(user)
    db.flush()
    db.add(UserRole(user_id=user.id, role_id="admin"))
    db.add(
        AuthProvider(
            user_id=user.id, provider="local", password_hash=hash_password(password)
        )
    )
    db.commit()
    return f"created bootstrap admin: {email}"


def main(argv: list[str] | None = None) -> int:
    _ = argv if argv is not None else sys.argv[1:]

    email = os.environ.get("BOOTSTRAP_ADMIN_EMAIL", "").strip()
    password = os.environ.get("BOOTSTRAP_ADMIN_PASSWORD", "")

    if not email:
        print("error: BOOTSTRAP_ADMIN_EMAIL is required", file=sys.stderr)
        return 1
    if len(password) < MIN_PASSWORD_LEN:
        print(
            f"error: BOOTSTRAP_ADMIN_PASSWORD must be at least "
            f"{MIN_PASSWORD_LEN} characters",
            file=sys.stderr,
        )
        return 1

    db = SessionLocal()
    try:
        print(bootstrap_admin(db, email, password))
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
