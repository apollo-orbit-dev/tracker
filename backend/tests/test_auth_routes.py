import time
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.auth.passwords import hash_password
from backend.app.auth.rate_limit import MAX_FAILURES
from backend.app.auth.sessions import (
    SESSION_COOKIE_NAME,
    SESSION_TTL,
    sign_session,
)
from backend.app.config import settings
from backend.app.db.models import AuthProvider, User

ALLOWED_ORIGIN = "http://localhost:5181"
HEADERS = {"Origin": ALLOWED_ORIGIN}


@pytest.fixture
def admin_user(db_session: Session) -> User:
    """Shadows the conftest admin_user fixture — these tests need a specific
    password to drive the real login form."""
    from backend.app.db.models import UserRole

    user = User(email="admin@example.com", display_name="Admin")
    db_session.add(user)
    db_session.flush()
    db_session.add(UserRole(user_id=user.id, role_id="admin"))
    db_session.add(
        AuthProvider(
            user_id=user.id,
            provider="local",
            password_hash=hash_password("correct horse battery staple"),
        )
    )
    db_session.flush()
    return user


def test_login_happy_path_sets_cookie_and_returns_user(
    client: TestClient, admin_user: User
):
    r = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "correct horse battery staple"},
        headers=HEADERS,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == "admin@example.com"
    assert body["roles"] == ["admin"]
    assert "id" in body
    assert SESSION_COOKIE_NAME in r.cookies


def test_login_wrong_password_401(client: TestClient, admin_user: User):
    r = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "WRONG"},
        headers=HEADERS,
    )
    assert r.status_code == 401
    assert r.json()["detail"] == "Invalid email or password"
    assert SESSION_COOKIE_NAME not in r.cookies


def test_login_unknown_email_401(client: TestClient):
    r = client.post(
        "/api/auth/login",
        json={"email": "nobody@example.com", "password": "anything"},
        headers=HEADERS,
    )
    assert r.status_code == 401
    assert r.json()["detail"] == "Invalid email or password"


def test_login_deactivated_user_401(
    client: TestClient, admin_user: User, db_session: Session
):
    admin_user.lifecycle_state = "deactivated"
    db_session.flush()
    r = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "correct horse battery staple"},
        headers=HEADERS,
    )
    assert r.status_code == 401


def test_login_soft_deleted_user_treated_as_unknown(
    client: TestClient, admin_user: User, db_session: Session
):
    from datetime import datetime, timezone

    admin_user.deleted_at = datetime.now(timezone.utc)
    db_session.flush()
    r = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "correct horse battery staple"},
        headers=HEADERS,
    )
    assert r.status_code == 401


def test_login_email_case_insensitive(client: TestClient, admin_user: User):
    r = client.post(
        "/api/auth/login",
        json={"email": "ADMIN@example.com", "password": "correct horse battery staple"},
        headers=HEADERS,
    )
    assert r.status_code == 200


def test_login_rate_limited_after_max_failures(client: TestClient, admin_user: User):
    for _ in range(MAX_FAILURES):
        client.post(
            "/api/auth/login",
            json={"email": "admin@example.com", "password": "WRONG"},
            headers=HEADERS,
        )
    r = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "correct horse battery staple"},
        headers=HEADERS,
    )
    assert r.status_code == 429


def test_successful_login_resets_rate_limit(client: TestClient, admin_user: User):
    for _ in range(MAX_FAILURES - 1):
        client.post(
            "/api/auth/login",
            json={"email": "admin@example.com", "password": "WRONG"},
            headers=HEADERS,
        )
    # one good login resets the counter
    r = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "correct horse battery staple"},
        headers=HEADERS,
    )
    assert r.status_code == 200
    # next failure should NOT trigger rate limit since reset happened
    r = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "WRONG"},
        headers=HEADERS,
    )
    assert r.status_code == 401  # not 429


def test_login_without_origin_blocked_by_csrf_middleware(
    client: TestClient, admin_user: User
):
    r = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "correct horse battery staple"},
    )
    assert r.status_code == 403


def test_me_requires_session_cookie(client: TestClient):
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_me_returns_authenticated_user(client: TestClient, admin_user: User):
    login = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "correct horse battery staple"},
        headers=HEADERS,
    )
    assert login.status_code == 200
    r = client.get("/api/auth/me")
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == "admin@example.com"
    assert body["roles"] == ["admin"]


def test_me_rejects_tampered_cookie(client: TestClient, admin_user: User):
    client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "correct horse battery staple"},
        headers=HEADERS,
    )
    # Tamper the payload (segment before the first '.') — flipping the last
    # byte of the signature alone can be a no-op due to base64url slack.
    original = client.cookies.get(SESSION_COOKIE_NAME)
    payload, rest = original.split(".", 1)
    new_first = "a" if payload[0] != "a" else "b"
    client.cookies.set(SESSION_COOKIE_NAME, new_first + payload[1:] + "." + rest)
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_me_rejects_expired_cookie(client: TestClient, admin_user: User):
    token = sign_session(admin_user.id, settings.session_secret)
    client.cookies.set(SESSION_COOKIE_NAME, token)
    far_future = time.time() + SESSION_TTL.total_seconds() + 60
    with patch("itsdangerous.timed.time.time", return_value=far_future):
        r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_logout_clears_session_cookie(client: TestClient, admin_user: User):
    client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "correct horse battery staple"},
        headers=HEADERS,
    )
    assert SESSION_COOKIE_NAME in client.cookies
    r = client.post("/api/auth/logout", headers=HEADERS)
    assert r.status_code == 204
    # After logout, /me should be 401
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_logout_requires_authentication(client: TestClient):
    r = client.post("/api/auth/logout", headers=HEADERS)
    assert r.status_code == 401


def test_login_with_invalid_email_format_422(client: TestClient):
    r = client.post(
        "/api/auth/login",
        json={"email": "not-an-email", "password": "anything"},
        headers=HEADERS,
    )
    assert r.status_code == 422


def test_login_rehashes_weak_hash(
    client: TestClient, admin_user: User, db_session: Session
):
    """If the stored hash needs rehashing, login should update it."""
    # Replace hash with a hand-crafted weak Argon2 hash (lower memory/time
    # than current defaults). Generate one via the hasher with low params.
    from argon2 import PasswordHasher

    weak_hasher = PasswordHasher(
        time_cost=1, memory_cost=8, parallelism=1
    )
    weak_hash = weak_hasher.hash("correct horse battery staple")
    provider = (
        db_session.query(AuthProvider).filter_by(user_id=admin_user.id).one()
    )
    provider.password_hash = weak_hash
    db_session.flush()

    r = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "correct horse battery staple"},
        headers=HEADERS,
    )
    assert r.status_code == 200

    db_session.refresh(provider)
    # Hash should have been replaced with a strong one.
    assert provider.password_hash != weak_hash


# --- Phase 7.15: manageable-departments (Share-menu target list) ---


def test_manageable_departments_lists_dm_depts(
    client_as, department_manager_user, viewer_user, admin_user, db_session
):
    # DM sees the dept they manage; a plain viewer sees none; admin sees all.
    dm = client_as(department_manager_user).get("/api/auth/me/manageable-departments")
    assert dm.status_code == 200
    assert len(dm.json()) >= 1
    assert client_as(viewer_user).get("/api/auth/me/manageable-departments").json() == []
    admin = client_as(admin_user).get("/api/auth/me/manageable-departments")
    assert admin.status_code == 200  # all live depts
