import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy.orm import Session

from backend.app.db.models import (
    Client,
    Department,
    Discipline,
    Milestone,
    Project,
    ProjectRoleAssignment,
    Template,
    User,
    UserRole,
)


@pytest.fixture
def env(db_session: Session):
    """Project in dept ALPHA; an in-dept editor, an in-dept viewer, a
    shared outsider, and an unshared outsider. Plus a milestone on the
    project and a milestone on a *second* project."""
    alpha = Department(code="ALPHA", name="Alpha")
    beta = Department(code="BETA", name="Beta")
    db_session.add_all([alpha, beta])
    db_session.flush()
    cl = Client(code="C", name="C", department_id=alpha.id)
    di = Discipline(code="D", name="D", department_id=alpha.id)
    db_session.add_all([cl, di])
    db_session.flush()
    t = Template(name="t", department_id=alpha.id, client_id=cl.id, discipline_id=di.id)
    db_session.add(t)
    db_session.flush()

    def mk(email, role, dept):
        u = User(email=email, display_name=email.split("@")[0])
        db_session.add(u)
        db_session.flush()
        if role:
            db_session.add(UserRole(user_id=u.id, role_id=role, department_id=dept))
        return u

    editor = mk("editor@x.com", "project_editor", alpha.id)
    viewer = mk("viewer@x.com", "viewer", alpha.id)
    shared = mk("shared@x.com", "project_editor", beta.id)
    outsider = mk("outsider@x.com", "project_editor", beta.id)

    # created_by is NOT NULL — must supply a valid user id
    proj = Project(project_number="P", title="x", template_id=t.id, created_by=editor.id)
    other = Project(project_number="P2", title="y", template_id=t.id, created_by=editor.id)
    db_session.add_all([proj, other])
    db_session.flush()

    db_session.add(ProjectRoleAssignment(user_id=shared.id, project_id=proj.id))

    m_here = Milestone(project_id=proj.id, name="Submit", direction="outbound", date_model="single")
    m_other = Milestone(project_id=other.id, name="Other", direction="outbound", date_model="single")
    db_session.add_all([m_here, m_other])
    db_session.flush()
    return locals()


def _body(env, **over):
    body = {
        "description": "Do the thing",
        "assignee_user_id": str(env["editor"].id),
        "status": "open",
    }
    body.update(over)
    return body


def test_create_then_list(env, client_as):
    proj = env["proj"]
    c = client_as(env["editor"])
    r = c.post(f"/api/projects/{proj.id}/assignments", json=_body(env))
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["assignee_name"] == "editor"
    assert out["status"] == "open"
    listing = c.get(f"/api/projects/{proj.id}/assignments").json()
    assert listing["total"] == 1


def test_assignee_must_be_eligible(env, client_as):
    proj = env["proj"]
    c = client_as(env["editor"])
    r = c.post(
        f"/api/projects/{proj.id}/assignments",
        json=_body(env, assignee_user_id=str(env["outsider"].id)),
    )
    assert r.status_code == 422


def test_shared_outsider_is_eligible(env, client_as):
    proj = env["proj"]
    c = client_as(env["editor"])
    r = c.post(
        f"/api/projects/{proj.id}/assignments",
        json=_body(env, assignee_user_id=str(env["shared"].id)),
    )
    assert r.status_code == 201, r.text


def test_milestone_must_belong_to_project(env, client_as):
    proj = env["proj"]
    c = client_as(env["editor"])
    r = c.post(
        f"/api/projects/{proj.id}/assignments",
        json=_body(env, milestone_id=str(env["m_other"].id)),
    )
    assert r.status_code == 422


def test_bad_status_rejected(env, client_as):
    proj = env["proj"]
    c = client_as(env["editor"])
    r = c.post(f"/api/projects/{proj.id}/assignments", json=_body(env, status="nope"))
    assert r.status_code == 422


def test_viewer_cannot_create(env, client_as):
    proj = env["proj"]
    c = client_as(env["viewer"])
    r = c.post(f"/api/projects/{proj.id}/assignments", json=_body(env))
    assert r.status_code == 403


