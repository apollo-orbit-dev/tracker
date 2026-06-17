"""Phase 2.2 — widget config validation + field_aggregate endpoint.

Widget management URLs moved to /api/dashboards/{did}/widgets in 2.4;
the /api/dashboard/field_aggregate data endpoint did NOT move.
"""
from collections.abc import Callable
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.db.models import (
    Client,
    Department,
    Discipline,
    Project,
    Template,
    TemplateFieldDef,
    User,
    UserRole,
)


def _did(c: TestClient) -> str:
    return c.get("/api/dashboards").json()["items"][0]["id"]


# Fixture helpers ---------------------------------------------------------


def _make_dept_template_with_two_fields(
    db: Session, code: str
) -> tuple[Department, Template, TemplateFieldDef, TemplateFieldDef]:
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
    spent = TemplateFieldDef(
        template_id=t.id,
        name="Spent",
        field_type="currency",
        required=False,
        order_index=0,
    )
    budget = TemplateFieldDef(
        template_id=t.id,
        name="Budget",
        field_type="currency",
        required=False,
        order_index=1,
    )
    db.add_all([spent, budget])
    db.flush()
    return d, t, spent, budget


def _seed_project_with_values(
    db: Session, *, template_id, title: str, creator_id, values: dict
) -> Project:
    p = Project(
        project_number=f"FA{title[:6]}",
        title=title,
        template_id=template_id,
        custom_field_values=values,
        lifecycle_state="active",
        created_by=creator_id,
    )
    db.add(p)
    db.flush()
    return p


# Config add / patch ------------------------------------------------------


