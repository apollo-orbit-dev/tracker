import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.db.models import AuthProvider, Role, User, UserRole


def test_seed_roles_present(db_session: Session) -> None:
    role_ids = {row.id for row in db_session.execute(select(Role)).scalars()}
    assert role_ids == {"admin", "department_manager", "project_editor", "viewer"}


def test_create_user_and_assign_role(db_session: Session) -> None:
    user = User(email="alice@example.com", display_name="Alice")
    db_session.add(user)
    db_session.flush()

    db_session.add(UserRole(user_id=user.id, role_id="admin"))
    db_session.flush()

    fetched = db_session.execute(
        select(User).where(User.email == "alice@example.com")
    ).scalar_one()
    assert fetched.lifecycle_state == "active"
    assert fetched.created_at is not None
    assert {ur.role_id for ur in fetched.user_roles} == {"admin"}


def test_duplicate_email_rejected(db_session: Session) -> None:
    db_session.add(User(email="dup@example.com", display_name="One"))
    db_session.flush()
    db_session.add(User(email="dup@example.com", display_name="Two"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_invalid_lifecycle_state_rejected(db_session: Session) -> None:
    db_session.add(
        User(email="bad@example.com", display_name="Bad", lifecycle_state="zombie")
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_local_auth_provider_requires_password_hash(db_session: Session) -> None:
    user = User(email="local@example.com", display_name="Local")
    db_session.add(user)
    db_session.flush()
    # Missing password_hash for provider='local' violates the CHECK.
    db_session.add(AuthProvider(user_id=user.id, provider="local"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_okta_auth_provider_requires_subject(db_session: Session) -> None:
    user = User(email="okta@example.com", display_name="Okta")
    db_session.add(user)
    db_session.flush()
    db_session.add(
        AuthProvider(user_id=user.id, provider="okta", password_hash="should-not-be-here")
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_local_auth_provider_with_password_hash_ok(db_session: Session) -> None:
    user = User(email="ok@example.com", display_name="OK")
    db_session.add(user)
    db_session.flush()
    db_session.add(
        AuthProvider(user_id=user.id, provider="local", password_hash="hashed")
    )
    db_session.flush()
    providers = db_session.execute(
        select(AuthProvider).where(AuthProvider.user_id == user.id)
    ).scalars().all()
    assert len(providers) == 1
    assert providers[0].password_hash == "hashed"


def test_one_provider_per_user_per_kind(db_session: Session) -> None:
    user = User(email="dual@example.com", display_name="Dual")
    db_session.add(user)
    db_session.flush()
    db_session.add(
        AuthProvider(user_id=user.id, provider="local", password_hash="a")
    )
    db_session.flush()
    db_session.add(
        AuthProvider(user_id=user.id, provider="local", password_hash="b")
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_user_role_uniqueness_per_dept(db_session: Session) -> None:
    """Post-1.9.1: same (user, role, dept) can't be granted twice.
    Per-dept multi-grant is covered in test_user_roles_scope.py."""
    from backend.app.db.models import Department

    user = User(email="role@example.com", display_name="Role")
    db_session.add(user)
    db_session.flush()
    dept = Department(code="ROLE_TEST", name="Role test")
    db_session.add(dept)
    db_session.flush()
    db_session.add(
        UserRole(user_id=user.id, role_id="viewer", department_id=dept.id)
    )
    db_session.flush()
    db_session.add(
        UserRole(user_id=user.id, role_id="viewer", department_id=dept.id)
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_cascading_delete_removes_auth_providers(db_session: Session) -> None:
    user = User(email="cascade@example.com", display_name="Cascade")
    db_session.add(user)
    db_session.flush()
    db_session.add(
        AuthProvider(user_id=user.id, provider="local", password_hash="hashed")
    )
    db_session.flush()
    user_id = user.id

    db_session.delete(user)
    db_session.flush()

    remaining = db_session.execute(
        select(AuthProvider).where(AuthProvider.user_id == user_id)
    ).scalars().all()
    assert remaining == []


def test_user_id_default_is_uuid(db_session: Session) -> None:
    user = User(email="uuid@example.com", display_name="UUIDed")
    db_session.add(user)
    db_session.flush()
    assert isinstance(user.id, uuid.UUID)