def test_patch_and_soft_delete(env, client_as):
    proj = env["proj"]
    c = client_as(env["editor"])
    created = c.post(f"/api/projects/{proj.id}/assignments", json=_body(env)).json()
    aid = created["id"]
    r = c.patch(
        f"/api/projects/{proj.id}/assignments/{aid}", json={"status": "done"}
    )
    assert r.status_code == 200
    assert r.json()["status"] == "done"
    r = c.delete(f"/api/projects/{proj.id}/assignments/{aid}")
    assert r.status_code == 204
    assert c.get(f"/api/projects/{proj.id}/assignments").json()["total"] == 0


def test_out_of_scope_project_404(env, client_as):
    proj = env["proj"]
    c = client_as(env["outsider"])
    r = c.get(f"/api/projects/{proj.id}/assignments")
    assert r.status_code == 404


def test_patch_revalidates_assignee(env, client_as):
    proj = env["proj"]
    c = client_as(env["editor"])
    aid = c.post(f"/api/projects/{proj.id}/assignments", json=_body(env)).json()["id"]
    r = c.patch(
        f"/api/projects/{proj.id}/assignments/{aid}",
        json={"assignee_user_id": str(env["outsider"].id)},
    )
    assert r.status_code == 422


def test_patch_revalidates_milestone(env, client_as):
    proj = env["proj"]
    c = client_as(env["editor"])
    aid = c.post(f"/api/projects/{proj.id}/assignments", json=_body(env)).json()["id"]
    r = c.patch(
        f"/api/projects/{proj.id}/assignments/{aid}",
        json={"milestone_id": str(env["m_other"].id)},
    )
    assert r.status_code == 422


def test_patch_revalidates_status(env, client_as):
    proj = env["proj"]
    c = client_as(env["editor"])
    aid = c.post(f"/api/projects/{proj.id}/assignments", json=_body(env)).json()["id"]
    r = c.patch(
        f"/api/projects/{proj.id}/assignments/{aid}",
        json={"status": "nope"},
    )
    assert r.status_code == 422


def test_soft_deleted_user_not_eligible(env, client_as, db_session):
    """A soft-deleted user must be rejected even if they are in the eligible-id set."""
    proj = env["proj"]
    # editor is an in-dept project_editor — normally eligible
    target = env["editor"]
    target.deleted_at = datetime.now(timezone.utc)
    db_session.flush()

    c = client_as(env["viewer"])  # viewer can't create — use a second editor
    # Need a non-deleted editor to make the request; mk a fresh one
    from backend.app.db.models import UserRole as _UR, User as _U

    actor = _U(email="actor2@x.com", display_name="actor2")
    db_session.add(actor)
    db_session.flush()
    db_session.add(_UR(user_id=actor.id, role_id="project_editor", department_id=env["alpha"].id))
    db_session.flush()

    c2 = client_as(actor)
    r = c2.post(
        f"/api/projects/{proj.id}/assignments",
        json=_body(env, assignee_user_id=str(target.id)),
    )
    assert r.status_code == 422


# ---- Phase 27.6: /api/me/assignments (my-assignments widget feed) -------


def test_my_assignments_open_only_ordered_by_due_date(env, client_as):
    proj = env["proj"]
    c = client_as(env["editor"])

    def mk(due, status):
        body = _body(env, status=status)
        if due is not None:
            body["due_date"] = due
        return c.post(f"/api/projects/{proj.id}/assignments", json=body)

    assert mk("2026-03-01", "open").status_code == 201
    assert mk("2026-01-15", "open").status_code == 201
    assert mk(None, "in_progress").status_code == 201
    assert mk("2026-02-01", "done").status_code == 201  # excluded (complete)
    # An assignment for a *different* assignee must not appear in editor's feed.
    assert c.post(
        f"/api/projects/{proj.id}/assignments",
        json=_body(env, assignee_user_id=str(env["viewer"].id)),
    ).status_code == 201

    body = c.get("/api/me/assignments").json()
    assert body["total"] == 3, body
    dues = [it["due_date"] for it in body["items"]]
    # Soonest first; the no-due (in_progress) row sorts last.
    assert dues == ["2026-01-15", "2026-03-01", None], dues
    # done is excluded; every row carries the project title.
    assert all(it["status"] in ("open", "in_progress") for it in body["items"])
    assert all(it["project_title"] == "x" for it in body["items"])


