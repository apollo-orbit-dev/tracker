"""Unit tests for form_push.push_submission (Phase 17.14, Task C2).

TDD: tests written to drive the implementation of the push service.

Scenarios covered:
1. Happy path — push_submission creates a COR with the correct description +
   amount, marks the submission approved with pushed_entity_* set, and
   writes both audit rows (COR create + submission transition).
2. Reviewer who lacks project_editor+ on the target project → 403 propagates
   from assert_can_edit_project.  (Cross-dept guard: reviewer is editor in
   dept A, target project is in dept B where they have no role.)
3. Duplicate cor_number on the target project → CORNumberConflict raised.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db.models import (
    AuditLog,
    Client,
    COR,
    Department,
    Discipline,
    Form,
    FormField,
    FormSubmission,
    Project,
    Template,
)
from backend.app.services.cor_create import CORNumberConflict
from backend.app.services.form_push import push_submission
from backend.tests.conftest import _make_dept, _make_user


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_template(db: Session, dept: Department) -> Template:
    code_suffix = dept.code.replace("-", "")
    cl = Client(code=f"CL_{code_suffix}", name="cl", department_id=dept.id)
    di = Discipline(code=f"DI_{code_suffix}", name="di", department_id=dept.id)
    db.add_all([cl, di])
    db.flush()
    t = Template(
        name=f"tmpl-{dept.code}",
        department_id=dept.id,
        client_id=cl.id,
        discipline_id=di.id,
    )
    db.add(t)
    db.flush()
    return t


def _make_project(db: Session, dept: Department, creator, number: str) -> Project:
    t = _make_template(db, dept)
    p = Project(
        project_number=number,
        title=f"Project {number}",
        template_id=t.id,
        created_by=creator.id,
    )
    db.add(p)
    db.flush()
    return p


def _make_cor_form(
    db: Session,
    dept: Department,
    creator,
) -> tuple[Form, FormField, FormField]:
    """Create a COR-targeting form with description (long_text) and amount
    (currency) fields, both bound to their respective target_keys."""
    form = Form(
        department_id=dept.id,
        name="CO Request Form",
        target_entity="cor",
        status="active",
        created_by=creator.id,
    )
    db.add(form)
    db.flush()

    desc_field = FormField(
        form_id=form.id,
        label="Description",
        field_type="long_text",
        required=True,
        order_index=0,
        target_key="description",
    )
    amount_field = FormField(
        form_id=form.id,
        label="Amount",
        field_type="currency",
        required=True,
        order_index=1,
        target_key="amount",
    )
    db.add_all([desc_field, amount_field])
    db.flush()
    return form, desc_field, amount_field


def _make_submission(
    db: Session,
    form: Form,
    submitter,
    desc_field: FormField,
    amount_field: FormField,
    *,
    description: str = "Extra scope added",
    amount: str = "12500.00",
    project: Project | None = None,
) -> FormSubmission:
    values = {
        str(desc_field.id): description,
        str(amount_field.id): amount,
    }
    sub = FormSubmission(
        form_id=form.id,
        submitted_by=submitter.id,
        values=values,
        target_project_id=project.id if project else None,
        status="pending",
    )
    db.add(sub)
    db.flush()
    return sub


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestPushSubmissionHappyPath:
    def test_creates_cor_with_mapped_fields(self, db_session: Session) -> None:
        """push_submission maps description + amount and creates the COR."""
        dept = _make_dept(db_session, code="FP-HAPPY")
        editor = _make_user(
            db_session,
            email="fp-editor@example.com",
            role="project_editor",
            department_id=dept.id,
        )
        project = _make_project(db_session, dept, editor, "FP-001")
        form, desc_field, amount_field = _make_cor_form(db_session, dept, editor)
        submission = _make_submission(
            db_session,
            form,
            editor,
            desc_field,
            amount_field,
            description="  Steel reinforcement change  ",
            amount="9875.50",
            project=project,
        )

        # Reload form with its fields relationship populated.
        db_session.refresh(form)

        final_values = {
            str(desc_field.id): "  Steel reinforcement change  ",
            str(amount_field.id): "9875.50",
        }

        cor = push_submission(
            db_session,
            editor,
            submission,
            form,
            final_values=final_values,
            ctx={"target_project_id": project.id, "cor_number": "COR-0001", "cor_status": "submitted"},
        )
        db_session.commit()

        # COR row exists with correct fields.
        assert cor.id is not None
        assert cor.project_id == project.id
        assert cor.number == "COR-0001"
        assert cor.description == "Steel reinforcement change"  # stripped
        assert cor.amount == Decimal("9875.50")
        assert cor.status == "submitted"

        # Submission is now approved with push metadata.
        assert submission.status == "approved"
        assert submission.reviewed_by == editor.id
        assert submission.reviewed_at is not None
        assert submission.pushed_entity_type == "cor"
        assert submission.pushed_entity_id == cor.id

        # Audit rows: one for COR create, one for submission transition.
        cor_audits = db_session.scalars(
            select(AuditLog).where(
                AuditLog.entity_type == "cor",
                AuditLog.entity_id == cor.id,
                AuditLog.operation == "create",
            )
        ).all()
        assert len(cor_audits) == 1

        sub_audits = db_session.scalars(
            select(AuditLog).where(
                AuditLog.entity_type == "form_submission",
                AuditLog.entity_id == submission.id,
                AuditLog.operation == "transition",
            )
        ).all()
        assert len(sub_audits) == 1
        assert sub_audits[0].changes["to"] == "approved"
        assert "cor" in sub_audits[0].changes["pushed"]


class TestPushSubmissionCrossDeptGuard:
    def test_reviewer_lacks_edit_on_target_dept_raises_403(
        self, db_session: Session
    ) -> None:
        """Reviewer is project_editor in dept A but target project is in dept B
        where they have no role → assert_can_edit_project raises 403."""
        dept_a = _make_dept(db_session, code="FP-DEPTA")
        dept_b = _make_dept(db_session, code="FP-DEPTB")

        # Editor only has rights in dept A.
        editor_a = _make_user(
            db_session,
            email="fp-editor-a@example.com",
            role="project_editor",
            department_id=dept_a.id,
        )
        # Creator for dept B project.
        creator_b = _make_user(
            db_session,
            email="fp-creator-b@example.com",
            role="project_editor",
            department_id=dept_b.id,
        )

        project_b = _make_project(db_session, dept_b, creator_b, "FP-B01")
        form, desc_field, amount_field = _make_cor_form(db_session, dept_a, editor_a)
        submission = _make_submission(
            db_session, form, editor_a, desc_field, amount_field, project=project_b
        )

        db_session.refresh(form)

        final_values = {
            str(desc_field.id): "Some work",
            str(amount_field.id): "1000.00",
        }

        with pytest.raises(HTTPException) as exc_info:
            push_submission(
                db_session,
                editor_a,
                submission,
                form,
                final_values=final_values,
                ctx={"target_project_id": project_b.id, "cor_number": "COR-0001"},
            )

        assert exc_info.value.status_code == 403


class TestPushSubmissionDuplicateNumber:
    def test_duplicate_cor_number_raises_conflict(self, db_session: Session) -> None:
        """A COR with the same number already on the project → CORNumberConflict."""
        dept = _make_dept(db_session, code="FP-DUP")
        editor = _make_user(
            db_session,
            email="fp-dup-editor@example.com",
            role="project_editor",
            department_id=dept.id,
        )
        project = _make_project(db_session, dept, editor, "FP-DUP-001")
        form, desc_field, amount_field = _make_cor_form(db_session, dept, editor)
        submission = _make_submission(
            db_session, form, editor, desc_field, amount_field, project=project
        )

        # Pre-create a COR with the number we'll try to use.
        existing_cor = COR(
            project_id=project.id,
            number="COR-0099",
            description="Existing",
            amount=Decimal("500.00"),
            status="submitted",
        )
        db_session.add(existing_cor)
        db_session.flush()

        db_session.refresh(form)

        final_values = {
            str(desc_field.id): "New work",
            str(amount_field.id): "2500.00",
        }

        with pytest.raises(CORNumberConflict):
            push_submission(
                db_session,
                editor,
                submission,
                form,
                final_values=final_values,
                ctx={"target_project_id": project.id, "cor_number": "COR-0099"},  # duplicate!
            )


class TestPushSubmissionDescriptionValidation:
    """Regression tests for the COR description validation added in Phase 17.

    push_submission must raise HTTP 422 (not create a COR) when the mapped
    description is empty or exceeds 2000 characters.
    """

    def test_empty_description_raises_422(self, db_session: Session) -> None:
        """Approving a submission whose mapped description is empty → 422;
        submission remains pending and no COR is created."""
        dept = _make_dept(db_session, code="FP-EDESC")
        editor = _make_user(
            db_session,
            email="fp-edesc@example.com",
            role="project_editor",
            department_id=dept.id,
        )
        project = _make_project(db_session, dept, editor, "FP-EDESC-001")
        form, desc_field, amount_field = _make_cor_form(db_session, dept, editor)
        submission = _make_submission(
            db_session,
            form,
            editor,
            desc_field,
            amount_field,
            description="",  # empty — will strip to ""
            project=project,
        )

        db_session.refresh(form)

        final_values = {
            str(desc_field.id): "",  # empty description
            str(amount_field.id): "500.00",
        }

        with pytest.raises(HTTPException) as exc_info:
            push_submission(
                db_session,
                editor,
                submission,
                form,
                final_values=final_values,
                ctx={"target_project_id": project.id, "cor_number": "COR-0001"},
            )

        assert exc_info.value.status_code == 422
        assert exc_info.value.detail == "COR description is required."

        # Submission must still be pending — no COR was created.
        assert submission.status == "pending"
        cor_count = db_session.scalars(
            select(COR).where(COR.project_id == project.id)
        ).all()
        assert len(cor_count) == 0

    def test_description_over_2000_chars_raises_422(
        self, db_session: Session
    ) -> None:
        """Mapped description longer than 2000 characters → HTTP 422."""
        dept = _make_dept(db_session, code="FP-LONG")
        editor = _make_user(
            db_session,
            email="fp-long@example.com",
            role="project_editor",
            department_id=dept.id,
        )
        project = _make_project(db_session, dept, editor, "FP-LONG-001")
        form, desc_field, amount_field = _make_cor_form(db_session, dept, editor)
        long_desc = "x" * 2001
        submission = _make_submission(
            db_session,
            form,
            editor,
            desc_field,
            amount_field,
            description=long_desc,
            project=project,
        )

        db_session.refresh(form)

        final_values = {
            str(desc_field.id): long_desc,
            str(amount_field.id): "500.00",
        }

        with pytest.raises(HTTPException) as exc_info:
            push_submission(
                db_session,
                editor,
                submission,
                form,
                final_values=final_values,
                ctx={"target_project_id": project.id, "cor_number": "COR-0002"},
            )

        assert exc_info.value.status_code == 422
        assert exc_info.value.detail == "COR description must be 2000 characters or fewer."


class TestWriterDispatch:
    """Phase 20.1: push_submission dispatches on the target descriptor's writer."""

    def test_dispatch_routes_to_cor_writer(self, db_session: Session) -> None:
        dept = _make_dept(db_session, code="FP-DISP")
        editor = _make_user(
            db_session, email="fp-disp@example.com",
            role="project_editor", department_id=dept.id,
        )
        project = _make_project(db_session, dept, editor, "FP-DISP-1")
        form, desc_field, amount_field = _make_cor_form(db_session, dept, editor)
        submission = _make_submission(
            db_session, form, editor, desc_field, amount_field, project=project
        )
        db_session.refresh(form)

        cor = push_submission(
            db_session, editor, submission, form,
            final_values={
                str(desc_field.id): "Scope add",
                str(amount_field.id): "1000.00",
            },
            ctx={"target_project_id": project.id, "cor_number": "COR-DISP-1"},
        )
        assert cor.number == "COR-DISP-1"
        assert submission.pushed_entity_type == "cor"

    def test_dispatch_unknown_writer_raises_500(
        self, db_session: Session, monkeypatch
    ) -> None:
        from backend.app.services import form_targets

        # Register a target whose writer has no entry in _WRITERS.
        monkeypatch.setitem(
            form_targets.FORM_TARGETS, "ghost",
            {"label": "Ghost", "requires_project": False, "writer": "ghost", "fields": []},
        )
        dept = _make_dept(db_session, code="FP-GHOST")
        editor = _make_user(
            db_session, email="fp-ghost@example.com",
            role="project_editor", department_id=dept.id,
        )
        form, desc_field, amount_field = _make_cor_form(db_session, dept, editor)
        submission = _make_submission(db_session, form, editor, desc_field, amount_field)
        db_session.refresh(form)
        # Set the (constraint-invalid) entity in memory only, AFTER the refresh —
        # the dispatcher raises before any DB flush, so it never persists.
        form.target_entity = "ghost"

        with pytest.raises(HTTPException) as exc_info:
            push_submission(db_session, editor, submission, form, final_values={}, ctx={})
        assert exc_info.value.status_code == 500
        db_session.expunge(form)  # drop the dirty in-memory change before teardown

    def test_dispatch_collect_only_returns_none(self, db_session: Session) -> None:
        dept = _make_dept(db_session, code="FP-COLLECT")
        editor = _make_user(
            db_session, email="fp-collect@example.com",
            role="project_editor", department_id=dept.id,
        )
        form, desc_field, amount_field = _make_cor_form(db_session, dept, editor)
        form.target_entity = None  # collect-only
        submission = _make_submission(db_session, form, editor, desc_field, amount_field)
        db_session.refresh(form)

        assert push_submission(
            db_session, editor, submission, form, final_values={}, ctx={}
        ) is None


