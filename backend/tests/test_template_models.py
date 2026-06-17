import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.db.models import (
    Client,
    Department,
    Discipline,
    Template,
    TemplateFieldDef,
    TemplateMilestoneDef,
)


def _make_taxonomy(db_session: Session) -> tuple[Department, Client, Discipline]:
    d = Department(code="DIV1", name="Division 1")
    db_session.add(d)
    db_session.flush()
    c = Client(code="CON", name="Contoso", department_id=d.id)
    di = Discipline(
        code="Design", name="Protection & Controls", department_id=d.id
    )
    db_session.add_all([c, di])
    db_session.flush()
    return d, c, di


def test_create_template(db_session: Session):
    d, c, di = _make_taxonomy(db_session)
    t = Template(
        name="DIV1 / CON / Design",
        department_id=d.id,
        client_id=c.id,
        discipline_id=di.id,
    )
    db_session.add(t)
    db_session.flush()
    assert t.id is not None


def test_unique_intersection_live(db_session: Session):
    d, c, di = _make_taxonomy(db_session)
    db_session.add(
        Template(name="a", department_id=d.id, client_id=c.id, discipline_id=di.id)
    )
    db_session.flush()
    db_session.add(
        Template(name="b", department_id=d.id, client_id=c.id, discipline_id=di.id)
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_intersection_reusable_after_soft_delete(db_session: Session):
    from datetime import datetime, timezone

    d, c, di = _make_taxonomy(db_session)
    t1 = Template(
        name="a", department_id=d.id, client_id=c.id, discipline_id=di.id
    )
    db_session.add(t1)
    db_session.flush()
    t1.deleted_at = datetime.now(timezone.utc)
    db_session.flush()

    t2 = Template(
        name="b", department_id=d.id, client_id=c.id, discipline_id=di.id
    )
    db_session.add(t2)
    db_session.flush()  # should NOT raise


def test_field_def_select_requires_options(db_session: Session):
    d, c, di = _make_taxonomy(db_session)
    t = Template(name="t", department_id=d.id, client_id=c.id, discipline_id=di.id)
    db_session.add(t)
    db_session.flush()
    db_session.add(
        TemplateFieldDef(
            template_id=t.id,
            name="Pick one",
            field_type="single_select",
            # options missing → CHECK fails
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_field_def_non_select_must_not_have_options(db_session: Session):
    d, c, di = _make_taxonomy(db_session)
    t = Template(name="t", department_id=d.id, client_id=c.id, discipline_id=di.id)
    db_session.add(t)
    db_session.flush()
    db_session.add(
        TemplateFieldDef(
            template_id=t.id,
            name="Some text",
            field_type="short_text",
            options={"choices": ["a", "b"]},
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_field_def_invalid_type_rejected(db_session: Session):
    d, c, di = _make_taxonomy(db_session)
    t = Template(name="t", department_id=d.id, client_id=c.id, discipline_id=di.id)
    db_session.add(t)
    db_session.flush()
    db_session.add(
        TemplateFieldDef(
            template_id=t.id, name="x", field_type="not_a_real_type"
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_milestone_invalid_direction_rejected(db_session: Session):
    d, c, di = _make_taxonomy(db_session)
    t = Template(name="t", department_id=d.id, client_id=c.id, discipline_id=di.id)
    db_session.add(t)
    db_session.flush()
    db_session.add(
        TemplateMilestoneDef(
            template_id=t.id,
            name="IFC",
            direction="sideways",
            date_model="single",
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_milestone_invalid_date_model_rejected(db_session: Session):
    d, c, di = _make_taxonomy(db_session)
    t = Template(name="t", department_id=d.id, client_id=c.id, discipline_id=di.id)
    db_session.add(t)
    db_session.flush()
    db_session.add(
        TemplateMilestoneDef(
            template_id=t.id,
            name="IFC",
            direction="outbound",
            date_model="quarterly",
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_milestone_happy_path(db_session: Session):
    d, c, di = _make_taxonomy(db_session)
    t = Template(name="t", department_id=d.id, client_id=c.id, discipline_id=di.id)
    db_session.add(t)
    db_session.flush()
    db_session.add(
        TemplateMilestoneDef(
            template_id=t.id,
            name="IFC",
            direction="outbound",
            date_model="planned_actual",
        )
    )
    db_session.flush()


def test_template_cascades_to_field_and_milestone_defs(db_session: Session):
    """Hard-deleting a template hard-deletes its child defs (ON DELETE CASCADE)."""
    d, c, di = _make_taxonomy(db_session)
    t = Template(name="t", department_id=d.id, client_id=c.id, discipline_id=di.id)
    db_session.add(t)
    db_session.flush()
    db_session.add(
        TemplateFieldDef(template_id=t.id, name="x", field_type="short_text")
    )
    db_session.add(
        TemplateMilestoneDef(
            template_id=t.id,
            name="m",
            direction="outbound",
            date_model="single",
        )
    )
    db_session.flush()
    db_session.delete(t)
    db_session.flush()

    # No orphans left.
    from sqlalchemy import select
    fields = db_session.execute(
        select(TemplateFieldDef).where(TemplateFieldDef.template_id == t.id)
    ).scalars().all()
    milestones = db_session.execute(
        select(TemplateMilestoneDef).where(
            TemplateMilestoneDef.template_id == t.id
        )
    ).scalars().all()
    assert fields == []
    assert milestones == []
