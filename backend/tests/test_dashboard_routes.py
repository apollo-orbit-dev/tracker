"""Phase 2.0 — dashboard aggregate endpoints.

Each test seeds a small fixture (1-2 depts × 1-2 projects) and asserts
the aggregate respects dept scope, soft-delete, and the documented
shape.
"""
from collections.abc import Callable
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.db.models import (
    COR,
    Client,
    Department,
    Discipline,
    Milestone,
    Note,
    Project,
    Template,
    User,
    UserRole,
)


def _make_dept_template(db: Session, code: str) -> tuple[Department, Template]:
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
    return d, t


def _make_project(
    db: Session, template_id, *, title: str, state: str = "active", creator_id
) -> Project:
    p = Project(
        project_number=f"DB{title[:6]}",
        title=title,
        template_id=template_id,
        custom_field_values={},
        lifecycle_state=state,
        created_by=creator_id,
    )
    db.add(p)
    db.flush()
    return p


def _grant_viewer(db: Session, user_id, dept_id):
    db.add(UserRole(user_id=user_id, role_id="viewer", department_id=dept_id))
    db.flush()


# ---- lifecycle counts ---------------------------------------------------


def test_lifecycle_requires_auth(client: TestClient):
    assert client.get("/api/dashboard/projects/lifecycle").status_code == 401


