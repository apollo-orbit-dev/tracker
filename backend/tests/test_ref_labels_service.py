"""Unit tests for the ref_labels collector.

Given a list of projects and the live field defs for their template,
collect_ref_labels should return a dict keyed by entity type with
{uuid: display_name} mappings, including a "(deleted)" fallback for
soft-deleted entities.
"""
import uuid

from sqlalchemy.orm import Session

from backend.app.db.models import (
    Client,
    Contact,
    Department,
    Discipline,
    Project,
    Template,
    TemplateFieldDef,
    User,
)
from backend.app.services.ref_labels import collect_ref_labels


def _seed_minimal(db: Session, admin_user: User) -> tuple[Template, dict]:
    dept = Department(code=f"D{uuid.uuid4().hex[:6]}", name="D")
    db.add(dept)
    db.flush()
    cli = Client(
        code=f"C{uuid.uuid4().hex[:6]}", name="Acme", department_id=dept.id
    )
    disc = Discipline(
        code=f"X{uuid.uuid4().hex[:6]}", name="X", department_id=dept.id
    )
    db.add_all([cli, disc])
    db.flush()
    t = Template(
        name="T", department_id=dept.id, client_id=cli.id, discipline_id=disc.id
    )
    db.add(t)
    db.flush()
    fd_user = TemplateFieldDef(
        template_id=t.id,
        name="Owner",
        field_type="user_picker_single",
        order_index=0,
    )
    fd_client = TemplateFieldDef(
        template_id=t.id,
        name="Linked Client",
        field_type="client_reference",
        order_index=1,
    )
    db.add_all([fd_user, fd_client])
    db.flush()
    return t, {"fd_user": fd_user, "fd_client": fd_client, "cli": cli}


def test_collect_user_picker_single(db_session, admin_user, viewer_user):
    t, ids = _seed_minimal(db_session, admin_user)
    p = Project(
        project_number="25710101",
        title="T1",
        template_id=t.id,
        created_by=admin_user.id,
        custom_field_values={str(ids["fd_user"].id): str(viewer_user.id)},
    )
    db_session.add(p)
    db_session.commit()

    labels = collect_ref_labels(
        db_session,
        projects=[p],
        live_field_defs=[ids["fd_user"], ids["fd_client"]],
    )
    assert labels["users"][str(viewer_user.id)] == viewer_user.display_name


def test_collect_client_reference(db_session, admin_user):
    t, ids = _seed_minimal(db_session, admin_user)
    p = Project(
        project_number="25710102",
        title="T1",
        template_id=t.id,
        created_by=admin_user.id,
        custom_field_values={str(ids["fd_client"].id): str(ids["cli"].id)},
    )
    db_session.add(p)
    db_session.commit()

    labels = collect_ref_labels(
        db_session,
        projects=[p],
        live_field_defs=[ids["fd_user"], ids["fd_client"]],
    )
    assert ids["cli"].code in labels["clients"][str(ids["cli"].id)]


def test_collect_marks_deleted_user_as_deleted(
    db_session, admin_user, viewer_user
):
    from datetime import datetime, timezone

    t, ids = _seed_minimal(db_session, admin_user)
    p = Project(
        project_number="25710103",
        title="T1",
        template_id=t.id,
        created_by=admin_user.id,
        custom_field_values={str(ids["fd_user"].id): str(viewer_user.id)},
    )
    db_session.add(p)
    db_session.flush()
    viewer_user.deleted_at = datetime.now(timezone.utc)
    db_session.commit()

    labels = collect_ref_labels(
        db_session,
        projects=[p],
        live_field_defs=[ids["fd_user"], ids["fd_client"]],
    )
    assert labels["users"][str(viewer_user.id)] == "(deleted)"


def test_collect_user_picker_multi(db_session, admin_user, viewer_user):
    """user_picker_multi stores a list of UUIDs; all must resolve."""
    t, ids = _seed_minimal(db_session, admin_user)
    ids["fd_user"].field_type = "user_picker_multi"
    p = Project(
        project_number="25710104",
        title="T1",
        template_id=t.id,
        created_by=admin_user.id,
        custom_field_values={
            str(ids["fd_user"].id): [str(admin_user.id), str(viewer_user.id)]
        },
    )
    db_session.add(p)
    db_session.commit()

    labels = collect_ref_labels(
        db_session,
        projects=[p],
        live_field_defs=[ids["fd_user"], ids["fd_client"]],
    )
    assert str(admin_user.id) in labels["users"]
    assert str(viewer_user.id) in labels["users"]


def test_collect_empty_when_no_ref_fields(db_session, admin_user):
    t, ids = _seed_minimal(db_session, admin_user)
    # Use only built-in scalar fields by passing an empty field def list.
    labels = collect_ref_labels(db_session, projects=[], live_field_defs=[])
    assert labels == {
        "users": {},
        "contacts": {},
        "projects": {},
        "clients": {},
    }
