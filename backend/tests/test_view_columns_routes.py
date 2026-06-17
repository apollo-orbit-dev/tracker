"""Endpoint tests for /api/projects/view/{template_id}/columns.

Covers CRUD happy paths, validation errors, scope enforcement,
cross-template isolation, and orphan-stripping on GET.
"""
import uuid

from sqlalchemy.orm import Session

from backend.app.db.models import (
    Client,
    Department,
    Discipline,
    Template,
    TemplateFieldDef,
    TemplateMilestoneDef,
    UserProjectViewColumns,
)


def _make_template_with_one_field_and_one_milestone(
    db: Session, *, dept_id: uuid.UUID | None = None
) -> tuple[Template, TemplateFieldDef, TemplateMilestoneDef]:
    if dept_id is None:
        dept = Department(code=f"D{uuid.uuid4().hex[:6]}", name="D")
        db.add(dept)
        db.flush()
        dept_id = dept.id
    cli = Client(
        code=f"C{uuid.uuid4().hex[:6]}", name="C", department_id=dept_id
    )
    disc = Discipline(
        code=f"X{uuid.uuid4().hex[:6]}", name="X", department_id=dept_id
    )
    db.add_all([cli, disc])
    db.flush()
    t = Template(
        name="T",
        department_id=dept_id,
        client_id=cli.id,
        discipline_id=disc.id,
    )
    db.add(t)
    db.flush()
    fd = TemplateFieldDef(
        template_id=t.id,
        name="Field A",
        field_type="short_text",
        order_index=0,
    )
    md = TemplateMilestoneDef(
        template_id=t.id,
        name="Milestone A",
        direction="outbound",
        date_model="planned_actual",
        order_index=0,
    )
    db.add_all([fd, md])
    db.flush()
    return t, fd, md


def test_get_404_when_no_row(db_session, client_as, admin_user):
    c = client_as(admin_user)
    t, _, _ = _make_template_with_one_field_and_one_milestone(db_session)
    db_session.commit()
    r = c.get(f"/api/projects/view/{t.id}/columns")
    assert r.status_code == 404


def test_get_returns_saved_row(db_session, client_as, admin_user):
    c = client_as(admin_user)
    t, fd, md = _make_template_with_one_field_and_one_milestone(db_session)
    db_session.add(
        UserProjectViewColumns(
            user_id=admin_user.id,
            template_id=t.id,
            columns=["builtin:title", f"custom_field:{fd.id}"],
            sort_key="builtin:title",
            sort_direction="asc",
        )
    )
    db_session.commit()
    r = c.get(f"/api/projects/view/{t.id}/columns")
    assert r.status_code == 200
    body = r.json()
    assert body["columns"] == ["builtin:title", f"custom_field:{fd.id}"]
    assert body["sort_key"] == "builtin:title"
    assert body["sort_direction"] == "asc"