def _make_assignment_form(db: Session, dept: Department, creator):
    """An assignment-target form: description (long_text) + due_date (date)."""
    form = Form(
        department_id=dept.id, name="Task intake", target_entity="assignment",
        status="active", created_by=creator.id,
    )
    db.add(form)
    db.flush()
    desc = FormField(form_id=form.id, label="What", field_type="long_text",
                     required=True, order_index=0, target_key="description")
    due = FormField(form_id=form.id, label="By when", field_type="date",
                    required=False, order_index=1, target_key="due_date")
    db.add_all([desc, due])
    db.flush()
    return form, desc, due


class TestAssignmentWriter:
    def test_creates_assignment_with_approval_assignee(self, db_session: Session) -> None:
        dept = _make_dept(db_session, code="FP-ASG")
        editor = _make_user(db_session, email="fp-asg@example.com",
                            role="project_editor", department_id=dept.id)
        project = _make_project(db_session, dept, editor, "FP-ASG-1")
        form, desc, due = _make_assignment_form(db_session, dept, editor)
        sub = FormSubmission(form_id=form.id, submitted_by=editor.id,
                             values={str(desc.id): "Inspect footings",
                                     str(due.id): "2026-07-15"},
                             target_project_id=project.id, status="pending")
        db_session.add(sub)
        db_session.flush()
        db_session.refresh(form)

        obj = push_submission(
            db_session, editor, sub, form,
            final_values={str(desc.id): "Inspect footings", str(due.id): "2026-07-15"},
            ctx={"target_project_id": project.id, "assignee_user_id": editor.id},
        )
        assert obj.description == "Inspect footings"
        assert str(obj.due_date) == "2026-07-15"
        assert obj.assignee_user_id == editor.id
        assert obj.status == "open"
        assert sub.status == "approved"
        assert sub.pushed_entity_type == "assignment"
        assert sub.pushed_entity_id == obj.id

    def test_missing_assignee_raises_422(self, db_session: Session) -> None:
        dept = _make_dept(db_session, code="FP-ASG-NOA")
        editor = _make_user(db_session, email="fp-asg-noa@example.com",
                            role="project_editor", department_id=dept.id)
        project = _make_project(db_session, dept, editor, "FP-ASG-NOA-1")
        form, desc, due = _make_assignment_form(db_session, dept, editor)
        sub = FormSubmission(form_id=form.id, submitted_by=editor.id,
                             values={str(desc.id): "x"},
                             target_project_id=project.id, status="pending")
        db_session.add(sub)
        db_session.flush()
        db_session.refresh(form)

        with pytest.raises(HTTPException) as e:
            push_submission(db_session, editor, sub, form,
                            final_values={str(desc.id): "x"},
                            ctx={"target_project_id": project.id, "assignee_user_id": None})
        assert e.value.status_code == 422
        assert sub.status == "pending"

    def test_ineligible_assignee_raises_422(self, db_session: Session) -> None:
        dept = _make_dept(db_session, code="FP-ASG-INE")
        other = _make_dept(db_session, code="FP-ASG-OTHER")
        editor = _make_user(db_session, email="fp-asg-ine@example.com",
                            role="project_editor", department_id=dept.id)
        outsider = _make_user(db_session, email="fp-asg-out@example.com",
                              role="viewer", department_id=other.id)
        project = _make_project(db_session, dept, editor, "FP-ASG-INE-1")
        form, desc, due = _make_assignment_form(db_session, dept, editor)
        sub = FormSubmission(form_id=form.id, submitted_by=editor.id,
                             values={str(desc.id): "x"},
                             target_project_id=project.id, status="pending")
        db_session.add(sub)
        db_session.flush()
        db_session.refresh(form)

        with pytest.raises(HTTPException) as e:
            push_submission(db_session, editor, sub, form,
                            final_values={str(desc.id): "x"},
                            ctx={"target_project_id": project.id, "assignee_user_id": outsider.id})
        assert e.value.status_code == 422  # ineligible assignee