def test_my_assignments_only_returns_own(env, client_as):
    proj = env["proj"]
    c = client_as(env["editor"])
    # editor assigns one to the viewer and one to themselves.
    c.post(
        f"/api/projects/{proj.id}/assignments",
        json=_body(env, assignee_user_id=str(env["viewer"].id)),
    )
    c.post(f"/api/projects/{proj.id}/assignments", json=_body(env))

    editor_feed = c.get("/api/me/assignments").json()
    assert editor_feed["total"] == 1
    viewer_feed = client_as(env["viewer"]).get("/api/me/assignments").json()
    assert viewer_feed["total"] == 1
    # The viewer's one row is the one assigned to them.
    assert viewer_feed["items"][0]["assignee_email"] == "viewer@x.com"


def test_my_assignments_excludes_revoked_visibility(env, client_as, db_session):
    """A direct-grant assignee who later loses the share no longer sees the
    assignment in their feed (open item 41 — no leak)."""
    proj = env["proj"]
    shared = env["shared"]  # dept beta, direct-granted on proj (alpha)
    # Assign to the shared outsider while they can view the project.
    assert client_as(env["editor"]).post(
        f"/api/projects/{proj.id}/assignments",
        json=_body(env, assignee_user_id=str(shared.id)),
    ).status_code == 201
    assert client_as(shared).get("/api/me/assignments").json()["total"] == 1

    # Revoke the direct share → the assignment is now invisible to them.
    from backend.app.db.models import ProjectRoleAssignment

    db_session.query(ProjectRoleAssignment).filter_by(
        user_id=shared.id, project_id=proj.id
    ).delete()
    db_session.flush()
    # Drop cached relationship collections so the next request reloads the
    # (now-revoked) project_role_assignments from the DB.
    db_session.expire_all()
    assert client_as(shared).get("/api/me/assignments").json()["total"] == 0


# ---- Phase 23.5: assignee status-only self-service ----------------------


def _assignment_for_viewer(env, client_as):
    """Editor creates an assignment whose assignee is the in-dept viewer.
    Returns the assignment id."""
    proj = env["proj"]
    c = client_as(env["editor"])
    return c.post(
        f"/api/projects/{proj.id}/assignments",
        json=_body(env, assignee_user_id=str(env["viewer"].id)),
    ).json()["id"]


def test_assignee_viewer_can_update_own_status(env, client_as):
    proj = env["proj"]
    aid = _assignment_for_viewer(env, client_as)
    c = client_as(env["viewer"])  # a Viewer, and the assignee
    r = c.patch(
        f"/api/projects/{proj.id}/assignments/{aid}",
        json={"status": "in_progress"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "in_progress"


def test_assignee_viewer_cannot_update_other_fields(env, client_as):
    proj = env["proj"]
    aid = _assignment_for_viewer(env, client_as)
    c = client_as(env["viewer"])
    r = c.patch(
        f"/api/projects/{proj.id}/assignments/{aid}",
        json={"description": "sneaky edit"},
    )
    assert r.status_code == 403


def test_assignee_viewer_cannot_smuggle_field_with_status(env, client_as):
    proj = env["proj"]
    aid = _assignment_for_viewer(env, client_as)
    c = client_as(env["viewer"])
    # status is allowed, but bundling another field is not.
    r = c.patch(
        f"/api/projects/{proj.id}/assignments/{aid}",
        json={"status": "done", "assignee_user_id": str(env["editor"].id)},
    )
    assert r.status_code == 403


def test_non_assignee_viewer_cannot_update_status(env, client_as):
    proj = env["proj"]
    aid = _assignment_for_viewer(env, client_as)
    # `shared` can view the project (direct grant) but is not an editor on
    # it and is not the assignee → no status write.
    c = client_as(env["shared"])
    r = c.patch(
        f"/api/projects/{proj.id}/assignments/{aid}",
        json={"status": "done"},
    )
    assert r.status_code == 403


def test_editor_still_updates_all_fields(env, client_as):
    proj = env["proj"]
    aid = _assignment_for_viewer(env, client_as)
    c = client_as(env["editor"])
    r = c.patch(
        f"/api/projects/{proj.id}/assignments/{aid}",
        json={"description": "edited", "status": "done"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["description"] == "edited"
    assert r.json()["status"] == "done"
