"""Phase 3.1 — integration tests for `/api/admin/audit-log`.

Covers:
- Admin-only gate (non-admins get 403).
- Default date range (last 30 days).
- Filter matrix: entity_type, user_id, project_id (matches column OR
  entity_type='project' AND entity_id=...), from/to.
- Pagination boundary cases.
- Deleted-user rendering (`changed_by_email = "(deleted user)"`).
- Stable ordering by `(changed_at DESC, id DESC)`.
"""
import uuid
from collections.abc import Callable
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.db.models import AuditLog, User


def _audit(
    db,
    *,
    actor: User,
    entity_type: str = "project",
    entity_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    operation: str = "create",
    changes: dict | None = None,
    changed_at: datetime | None = None,
) -> AuditLog:
    row = AuditLog(
        entity_type=entity_type,
        entity_id=entity_id or uuid.uuid4(),
        project_id=project_id,
        operation=operation,
        changes=changes if changes is not None else {},
        changed_by=actor.id,
    )
    if changed_at is not None:
        row.changed_at = changed_at
    db.add(row)
    db.flush()
    return row


# ---- auth gate ---------------------------------------------------------


def test_audit_log_requires_admin(
    client_as: Callable[[User], TestClient], viewer_user: User
):
    r = client_as(viewer_user).get("/api/admin/audit-log")
    assert r.status_code == 403


def test_audit_log_admin_ok(
    client_as: Callable[[User], TestClient], admin_user: User
):
    r = client_as(admin_user).get("/api/admin/audit-log")
    assert r.status_code == 200
    assert "items" in r.json()


# ---- default date range -----------------------------------------------