def test_put_creates_new_row(db_session, client_as, admin_user):
    c = client_as(admin_user)
    t, fd, md = _make_template_with_one_field_and_one_milestone(db_session)
    db_session.commit()
    r = c.put(
        f"/api/projects/view/{t.id}/columns",
        json={
            "columns": [
                "builtin:title",
                f"custom_field:{fd.id}",
                f"milestone:{md.id}:planned",
            ],
            "sort_key": "builtin:created_at",
            "sort_direction": "desc",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["columns"][0] == "builtin:title"
    # Persisted in DB:
    db_session.expire_all()
    row = db_session.query(UserProjectViewColumns).one()
    assert row.user_id == admin_user.id
    assert row.template_id == t.id


def test_put_upserts_existing(db_session, client_as, admin_user):
    c = client_as(admin_user)
    t, _, _ = _make_template_with_one_field_and_one_milestone(db_session)
    db_session.add(
        UserProjectViewColumns(
            user_id=admin_user.id,
            template_id=t.id,
            columns=["builtin:title"],
        )
    )
    db_session.commit()
    r = c.put(
        f"/api/projects/view/{t.id}/columns",
        json={"columns": ["builtin:project_number"]},
    )
    assert r.status_code == 200
    db_session.expire_all()
    rows = db_session.query(UserProjectViewColumns).all()
    assert len(rows) == 1
    assert rows[0].columns == ["builtin:project_number"]


def test_delete_returns_204_and_subsequent_get_404(
    db_session, client_as, admin_user
):
    c = client_as(admin_user)
    t, _, _ = _make_template_with_one_field_and_one_milestone(db_session)
    db_session.add(
        UserProjectViewColumns(
            user_id=admin_user.id,
            template_id=t.id,
            columns=["builtin:title"],
        )
    )
    db_session.commit()
    r = c.delete(f"/api/projects/view/{t.id}/columns")
    assert r.status_code == 204
    r2 = c.get(f"/api/projects/view/{t.id}/columns")
    assert r2.status_code == 404


def test_put_rejects_invalid_regex(db_session, client_as, admin_user):
    c = client_as(admin_user)
    t, _, _ = _make_template_with_one_field_and_one_milestone(db_session)
    db_session.commit()
    r = c.put(
        f"/api/projects/view/{t.id}/columns",
        json={"columns": ["not-a-real-key"]},
    )
    assert r.status_code == 422


def test_put_rejects_duplicate(db_session, client_as, admin_user):
    c = client_as(admin_user)
    t, _, _ = _make_template_with_one_field_and_one_milestone(db_session)
    db_session.commit()
    r = c.put(
        f"/api/projects/view/{t.id}/columns",
        json={"columns": ["builtin:title", "builtin:title"]},
    )
    assert r.status_code == 422


def test_put_rejects_custom_field_not_in_template(
    db_session, client_as, admin_user
):
    c = client_as(admin_user)
    t, _, _ = _make_template_with_one_field_and_one_milestone(db_session)
    db_session.commit()
    r = c.put(
        f"/api/projects/view/{t.id}/columns",
        json={"columns": [f"custom_field:{uuid.uuid4()}"]},
    )
    assert r.status_code == 422


def test_put_rejects_non_built_in_sort_key(
    db_session, client_as, admin_user
):
    c = client_as(admin_user)
    t, fd, _ = _make_template_with_one_field_and_one_milestone(db_session)
    db_session.commit()
    r = c.put(
        f"/api/projects/view/{t.id}/columns",
        json={
            "columns": [f"custom_field:{fd.id}"],
            "sort_key": f"custom_field:{fd.id}",
            "sort_direction": "asc",
        },
    )
    assert r.status_code == 422


def test_put_rejects_unpaired_sort(db_session, client_as, admin_user):
    c = client_as(admin_user)
    t, _, _ = _make_template_with_one_field_and_one_milestone(db_session)
    db_session.commit()
    r = c.put(
        f"/api/projects/view/{t.id}/columns",
        json={"columns": [], "sort_key": "builtin:title", "sort_direction": None},
    )
    assert r.status_code == 422


def test_cross_template_isolation(db_session, client_as, admin_user):
    c = client_as(admin_user)
    t1, _, _ = _make_template_with_one_field_and_one_milestone(db_session)
    t2, _, _ = _make_template_with_one_field_and_one_milestone(db_session)
    db_session.add(
        UserProjectViewColumns(
            user_id=admin_user.id,
            template_id=t1.id,
            columns=["builtin:title"],
        )
    )
    db_session.commit()
    r1 = c.get(f"/api/projects/view/{t1.id}/columns")
    assert r1.status_code == 200
    r2 = c.get(f"/api/projects/view/{t2.id}/columns")
    assert r2.status_code == 404


def test_scope_404_when_out_of_dept(
    db_session, client_as, viewer_user
):
    # viewer_user is scoped to one dept; create a template in a different dept.
    other_dept = Department(code=f"OTH{uuid.uuid4().hex[:6]}", name="Other")
    db_session.add(other_dept)
    db_session.flush()
    t, _, _ = _make_template_with_one_field_and_one_milestone(
        db_session, dept_id=other_dept.id
    )
    db_session.commit()
    c = client_as(viewer_user)
    r = c.get(f"/api/projects/view/{t.id}/columns")
    assert r.status_code == 404


def test_get_strips_orphans(db_session, client_as, admin_user):
    """Saved row contains a custom_field key whose def is soft-deleted.
    GET drops the orphan and rewrites the row."""
    from datetime import datetime, timezone

    c = client_as(admin_user)
    t, fd, md = _make_template_with_one_field_and_one_milestone(db_session)
    db_session.add(
        UserProjectViewColumns(
            user_id=admin_user.id,
            template_id=t.id,
            columns=[
                "builtin:title",
                f"custom_field:{fd.id}",
                f"milestone:{md.id}:planned",
            ],
        )
    )
    fd.deleted_at = datetime.now(timezone.utc)
    db_session.commit()

    r = c.get(f"/api/projects/view/{t.id}/columns")
    assert r.status_code == 200
    body = r.json()
    assert f"custom_field:{fd.id}" not in body["columns"]
    assert "builtin:title" in body["columns"]
    assert f"milestone:{md.id}:planned" in body["columns"]
    # DB row also cleaned:
    db_session.expire_all()
    row = db_session.query(UserProjectViewColumns).one()
    assert f"custom_field:{fd.id}" not in row.columns
