"""Phase 7.2 — metric engine + /api/metrics/eval.

Each test seeds a small dept/template fixture and asserts the engine
respects op whitelists, template access, dept scope, and returns the
documented Decimal-as-string payloads.
"""
import uuid
from collections.abc import Callable
from datetime import date, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.db.models import (
    COR,
    Client,
    Department,
    Discipline,
    Milestone,
    Project,
    ProjectRoleAssignment,
    Template,
    TemplateFieldDef,
    User,
    UserRole,
)


def _taxonomy(db: Session, code: str):
    dept = Department(code=code, name=f"{code} dept")
    db.add(dept)
    db.flush()
    cl = Client(department_id=dept.id, code=f"{code}C", name="client")
    di = Discipline(department_id=dept.id, code=f"{code}D", name="disc")
    db.add_all([cl, di])
    db.flush()
    t = Template(
        name=f"t-{code}",
        department_id=dept.id,
        client_id=cl.id,
        discipline_id=di.id,
    )
    db.add(t)
    db.flush()
    return dept, t


def _grant(db: Session, user: User, dept_id: uuid.UUID, role: str = "viewer"):
    db.add(UserRole(user_id=user.id, role_id=role, department_id=dept_id))
    db.flush()


def _field(db: Session, template_id: uuid.UUID, name: str, ftype: str, options=None):
    fd = TemplateFieldDef(
        template_id=template_id, name=name, field_type=ftype, options=options
    )
    db.add(fd)
    db.flush()
    return fd


def _project(
    db: Session, template_id: uuid.UUID, creator: User,
    *, state="active", cfv=None, title="P",
):
    p = Project(
        project_number=f"M-{uuid.uuid4().hex[:6]}",
        title=title,
        template_id=template_id,
        lifecycle_state=state,
        custom_field_values=cfv or {},
        created_by=creator.id,
    )
    db.add(p)
    db.flush()
    return p


def _milestone(db: Session, project_id, name="m", direction="outbound", planned=None, actual=None):
    ms = Milestone(
        project_id=project_id, name=name, direction=direction,
        date_model="planned_actual", planned_date=planned, actual_date=actual,
    )
    db.add(ms)
    db.flush()
    return ms


def _cor(db: Session, project_id, number="1", amount=0, status="draft"):
    c = COR(project_id=project_id, number=number, description="d",
            amount=amount, status=status)
    db.add(c)
    db.flush()
    return c


def test_eval_requires_auth(client: TestClient):
    # Origin header satisfies the CSRF middleware (which 403s first) so
    # this asserts the auth gate itself.
    body = {"entity": "project", "aggregation": "count"}
    r = client.post(
        "/api/metrics/eval",
        json=body,
        headers={"Origin": "http://localhost:5181"},
    )
    assert r.status_code == 401


def test_count_boolean_false(
    client_as: Callable[[User], TestClient], admin_user: User, db_session: Session
):
    _, t = _taxonomy(db_session, "ME1")
    fd = _field(db_session, t.id, "Kickoff held", "boolean")
    _project(db_session, t.id, admin_user, cfv={str(fd.id): False})
    _project(db_session, t.id, admin_user, cfv={str(fd.id): False})
    _project(db_session, t.id, admin_user, cfv={str(fd.id): True})
    _project(db_session, t.id, admin_user)  # unset: not counted by is_false
    db_session.commit()
    r = client_as(admin_user).post(
        "/api/metrics/eval",
        json={
            "entity": "project",
            "aggregation": "count",
            "template_id": str(t.id),
            "conditions": {
                "combinator": "and",
                "items": [{"field": str(fd.id), "op": "is_false"}],
            },
        },
    )
    assert r.status_code == 200
    assert Decimal(r.json()["value"]) == 2


def test_sum_numeric_field_with_select_condition(
    client_as: Callable[[User], TestClient], admin_user: User, db_session: Session
):
    _, t = _taxonomy(db_session, "ME2")
    region = _field(
        db_session, t.id, "Region", "single_select",
        options={"choices": ["North", "South"]},
    )
    budget = _field(db_session, t.id, "Budget", "currency")
    _project(db_session, t.id, admin_user, cfv={str(region.id): "North", str(budget.id): 100})
    _project(db_session, t.id, admin_user, cfv={str(region.id): "North", str(budget.id): 250})
    _project(db_session, t.id, admin_user, cfv={str(region.id): "South", str(budget.id): 999})
    db_session.commit()
    r = client_as(admin_user).post(
        "/api/metrics/eval",
        json={
            "entity": "project",
            "aggregation": "sum",
            "template_id": str(t.id),
            "target_field": str(budget.id),
            "conditions": {
                "combinator": "and",
                "items": [{"field": str(region.id), "op": "in", "value": ["North"]}],
            },
        },
    )
    assert Decimal(r.json()["value"]) == 350


