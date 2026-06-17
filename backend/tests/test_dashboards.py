"""Phase 2.4 — tabbed dashboards CRUD + per-dashboard widget isolation."""
from collections.abc import Callable

from fastapi.testclient import TestClient

from backend.app.db.models import User


# ---- list / lazy init ---------------------------------------------------


def test_dashboards_requires_auth(client: TestClient):
    assert client.get("/api/dashboards").status_code == 401


def test_dashboards_list_lazy_initializes(
    client_as: Callable[[User], TestClient], admin_user: User
):
    body = client_as(admin_user).get("/api/dashboards").json()
    assert len(body["items"]) == 1
    assert body["items"][0]["name"] == "Dashboard"
    assert body["items"][0]["order_index"] == 0


def test_dashboards_list_second_call_idempotent(
    client_as: Callable[[User], TestClient], admin_user: User
):
    c = client_as(admin_user)
    c.get("/api/dashboards")
    body = c.get("/api/dashboards").json()
    assert len(body["items"]) == 1


# ---- create / update / delete ------------------------------------------


def test_dashboard_create_appends(
    client_as: Callable[[User], TestClient], admin_user: User
):
    c = client_as(admin_user)
    c.get("/api/dashboards")  # init default
    r = c.post("/api/dashboards", json={"name": "Exec view"})
    assert r.status_code == 201
    assert r.json()["name"] == "Exec view"
    assert r.json()["order_index"] == 1
    body = c.get("/api/dashboards").json()
    assert [d["name"] for d in body["items"]] == ["Dashboard", "Exec view"]


def test_dashboard_rename(
    client_as: Callable[[User], TestClient], admin_user: User
):
    c = client_as(admin_user)
    d = c.get("/api/dashboards").json()["items"][0]
    r = c.patch(f"/api/dashboards/{d['id']}", json={"name": "My Stuff"})
    assert r.status_code == 200
    assert r.json()["name"] == "My Stuff"


def test_dashboard_delete_last_blocked(
    client_as: Callable[[User], TestClient], admin_user: User
):
    """Cannot delete the user's only dashboard."""
    c = client_as(admin_user)
    d = c.get("/api/dashboards").json()["items"][0]
    r = c.delete(f"/api/dashboards/{d['id']}")
    assert r.status_code == 422


def test_dashboard_delete_cascades_widgets(
    client_as: Callable[[User], TestClient], admin_user: User
):
    """Deleting a non-last dashboard CASCADEs its widgets."""
    c = client_as(admin_user)
    c.get("/api/dashboards")  # default
    extra = c.post("/api/dashboards", json={"name": "Tab B"}).json()
    # Materialize widgets on Tab B
    c.get(f"/api/dashboards/{extra['id']}/widgets")
    r = c.delete(f"/api/dashboards/{extra['id']}")
    assert r.status_code == 204
    # GETting the dashboards now returns only the default.
    body = c.get("/api/dashboards").json()
    assert [d["name"] for d in body["items"]] == ["Dashboard"]


def test_dashboard_other_users_id_404(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    viewer_user: User,
):
    """Touching another user's dashboard id 404s — existence hidden."""
    admin_did = client_as(admin_user).get("/api/dashboards").json()["items"][0]["id"]
    viewer_c = client_as(viewer_user)
    assert (
        viewer_c.patch(
            f"/api/dashboards/{admin_did}", json={"name": "x"}
        ).status_code
        == 404
    )
    assert viewer_c.delete(f"/api/dashboards/{admin_did}").status_code == 404


# ---- reorder ------------------------------------------------------------


def test_dashboards_reorder(
    client_as: Callable[[User], TestClient], admin_user: User
):
    c = client_as(admin_user)
    c.get("/api/dashboards")
    c.post("/api/dashboards", json={"name": "B"})
    c.post("/api/dashboards", json={"name": "C"})
    listed = c.get("/api/dashboards").json()["items"]
    reversed_ids = list(reversed([d["id"] for d in listed]))
    r = c.post("/api/dashboards/reorder", json={"ordered_ids": reversed_ids})
    assert r.status_code == 204
    after = c.get("/api/dashboards").json()["items"]
    assert [d["id"] for d in after] == reversed_ids


# ---- per-dashboard widget isolation ------------------------------------


def test_widgets_isolated_by_dashboard(
    client_as: Callable[[User], TestClient], admin_user: User
):
    """Widgets on dashboard A don't appear on dashboard B; both
    dashboards lazy-init their own default set."""
    c = client_as(admin_user)
    did_a = c.get("/api/dashboards").json()["items"][0]["id"]
    did_b = c.post("/api/dashboards", json={"name": "B"}).json()["id"]
    a_widgets = c.get(f"/api/dashboards/{did_a}/widgets").json()["items"]
    b_widgets = c.get(f"/api/dashboards/{did_b}/widgets").json()["items"]
    a_ids = {w["id"] for w in a_widgets}
    b_ids = {w["id"] for w in b_widgets}
    assert a_ids.isdisjoint(b_ids)
    # Both dashboards have the same default widget types.
    assert sorted(w["widget_type"] for w in a_widgets) == sorted(
        w["widget_type"] for w in b_widgets
    )


def test_widget_id_from_wrong_dashboard_404(
    client_as: Callable[[User], TestClient], admin_user: User
):
    """A widget id from dashboard A under URL /dashboards/B/... 404s."""
    c = client_as(admin_user)
    did_a = c.get("/api/dashboards").json()["items"][0]["id"]
    did_b = c.post("/api/dashboards", json={"name": "B"}).json()["id"]
    a_widget_id = c.get(f"/api/dashboards/{did_a}/widgets").json()["items"][0]["id"]
    r = c.delete(f"/api/dashboards/{did_b}/widgets/{a_widget_id}")
    assert r.status_code == 404
    r2 = c.patch(
        f"/api/dashboards/{did_b}/widgets/{a_widget_id}",
        json={"width": 2},
    )
    assert r2.status_code == 404


def test_same_widget_type_on_two_dashboards_ok(
    client_as: Callable[[User], TestClient], admin_user: User
):
    """The partial unique is scoped per-dashboard — same widget_type
    can live on each tab independently."""
    c = client_as(admin_user)
    did_a = c.get("/api/dashboards").json()["items"][0]["id"]
    did_b = c.post("/api/dashboards", json={"name": "B"}).json()["id"]
    a_widgets = c.get(f"/api/dashboards/{did_a}/widgets").json()["items"]
    b_widgets = c.get(f"/api/dashboards/{did_b}/widgets").json()["items"]
    # Each dashboard owns a lifecycle widget.
    assert any(w["widget_type"] == "lifecycle" for w in a_widgets)
    assert any(w["widget_type"] == "lifecycle" for w in b_widgets)
