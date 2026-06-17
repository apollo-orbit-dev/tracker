"""Pytest fixtures: test database + per-test transactional session + TestClient.

Strategy:
- Session-scoped `test_engine` fixture drops/recreates `tracker_test` (via a
  maintenance connection to the `postgres` DB), then runs `alembic upgrade
  head` against it.
- Per-test `db_session` opens a transaction on a dedicated connection and
  uses `join_transaction_mode="create_savepoint"` so route handlers can call
  `commit()` (which becomes a SAVEPOINT release) without breaking isolation.
  Teardown rolls back the outer transaction; nothing persists between tests.
- `client` overrides the FastAPI `get_db` dependency to yield the same
  `db_session`, so routes hit the test DB inside the test's transaction.
- `reset_rate_limiter` clears the in-memory login limiter between tests.
"""
import os
from collections.abc import Iterator
from urllib.parse import urlparse, urlunparse

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from backend.app.auth.rate_limit import login_rate_limiter
from backend.app.config import settings
from backend.app.db.session import get_db
from backend.app.main import app


def _maintenance_url(test_db_url: str) -> tuple[str, str]:
    parsed = urlparse(test_db_url)
    test_db_name = parsed.path.lstrip("/")
    maintenance = parsed._replace(path="/postgres")
    return urlunparse(maintenance), test_db_name


@pytest.fixture(scope="session")
def test_engine() -> Iterator[Engine]:
    test_url = settings.test_database_url
    maintenance_url, test_db_name = _maintenance_url(test_url)

    maintenance_engine = create_engine(maintenance_url, isolation_level="AUTOCOMMIT")
    with maintenance_engine.connect() as conn:
        conn.execute(text(f'DROP DATABASE IF EXISTS "{test_db_name}" WITH (FORCE)'))
        conn.execute(text(f'CREATE DATABASE "{test_db_name}"'))
    maintenance_engine.dispose()

    alembic_cfg = Config("alembic.ini")
    os.environ["ALEMBIC_DATABASE_URL"] = test_url
    try:
        command.upgrade(alembic_cfg, "head")
    finally:
        os.environ.pop("ALEMBIC_DATABASE_URL", None)

    engine = create_engine(test_url, pool_pre_ping=True, future=True)
    try:
        yield engine
    finally:
        engine.dispose()
        maintenance_engine = create_engine(maintenance_url, isolation_level="AUTOCOMMIT")
        with maintenance_engine.connect() as conn:
            conn.execute(text(f'DROP DATABASE IF EXISTS "{test_db_name}" WITH (FORCE)'))
        maintenance_engine.dispose()


@pytest.fixture
def db_session(test_engine: Engine) -> Iterator[Session]:
    connection = test_engine.connect()
    transaction = connection.begin()
    SessionLocal = sessionmaker(
        bind=connection,
        autocommit=False,
        autoflush=False,
        future=True,
        join_transaction_mode="create_savepoint",
    )
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        if transaction.is_active:
            transaction.rollback()
        connection.close()


@pytest.fixture
def client(db_session: Session) -> Iterator[TestClient]:
    def _override_get_db() -> Iterator[Session]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.fixture(autouse=True)
def reset_rate_limiter() -> Iterator[None]:
    login_rate_limiter.clear_all()
    yield
    login_rate_limiter.clear_all()


# ---- user-shaped fixtures for RBAC tests ----------------------------------

from collections.abc import Callable

from backend.app.auth.passwords import hash_password
from backend.app.auth.sessions import SESSION_COOKIE_NAME, sign_session
from backend.app.config import settings as _settings
from backend.app.db.models import AuthProvider, Department, User, UserRole


def _make_user(
    db_session: Session,
    *,
    email: str,
    role: str,
    password: str = "longenoughpw",
    department_id: "uuid.UUID | None" = None,  # noqa: F821
) -> User:
    user = User(email=email, display_name=email.split("@", 1)[0].title())
    db_session.add(user)
    db_session.flush()
    db_session.add(
        UserRole(user_id=user.id, role_id=role, department_id=department_id)
    )
    db_session.add(
        AuthProvider(
            user_id=user.id, provider="local", password_hash=hash_password(password)
        )
    )
    db_session.flush()
    return user


def _make_dept(db_session: Session, *, code: str, name: str | None = None) -> Department:
    dept = Department(code=code, name=name or f"Dept {code}")
    db_session.add(dept)
    db_session.flush()
    return dept


@pytest.fixture
def admin_user(db_session: Session) -> User:
    # Org admin: no department scope (NULL).
    return _make_user(db_session, email="admin@example.com", role="admin")


@pytest.fixture
def viewer_user(db_session: Session) -> User:
    # Non-admin roles must have a department under the 1.9.1 schema.
    dept = _make_dept(db_session, code="VIEWER_TEST")
    return _make_user(
        db_session,
        email="viewer@example.com",
        role="viewer",
        department_id=dept.id,
    )


@pytest.fixture
def project_editor_user(db_session: Session) -> User:
    dept = _make_dept(db_session, code="EDITOR_TEST")
    return _make_user(
        db_session,
        email="editor@example.com",
        role="project_editor",
        department_id=dept.id,
    )


@pytest.fixture
def department_manager_user(db_session: Session) -> User:
    dept = _make_dept(db_session, code="DM_TEST", name="DM Test Department")
    return _make_user(
        db_session,
        email="dm@example.com",
        role="department_manager",
        department_id=dept.id,
    )


@pytest.fixture
def client_as(client: TestClient) -> Callable[[User], TestClient]:
    """Return a callable that mints a signed session cookie for the given user
    and attaches it to the TestClient. Also sets the Origin header so unsafe
    methods pass the CSRF middleware.

    Bypasses the login route — useful for the many RBAC permutation tests
    that don't care about the login flow itself.
    """
    def _attach(user: User) -> TestClient:
        token = sign_session(user.id, _settings.session_secret)
        client.cookies.set(SESSION_COOKIE_NAME, token)
        client.headers["Origin"] = "http://localhost:5181"
        return client
    return _attach