def _make_milestone_form(db: Session, dept: Department, creator):
    """A milestone-target form: name (short_text) + planned_date (date)."""
    form = Form(department_id=dept.id, name="New milestone", target_entity="milestone",
                status="active", created_by=creator.id)
    db.add(form)
    db.flush()
    name_f = FormField(form_id=form.id, label="Name", field_type="short_text",
                       required=True, order_index=0, target_key="name")
    planned = FormField(form_id=form.id, label="Planned", field_type="date",
                        required=False, order_index=1, target_key="planned_date")
    db.add_all([name_f, planned])
    db.flush()
    return form, name_f, planned


class TestMilestoneWriter:
    def test_creates_ad_hoc_milestone(self, db_session: Session) -> None:
        dept = _make_dept(db_session, code="FP-MS")
        editor = _make_user(db_session, email="fp-ms@example.com",
                            role="project_editor", department_id=dept.id)
        project = _make_project(db_session, dept, editor, "FP-MS-1")
        form, name_f, planned = _make_milestone_form(db_session, dept, editor)
        sub = FormSubmission(form_id=form.id, submitted_by=editor.id,
                             values={str(name_f.id): "Submit drawings",
                                     str(planned.id): "2026-09-01"},
                             target_project_id=project.id, status="pending")
        db_session.add(sub)
        db_session.flush()
        db_session.refresh(form)

        obj = push_submission(
            db_session, editor, sub, form,
            final_values={str(name_f.id): "Submit drawings", str(planned.id): "2026-09-01"},
            ctx={"target_project_id": project.id,
                 "milestone_direction": "outbound", "milestone_date_model": "planned_actual"},
        )
        assert obj.name == "Submit drawings"
        assert obj.direction == "outbound"
        assert obj.date_model == "planned_actual"
        assert str(obj.planned_date) == "2026-09-01"
        assert obj.template_milestone_def_id is None  # ad-hoc
        assert sub.pushed_entity_type == "milestone"

    def test_missing_direction_raises_422(self, db_session: Session) -> None:
        dept = _make_dept(db_session, code="FP-MS-ND")
        editor = _make_user(db_session, email="fp-ms-nd@example.com",
                            role="project_editor", department_id=dept.id)
        project = _make_project(db_session, dept, editor, "FP-MS-ND-1")
        form, name_f, planned = _make_milestone_form(db_session, dept, editor)
        sub = FormSubmission(form_id=form.id, submitted_by=editor.id,
                             values={str(name_f.id): "x"},
                             target_project_id=project.id, status="pending")
        db_session.add(sub)
        db_session.flush()
        db_session.refresh(form)

        with pytest.raises(HTTPException) as e:
            push_submission(db_session, editor, sub, form,
                            final_values={str(name_f.id): "x"},
                            ctx={"target_project_id": project.id,
                                 "milestone_date_model": "single"})
        assert e.value.status_code == 422
        assert sub.status == "pending"

    def test_bad_direction_enum_raises_422(self, db_session: Session) -> None:
        dept = _make_dept(db_session, code="FP-MS-BD")
        editor = _make_user(db_session, email="fp-ms-bd@example.com",
                            role="project_editor", department_id=dept.id)
        project = _make_project(db_session, dept, editor, "FP-MS-BD-1")
        form, name_f, planned = _make_milestone_form(db_session, dept, editor)
        sub = FormSubmission(form_id=form.id, submitted_by=editor.id,
                             values={str(name_f.id): "x"},
                             target_project_id=project.id, status="pending")
        db_session.add(sub)
        db_session.flush()
        db_session.refresh(form)

        with pytest.raises(HTTPException) as e:
            push_submission(db_session, editor, sub, form,
                            final_values={str(name_f.id): "x"},
                            ctx={"target_project_id": project.id,
                                 "milestone_direction": "sideways",
                                 "milestone_date_model": "single"})
        assert e.value.status_code == 422