def test_lifecycle_counts_grouped(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    _, t = _make_dept_template(db_session, "LCC")
    _make_project(db_session, t.id, title="A1", state="draft", creator_id=admin_user.id)
    _make_project(db_session, t.id, title="A2", state="draft", creator_id=admin_user.id)
    _make_project(db_session, t.id, title="A3", state="active", creator_id=admin_user.id)
    _make_project(db_session, t.id, title="A4", state="complete", creator_id=admin_user.id)
    db_session.commit()
    body = client_as(admin_user).get(
        "/api/dashboard/projects/lifecycle"
    ).json()
    assert body["draft"] == 2
    assert body["active"] == 1
    assert body["complete"] == 1
    assert body["on_hold"] == 0
    assert body["cancelled"] == 0


def test_lifecycle_dept_scope(
    client_as: Callable[[User], TestClient],
    db_session: Session,
    viewer_user: User,
    admin_user: User,
):
    a, t_a = _make_dept_template(db_session, "LCA")
    b, t_b = _make_dept_template(db_session, "LCB")
    _make_project(db_session, t_a.id, title="inA", state="active", creator_id=admin_user.id)
    _make_project(db_session, t_b.id, title="inB", state="active", creator_id=admin_user.id)
    _grant_viewer(db_session, viewer_user.id, a.id)
    db_session.commit()
    body = client_as(viewer_user).get(
        "/api/dashboard/projects/lifecycle"
    ).json()
    assert body["active"] == 1  # only the A-side project


def test_lifecycle_excludes_soft_deleted(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    from datetime import datetime, timezone
    _, t = _make_dept_template(db_session, "LCSD")
    live = _make_project(db_session, t.id, title="live", state="active", creator_id=admin_user.id)
    dead = _make_project(db_session, t.id, title="dead", state="active", creator_id=admin_user.id)
    dead.deleted_at = datetime.now(timezone.utc)
    db_session.flush()
    db_session.commit()
    body = client_as(admin_user).get(
        "/api/dashboard/projects/lifecycle"
    ).json()
    assert body["active"] == 1


# ---- milestone lookahead ------------------------------------------------


def test_milestone_lookahead_includes_past_and_future(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    _, t = _make_dept_template(db_session, "MLA")
    p = _make_project(db_session, t.id, title="proj", state="active", creator_id=admin_user.id)
    today = date.today()
    db_session.add_all([
        Milestone(
            project_id=p.id,
            name="Past Due",
            direction="outbound",
            date_model="single",
            planned_date=today - timedelta(days=5),
            order_index=0,
        ),
        Milestone(
            project_id=p.id,
            name="Soon",
            direction="outbound",
            date_model="single",
            planned_date=today + timedelta(days=3),
            order_index=1,
        ),
        Milestone(
            project_id=p.id,
            name="WayOut",
            direction="outbound",
            date_model="single",
            planned_date=today + timedelta(days=120),  # past future_days
            order_index=2,
        ),
    ])
    db_session.commit()
    body = client_as(admin_user).get(
        "/api/dashboard/milestones/lookahead"
    ).json()
    names = [i["milestone_name"] for i in body["items"]]
    assert "Past Due" in names
    assert "Soon" in names
    assert "WayOut" not in names
    # Past-due first (most overdue → least), then upcoming chronologically.
    assert names.index("Past Due") < names.index("Soon")


def test_milestone_lookahead_includes_very_old_past_due(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    """An overdue milestone from months ago must still surface — past
    due is unbounded; only the upcoming window has a cap."""
    _, t = _make_dept_template(db_session, "MLOLD")
    p = _make_project(db_session, t.id, title="proj", state="active", creator_id=admin_user.id)
    today = date.today()
    db_session.add(
        Milestone(
            project_id=p.id,
            name="WayOverdue",
            direction="outbound",
            date_model="single",
            planned_date=today - timedelta(days=200),
            order_index=0,
        )
    )
    db_session.commit()
    items = client_as(admin_user).get(
        "/api/dashboard/milestones/lookahead"
    ).json()["items"]
    names = [i["milestone_name"] for i in items]
    assert "WayOverdue" in names


def test_milestone_lookahead_ad_hoc_flag(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    _, t = _make_dept_template(db_session, "MLAH")
    p = _make_project(db_session, t.id, title="proj", state="active", creator_id=admin_user.id)
    today = date.today()
    db_session.add(
        Milestone(
            project_id=p.id,
            template_milestone_def_id=None,  # ad-hoc
            name="Ad-hoc",
            direction="internal",
            date_model="single",
            planned_date=today + timedelta(days=2),
            order_index=0,
        )
    )
    db_session.commit()
    items = client_as(admin_user).get(
        "/api/dashboard/milestones/lookahead"
    ).json()["items"]
    ad_hoc = next(i for i in items if i["milestone_name"] == "Ad-hoc")
    assert ad_hoc["ad_hoc"] is True


def test_milestone_lookahead_excludes_with_actual(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    """Milestones that already have an actual_date drop out — they're done."""
    _, t = _make_dept_template(db_session, "MLDONE")
    p = _make_project(db_session, t.id, title="proj", state="active", creator_id=admin_user.id)
    today = date.today()
    db_session.add_all([
        Milestone(
            project_id=p.id,
            name="Open",
            direction="outbound",
            date_model="planned_actual",
            planned_date=today + timedelta(days=5),
            actual_date=None,
            order_index=0,
        ),
        Milestone(
            project_id=p.id,
            name="Done",
            direction="outbound",
            date_model="planned_actual",
            planned_date=today + timedelta(days=5),
            actual_date=today,
            order_index=1,
        ),
    ])
    db_session.commit()
    items = client_as(admin_user).get(
        "/api/dashboard/milestones/lookahead"
    ).json()["items"]
    names = [i["milestone_name"] for i in items]
    assert "Open" in names
    assert "Done" not in names


def test_milestone_lookahead_dept_scope(
    client_as: Callable[[User], TestClient],
    db_session: Session,
    viewer_user: User,
    admin_user: User,
):
    a, t_a = _make_dept_template(db_session, "MLDA")
    b, t_b = _make_dept_template(db_session, "MLDB")
    pa = _make_project(db_session, t_a.id, title="A", state="active", creator_id=admin_user.id)
    pb = _make_project(db_session, t_b.id, title="B", state="active", creator_id=admin_user.id)
    today = date.today()
    for proj, name in [(pa, "A_ms"), (pb, "B_ms")]:
        db_session.add(
            Milestone(
                project_id=proj.id,
                name=name,
                direction="outbound",
                date_model="single",
                planned_date=today + timedelta(days=1),
                order_index=0,
            )
        )
    _grant_viewer(db_session, viewer_user.id, a.id)
    db_session.commit()
    items = client_as(viewer_user).get(
        "/api/dashboard/milestones/lookahead"
    ).json()["items"]
    names = [i["milestone_name"] for i in items]
    assert names == ["A_ms"]


# ---- COR summary --------------------------------------------------------


def test_cor_summary_grouped_with_amount_sum(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    _, t = _make_dept_template(db_session, "CSA")
    p = _make_project(db_session, t.id, title="proj", state="active", creator_id=admin_user.id)
    db_session.add_all([
        COR(
            project_id=p.id,
            number="1",
            description="x",
            amount=Decimal("100.00"),
            status="approved",
        ),
        COR(
            project_id=p.id,
            number="2",
            description="x",
            amount=Decimal("250.50"),
            status="approved",
        ),
        COR(
            project_id=p.id,
            number="3",
            description="x",
            amount=Decimal("50.00"),
            status="submitted",
        ),
    ])
    db_session.commit()
    body = client_as(admin_user).get(
        "/api/dashboard/cors/summary"
    ).json()
    by_status = {row["status"]: row for row in body["by_status"]}
    assert by_status["approved"]["count"] == 2
    assert Decimal(by_status["approved"]["total_amount"]) == Decimal("350.50")
    assert by_status["submitted"]["count"] == 1


def test_cor_summary_excludes_soft_deleted(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    from datetime import datetime, timezone
    _, t = _make_dept_template(db_session, "CSD")
    p = _make_project(db_session, t.id, title="proj", state="active", creator_id=admin_user.id)
    live = COR(
        project_id=p.id,
        number="L",
        description="x",
        amount=Decimal("10.00"),
        status="approved",
    )
    dead = COR(
        project_id=p.id,
        number="D",
        description="x",
        amount=Decimal("999.99"),
        status="approved",
        deleted_at=datetime.now(timezone.utc),
    )
    db_session.add_all([live, dead])
    db_session.commit()
    body = client_as(admin_user).get(
        "/api/dashboard/cors/summary"
    ).json()
    approved = next(r for r in body["by_status"] if r["status"] == "approved")
    assert approved["count"] == 1


# ---- recent activity ----------------------------------------------------


def test_recent_activity_limit_and_order(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    from datetime import datetime, timezone
    _, t = _make_dept_template(db_session, "RA")
    p = _make_project(db_session, t.id, title="proj", state="active", creator_id=admin_user.id)
    # Per-test transaction's `now()` is constant, so set timestamps
    # explicitly to get a deterministic ordering.
    base = datetime(2026, 5, 1, 0, 0, 0, tzinfo=timezone.utc)
    for i in range(5):
        n = Note(
            project_id=p.id,
            body=f"note {i}",
            created_by=admin_user.id,
            created_at=base.replace(second=i),
        )
        db_session.add(n)
    db_session.commit()
    body = client_as(admin_user).get(
        "/api/dashboard/activity/recent?limit=3"
    ).json()
    assert len(body["items"]) == 3
    # Newest first.
    assert body["items"][0]["body_preview"] == "note 4"
    assert body["items"][2]["body_preview"] == "note 2"
    assert body["items"][0]["author_name"] == "Admin"


def test_recent_activity_dept_scope(
    client_as: Callable[[User], TestClient],
    db_session: Session,
    viewer_user: User,
    admin_user: User,
):
    a, t_a = _make_dept_template(db_session, "RADA")
    b, t_b = _make_dept_template(db_session, "RADB")
    pa = _make_project(db_session, t_a.id, title="A", state="active", creator_id=admin_user.id)
    pb = _make_project(db_session, t_b.id, title="B", state="active", creator_id=admin_user.id)
    db_session.add_all([
        Note(project_id=pa.id, body="A-side", created_by=admin_user.id),
        Note(project_id=pb.id, body="B-side", created_by=admin_user.id),
    ])
    _grant_viewer(db_session, viewer_user.id, a.id)
    db_session.commit()
    body = client_as(viewer_user).get(
        "/api/dashboard/activity/recent"
    ).json()
    bodies = [i["body_preview"] for i in body["items"]]
    assert bodies == ["A-side"]