def test_audit_log_default_range_excludes_old_rows(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    now = datetime.now(timezone.utc)
    _audit(
        db_session,
        actor=admin_user,
        operation="create",
        changes={"recent": True},
        changed_at=now,
    )
    _audit(
        db_session,
        actor=admin_user,
        operation="create",
        changes={"recent": False},
        changed_at=now - timedelta(days=60),
    )
    db_session.commit()
    body = client_as(admin_user).get("/api/admin/audit-log").json()
    flags = [item["changes"].get("recent") for item in body["items"]]
    assert True in flags
    assert False not in flags


# ---- filter matrix ----------------------------------------------------


def test_audit_log_filter_by_entity_type(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    _audit(db_session, actor=admin_user, entity_type="project")
    _audit(db_session, actor=admin_user, entity_type="milestone")
    db_session.commit()
    body = client_as(admin_user).get(
        "/api/admin/audit-log?entity_type=milestone"
    ).json()
    assert all(i["entity_type"] == "milestone" for i in body["items"])
    assert body["total"] == 1


def test_audit_log_unknown_entity_type_422(
    client_as: Callable[[User], TestClient], admin_user: User
):
    r = client_as(admin_user).get(
        "/api/admin/audit-log?entity_type=bogus"
    )
    assert r.status_code == 422


def test_audit_log_filter_by_user_id(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
    viewer_user: User,
):
    _audit(db_session, actor=admin_user)
    _audit(db_session, actor=viewer_user)
    db_session.commit()
    body = client_as(admin_user).get(
        f"/api/admin/audit-log?user_id={viewer_user.id}"
    ).json()
    assert all(
        i["changed_by"] == str(viewer_user.id) for i in body["items"]
    )
    assert body["total"] == 1


def test_audit_log_filter_by_project_id_includes_parent_and_sub_entities(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    project_id = uuid.uuid4()
    # Parent project row: entity_type='project', entity_id=project_id.
    _audit(
        db_session,
        actor=admin_user,
        entity_type="project",
        entity_id=project_id,
        operation="update",
    )
    # Child milestone row: project_id denormalized.
    _audit(
        db_session,
        actor=admin_user,
        entity_type="milestone",
        project_id=project_id,
        operation="create",
    )
    # Unrelated row.
    _audit(
        db_session,
        actor=admin_user,
        entity_type="project",
        operation="create",
    )
    db_session.commit()
    body = client_as(admin_user).get(
        f"/api/admin/audit-log?project_id={project_id}"
    ).json()
    entity_types = sorted(i["entity_type"] for i in body["items"])
    assert entity_types == ["milestone", "project"]


def test_audit_log_filter_by_date_range(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    base = datetime.now(timezone.utc).replace(
        hour=12, minute=0, second=0, microsecond=0
    )
    _audit(db_session, actor=admin_user, changed_at=base)
    _audit(db_session, actor=admin_user, changed_at=base - timedelta(days=10))
    _audit(db_session, actor=admin_user, changed_at=base - timedelta(days=20))
    db_session.commit()
    five_days_ago = (base - timedelta(days=5)).date().isoformat()
    body = client_as(admin_user).get(
        f"/api/admin/audit-log?from={five_days_ago}"
    ).json()
    assert body["total"] == 1


def test_audit_log_from_after_to_422(
    client_as: Callable[[User], TestClient], admin_user: User
):
    r = client_as(admin_user).get(
        "/api/admin/audit-log?from=2026-06-10&to=2026-06-01"
    )
    assert r.status_code == 422


# ---- pagination ------------------------------------------------------


def test_audit_log_pagination_roundtrips(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    for _ in range(7):
        _audit(db_session, actor=admin_user)
    db_session.commit()
    page1 = client_as(admin_user).get(
        "/api/admin/audit-log?limit=3&offset=0"
    ).json()
    page2 = client_as(admin_user).get(
        "/api/admin/audit-log?limit=3&offset=3"
    ).json()
    page3 = client_as(admin_user).get(
        "/api/admin/audit-log?limit=3&offset=6"
    ).json()
    assert page1["total"] == 7
    assert len(page1["items"]) == 3
    assert len(page2["items"]) == 3
    assert len(page3["items"]) == 1
    ids_seen = {i["id"] for i in page1["items"] + page2["items"] + page3["items"]}
    assert len(ids_seen) == 7


def test_audit_log_pagination_offset_past_end(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    _audit(db_session, actor=admin_user)
    db_session.commit()
    body = client_as(admin_user).get(
        "/api/admin/audit-log?limit=5&offset=999"
    ).json()
    assert body["items"] == []


def test_audit_log_pagination_validates_bounds(
    client_as: Callable[[User], TestClient], admin_user: User
):
    assert (
        client_as(admin_user).get("/api/admin/audit-log?limit=0").status_code
        == 422
    )
    assert (
        client_as(admin_user).get("/api/admin/audit-log?limit=999").status_code
        == 422
    )
    assert (
        client_as(admin_user).get("/api/admin/audit-log?offset=-1").status_code
        == 422
    )


# ---- deleted-user rendering ------------------------------------------


def test_audit_log_renders_deleted_user(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    """When a user is deleted, the audit row's `changed_by` FK goes to
    NULL via ON DELETE SET NULL. The viewer renders `changed_by_email`
    as `"(deleted user)"`."""
    transient = User(email="will-delete@example.com", display_name="X")
    db_session.add(transient)
    db_session.flush()
    row = _audit(db_session, actor=transient)
    db_session.delete(transient)
    db_session.commit()
    body = client_as(admin_user).get("/api/admin/audit-log").json()
    matching = [i for i in body["items"] if i["id"] == row.id]
    assert len(matching) == 1
    assert matching[0]["changed_by"] is None
    assert matching[0]["changed_by_email"] == "(deleted user)"


# ---- ordering --------------------------------------------------------


def test_audit_log_orders_by_changed_at_desc(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    base = datetime.now(timezone.utc)
    _audit(
        db_session,
        actor=admin_user,
        operation="create",
        changes={"label": "older"},
        changed_at=base - timedelta(hours=2),
    )
    _audit(
        db_session,
        actor=admin_user,
        operation="create",
        changes={"label": "newer"},
        changed_at=base - timedelta(hours=1),
    )
    db_session.commit()
    body = client_as(admin_user).get("/api/admin/audit-log").json()
    labels = [
        i["changes"].get("label")
        for i in body["items"]
        if i["changes"].get("label") in ("older", "newer")
    ]
    assert labels[0] == "newer"
    assert labels[1] == "older"