def _make_event_form(db: Session, dept: Department, creator):
    """An event-target form: title + start_date + end_date + description."""
    form = Form(department_id=dept.id, name="New event", target_entity="event",
                status="active", created_by=creator.id)
    db.add(form)
    db.flush()
    title = FormField(form_id=form.id, label="Title", field_type="short_text",
                      required=True, order_index=0, target_key="title")
    start = FormField(form_id=form.id, label="Start", field_type="date",
                      required=True, order_index=1, target_key="start_date")
    end = FormField(form_id=form.id, label="End", field_type="date",
                    required=False, order_index=2, target_key="end_date")
    db.add_all([title, start, end])
    db.flush()
    return form, title, start, end


class TestEventWriter:
    def test_creates_single_dept_event(self, db_session: Session) -> None:
        from backend.app.db.models import Event

        dept = _make_dept(db_session, code="FP-EV")
        editor = _make_user(db_session, email="fp-ev@example.com",
                            role="project_editor", department_id=dept.id)
        form, title, start, end = _make_event_form(db_session, dept, editor)
        sub = FormSubmission(form_id=form.id, submitted_by=editor.id,
                             values={str(title.id): "Kickoff", str(start.id): "2026-09-10",
                                     str(end.id): "2026-09-11"},
                             target_project_id=None, status="pending")
        db_session.add(sub)
        db_session.flush()
        db_session.refresh(form)

        obj = push_submission(
            db_session, editor, sub, form,
            final_values={str(title.id): "Kickoff", str(start.id): "2026-09-10",
                          str(end.id): "2026-09-11"},
            ctx={},  # no project, no approval-time inputs
        )
        assert isinstance(obj, Event)
        assert obj.title == "Kickoff"
        assert obj.department_id == dept.id
        assert str(obj.start_date) == "2026-09-10"
        assert str(obj.end_date) == "2026-09-11"
        assert obj.recurrence is None
        assert obj.all_day is True
        assert sub.pushed_entity_type == "event"

    def test_missing_title_raises_422(self, db_session: Session) -> None:
        dept = _make_dept(db_session, code="FP-EV-NT")
        editor = _make_user(db_session, email="fp-ev-nt@example.com",
                            role="project_editor", department_id=dept.id)
        form, title, start, end = _make_event_form(db_session, dept, editor)
        sub = FormSubmission(form_id=form.id, submitted_by=editor.id,
                             values={str(start.id): "2026-09-10"},
                             target_project_id=None, status="pending")
        db_session.add(sub)
        db_session.flush()
        db_session.refresh(form)

        with pytest.raises(HTTPException) as e:
            push_submission(db_session, editor, sub, form,
                            final_values={str(start.id): "2026-09-10"}, ctx={})
        assert e.value.status_code == 422

    def test_end_before_start_raises_422(self, db_session: Session) -> None:
        dept = _make_dept(db_session, code="FP-EV-BAD")
        editor = _make_user(db_session, email="fp-ev-bad@example.com",
                            role="project_editor", department_id=dept.id)
        form, title, start, end = _make_event_form(db_session, dept, editor)
        sub = FormSubmission(form_id=form.id, submitted_by=editor.id,
                             values={str(title.id): "x", str(start.id): "2026-09-10",
                                     str(end.id): "2026-09-01"},
                             target_project_id=None, status="pending")
        db_session.add(sub)
        db_session.flush()
        db_session.refresh(form)

        with pytest.raises(HTTPException) as e:
            push_submission(db_session, editor, sub, form,
                            final_values={str(title.id): "x", str(start.id): "2026-09-10",
                                          str(end.id): "2026-09-01"}, ctx={})
        assert e.value.status_code == 422


