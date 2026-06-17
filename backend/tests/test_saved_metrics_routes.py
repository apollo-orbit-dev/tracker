"""Phase 7.9 — /api/saved-metrics CRUD.

Personal saved-metric library: owner-scoped rows, configs fully
validated via validate_metric at save time (semantic, not just shape),
50-per-user cap, hard delete.
"""
import uuid
from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.db.models import SavedMetric, User

COUNT_METRIC = {"entity": "project", "aggregation": "count"}


def _mk_saved(
    db: Session, owner_id: uuid.UUID, name: str = "My metric"
) -> SavedMetric:
    m = SavedMetric(owner_user_id=owner_id, name=name, config=COUNT_METRIC)
    db.add(m)
    db.flush()
    return m


def test_saved_metrics_require_auth(client: TestClient):
    assert client.get("/api/saved-metrics").status_code == 401


def test_create_list_rename_delete_saved_metric(
    client_as: Callable[[User], TestClient], viewer_user: User
):
    c = client_as(viewer_user)
    made = c.post(
        "/api/saved-metrics", json={"name": "Zulu count", "config": COUNT_METRIC}
    )
    assert made.status_code == 201
    mid = made.json()["id"]
    assert made.json()["config"]["aggregation"] == "count"

    c.post("/api/saved-metrics", json={"name": "Alpha count", "config": COUNT_METRIC})

    # list ordered by name
    listed = c.get("/api/saved-metrics").json()["items"]
    assert [m["name"] for m in listed] == ["Alpha count", "Zulu count"]

    renamed = c.patch(f"/api/saved-metrics/{mid}", json={"name": "Beta"})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Beta"

    # update with a new config (re-validated)
    upd = c.patch(
        f"/api/saved-metrics/{mid}",
        json={"config": {"entity": "cor", "aggregation": "sum",
                         "target_field": "amount"}},
    )
    assert upd.status_code == 200
    assert upd.json()["config"]["entity"] == "cor"

    assert c.delete(f"/api/saved-metrics/{mid}").status_code == 204
    assert [m["name"] for m in c.get("/api/saved-metrics").json()["items"]] == [
        "Alpha count"
    ]


def test_saved_metrics_owner_scoped(
    client_as: Callable[[User], TestClient],
    viewer_user: User,
    project_editor_user: User,
    db_session: Session,
):
    m = _mk_saved(db_session, viewer_user.id)
    db_session.commit()
    c = client_as(project_editor_user)
    assert c.get("/api/saved-metrics").json()["items"] == []
    assert (
        c.patch(f"/api/saved-metrics/{m.id}", json={"name": "x"}).status_code == 404
    )
    assert c.delete(f"/api/saved-metrics/{m.id}").status_code == 404


def test_saved_metric_config_semantically_validated(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    viewer_user: User,
    db_session: Session,
):
    from backend.tests.test_metric_engine import _field, _taxonomy

    _, t = _taxonomy(db_session, "SM1")
    fd = _field(db_session, t.id, "Kickoff", "boolean")
    db_session.commit()

    c = client_as(admin_user)
    # shape-valid but semantically wrong: sum needs a numeric target
    bad = {"entity": "project", "aggregation": "sum"}
    r = c.post("/api/saved-metrics", json={"name": "Bad", "config": bad})
    assert r.status_code == 422
    assert any("target_field" in reason for reason in r.json()["detail"])

    # op not allowed for the field's kind (admin CAN see the template,
    # so this 422 is the op check, not template access)
    bad_op = {
        "entity": "project", "aggregation": "count",
        "template_id": str(t.id),
        "conditions": {"combinator": "and",
                       "items": [{"field": str(fd.id), "op": "contains",
                                  "value": "x"}]},
    }
    r2 = c.post("/api/saved-metrics", json={"name": "Bad op", "config": bad_op})
    assert r2.status_code == 422
    assert any("not allowed for boolean" in reason for reason in r2.json()["detail"])

    # the update path is re-validated too
    m = _mk_saved(db_session, admin_user.id)
    db_session.commit()
    r3 = c.patch(f"/api/saved-metrics/{m.id}", json={"config": bad})
    assert r3.status_code == 422

    # dept-scoped viewer referencing SM1's template (another dept) gets
    # the unified "template not found" — no existence leak
    cv = client_as(viewer_user)
    foreign = {"entity": "project", "aggregation": "count",
               "template_id": str(t.id)}
    r4 = cv.post("/api/saved-metrics", json={"name": "Foreign", "config": foreign})
    assert r4.status_code == 422
    assert r4.json()["detail"] == ["template not found"]


def test_saved_metric_cap(
    client_as: Callable[[User], TestClient], viewer_user: User, db_session: Session
):
    for i in range(50):
        _mk_saved(db_session, viewer_user.id, name=f"m{i:02d}")
    db_session.commit()
    c = client_as(viewer_user)
    r = c.post("/api/saved-metrics", json={"name": "one too many",
                                           "config": COUNT_METRIC})
    assert r.status_code == 422
    assert "50" in str(r.json()["detail"])
    # the cap applies to create only — update still works at the cap
    mid = c.get("/api/saved-metrics").json()["items"][0]["id"]
    assert (
        c.patch(f"/api/saved-metrics/{mid}", json={"name": "renamed"}).status_code
        == 200
    )


def test_saved_metric_name_whitespace_only_rejected(
    client_as: Callable[[User], TestClient], viewer_user: User, db_session: Session
):
    """Phase 7.12.1: whitespace-only name must 422 at the schema boundary,
    not pass validation and store as empty string after route-level strip."""
    c = client_as(viewer_user)
    # create: spaces-only → 422
    r = c.post("/api/saved-metrics", json={"name": "   ", "config": COUNT_METRIC})
    assert r.status_code == 422

    # update: spaces-only → 422
    m = _mk_saved(db_session, viewer_user.id, name="Good name")
    db_session.commit()
    r2 = c.patch(f"/api/saved-metrics/{m.id}", json={"name": "   "})
    assert r2.status_code == 422

    # valid name with surrounding spaces is trimmed and accepted
    r3 = c.post("/api/saved-metrics", json={"name": "  Trimmed  ", "config": COUNT_METRIC})
    assert r3.status_code == 201
    assert r3.json()["name"] == "Trimmed"
