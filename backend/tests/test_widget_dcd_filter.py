"""Phase 2.5 — dept/client/discipline filter on the four 2.0 widgets."""
from collections.abc import Callable
from datetime import datetime, timezone
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.db.models import (
    COR,
    Client,
    Department,
    Discipline,
    Project,
    Template,
    User,
    UserRole,
)


def _did(c: TestClient) -> str:
    return c.get("/api/dashboards").json()["items"][0]["id"]


def _make_taxonomy(
    db: Session, code: str
) -> tuple[Department, Client, Discipline, Template]:
    d = Department(code=code, name=f"Dept {code}")
    db.add(d)
    db.flush()
    cl = Client(code=f"CL_{code}", name="cl", department_id=d.id)
    di = Discipline(code=f"DI_{code}", name="di", department_id=d.id)
    db.add_all([cl, di])
    db.flush()
    t = Template(
        name=f"t-{code}",
        department_id=d.id,
        client_id=cl.id,
        discipline_id=di.id,
    )
    db.add(t)
    db.flush()
    return d, cl, di, t


def _make_project(
    db: Session, template_id, *, title: str, state: str = "active", creator_id
) -> Project:
    p = Project(
        project_number=f"DCD{title[:6]}",
        title=title,
        template_id=template_id,
        custom_field_values={},
        lifecycle_state=state,
        created_by=creator_id,
    )
    db.add(p)
    db.flush()
    return p


# ---- validator (via POST /widgets) -------------------------------------


