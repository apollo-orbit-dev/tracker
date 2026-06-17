import os
from unittest.mock import patch

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.auth.passwords import verify_password
from backend.app.db.models import AuthProvider, User, UserRole
from backend.app.seed import bootstrap_admin, main


def test_bootstrap_admin_creates_user_role_and_provider(db_session: Session):
    msg = bootstrap_admin(db_session, "admin@example.com", "longenoughpassword")
    assert "created" in msg
    user = db_session.execute(
        select(User).where(User.email == "admin@example.com")
    ).scalar_one()
    assert user.display_name == "Admin"
    roles = {ur.role_id for ur in user.user_roles}
    assert roles == {"admin"}
    provider = db_session.execute(
        select(AuthProvider).where(AuthProvider.user_id == user.id)
    ).scalar_one()
    assert provider.provider == "local"
    assert provider.password_hash is not None
    assert verify_password(provider.password_hash, "longenoughpassword")


def test_bootstrap_admin_idempotent(db_session: Session):
    bootstrap_admin(db_session, "admin@example.com", "longenoughpassword")
    msg = bootstrap_admin(db_session, "admin@example.com", "DIFFERENT_PASS")
    assert "already exists" in msg
    # Only one user
    users = (
        db_session.execute(select(User).where(User.email == "admin@example.com"))
        .scalars()
        .all()
    )
    assert len(users) == 1


def test_bootstrap_admin_lowercases_email(db_session: Session):
    bootstrap_admin(db_session, "Admin@Example.com", "longenoughpassword")
    user = db_session.execute(
        select(User).where(User.email == "admin@example.com")
    ).scalar_one()
    assert user.email == "admin@example.com"


def test_main_missing_email_returns_1(capsys):
    with patch.dict(os.environ, {"BOOTSTRAP_ADMIN_EMAIL": ""}, clear=False):
        rc = main([])
    assert rc == 1
    err = capsys.readouterr().err
    assert "BOOTSTRAP_ADMIN_EMAIL is required" in err


def test_main_short_password_returns_1(capsys):
    with patch.dict(
        os.environ,
        {
            "BOOTSTRAP_ADMIN_EMAIL": "admin@example.com",
            "BOOTSTRAP_ADMIN_PASSWORD": "short",
        },
        clear=False,
    ):
        rc = main([])
    assert rc == 1
    err = capsys.readouterr().err
    assert "at least" in err