def test_milestone_overdue_count(
    client_as: Callable[[User], TestClient], admin_user: User, db_session: Session
):
    _, t = _taxonomy(db_session, "ME3")
    p = _project(db_session, t.id, admin_user)
    past = date.today() - timedelta(days=10)
    future = date.today() + timedelta(days=10)
    db_session.add_all([
        Milestone(project_id=p.id, name="late", direction="outbound",
                  date_model="planned_actual", planned_date=past),
        Milestone(project_id=p.id, name="ok", direction="outbound",
                  date_model="planned_actual", planned_date=future),
    ])
    db_session.commit()
    r = client_as(admin_user).post(
        "/api/metrics/eval",
        json={
            "entity": "milestone",
            "aggregation": "count",
            "conditions": {
                "combinator": "and",
                "items": [
                    {"field": "planned", "op": "before", "value": "today"},
                    {"field": "actual", "op": "is_empty"},
                ],
            },
        },
    )
    assert Decimal(r.json()["value"]) == 1


def test_cor_open_exposure_sum(
    client_as: Callable[[User], TestClient], admin_user: User, db_session: Session
):
    _, t = _taxonomy(db_session, "ME4")
    p = _project(db_session, t.id, admin_user)
    db_session.add_all([
        COR(project_id=p.id, number="1", description="d", amount=1000, status="submitted"),
        COR(project_id=p.id, number="2", description="d", amount=500, status="draft"),
        COR(project_id=p.id, number="3", description="d", amount=9999, status="approved"),
    ])
    db_session.commit()
    r = client_as(admin_user).post(
        "/api/metrics/eval",
        json={
            "entity": "cor",
            "aggregation": "sum",
            "target_field": "amount",
            "scope": {"cor_status": ["submitted", "draft"]},
        },
    )
    assert Decimal(r.json()["value"]) == 1500


def test_dept_scope_enforced(
    client_as: Callable[[User], TestClient],
    viewer_user: User,
    admin_user: User,
    db_session: Session,
):
    # viewer_user's grant is on its own dept; this project lives elsewhere
    _, t = _taxonomy(db_session, "ME5")
    _project(db_session, t.id, admin_user)
    db_session.commit()
    r = client_as(viewer_user).post(
        "/api/metrics/eval", json={"entity": "project", "aggregation": "count"}
    )
    assert r.status_code == 200
    assert Decimal(r.json()["value"]) == 0


def test_validation_rejects_bad_op_and_foreign_field(
    client_as: Callable[[User], TestClient],
    viewer_user: User,
    admin_user: User,
    db_session: Session,
):
    _, t = _taxonomy(db_session, "ME6")
    fd = _field(db_session, t.id, "Flag", "boolean")
    db_session.commit()
    c = client_as(viewer_user)
    # op not allowed for boolean
    r = c.post(
        "/api/metrics/eval",
        json={
            "entity": "project",
            "aggregation": "count",
            "template_id": str(t.id),
            "conditions": {"combinator": "and",
                           "items": [{"field": str(fd.id), "op": "gt", "value": 1}]},
        },
    )
    assert r.status_code == 422
    # template not in viewer's dept → 422, no data leak
    r2 = c.post(
        "/api/metrics/eval",
        json={"entity": "project", "aggregation": "count", "template_id": str(t.id)},
    )
    assert r2.status_code == 422


def test_pct_of_total(
    client_as: Callable[[User], TestClient], admin_user: User, db_session: Session
):
    _, t = _taxonomy(db_session, "ME7")
    fd = _field(db_session, t.id, "QA", "boolean")
    _project(db_session, t.id, admin_user, cfv={str(fd.id): True})
    _project(db_session, t.id, admin_user, cfv={str(fd.id): False})
    _project(db_session, t.id, admin_user, cfv={str(fd.id): False})
    _project(db_session, t.id, admin_user, cfv={str(fd.id): False})
    db_session.commit()
    r = client_as(admin_user).post(
        "/api/metrics/eval",
        json={
            "entity": "project",
            "aggregation": "pct_of_total",
            "template_id": str(t.id),
            "conditions": {"combinator": "and",
                           "items": [{"field": str(fd.id), "op": "is_true"}]},
        },
    )
    assert Decimal(r.json()["value"]) == 25


