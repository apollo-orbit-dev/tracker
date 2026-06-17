"""Phase 2.4 (item #6) — user-overridable widget title.

Widget endpoints moved under /api/dashboards/{did}/widgets in 2.4.
"""
from collections.abc import Callable

from fastapi.testclient import TestClient

from backend.app.db.models import User


def _did(c: TestClient) -> str:
    return c.get("/api/dashboards").json()["items"][0]["id"]


def test_widget_title_defaults_to_null(
    client_as: Callable[[User], TestClient], admin_user: User
):
    c = client_as(admin_user)
    did = _did(c)
    body = c.get(f"/api/dashboards/{did}/widgets").json()
    assert all(w["title"] is None for w in body["items"])


def test_patch_sets_title(
    client_as: Callable[[User], TestClient], admin_user: User
):
    c = client_as(admin_user)
    did = _did(c)
    w = c.get(f"/api/dashboards/{did}/widgets").json()["items"][0]
    r = c.patch(
        f"/api/dashboards/{did}/widgets/{w['id']}",
        json={"title": "DEC Design Design Budget vs Spent"},
    )
    assert r.status_code == 200
    assert r.json()["title"] == "DEC Design Design Budget vs Spent"


def test_patch_clears_title_to_null(
    client_as: Callable[[User], TestClient], admin_user: User
):
    c = client_as(admin_user)
    did = _did(c)
    w = c.get(f"/api/dashboards/{did}/widgets").json()["items"][0]
    c.patch(
        f"/api/dashboards/{did}/widgets/{w['id']}",
        json={"title": "named"},
    )
    r = c.patch(
        f"/api/dashboards/{did}/widgets/{w['id']}",
        json={"title": None},
    )
    assert r.status_code == 200
    assert r.json()["title"] is None


def test_patch_blank_title_normalizes_to_null(
    client_as: Callable[[User], TestClient], admin_user: User
):
    c = client_as(admin_user)
    did = _did(c)
    w = c.get(f"/api/dashboards/{did}/widgets").json()["items"][0]
    c.patch(
        f"/api/dashboards/{did}/widgets/{w['id']}",
        json={"title": "previously set"},
    )
    r = c.patch(
        f"/api/dashboards/{did}/widgets/{w['id']}",
        json={"title": "   "},
    )
    assert r.status_code == 200
    assert r.json()["title"] is None


def test_patch_title_too_long_422(
    client_as: Callable[[User], TestClient], admin_user: User
):
    c = client_as(admin_user)
    did = _did(c)
    w = c.get(f"/api/dashboards/{did}/widgets").json()["items"][0]
    r = c.patch(
        f"/api/dashboards/{did}/widgets/{w['id']}",
        json={"title": "x" * 201},
    )
    assert r.status_code == 422


def test_patch_title_alone_preserves_other_fields(
    client_as: Callable[[User], TestClient], admin_user: User
):
    """Partial-update semantics — sending only title can't blow away
    config or width."""
    c = client_as(admin_user)
    did = _did(c)
    created = c.post(
        f"/api/dashboards/{did}/widgets",
        json={"widget_type": "field_aggregate"},
    ).json()
    c.patch(
        f"/api/dashboards/{did}/widgets/{created['id']}",
        json={"width": 2},
    )
    r = c.patch(
        f"/api/dashboards/{did}/widgets/{created['id']}",
        json={"title": "renamed"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "renamed"
    assert body["width"] == 2
    assert body["config"] is None
