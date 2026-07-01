"""Phase 2.1 — per-user dashboard widget selection.

URLs migrated in Phase 2.4 to nest widget endpoints under a specific
dashboard. `_did(c)` resolves the caller's default dashboard for the
test.
"""
from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.db.models import User, UserDashboardWidget


def _did(c: TestClient) -> str:
    """Lazy-init + return the caller's first dashboard id."""
    return c.get("/api/dashboards").json()["items"][0]["id"]


def _row_count(db: Session, user_id) -> int:
    return (
        db.query(UserDashboardWidget)
        .filter(UserDashboardWidget.user_id == user_id)
        .count()
    )


# ---- list / lazy init ---------------------------------------------------


def test_widgets_requires_auth(client: TestClient):
    # Without a session the dashboards lookup itself 401s before we
    # ever reach the widgets URL.
    assert client.get("/api/dashboards").status_code == 401


def test_widgets_list_lazy_initializes(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    assert _row_count(db_session, admin_user.id) == 0
    c = client_as(admin_user)
    did = _did(c)
    body = c.get(f"/api/dashboards/{did}/widgets").json()
    assert len(body["items"]) == 4
    # Default order is hardcoded in the route.
    assert [w["widget_type"] for w in body["items"]] == [
        "lifecycle",
        "milestone_lookahead",
        "recent_activity",
        "cor_summary",
    ]
    # Rows actually materialized.
    db_session.expire_all()
    assert _row_count(db_session, admin_user.id) == 4


def test_widgets_list_second_call_idempotent(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    c = client_as(admin_user)
    did = _did(c)
    c.get(f"/api/dashboards/{did}/widgets")
    c.get(f"/api/dashboards/{did}/widgets")
    db_session.expire_all()
    assert _row_count(db_session, admin_user.id) == 4


# ---- add ----------------------------------------------------------------


def test_widget_add_duplicate_409(
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    c = client_as(admin_user)
    did = _did(c)
    c.get(f"/api/dashboards/{did}/widgets")  # init
    # The user already has "lifecycle" — adding again should 409.
    r = c.post(
        f"/api/dashboards/{did}/widgets", json={"widget_type": "lifecycle"}
    )
    assert r.status_code == 409


def test_widget_add_my_assignments(
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    # Phase 27.6: the new config-less my_assignments widget is addable.
    c = client_as(admin_user)
    did = _did(c)
    c.get(f"/api/dashboards/{did}/widgets")  # init default set
    r = c.post(
        f"/api/dashboards/{did}/widgets", json={"widget_type": "my_assignments"}
    )
    assert r.status_code == 201, r.text
    assert r.json()["widget_type"] == "my_assignments"


def test_widget_add_unknown_type_422(
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    c = client_as(admin_user)
    did = _did(c)
    c.get(f"/api/dashboards/{did}/widgets")
    r = c.post(
        f"/api/dashboards/{did}/widgets", json={"widget_type": "made_up"}
    )
    assert r.status_code == 422


def test_widget_add_appends_to_end(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    """Remove a widget then add it back — order_index is the new max+1."""
    c = client_as(admin_user)
    did = _did(c)
    body = c.get(f"/api/dashboards/{did}/widgets").json()
    first_id = body["items"][0]["id"]
    c.delete(f"/api/dashboards/{did}/widgets/{first_id}")
    r = c.post(
        f"/api/dashboards/{did}/widgets", json={"widget_type": "lifecycle"}
    )
    assert r.status_code == 201
    new = r.json()
    # Deleted row had order_index 0; remaining were 1-3; new gets 4.
    assert new["order_index"] == 4


# ---- remove -------------------------------------------------------------


def test_widget_remove_self(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    c = client_as(admin_user)
    did = _did(c)
    body = c.get(f"/api/dashboards/{did}/widgets").json()
    wid = body["items"][0]["id"]
    r = c.delete(f"/api/dashboards/{did}/widgets/{wid}")
    assert r.status_code == 204
    db_session.expire_all()
    assert _row_count(db_session, admin_user.id) == 3


def test_widget_remove_other_users_404(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    viewer_user: User,
):
    """A widget id that belongs to another user → 404 (not 403)."""
    admin_c = client_as(admin_user)
    admin_did = _did(admin_c)
    admin_widget_id = (
        admin_c.get(f"/api/dashboards/{admin_did}/widgets").json()["items"][0]["id"]
    )
    # Viewer tries to delete admin's row by guessing the dashboard id.
    viewer_c = client_as(viewer_user)
    viewer_did = _did(viewer_c)
    r = viewer_c.delete(
        f"/api/dashboards/{viewer_did}/widgets/{admin_widget_id}"
    )
    assert r.status_code == 404
    # And aiming the URL at admin's dashboard 404s too — viewer can't
    # see anything in another user's dashboard.
    r2 = viewer_c.delete(
        f"/api/dashboards/{admin_did}/widgets/{admin_widget_id}"
    )
    assert r2.status_code == 404


# ---- reorder ------------------------------------------------------------


def test_widget_reorder_happy(
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    c = client_as(admin_user)
    did = _did(c)
    items = c.get(f"/api/dashboards/{did}/widgets").json()["items"]
    new_order = [items[3]["id"], items[2]["id"], items[1]["id"], items[0]["id"]]
    r = c.post(
        f"/api/dashboards/{did}/widgets/reorder",
        json={"ordered_ids": new_order},
    )
    assert r.status_code == 204
    after = c.get(f"/api/dashboards/{did}/widgets").json()["items"]
    assert [w["id"] for w in after] == new_order


def test_widget_reorder_missing_id_422(
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    c = client_as(admin_user)
    did = _did(c)
    items = c.get(f"/api/dashboards/{did}/widgets").json()["items"]
    r = c.post(
        f"/api/dashboards/{did}/widgets/reorder",
        json={"ordered_ids": [items[0]["id"], items[1]["id"]]},
    )
    assert r.status_code == 422


def test_widget_reorder_does_not_touch_other_user(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    viewer_user: User,
    db_session: Session,
):
    """Two users, two independent dashboards. Reordering A's doesn't
    affect B's order_index values."""
    admin_c0 = client_as(admin_user)
    admin_did = _did(admin_c0)
    admin_items = (
        admin_c0.get(f"/api/dashboards/{admin_did}/widgets").json()["items"]
    )
    viewer_c0 = client_as(viewer_user)
    viewer_did = _did(viewer_c0)
    viewer_items_before = (
        viewer_c0.get(f"/api/dashboards/{viewer_did}/widgets").json()["items"]
    )

    admin_reversed = list(reversed([w["id"] for w in admin_items]))
    client_as(admin_user).post(
        f"/api/dashboards/{admin_did}/widgets/reorder",
        json={"ordered_ids": admin_reversed},
    )

    db_session.expire_all()
    viewer_items_after = (
        client_as(viewer_user)
        .get(f"/api/dashboards/{viewer_did}/widgets")
        .json()["items"]
    )
    assert [w["widget_type"] for w in viewer_items_after] == [
        w["widget_type"] for w in viewer_items_before
    ]
    # Admin's reorder did stick.
    admin_after = (
        client_as(admin_user)
        .get(f"/api/dashboards/{admin_did}/widgets")
        .json()["items"]
    )
    assert [w["id"] for w in admin_after] == admin_reversed


# ---- Phase 2.11.1: column_pos + reorder extension ------------------------


def _post_reorder(client, dashboard_id, payload):
    return client.post(
        f"/api/dashboards/{dashboard_id}/widgets/reorder",
        json=payload,
    )


def test_reorder_new_items_shape_persists_column_pos(
    db_session, client_as, admin_user
):
    """`items: [{id, column}]` writes both order_index and column_pos."""
    c = client_as(admin_user)
    # Seed a dashboard + lazy-init its 4 default widgets via GET.
    dash = c.post("/api/dashboards", json={"name": "T"}).json()
    did = dash["id"]
    widgets = c.get(f"/api/dashboards/{did}/widgets").json()["items"]
    w1, w2, w3 = widgets[0], widgets[1], widgets[2]

    r = _post_reorder(
        c,
        did,
        {
            "items": [
                {"id": w3["id"], "column": 1},
                {"id": w1["id"], "column": 0},
                {"id": w2["id"], "column": 1},
                {"id": widgets[3]["id"], "column": 0},
            ]
        },
    )
    assert r.status_code == 204, r.text

    listing = c.get(f"/api/dashboards/{did}/widgets").json()
    by_id = {w["id"]: w for w in listing["items"]}
    assert by_id[w3["id"]]["order_index"] == 0
    assert by_id[w3["id"]]["column"] == 1
    assert by_id[w1["id"]]["order_index"] == 1
    assert by_id[w1["id"]]["column"] == 0
    assert by_id[w2["id"]]["order_index"] == 2
    assert by_id[w2["id"]]["column"] == 1


def test_reorder_legacy_ordered_ids_still_works_and_resets_column(
    db_session, client_as, admin_user
):
    """`ordered_ids: [...]` is accepted and writes column_pos=0 for all."""
    c = client_as(admin_user)
    dash = c.post("/api/dashboards", json={"name": "T"}).json()
    did = dash["id"]
    widgets = c.get(f"/api/dashboards/{did}/widgets").json()["items"]
    ids = [w["id"] for w in widgets]
    # First put alternating widgets into columns via the new shape, then
    # send a legacy reorder and verify all columns get reset to 0.
    c.post(
        f"/api/dashboards/{did}/widgets/reorder",
        json={
            "items": [
                {"id": ids[0], "column": 0},
                {"id": ids[1], "column": 1},
                {"id": ids[2], "column": 0},
                {"id": ids[3], "column": 1},
            ]
        },
    )
    r = _post_reorder(c, did, {"ordered_ids": list(reversed(ids))})
    assert r.status_code == 204, r.text

    listing = c.get(f"/api/dashboards/{did}/widgets").json()
    assert all(w["column"] == 0 for w in listing["items"])


def test_reorder_rejects_column_out_of_range(db_session, client_as, admin_user):
    c = client_as(admin_user)
    dash = c.post("/api/dashboards", json={"name": "T"}).json()
    did = dash["id"]
    widgets = c.get(f"/api/dashboards/{did}/widgets").json()["items"]
    w1 = widgets[0]
    r = _post_reorder(c, did, {"items": [{"id": w1["id"], "column": 2}]})
    assert r.status_code == 422


def test_reorder_rejects_both_payloads(db_session, client_as, admin_user):
    c = client_as(admin_user)
    dash = c.post("/api/dashboards", json={"name": "T"}).json()
    did = dash["id"]
    widgets = c.get(f"/api/dashboards/{did}/widgets").json()["items"]
    w1 = widgets[0]
    r = _post_reorder(
        c,
        did,
        {"ordered_ids": [w1["id"]], "items": [{"id": w1["id"], "column": 0}]},
    )
    assert r.status_code == 422


def test_reorder_rejects_neither_payload(db_session, client_as, admin_user):
    c = client_as(admin_user)
    dash = c.post("/api/dashboards", json={"name": "T"}).json()
    did = dash["id"]
    r = _post_reorder(c, did, {})
    assert r.status_code == 422


def test_reorder_rejects_unknown_id_in_items(db_session, client_as, admin_user):
    import uuid as _uuid

    c = client_as(admin_user)
    dash = c.post("/api/dashboards", json={"name": "T"}).json()
    did = dash["id"]
    widgets = c.get(f"/api/dashboards/{did}/widgets").json()["items"]
    w1 = widgets[0]
    r = _post_reorder(
        c,
        did,
        {
            "items": [
                {"id": w1["id"], "column": 0},
                {"id": str(_uuid.uuid4()), "column": 1},
            ]
        },
    )
    assert r.status_code == 422


def test_reorder_rejects_duplicate_ids_in_items(db_session, client_as, admin_user):
    c = client_as(admin_user)
    dash = c.post("/api/dashboards", json={"name": "T"}).json()
    did = dash["id"]
    widgets = c.get(f"/api/dashboards/{did}/widgets").json()["items"]
    w1 = widgets[0]
    r = _post_reorder(
        c,
        did,
        {
            "items": [
                {"id": w1["id"], "column": 0},
                {"id": w1["id"], "column": 1},
            ]
        },
    )
    assert r.status_code == 422


def test_dashboard_widget_response_includes_column(
    db_session, client_as, admin_user
):
    """GET /widgets returns the new `column` field on every widget."""
    c = client_as(admin_user)
    dash = c.post("/api/dashboards", json={"name": "T"}).json()
    did = dash["id"]
    listing = c.get(f"/api/dashboards/{did}/widgets").json()
    assert listing["items"], "expected lazy-init to produce default widgets"
    assert all("column" in w for w in listing["items"])
    assert all(w["column"] in (0, 1) for w in listing["items"])