class TestIntakeWriter:
    def test_intake_creates_project(self, db_session: Session) -> None:
        dept = _make_dept(db_session, code="FP-INT")
        editor = _make_user(db_session, email="fp-int@example.com",
                            role="project_editor", department_id=dept.id)
        template = _make_template(db_session, dept)
        form = Form(department_id=dept.id, name="Project intake",
                    target_entity="intake", target_template_id=template.id,
                    status="active", created_by=editor.id)
        db_session.add(form)
        db_session.flush()
        title_f = FormField(form_id=form.id, label="Title", field_type="short_text",
                            required=True, order_index=0, target_key="title")
        db_session.add(title_f)
        db_session.flush()
        sub = FormSubmission(form_id=form.id, submitted_by=editor.id,
                             values={str(title_f.id): "New bridge project"},
                             target_project_id=None, status="pending")
        db_session.add(sub)
        db_session.flush()
        db_session.refresh(form)

        obj = push_submission(
            db_session, editor, sub, form,
            final_values={str(title_f.id): "New bridge project"},
            ctx={"project_number": "PRJ-2026-001"},
        )
        assert obj.title == "New bridge project"
        assert obj.project_number == "PRJ-2026-001"
        assert obj.template_id == template.id
        assert obj.custom_field_values == {}
        assert sub.pushed_entity_type == "project"
        assert sub.pushed_entity_id == obj.id

    def test_intake_missing_project_number_raises_422(self, db_session: Session) -> None:
        dept = _make_dept(db_session, code="FP-INT-NN")
        editor = _make_user(db_session, email="fp-int-nn@example.com",
                            role="project_editor", department_id=dept.id)
        template = _make_template(db_session, dept)
        form = Form(department_id=dept.id, name="Intake", target_entity="intake",
                    target_template_id=template.id, status="active", created_by=editor.id)
        db_session.add(form)
        db_session.flush()
        title_f = FormField(form_id=form.id, label="Title", field_type="short_text",
                            required=True, order_index=0, target_key="title")
        db_session.add(title_f)
        db_session.flush()
        sub = FormSubmission(form_id=form.id, submitted_by=editor.id,
                             values={str(title_f.id): "x"}, status="pending")
        db_session.add(sub)
        db_session.flush()
        db_session.refresh(form)

        with pytest.raises(HTTPException) as e:
            push_submission(db_session, editor, sub, form,
                            final_values={str(title_f.id): "x"}, ctx={})
        assert e.value.status_code == 422
        assert sub.status == "pending"

    def test_intake_no_template_binding_raises_422(self, db_session: Session) -> None:
        dept = _make_dept(db_session, code="FP-INT-NT")
        editor = _make_user(db_session, email="fp-int-nt@example.com",
                            role="project_editor", department_id=dept.id)
        form = Form(department_id=dept.id, name="Intake", target_entity="intake",
                    target_template_id=None, status="active", created_by=editor.id)
        db_session.add(form)
        db_session.flush()
        title_f = FormField(form_id=form.id, label="Title", field_type="short_text",
                            required=True, order_index=0, target_key="title")
        db_session.add(title_f)
        db_session.flush()
        sub = FormSubmission(form_id=form.id, submitted_by=editor.id,
                             values={str(title_f.id): "x"}, status="pending")
        db_session.add(sub)
        db_session.flush()
        db_session.refresh(form)

        with pytest.raises(HTTPException) as e:
            push_submission(db_session, editor, sub, form,
                            final_values={str(title_f.id): "x"},
                            ctx={"project_number": "PRJ-1"})
        assert e.value.status_code == 422