def test_dcd_client_without_dept_422(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    _, cl, _, _ = _make_taxonomy(db_session, "DCD_NDA")
    db_session.commit()
    c = client_as(admin_user)
    did = _did(c)
    r = c.post(
        f"/api/dashboards/{did}/widgets",
        json={
            "widget_type": "lifecycle",
            "config": {"client_id": str(cl.id)},
        },
    )
    assert r.status_code == 422


def test_dcd_client_in_wrong_dept_422(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    d_a, _, _, _ = _make_taxonomy(db_session, "DCD_A")
    _, cl_b, _, _ = _make_taxonomy(db_session, "DCD_B")
    db_session.commit()
    c = client_as(admin_user)
    did = _did(c)
    r = c.post(
        f"/api/dashboards/{did}/widgets",
        json={
            "widget_type": "lifecycle",
            "config": {
                "department_id": str(d_a.id),
                "client_id": str(cl_b.id),  # in B, not A
            },
        },
    )
    assert r.status_code == 422


def test_dcd_discipline_in_wrong_dept_422(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    d_a, _, _, _ = _make_taxonomy(db_session, "DCD_DA")
    _, _, di_b, _ = _make_taxonomy(db_session, "DCD_DB")
    db_session.commit()
    c = client_as(admin_user)
    did = _did(c)
    r = c.post(
        f"/api/dashboards/{did}/widgets",
        json={
            "widget_type": "lifecycle",
            "config": {
                "department_id": str(d_a.id),
                "discipline_id": str(di_b.id),
            },
        },
    )
    assert r.status_code == 422


def test_dcd_dept_not_accessible_422(
    client_as: Callable[[User], TestClient],
    viewer_user: User,
    db_session: Session,
):
    """A viewer can't save a widget config pointing at a dept they
    can't access."""
    other, _, _, _ = _make_taxonomy(db_session, "DCD_NOPE")
    db_session.commit()
    c = client_as(viewer_user)
    did = _did(c)
    r = c.post(
        f"/api/dashboards/{did}/widgets",
        json={
            "widget_type": "lifecycle",
            "config": {"department_id": str(other.id)},
        },
    )
    assert r.status_code == 422


def test_dcd_unknown_config_key_422(
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    c = client_as(admin_user)
    did = _did(c)
    r = c.post(
        f"/api/dashboards/{did}/widgets",
        json={
            "widget_type": "lifecycle",
            "config": {"surprise_field": "x"},
        },
    )
    assert r.status_code == 422


def test_dcd_empty_dict_treated_as_unconfigured(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    """Removing all filters (empty dict) is valid — same effect as null."""
    c = client_as(admin_user)
    did = _did(c)
    # Re-add lifecycle with empty config after deleting the default.
    listed = c.get(f"/api/dashboards/{did}/widgets").json()["items"]
    lifecycle = next(w for w in listed if w["widget_type"] == "lifecycle")
    c.delete(f"/api/dashboards/{did}/widgets/{lifecycle['id']}")
    r = c.post(
        f"/api/dashboards/{did}/widgets",
        json={"widget_type": "lifecycle", "config": {}},
    )
    assert r.status_code == 201


def test_dcd_full_filter_happy(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    d, cl, di, _ = _make_taxonomy(db_session, "DCD_OK")
    db_session.commit()
    c = client_as(admin_user)
    did = _did(c)
    r = c.post(
        f"/api/dashboards/{did}/widgets",
        json={
            "widget_type": "milestone_lookahead",
            "config": {
                "department_id": str(d.id),
                "client_id": str(cl.id),
                "discipline_id": str(di.id),
            },
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["config"]["department_id"] == str(d.id)
    assert body["config"]["client_id"] == str(cl.id)
    assert body["config"]["discipline_id"] == str(di.id)


# ---- data endpoints narrow correctly -----------------------------------


def test_lifecycle_filter_by_department(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    _, _, _, t_a = _make_taxonomy(db_session, "LCF_A")
    d_b, _, _, t_b = _make_taxonomy(db_session, "LCF_B")
    _make_project(db_session, t_a.id, title="A1", state="active", creator_id=admin_user.id)
    _make_project(db_session, t_a.id, title="A2", state="active", creator_id=admin_user.id)
    _make_project(db_session, t_b.id, title="B1", state="active", creator_id=admin_user.id)
    db_session.commit()
    c = client_as(admin_user)
    body = c.get(
        "/api/dashboard/projects/lifecycle",
        params={"department_id": str(d_b.id)},
    ).json()
    assert body["active"] == 1


def test_cors_filter_by_client(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    d, cl_a, _, t_a = _make_taxonomy(db_session, "CORF_A")
    # Second template in the same dept but different client.
    cl_b = Client(code="CORF_OTHER_CL", name="cl-b", department_id=d.id)
    db_session.add(cl_b)
    db_session.flush()
    _, _, _, t_b = _make_taxonomy(db_session, "CORF_B")
    p_a = _make_project(db_session, t_a.id, title="pA", state="active", creator_id=admin_user.id)
    p_b = _make_project(db_session, t_b.id, title="pB", state="active", creator_id=admin_user.id)
    db_session.add_all([
        COR(project_id=p_a.id, number="1", description="x", amount=Decimal("100"), status="approved"),
        COR(project_id=p_b.id, number="2", description="x", amount=Decimal("999"), status="approved"),
    ])
    db_session.commit()
    body = client_as(admin_user).get(
        "/api/dashboard/cors/summary",
        params={"department_id": str(d.id), "client_id": str(cl_a.id)},
    ).json()
    approved = next(r for r in body["by_status"] if r["status"] == "approved")
    assert Decimal(approved["total_amount"]) == Decimal("100")


def test_activity_filter_by_discipline(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    from backend.app.db.models import Note
    d, _, di_a, t_a = _make_taxonomy(db_session, "ACT_A")
    # Another template in same dept but different discipline.
    di_b = Discipline(code="ACT_OTHER", name="di-b", department_id=d.id)
    db_session.add(di_b)
    db_session.flush()
    cl_b = Client(code="ACT_CB", name="cl-b", department_id=d.id)
    db_session.add(cl_b)
    db_session.flush()
    t_b = Template(
        name="t-act-b",
        department_id=d.id,
        client_id=cl_b.id,
        discipline_id=di_b.id,
    )
    db_session.add(t_b)
    db_session.flush()
    p_a = _make_project(db_session, t_a.id, title="pA", state="active", creator_id=admin_user.id)
    p_b = _make_project(db_session, t_b.id, title="pB", state="active", creator_id=admin_user.id)
    base = datetime(2026, 5, 1, tzinfo=timezone.utc)
    db_session.add(Note(project_id=p_a.id, body="A side", created_by=admin_user.id, created_at=base))
    db_session.add(Note(project_id=p_b.id, body="B side", created_by=admin_user.id, created_at=base.replace(second=1)))
    db_session.commit()
    body = client_as(admin_user).get(
        "/api/dashboard/activity/recent",
        params={"department_id": str(d.id), "discipline_id": str(di_a.id)},
    ).json()
    bodies = [a["body_preview"] for a in body["items"]]
    assert bodies == ["A side"]


def test_milestone_lookahead_filter_by_department(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    from datetime import date, timedelta
    from backend.app.db.models import Milestone
    d_a, _, _, t_a = _make_taxonomy(db_session, "MFA")
    d_b, _, _, t_b = _make_taxonomy(db_session, "MFB")
    p_a = _make_project(db_session, t_a.id, title="pA", state="active", creator_id=admin_user.id)
    p_b = _make_project(db_session, t_b.id, title="pB", state="active", creator_id=admin_user.id)
    today = date.today()
    db_session.add(
        Milestone(
            project_id=p_a.id,
            name="A_M",
            direction="outbound",
            date_model="single",
            planned_date=today + timedelta(days=2),
            order_index=0,
        )
    )
    db_session.add(
        Milestone(
            project_id=p_b.id,
            name="B_M",
            direction="outbound",
            date_model="single",
            planned_date=today + timedelta(days=2),
            order_index=0,
        )
    )
    db_session.commit()
    body = client_as(admin_user).get(
        "/api/dashboard/milestones/lookahead",
        params={"department_id": str(d_a.id)},
    ).json()
    names = [m["milestone_name"] for m in body["items"]]
    assert "A_M" in names
    assert "B_M" not in names


def test_dept_scope_still_wins_over_filter(
    client_as: Callable[[User], TestClient],
    viewer_user: User,
    admin_user: User,
    db_session: Session,
):
    """A user can't escape their dept scope by setting a filter on a
    dept they don't have access to. The validator catches it on save,
    but if a config somehow names an inaccessible dept (e.g., user
    lost access after configuring), the data endpoint's dept-scope
    filter still wins and the response is empty."""
    # Build a project in a dept the viewer can't see.
    other_d, _, _, t = _make_taxonomy(db_session, "BYPASS")
    _make_project(db_session, t.id, title="x", state="active", creator_id=admin_user.id)
    db_session.commit()
    # Viewer queries with an explicit filter at that dept. Dept-scope
    # filter (accessible_department_ids) still applies first.
    body = client_as(viewer_user).get(
        "/api/dashboard/projects/lifecycle",
        params={"department_id": str(other_d.id)},
    ).json()
    assert body["active"] == 0