def test_bool_value_rejected_for_numeric_op(
    client_as: Callable[[User], TestClient], admin_user: User, db_session: Session
):
    """Pin Phase 7.2.1 fix 1: isinstance(True, int) is True, so a JSON
    `true` on a numeric op used to pass validation and 500 in SQL.
    Must be a 422 at the validation boundary."""
    _, t = _taxonomy(db_session, "ME8")
    budget = _field(db_session, t.id, "Budget", "currency")
    db_session.commit()
    c = client_as(admin_user)
    r = c.post(
        "/api/metrics/eval",
        json={
            "entity": "project",
            "aggregation": "count",
            "template_id": str(t.id),
            "conditions": {
                "combinator": "and",
                "items": [{"field": str(budget.id), "op": "gt", "value": True}],
            },
        },
    )
    assert r.status_code == 422
    # between with a bool bound is rejected the same way
    r2 = c.post(
        "/api/metrics/eval",
        json={
            "entity": "project",
            "aggregation": "count",
            "template_id": str(t.id),
            "conditions": {
                "combinator": "and",
                "items": [{"field": str(budget.id), "op": "between",
                           "value": [True, 10]}],
            },
        },
    )
    assert r2.status_code == 422


def test_multi_select_not_in_strict_excludes_unset(
    client_as: Callable[[User], TestClient], admin_user: User, db_session: Session
):
    """Pin Phase 7.2.1 fix 2: not_in is STRICT — rows where the field is
    unset do NOT match (users combine with is_empty for "missing").
    multi_select must behave identically to single_select here."""
    _, t = _taxonomy(db_session, "ME9")
    tags = _field(
        db_session, t.id, "Tags", "multi_select",
        options={"choices": ["a", "b"]},
    )
    region = _field(
        db_session, t.id, "Region", "single_select",
        options={"choices": ["a", "b"]},
    )
    # one project with the fields set to a non-matching value, one unset
    _project(db_session, t.id, admin_user,
             cfv={str(tags.id): ["b"], str(region.id): "b"})
    _project(db_session, t.id, admin_user)
    db_session.commit()
    c = client_as(admin_user)

    def _count(field_id, op, value):
        r = c.post(
            "/api/metrics/eval",
            json={
                "entity": "project",
                "aggregation": "count",
                "template_id": str(t.id),
                "conditions": {
                    "combinator": "and",
                    "items": [{"field": str(field_id), "op": op, "value": value}],
                },
            },
        )
        assert r.status_code == 200
        return Decimal(r.json()["value"])

    # only the project with Tags=["b"] matches; the unset one is excluded
    assert _count(tags.id, "not_in", ["a"]) == 1
    # parity: single_select not_in behaves identically
    assert _count(region.id, "not_in", ["a"]) == 1


def test_multi_select_in_matches_array_containing_value(
    client_as: Callable[[User], TestClient], admin_user: User, db_session: Session
):
    _, t = _taxonomy(db_session, "ME10")
    tags = _field(
        db_session, t.id, "Tags", "multi_select",
        options={"choices": ["a", "b", "c"]},
    )
    _project(db_session, t.id, admin_user, cfv={str(tags.id): ["a", "c"]})
    _project(db_session, t.id, admin_user, cfv={str(tags.id): ["b"]})
    _project(db_session, t.id, admin_user)  # unset
    db_session.commit()
    r = client_as(admin_user).post(
        "/api/metrics/eval",
        json={
            "entity": "project",
            "aggregation": "count",
            "template_id": str(t.id),
            "conditions": {
                "combinator": "and",
                "items": [{"field": str(tags.id), "op": "in", "value": ["a"]}],
            },
        },
    )
    assert r.status_code == 200
    assert Decimal(r.json()["value"]) == 1


def test_contains_escapes_like_metacharacters(
    client_as: Callable[[User], TestClient], admin_user: User, db_session: Session
):
    """A literal % in the search value must not act as a wildcard."""
    _, t = _taxonomy(db_session, "ME11")
    _project(db_session, t.id, admin_user, title="100% done")
    _project(db_session, t.id, admin_user, title="100x done")
    db_session.commit()
    r = client_as(admin_user).post(
        "/api/metrics/eval",
        json={
            "entity": "project",
            "aggregation": "count",
            "template_id": str(t.id),
            "conditions": {
                "combinator": "and",
                "items": [{"field": "title", "op": "contains", "value": "100%"}],
            },
        },
    )
    assert r.status_code == 200
    assert Decimal(r.json()["value"]) == 1


def test_direct_grant_visible_in_metric(
    client_as: Callable[[User], TestClient], admin_user: User, db_session: Session
):
    """A user with NO dept grants but a project_role_assignment on one
    project sees exactly that project in a count metric."""
    _, t = _taxonomy(db_session, "ME12")
    granted = _project(db_session, t.id, admin_user, title="granted")
    _project(db_session, t.id, admin_user, title="not granted")
    u = User(email="direct-metric@example.com", display_name="Direct")
    db_session.add(u)
    db_session.flush()
    db_session.add(ProjectRoleAssignment(user_id=u.id, project_id=granted.id))
    db_session.commit()
    r = client_as(u).post(
        "/api/metrics/eval", json={"entity": "project", "aggregation": "count"}
    )
    assert r.status_code == 200
    assert Decimal(r.json()["value"]) == 1


