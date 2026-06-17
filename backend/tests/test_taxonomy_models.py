"""Sanity tests for the three taxonomy models — they all share `_TaxonomyMixin`,
so one happy-path test per model is sufficient, plus one cross-model uniqueness
test.
"""
import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.db.models import Client, Department, Discipline


def _seed_dept(db_session: Session) -> Department:
    d = Department(code="MODEL_TEST_DEPT", name="Model Test Dept")
    db_session.add(d)
    db_session.flush()
    return d


@pytest.mark.parametrize(
    "model,code,name,scoped",
    [
        (Department, "DIV1", "Division 1", False),
        (Client, "CON", "Contoso", True),
        (Discipline, "Design", "Protection & Controls", True),
    ],
)
def test_create_taxonomy_row(model, code, name, scoped, db_session: Session):
    if scoped:
        d = _seed_dept(db_session)
        obj = model(code=code, name=name, department_id=d.id)
    else:
        obj = model(code=code, name=name)
    db_session.add(obj)
    db_session.flush()
    assert obj.id is not None
    assert obj.created_at is not None
    assert obj.deleted_at is None


def test_partial_unique_allows_recreate_after_soft_delete(db_session: Session):
    from datetime import datetime, timezone

    a = Department(code="DIV2", name="Division 2")
    db_session.add(a)
    db_session.flush()
    a.deleted_at = datetime.now(timezone.utc)
    db_session.flush()

    b = Department(code="DIV2", name="Division 2 (new)")
    db_session.add(b)
    db_session.flush()  # should NOT raise — old row is soft-deleted
    rows = db_session.execute(
        select(Department).where(Department.code == "DIV2")
    ).scalars().all()
    assert len(rows) == 2


def test_partial_unique_blocks_duplicate_live(db_session: Session):
    db_session.add(Department(code="DUPE", name="One"))
    db_session.flush()
    db_session.add(Department(code="DUPE", name="Two"))
    with pytest.raises(IntegrityError):
        db_session.flush()