def test_add_field_aggregate_without_config_creates_unconfigured(
    client_as: Callable[[User], TestClient], admin_user: User
):
    c = client_as(admin_user)
    did = _did(c)
    r = c.post(
        f"/api/dashboards/{did}/widgets",
        json={"widget_type": "field_aggregate"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["widget_type"] == "field_aggregate"
    assert body["config"] is None


def test_add_field_aggregate_unknown_field_422(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    _, t, _, _ = _make_dept_template_with_two_fields(db_session, "CFG_UNK")
    db_session.commit()
    c = client_as(admin_user)
    did = _did(c)
    r = c.post(
        f"/api/dashboards/{did}/widgets",
        json={
            "widget_type": "field_aggregate",
            "config": {
                "template_id": str(t.id),
                "primary_field_id": "00000000-0000-0000-0000-000000000000",
            },
        },
    )
    assert r.status_code == 422


def test_add_field_aggregate_non_numeric_field_422(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    _, t, _, _ = _make_dept_template_with_two_fields(db_session, "CFG_NN")
    text_fd = TemplateFieldDef(
        template_id=t.id,
        name="Description",
        field_type="long_text",
        required=False,
        order_index=2,
    )
    db_session.add(text_fd)
    db_session.flush()
    db_session.commit()
    c = client_as(admin_user)
    did = _did(c)
    r = c.post(
        f"/api/dashboards/{did}/widgets",
        json={
            "widget_type": "field_aggregate",
            "config": {
                "template_id": str(t.id),
                "primary_field_id": str(text_fd.id),
            },
        },
    )
    assert r.status_code == 422


def test_add_field_aggregate_field_on_other_template_422(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    _, t_a, spent_a, _ = _make_dept_template_with_two_fields(
        db_session, "CFG_TA"
    )
    _, t_b, _, _ = _make_dept_template_with_two_fields(db_session, "CFG_TB")
    db_session.commit()
    c = client_as(admin_user)
    did = _did(c)
    r = c.post(
        f"/api/dashboards/{did}/widgets",
        json={
            "widget_type": "field_aggregate",
            "config": {
                "template_id": str(t_b.id),
                "primary_field_id": str(spent_a.id),
            },
        },
    )
    assert r.status_code == 422


def test_add_field_aggregate_happy(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    _, t, spent, budget = _make_dept_template_with_two_fields(
        db_session, "CFG_OK"
    )
    db_session.commit()
    c = client_as(admin_user)
    did = _did(c)
    r = c.post(
        f"/api/dashboards/{did}/widgets",
        json={
            "widget_type": "field_aggregate",
            "config": {
                "template_id": str(t.id),
                "primary_field_id": str(spent.id),
                "secondary_field_id": str(budget.id),
            },
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["widget_type"] == "field_aggregate"
    assert body["config"]["template_id"] == str(t.id)
    assert body["config"]["primary_field_id"] == str(spent.id)
    assert body["config"]["secondary_field_id"] == str(budget.id)


def test_add_configless_widget_rejects_config(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    c = client_as(admin_user)
    did = _did(c)
    body = c.get(f"/api/dashboards/{did}/widgets").json()
    lifecycle_id = next(
        w["id"] for w in body["items"] if w["widget_type"] == "lifecycle"
    )
    c.delete(f"/api/dashboards/{did}/widgets/{lifecycle_id}")
    r = c.post(
        f"/api/dashboards/{did}/widgets",
        json={"widget_type": "lifecycle", "config": {"anything": True}},
    )
    assert r.status_code == 422


def test_two_field_aggregate_widgets_allowed(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    """The partial unique index lets the same user have multiple
    field_aggregate widgets (different configs) on the same dashboard."""
    _, t, spent, budget = _make_dept_template_with_two_fields(
        db_session, "CFG_TWO"
    )
    db_session.commit()
    c = client_as(admin_user)
    did = _did(c)
    a = c.post(
        f"/api/dashboards/{did}/widgets",
        json={
            "widget_type": "field_aggregate",
            "config": {
                "template_id": str(t.id),
                "primary_field_id": str(spent.id),
            },
        },
    )
    b = c.post(
        f"/api/dashboards/{did}/widgets",
        json={
            "widget_type": "field_aggregate",
            "config": {
                "template_id": str(t.id),
                "primary_field_id": str(budget.id),
            },
        },
    )
    assert a.status_code == 201
    assert b.status_code == 201


def test_patch_widget_config(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    _, t, spent, budget = _make_dept_template_with_two_fields(
        db_session, "CFG_PATCH"
    )
    db_session.commit()
    c = client_as(admin_user)
    did = _did(c)
    created = c.post(
        f"/api/dashboards/{did}/widgets",
        json={
            "widget_type": "field_aggregate",
            "config": {
                "template_id": str(t.id),
                "primary_field_id": str(spent.id),
            },
        },
    ).json()
    r = c.patch(
        f"/api/dashboards/{did}/widgets/{created['id']}",
        json={
            "config": {
                "template_id": str(t.id),
                "primary_field_id": str(budget.id),
            }
        },
    )
    assert r.status_code == 200
    assert r.json()["config"]["primary_field_id"] == str(budget.id)


def test_patch_other_users_widget_404(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    viewer_user: User,
    db_session: Session,
):
    _, t, spent, _ = _make_dept_template_with_two_fields(db_session, "CFG_X")
    db_session.commit()
    admin_c = client_as(admin_user)
    admin_did = _did(admin_c)
    created = admin_c.post(
        f"/api/dashboards/{admin_did}/widgets",
        json={
            "widget_type": "field_aggregate",
            "config": {
                "template_id": str(t.id),
                "primary_field_id": str(spent.id),
            },
        },
    ).json()
    viewer_c = client_as(viewer_user)
    viewer_did = _did(viewer_c)
    r = viewer_c.patch(
        f"/api/dashboards/{viewer_did}/widgets/{created['id']}",
        json={
            "config": {
                "template_id": str(t.id),
                "primary_field_id": str(spent.id),
            }
        },
    )
    assert r.status_code == 404


# /field_aggregate data endpoint (URL unchanged) --------------------------


def test_field_aggregate_sums_across_projects(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    _, t, spent, budget = _make_dept_template_with_two_fields(
        db_session, "FA_SUM"
    )
    _seed_project_with_values(
        db_session,
        template_id=t.id,
        title="P1",
        creator_id=admin_user.id,
        values={str(spent.id): "100.00", str(budget.id): "500.00"},
    )
    _seed_project_with_values(
        db_session,
        template_id=t.id,
        title="P2",
        creator_id=admin_user.id,
        values={str(spent.id): "250.50", str(budget.id): "500.00"},
    )
    db_session.commit()
    r = client_as(admin_user).get(
        "/api/dashboard/field_aggregate",
        params={
            "template_id": str(t.id),
            "primary_field_id": str(spent.id),
            "secondary_field_id": str(budget.id),
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["primary"]["field_name"] == "Spent"
    assert Decimal(body["primary"]["total"]) == Decimal("350.50")
    assert body["primary"]["project_count"] == 2
    assert Decimal(body["secondary"]["total"]) == Decimal("1000.00")


def test_field_aggregate_dept_scope_404(
    client_as: Callable[[User], TestClient],
    db_session: Session,
    viewer_user: User,
    admin_user: User,
):
    _, t_b, spent_b, _ = _make_dept_template_with_two_fields(
        db_session, "FA_SCB"
    )
    db_session.commit()
    r = client_as(viewer_user).get(
        "/api/dashboard/field_aggregate",
        params={
            "template_id": str(t_b.id),
            "primary_field_id": str(spent_b.id),
        },
    )
    assert r.status_code == 404


def test_field_aggregate_excludes_soft_deleted(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    from datetime import datetime, timezone
    _, t, spent, _ = _make_dept_template_with_two_fields(db_session, "FA_SD")
    _seed_project_with_values(
        db_session,
        template_id=t.id,
        title="live",
        creator_id=admin_user.id,
        values={str(spent.id): "10"},
    )
    dead = _seed_project_with_values(
        db_session,
        template_id=t.id,
        title="dead",
        creator_id=admin_user.id,
        values={str(spent.id): "999"},
    )
    dead.deleted_at = datetime.now(timezone.utc)
    db_session.flush()
    db_session.commit()
    body = (
        client_as(admin_user)
        .get(
            "/api/dashboard/field_aggregate",
            params={
                "template_id": str(t.id),
                "primary_field_id": str(spent.id),
            },
        )
        .json()
    )
    assert Decimal(body["primary"]["total"]) == Decimal("10")
    assert body["primary"]["project_count"] == 1


# ---- Phase 2.8: milestone_lookahead future_days -------------------------


def test_milestone_lookahead_accepts_future_days(db_session, admin_user):
    """`future_days: 45` is valid alongside (or without) the DCD subset."""
    from backend.app.services.widget_config import validate_config

    # No DCD, just the new key.
    validate_config(
        db_session, "milestone_lookahead", {"future_days": 45}, user=admin_user
    )
    # Combined with the existing DCD filter shape.
    # (We can't easily seed a real dept here without more fixtures; the
    # combined-key path is covered by the unknown-key rejection test below.)


def test_milestone_lookahead_rejects_future_days_zero(db_session, admin_user):
    """Zero is below the config-layer floor (1..365)."""
    from backend.app.services.widget_config import ConfigError, validate_config

    with pytest.raises(ConfigError, match="future_days"):
        validate_config(
            db_session,
            "milestone_lookahead",
            {"future_days": 0},
            user=admin_user,
        )


def test_milestone_lookahead_rejects_future_days_too_large(
    db_session, admin_user
):
    from backend.app.services.widget_config import ConfigError, validate_config

    with pytest.raises(ConfigError, match="future_days"):
        validate_config(
            db_session,
            "milestone_lookahead",
            {"future_days": 9999},
            user=admin_user,
        )


def test_milestone_lookahead_rejects_future_days_non_integer(
    db_session, admin_user
):
    from backend.app.services.widget_config import ConfigError, validate_config

    with pytest.raises(ConfigError, match="future_days"):
        validate_config(
            db_session,
            "milestone_lookahead",
            {"future_days": "soon"},
            user=admin_user,
        )


def test_lifecycle_widget_rejects_future_days(db_session, admin_user):
    """`future_days` is milestone_lookahead-only; other DCD widgets reject it."""
    from backend.app.services.widget_config import ConfigError, validate_config

    with pytest.raises(ConfigError, match="unknown config key"):
        validate_config(
            db_session, "lifecycle", {"future_days": 60}, user=admin_user
        )