def test_cor_status_constants_in_sync():
    """Drift guard (7.1 review carry-over): the schemas' COR status tuple
    and the engine's COR field choices must match the models' constant."""
    from backend.app.db import models
    from backend.app.schemas import views as views_schemas
    from backend.app.services import metric_engine

    assert set(views_schemas.COR_STATUSES) == models.COR_STATUSES
    assert set(metric_engine.COR_FIELDS["status"][1]) == models.COR_STATUSES
    assert set(views_schemas.LIFECYCLE_STATES) == set(
        metric_engine.PROJECT_BUILTINS["lifecycle_state"][1]
    )


def test_conditional_boolean_fields(
    client_as: Callable[[User], TestClient], admin_user: User, db_session: Session
):
    """Phase 7.4.1: boolean_conditional_date / boolean_conditional_text
    store {"value": bool, ...} — the engine must compare the NESTED
    flag, not the top-level object. is_empty still means field unset."""
    _, t = _taxonomy(db_session, "ME13")
    fd = _field(db_session, t.id, "NTP received", "boolean_conditional_date")
    _project(db_session, t.id, admin_user,
             cfv={str(fd.id): {"value": True, "date": "2026-01-15"}})
    _project(db_session, t.id, admin_user, cfv={str(fd.id): {"value": False}})
    _project(db_session, t.id, admin_user)  # field unset
    txt = _field(db_session, t.id, "Waiver", "boolean_conditional_text")
    db_session.commit()
    c = client_as(admin_user)

    def _count(field_id, op):
        r = c.post(
            "/api/metrics/eval",
            json={
                "entity": "project",
                "aggregation": "count",
                "template_id": str(t.id),
                "conditions": {
                    "combinator": "and",
                    "items": [{"field": str(field_id), "op": op}],
                },
            },
        )
        assert r.status_code == 200, r.text
        return Decimal(r.json()["value"])

    assert _count(fd.id, "is_true") == 1
    assert _count(fd.id, "is_false") == 1
    assert _count(fd.id, "is_empty") == 1
    # boolean_conditional_text is accepted too (no 422 "not supported")
    assert _count(txt.id, "is_true") == 0


def test_grouped_count_by_select_with_null_bucket(
    client_as, admin_user, db_session
):
    from backend.app.schemas.views import MetricDefinition
    from backend.app.services.metric_engine import evaluate_grouped

    _, t = _taxonomy(db_session, "GR1")
    region = _field(db_session, t.id, "Region", "single_select",
                    options={"choices": ["North", "South"]})
    _project(db_session, t.id, admin_user, cfv={str(region.id): "North"})
    _project(db_session, t.id, admin_user, cfv={str(region.id): "North"})
    _project(db_session, t.id, admin_user, cfv={str(region.id): "South"})
    _project(db_session, t.id, admin_user)  # unset -> "—"
    db_session.commit()
    m = MetricDefinition.model_validate({
        "entity": "project", "aggregation": "count", "template_id": str(t.id),
    })
    rows = evaluate_grouped(db_session, admin_user, m, str(region.id))
    assert [(r.label, int(r.value)) for r in rows] == [
        ("North", 2), ("South", 1), ("—", 1),
    ]
    # 7.5.1 fix 2: the unset bucket is flagged, not just label-encoded —
    # a real option literally named "—" must not collide with it.
    assert [r.is_null for r in rows] == [False, False, True]
    assert not any(r.is_other for r in rows)


def test_grouped_sum_by_boolean_and_topn_other(
    client_as, admin_user, db_session
):
    from backend.app.schemas.views import MetricDefinition
    from backend.app.services.metric_engine import evaluate_grouped

    _, t = _taxonomy(db_session, "GR2")
    sel = _field(db_session, t.id, "Bucket", "single_select",
                 options={"choices": [f"b{i}" for i in range(15)]})
    for i in range(15):
        _project(db_session, t.id, admin_user, cfv={str(sel.id): f"b{i}"})
    db_session.commit()
    m = MetricDefinition.model_validate({
        "entity": "project", "aggregation": "count", "template_id": str(t.id),
    })
    rows = evaluate_grouped(db_session, admin_user, m, str(sel.id), top_n=12)
    assert len(rows) == 13  # 12 + Other
    assert rows[-1].label == "Other"
    assert int(rows[-1].value) == 3
    # 7.5.1 fix 2: the synthetic tail is flagged, not just label-encoded
    assert rows[-1].is_other is True
    assert not rows[-1].is_null
    assert not any(r.is_other for r in rows[:-1])
    # 7.5.1 fix 1: top_n=None returns every group untruncated
    rows_all = evaluate_grouped(db_session, admin_user, m, str(sel.id), top_n=None)
    assert len(rows_all) == 15
    assert not any(r.is_other for r in rows_all)


