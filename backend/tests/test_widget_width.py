"""Phase 2.3 — widget width.

Widget endpoints moved under /api/dashboards/{did}/widgets in 2.4.
"""
from collections.abc import Callable

from fastapi.testclient import TestClient

from backend.app.db.models import User


def _did(c: TestClient) -> str:
    return c.get("/api/dashboards").json()["items"][0]["id"]


def test_lazy_init_writes_per_type_widths(
    client_as: Callable[[User], TestClient], admin_user: User
):
    c = client_as(admin_user)
    did = _did(c)
    body = c.get(f"/api/dashboards/{did}/widgets").json()
    by_type = {w["widget_type"]: w["width"] for w in body["items"]}
    assert by_type == {
        "lifecycle": 2,
        "milestone_lookahead": 1,
        "recent_activity": 1,
        "cor_summary": 2,
    }


def test_new_widget_defaults_to_width_1(
    client_as: Callable[[User], TestClient], admin_user: User
):
    """A widget added via POST gets the DB column DEFAULT (1) unless the
    caller specifies otherwise — and they can't, since the create body
    has no width field."""
    c = client_as(admin_user)
    did = _did(c)
    c.get(f"/api/dashboards/{did}/widgets")  # init
    listed = c.get(f"/api/dashboards/{did}/widgets").json()["items"]
    cor = next(w for w in listed if w["widget_type"] == "cor_summary")
    c.delete(f"/api/dashboards/{did}/widgets/{cor['id']}")
    r = c.post(
        f"/api/dashboards/{did}/widgets",
        json={"widget_type": "cor_summary"},
    )
    assert r.status_code == 201
    assert r.json()["width"] == 1


def test_patch_width_happy(
    client_as: Callable[[User], TestClient], admin_user: User
):
    c = client_as(admin_user)
    did = _did(c)
    listed = c.get(f"/api/dashboards/{did}/widgets").json()["items"]
    narrow = next(w for w in listed if w["width"] == 1)
    r = c.patch(
        f"/api/dashboards/{did}/widgets/{narrow['id']}",
        json={"width": 2},
    )
    assert r.status_code == 200
    assert r.json()["width"] == 2


def test_patch_width_invalid_422(
    client_as: Callable[[User], TestClient], admin_user: User
):
    c = client_as(admin_user)
    did = _did(c)
    listed = c.get(f"/api/dashboards/{did}/widgets").json()["items"]
    target = listed[0]
    assert (
        c.patch(
            f"/api/dashboards/{did}/widgets/{target['id']}",
            json={"width": 3},
        ).status_code
        == 422
    )
    assert (
        c.patch(
            f"/api/dashboards/{did}/widgets/{target['id']}",
            json={"width": 0},
        ).status_code
        == 422
    )


def test_patch_width_alone_preserves_config(
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    """PATCH must be partial — sending only width can't blow away an
    existing config. Uses an unconfigured field_aggregate as the
    fixture so we can assert config is preserved at None."""
    c = client_as(admin_user)
    did = _did(c)
    created = c.post(
        f"/api/dashboards/{did}/widgets",
        json={"widget_type": "field_aggregate"},
    ).json()
    assert created["config"] is None
    assert created["width"] == 1
    r = c.patch(
        f"/api/dashboards/{did}/widgets/{created['id']}",
        json={"width": 2},
    )
    assert r.status_code == 200
    assert r.json()["width"] == 2
    assert r.json()["config"] is None
