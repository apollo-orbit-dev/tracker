"""Service for creating a COR record (Phase 17.13).

Extracted from ``backend.app.routes.cors.create_cor`` so that the forms
push pipeline (Task C2) can create CORs without going through HTTP.

The caller owns the transaction — this service does NOT commit.
"""
from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.db.models import COR, User, Project
from backend.app.services.audit import record_audit


class CORNumberConflict(Exception):
    """Raised when a COR with the same number already exists on the project."""


def create_cor_record(
    db: Session,
    user: User,
    project: Project,
    *,
    number: str,
    description: str,
    amount,
    status: str,
    submitted_date=None,
    approved_date=None,
) -> COR:
    """Insert a COR row, record an audit entry, and return the new COR.

    Does **not** call ``db.commit()`` — the caller is responsible for
    committing (or rolling back) the surrounding transaction.

    Raises:
        CORNumberConflict: if a non-deleted COR with the same ``number``
            already exists on ``project``.  The session is rolled back to
            a clean state before raising, so the caller can continue using
            the session (e.g. to map the error to an HTTP 409 and then let
            the session close normally).
    """
    obj = COR(
        project_id=project.id,
        number=number,
        description=description,
        amount=amount,
        submitted_date=submitted_date,
        approved_date=approved_date,
        status=status,
    )
    db.add(obj)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise CORNumberConflict(
            f"A COR with number {number!r} already exists on project {project.id}."
        )

    record_audit(
        db,
        user=user,
        entity_type="cor",
        entity_id=obj.id,
        operation="create",
        changes={
            "initial": {
                "number": obj.number,
                "description": obj.description,
                "amount": obj.amount,
                "status": obj.status,
                "submitted_date": obj.submitted_date,
                "approved_date": obj.approved_date,
            }
        },
        project_id=project.id,
    )

    return obj