def test_grouped_exactly_topn_groups_no_other(client_as, admin_user, db_session):
    """7.5.1 fix 3: exactly top_n groups -> no Other row (pins the
    strict > boundary in the truncation check)."""
    from backend.app.schemas.views import MetricDefinition
    from backend.app.services.metric_engine import evaluate_grouped

    _, t = _taxonomy(db_session, "GR5")
    sel = _field(db_session, t.id, "Bucket", "single_select",
                 options={"choices": [f"b{i}" for i in range(12)]})
    for i in range(12):
        _project(db_session, t.id, admin_user, cfv={str(sel.id): f"b{i}"})
    db_session.commit()
    m = MetricDefinition.model_validate({
        "entity": "project", "aggregation": "count", "template_id": str(t.id),
    })
    rows = evaluate_grouped(db_session, admin_user, m, str(sel.id), top_n=12)
    assert len(rows) == 12
    assert not any(r.is_other for r in rows)
    assert all(r.label != "Other" for r in rows)


def test_grouped_all_null_aggregate_sorts_last(client_as, admin_user, db_session):
    """7.5.1 fix 3: pins the nulls_last deviation — Postgres DESC
    defaults to NULLS FIRST, so a group whose aggregate is NULL (sum of
    a field unset across the whole group) would float to the top
    without the explicit nulls_last."""
    from backend.app.schemas.views import MetricDefinition
    from backend.app.services.metric_engine import evaluate_grouped

    _, t = _taxonomy(db_session, "GR6")
    region = _field(db_session, t.id, "Region", "single_select",
                    options={"choices": ["A", "B"]})
    budget = _field(db_session, t.id, "Budget", "currency")
    _project(db_session, t.id, admin_user,
             cfv={str(region.id): "A", str(budget.id): 10})
    _project(db_session, t.id, admin_user, cfv={str(region.id): "B"})
    db_session.commit()
    m = MetricDefinition.model_validate({
        "entity": "project", "aggregation": "sum",
        "target_field": str(budget.id), "template_id": str(t.id),
    })
    rows = evaluate_grouped(db_session, admin_user, m, str(region.id))
    assert [(r.label, r.value) for r in rows] == [("A", Decimal(10)), ("B", None)]


def test_grouped_rejects_bad_group_field(client_as, admin_user, db_session):
    import pytest as _pytest
    from backend.app.schemas.views import MetricDefinition
    from backend.app.services.metric_engine import ConfigError, evaluate_grouped

    _, t = _taxonomy(db_session, "GR3")
    multi = _field(db_session, t.id, "Tags", "multi_select",
                   options={"choices": ["a", "b"]})
    num = _field(db_session, t.id, "Budget", "currency")
    db_session.commit()
    m = MetricDefinition.model_validate({
        "entity": "project", "aggregation": "count", "template_id": str(t.id),
    })
    for bad in (str(multi.id), str(num.id), "title"):
        with _pytest.raises(ConfigError):
            evaluate_grouped(db_session, admin_user, m, bad)