def test_intake_maps_custom_fields(db_session: Session) -> None:
    """Phase 20.5c: a form field bound to a template custom-field def populates
    the new project's custom_field_values."""
    from backend.app.db.models import TemplateFieldDef

    dept = _make_dept(db_session, code="FP-INT-CF")
    editor = _make_user(db_session, email="fp-int-cf@example.com",
                        role="project_editor", department_id=dept.id)
    template = _make_template(db_session, dept)
    region = TemplateFieldDef(template_id=template.id, name="Region",
                              field_type="short_text", order_index=0)
    db_session.add(region)
    db_session.flush()

    form = Form(department_id=dept.id, name="Intake", target_entity="intake",
                target_template_id=template.id, status="active", created_by=editor.id)
    db_session.add(form)
    db_session.flush()
    title_f = FormField(form_id=form.id, label="Title", field_type="short_text",
                        required=True, order_index=0, target_key="title")
    region_f = FormField(form_id=form.id, label="Region", field_type="short_text",
                         required=False, order_index=1, target_key=str(region.id))
    db_session.add_all([title_f, region_f])
    db_session.flush()
    sub = FormSubmission(form_id=form.id, submitted_by=editor.id,
                         values={str(title_f.id): "Grid project", str(region_f.id): "West"},
                         status="pending")
    db_session.add(sub)
    db_session.flush()
    db_session.refresh(form)

    obj = push_submission(
        db_session, editor, sub, form,
        final_values={str(title_f.id): "Grid project", str(region_f.id): "West"},
        ctx={"project_number": "PRJ-CF-1"},
    )
    assert obj.title == "Grid project"
    assert obj.custom_field_values == {str(region.id): "West"}