def test_drill_rows_project_with_group(client_as, admin_user, db_session):
    _, t = _taxonomy(db_session, "DR1")
    region = _field(db_session, t.id, "Region", "single_select",
                    options={"choices": ["North", "South"]})
    _project(db_session, t.id, admin_user, title="P north",
             cfv={str(region.id): "North"})
    _project(db_session, t.id, admin_user, title="P south",
             cfv={str(region.id): "South"})
    _project(db_session, t.id, admin_user, title="P unset")
    db_session.commit()
    c = client_as(admin_user)
    body = {
        "metric": {"entity": "project", "aggregation": "count",
                   "template_id": str(t.id)},
        "group_by": str(region.id),
        "group_value": "North",
    }
    r = c.post("/api/metrics/eval/rows", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 1
    assert data["rows"][0]["label"] == "P north"
    # the "—" bucket
    body["group_value"] = None
    data2 = c.post("/api/metrics/eval/rows", json=body).json()
    assert [row["label"] for row in data2["rows"]] == ["P unset"]
    # no group: all three
    assert c.post("/api/metrics/eval/rows", json={"metric": body["metric"]}).json()["total"] == 3


def test_drill_rows_cor_and_cap(client_as, admin_user, db_session):
    _, t = _taxonomy(db_session, "DR2")
    p = _project(db_session, t.id, admin_user, title="Host")
    for i in range(105):
        _cor(db_session, p.id, number=str(i), amount=10, status="draft")
    db_session.commit()
    c = client_as(admin_user)
    data = c.post("/api/metrics/eval/rows", json={
        "metric": {"entity": "cor", "aggregation": "count"},
    }).json()
    assert data["total"] == 105
    assert len(data["rows"]) == 100
    assert data["rows"][0]["project_id"] == str(p.id)
    assert "Host" in data["rows"][0]["sublabel"]


def test_grouped_cor_status_builtin(client_as, admin_user, db_session):
    from backend.app.schemas.views import MetricDefinition
    from backend.app.services.metric_engine import evaluate_grouped

    _, t = _taxonomy(db_session, "GR4")
    p = _project(db_session, t.id, admin_user)
    _cor(db_session, p.id, number="1", amount=100, status="submitted")
    _cor(db_session, p.id, number="2", amount=250, status="submitted")
    _cor(db_session, p.id, number="3", amount=999, status="approved")
    db_session.commit()
    m = MetricDefinition.model_validate({
        "entity": "cor", "aggregation": "sum", "target_field": "amount",
    })
    rows = evaluate_grouped(db_session, admin_user, m, "status")
    by_label = {r.label: int(r.value) for r in rows}
    assert by_label == {"submitted": 350, "approved": 999}


def test_date_planned_actual_subfields(client_as, admin_user, db_session):
    _, t = _taxonomy(db_session, "FX1")
    fd = _field(db_session, t.id, "Design dates", "date_planned_actual")
    _project(db_session, t.id, admin_user,
             cfv={str(fd.id): {"planned": "2026-01-10", "actual": "2026-01-12"}})
    _project(db_session, t.id, admin_user,
             cfv={str(fd.id): {"planned": "2026-01-10"}})  # actual unset
    _project(db_session, t.id, admin_user)                  # whole field unset
    db_session.commit()
    c = client_as(admin_user)

    def count(items):
        return int(float(c.post("/api/metrics/eval", json={
            "entity": "project", "aggregation": "count",
            "template_id": str(t.id),
            "conditions": {"combinator": "and", "items": items},
        }).json()["value"]))

    assert count([{"field": f"{fd.id}.actual", "op": "is_empty"}]) == 2
    assert count([{"field": f"{fd.id}.planned", "op": "before",
                   "value": "2026-02-01"}]) == 2
    # bad sub-key rejected
    r = c.post("/api/metrics/eval", json={
        "entity": "project", "aggregation": "count", "template_id": str(t.id),
        "conditions": {"combinator": "and",
                       "items": [{"field": f"{fd.id}.bogus", "op": "is_empty"}]},
    })
    assert r.status_code == 422
    # bare ref on a sub-field type rejected too
    r2 = c.post("/api/metrics/eval", json={
        "entity": "project", "aggregation": "count", "template_id": str(t.id),
        "conditions": {"combinator": "and",
                       "items": [{"field": str(fd.id), "op": "is_empty"}]},
    })
    assert r2.status_code == 422
    # count_distinct on a sub-ref counts the sub-date (both projects
    # share planned=2026-01-10 -> 1 distinct), not the JSON object
    r3 = c.post("/api/metrics/eval", json={
        "entity": "project", "aggregation": "count_distinct",
        "template_id": str(t.id), "target_field": f"{fd.id}.planned",
    })
    assert r3.status_code == 200
    assert int(float(r3.json()["value"])) == 1


def test_last_month_bounds_year_boundary(monkeypatch):
    # Pin the clock to January so the prev-month rollover crosses the year
    # (the relative-to-today API test only exercises this if run in Jan).
    import datetime as _dt

    from backend.app.services import metric_engine

    class _FakeDate(_dt.date):
        @classmethod
        def today(cls):
            return _dt.date(2026, 1, 15)

    monkeypatch.setattr(metric_engine, "date", _FakeDate)
    lo, hi = metric_engine._date_bounds("last_month", None)
    assert (lo, hi) == (_dt.date(2025, 12, 1), _dt.date(2025, 12, 31))


def test_last_month_date_op(client_as, admin_user, db_session):
    import datetime as _dt
    _, t = _taxonomy(db_session, "DLM")
    d = _field(db_session, t.id, "Due", "date")
    today = _dt.date.today()
    first_this = today.replace(day=1)
    last_prev = first_this - _dt.timedelta(days=1)       # in last month
    in_last_month = last_prev.isoformat()
    in_this_month = first_this.isoformat()
    _project(db_session, t.id, admin_user, cfv={str(d.id): in_last_month})
    _project(db_session, t.id, admin_user, cfv={str(d.id): in_this_month})
    db_session.commit()
    r = client_as(admin_user).post("/api/metrics/eval", json={
        "entity": "project", "aggregation": "count", "template_id": str(t.id),
        "conditions": {"combinator": "and",
                       "items": [{"field": str(d.id), "op": "last_month"}]},
    })
    assert int(float(r.json()["value"])) == 1


def test_on_or_before_today_includes_today(client_as, admin_user, db_session):
    import datetime as _dt
    _, t = _taxonomy(db_session, "DOB")
    d = _field(db_session, t.id, "Due", "date")
    today = _dt.date.today()
    _project(db_session, t.id, admin_user, cfv={str(d.id): today.isoformat()})
    _project(db_session, t.id, admin_user,
             cfv={str(d.id): (today - _dt.timedelta(days=5)).isoformat()})
    _project(db_session, t.id, admin_user,
             cfv={str(d.id): (today + _dt.timedelta(days=5)).isoformat()})
    db_session.commit()
    r = client_as(admin_user).post("/api/metrics/eval", json={
        "entity": "project", "aggregation": "count", "template_id": str(t.id),
        "conditions": {"combinator": "and",
                       "items": [{"field": str(d.id), "op": "on_or_before_today"}]},
    })
    # today + 5-days-ago, NOT the future one (and unlike strict `before`, today IS included)
    assert int(float(r.json()["value"])) == 2


def test_new_date_ops_take_no_value(client_as, admin_user, db_session):
    # supplying a value to a no-value op is a 422
    _, t = _taxonomy(db_session, "DNV")
    d = _field(db_session, t.id, "Due", "date")
    db_session.commit()
    r = client_as(admin_user).post("/api/metrics/eval", json={
        "entity": "project", "aggregation": "count", "template_id": str(t.id),
        "conditions": {"combinator": "and",
                       "items": [{"field": str(d.id), "op": "last_month", "value": "2026-01-01"}]},
    })
    assert r.status_code == 422


def test_url_email_phone_as_text(client_as, admin_user, db_session):
    _, t = _taxonomy(db_session, "FX2")
    url = _field(db_session, t.id, "Site", "url")
    _project(db_session, t.id, admin_user,
             cfv={str(url.id): "https://example.com/specs"})
    _project(db_session, t.id, admin_user)
    db_session.commit()
    c = client_as(admin_user)
    r = c.post("/api/metrics/eval", json={
        "entity": "project", "aggregation": "count", "template_id": str(t.id),
        "conditions": {"combinator": "and",
                       "items": [{"field": str(url.id), "op": "contains",
                                  "value": "example.com"}]},
    })
    assert int(float(r.json()["value"])) == 1
    # a sub-ref on a non-sub-field type is rejected
    r2 = c.post("/api/metrics/eval", json={
        "entity": "project", "aggregation": "count", "template_id": str(t.id),
        "conditions": {"combinator": "and",
                       "items": [{"field": f"{url.id}.planned",
                                  "op": "contains", "value": "x"}]},
    })
    assert r2.status_code == 422


# ---- Phase 7.6.1 follow-up tests ------------------------------------------


def test_drill_group_value_requires_group_by(client_as, admin_user, db_session):
    """Fix 2: group_value set without group_by is rejected at schema level
    (model_validator on DrillRequest) → 422."""
    _, t = _taxonomy(db_session, "DR3")
    db_session.commit()
    c = client_as(admin_user)
    r = c.post("/api/metrics/eval/rows", json={
        "metric": {"entity": "project", "aggregation": "count",
                   "template_id": str(t.id)},
        "group_value": "North",   # no group_by
    })
    assert r.status_code == 422


def test_drill_boolean_group_value_garbage_rejected(client_as, admin_user, db_session):
    """Fix 1: a group_value that is neither 'True' nor 'False' for a boolean
    group field must raise ConfigError → 422, not silently map to False."""
    _, t = _taxonomy(db_session, "DR4")
    fd = _field(db_session, t.id, "Flag", "boolean")
    _project(db_session, t.id, admin_user, cfv={str(fd.id): False})
    db_session.commit()
    c = client_as(admin_user)
    r = c.post("/api/metrics/eval/rows", json={
        "metric": {"entity": "project", "aggregation": "count",
                   "template_id": str(t.id)},
        "group_by": str(fd.id),
        "group_value": "garbage",
    })
    assert r.status_code == 422


def test_drill_boolean_group_value_false_correct_rows(client_as, admin_user, db_session):
    """Fix 1: group_value='False' selects only the explicitly-false bucket."""
    _, t = _taxonomy(db_session, "DR5")
    fd = _field(db_session, t.id, "Flag", "boolean")
    _project(db_session, t.id, admin_user, title="P true",  cfv={str(fd.id): True})
    _project(db_session, t.id, admin_user, title="P false", cfv={str(fd.id): False})
    _project(db_session, t.id, admin_user, title="P unset")
    db_session.commit()
    c = client_as(admin_user)
    r = c.post("/api/metrics/eval/rows", json={
        "metric": {"entity": "project", "aggregation": "count",
                   "template_id": str(t.id)},
        "group_by": str(fd.id),
        "group_value": "False",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 1
    assert data["rows"][0]["label"] == "P false"


def test_drill_rows_dept_scoped(
    client_as, viewer_user, admin_user, db_session
):
    """Fix 3: viewer_user scoped to its own dept drills a metric over
    another dept's data.
    (a) no template_id → 200 with total==0 and empty rows.
    (b) foreign template_id → 422 ("template not found").
    Mirrors test_dept_scope_enforced."""
    # Build a foreign dept+template with one project
    _, t_foreign = _taxonomy(db_session, "DR6")
    _project(db_session, t_foreign.id, admin_user, title="Foreign P")
    db_session.commit()

    c = client_as(viewer_user)
    # (a) no template_id: viewer sees 0 matching rows
    r_a = c.post("/api/metrics/eval/rows", json={
        "metric": {"entity": "project", "aggregation": "count"},
    })
    assert r_a.status_code == 200
    data_a = r_a.json()
    assert data_a["total"] == 0
    assert data_a["rows"] == []

    # (b) with the foreign template_id: same unified "template not found" 422
    r_b = c.post("/api/metrics/eval/rows", json={
        "metric": {"entity": "project", "aggregation": "count",
                   "template_id": str(t_foreign.id)},
    })
    assert r_b.status_code == 422


def test_drill_boolean_full_bucket_coverage(client_as, admin_user, db_session):
    """Fix 4: drill a boolean-grouped metric → correct rows per bucket.
    True bucket → only the true project.
    None (unset) bucket → only the unset project.
    """
    _, t = _taxonomy(db_session, "DR7")
    fd = _field(db_session, t.id, "Active", "boolean")
    _project(db_session, t.id, admin_user, title="P true",  cfv={str(fd.id): True})
    _project(db_session, t.id, admin_user, title="P false", cfv={str(fd.id): False})
    _project(db_session, t.id, admin_user, title="P unset")
    db_session.commit()
    c = client_as(admin_user)
    base_body = {
        "metric": {"entity": "project", "aggregation": "count",
                   "template_id": str(t.id)},
        "group_by": str(fd.id),
    }

    # True bucket
    r_true = c.post("/api/metrics/eval/rows",
                    json={**base_body, "group_value": "True"})
    assert r_true.status_code == 200
    assert r_true.json()["total"] == 1
    assert r_true.json()["rows"][0]["label"] == "P true"

    # Unset (None) bucket
    r_unset = c.post("/api/metrics/eval/rows",
                     json={**base_body, "group_value": None})
    assert r_unset.status_code == 200
    assert r_unset.json()["total"] == 1
    assert r_unset.json()["rows"][0]["label"] == "P unset"


def test_scope_dcd_and_lifecycle_narrow(
    client_as: Callable[[User], TestClient], admin_user: User, db_session: Session
):
    # admin sees all depts; scope must narrow within that visibility.
    # Characterization test for the already-shipped _scoped_base (Phase
    # 7.14): no backend source change — it passes on first run and would
    # only fail if DCD/lifecycle scope application were ever removed.
    d1, t1 = _taxonomy(db_session, "SC1")
    _d2, t2 = _taxonomy(db_session, "SC2")
    _project(db_session, t1.id, admin_user, state="active")
    _project(db_session, t1.id, admin_user, state="complete")
    _project(db_session, t2.id, admin_user, state="active")
    db_session.commit()
    c = client_as(admin_user)

    def count(scope):
        r = c.post(
            "/api/metrics/eval",
            json={"entity": "project", "aggregation": "count", "scope": scope},
        )
        assert r.status_code == 200, r.json()
        return int(Decimal(r.json()["value"]))

    assert count({}) == 3                                   # no narrowing
    assert count({"department_id": str(d1.id)}) == 2        # dept SC1 only
    assert count({"client_id": str(t1.client_id),
                  "department_id": str(d1.id)}) == 2        # SC1's client
    assert count({"discipline_id": str(t1.discipline_id),
                  "department_id": str(d1.id)}) == 2        # SC1's discipline
    assert count({"lifecycle_state": "active"}) == 2        # active across depts
    assert count({"department_id": str(d1.id),
                  "lifecycle_state": "active"}) == 1        # SC1 + active
