"""Cross-cutting matrix tests for the Phase 1.9.3 dept-scope rollout
across templates, projects, and the project sub-routes (cors, notes,
project_contacts).

These exercise the "user in dept A can't touch resource in dept B" path
that the per-route test files don't cover.
"""
from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.auth.passwords import hash_password
from backend.app.db.models import (
    AuthProvider,
    Client,
    Contact,
    Department,
    Discipline,
    ProjectRoleAssignment,
    Template,
    TemplateFieldDef,
    TemplateMilestoneDef,
    User,
    UserRole,
)


# Helpers ------------------------------------------------------------------


def _make_dept_with_template(
    db: Session, code: str
) -> tuple[Department, Template]:
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


def _user_with_role(
    db: Session, email: str, role: str, dept_id
) -> User:
    user = User(email=email, display_name=email.split("@")[0])
    db.add(user)
    db.flush()
    db.add(UserRole(user_id=user.id, role_id=role, department_id=dept_id))
    db.add(
        AuthProvider(
            user_id=user.id,
            provider="local",
            password_hash=hash_password("longenoughpw"),
        )
    )
    db.flush()
    return user


def _create_project(client: TestClient, template_id) -> dict:
    r = client.post(
        "/api/projects",
        json={
            "project_number": f"SCP{template_id.hex[:6]}",
            "title": "scope-test",
            "template_id": str(template_id),
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


# Templates ----------------------------------------------------------------


def test_templates_list_filtered_by_dept(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, t_a = _make_dept_with_template(db_session, "SCOPE_A")
    b, t_b = _make_dept_with_template(db_session, "SCOPE_B")
    user_in_a = _user_with_role(db_session, "ua@scope.test", "viewer", a.id)
    db_session.commit()

    body = client_as(user_in_a).get("/api/admin/templates").json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == str(t_a.id)


def test_template_get_in_other_dept_404(
    db_session: Session,
    client_as: Callable[[User], TestClient],
):
    a, _ = _make_dept_with_template(db_session, "SCG_A")
    b, t_b = _make_dept_with_template(db_session, "SCG_B")
    user = _user_with_role(db_session, "ug@scope.test", "viewer", a.id)
    db_session.commit()
    r = client_as(user).get(f"/api/admin/templates/{t_b.id}")
    assert r.status_code == 404


def test_template_create_requires_dm_in_target_dept(
    db_session: Session,
    client_as: Callable[[User], TestClient],
):
    a, _ = _make_dept_with_template(db_session, "SCC_A")
    b, _ = _make_dept_with_template(db_session, "SCC_B")
    dm_in_a = _user_with_role(
        db_session, "dma@scope.test", "department_manager", a.id
    )
    cl = Client(code="X", name="x", department_id=b.id)
    di = Discipline(code="Y", name="y", department_id=b.id)
    db_session.add_all([cl, di])
    db_session.flush()
    db_session.commit()
    # DM in A trying to create template in B → 403.
    r = client_as(dm_in_a).post(
        "/api/admin/templates",
        json={
            "name": "x",
            "department_id": str(b.id),
            "client_id": str(cl.id),
            "discipline_id": str(di.id),
        },
    )
    assert r.status_code == 403


def test_template_dm_in_dept_can_create(
    db_session: Session,
    client_as: Callable[[User], TestClient],
):
    a, _ = _make_dept_with_template(db_session, "SCDM_A")
    dm_in_a = _user_with_role(
        db_session, "dmcr@scope.test", "department_manager", a.id
    )
    cl = Client(code="CCDM", name="x", department_id=a.id)
    di = Discipline(code="DCDM", name="y", department_id=a.id)
    db_session.add_all([cl, di])
    db_session.flush()
    db_session.commit()
    r = client_as(dm_in_a).post(
        "/api/admin/templates",
        json={
            "name": "owned-by-dm",
            "department_id": str(a.id),
            "client_id": str(cl.id),
            "discipline_id": str(di.id),
        },
    )
    assert r.status_code == 201, r.text


def test_template_field_create_in_other_dept_forbidden(
    db_session: Session,
    client_as: Callable[[User], TestClient],
):
    a, _ = _make_dept_with_template(db_session, "SCF_A")
    b, t_b = _make_dept_with_template(db_session, "SCF_B")
    dm_in_a = _user_with_role(
        db_session, "dmf@scope.test", "department_manager", a.id
    )
    db_session.commit()
    r = client_as(dm_in_a).post(
        f"/api/admin/templates/{t_b.id}/fields",
        json={
            "name": "x",
            "field_type": "short_text",
            "required": False,
        },
    )
    # Write endpoints check management permission and surface 403 (not 404).
    assert r.status_code == 403


# Projects -----------------------------------------------------------------


def test_projects_list_filtered_via_template_join(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, t_a = _make_dept_with_template(db_session, "SCPA")
    b, t_b = _make_dept_with_template(db_session, "SCPB")
    user_in_a = _user_with_role(db_session, "pja@scope.test", "viewer", a.id)
    db_session.commit()
    c_admin = client_as(admin_user)
    _create_project(c_admin, t_a.id)
    _create_project(c_admin, t_b.id)
    r = client_as(user_in_a).get("/api/projects")
    body = r.json()
    assert body["total"] == 1
    assert body["items"][0]["template_id"] == str(t_a.id)


def test_project_get_in_other_dept_404(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, t_a = _make_dept_with_template(db_session, "SGGA")
    b, t_b = _make_dept_with_template(db_session, "SGGB")
    user_in_a = _user_with_role(db_session, "pga@scope.test", "viewer", a.id)
    db_session.commit()
    proj_b = _create_project(client_as(admin_user), t_b.id)
    r = client_as(user_in_a).get(f"/api/projects/{proj_b['id']}")
    assert r.status_code == 404


def test_project_editor_in_other_dept_cannot_create(
    db_session: Session,
    client_as: Callable[[User], TestClient],
):
    a, _ = _make_dept_with_template(db_session, "SECA")
    b, t_b = _make_dept_with_template(db_session, "SECB")
    pe_in_a = _user_with_role(
        db_session, "pea@scope.test", "project_editor", a.id
    )
    db_session.commit()
    r = client_as(pe_in_a).post(
        "/api/projects",
        json={
            "project_number": "OTHER1",
            "title": "x",
            "template_id": str(t_b.id),
        },
    )
    assert r.status_code == 403


def test_project_editor_in_other_dept_cannot_patch(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, _ = _make_dept_with_template(db_session, "SPPA")
    b, t_b = _make_dept_with_template(db_session, "SPPB")
    pe_in_a = _user_with_role(
        db_session, "pep@scope.test", "project_editor", a.id
    )
    db_session.commit()
    proj_b = _create_project(client_as(admin_user), t_b.id)
    r = client_as(pe_in_a).patch(
        f"/api/projects/{proj_b['id']}", json={"title": "renamed"}
    )
    assert r.status_code == 403


def test_project_editor_in_other_dept_cannot_delete(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, _ = _make_dept_with_template(db_session, "SPDA")
    b, t_b = _make_dept_with_template(db_session, "SPDB")
    pe_in_a = _user_with_role(
        db_session, "ped@scope.test", "project_editor", a.id
    )
    db_session.commit()
    proj_b = _create_project(client_as(admin_user), t_b.id)
    r = client_as(pe_in_a).delete(f"/api/projects/{proj_b['id']}")
    assert r.status_code == 403


# Sub-routes inheriting project's dept -------------------------------------


def test_notes_list_in_other_dept_404(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, _ = _make_dept_with_template(db_session, "SNA")
    b, t_b = _make_dept_with_template(db_session, "SNB")
    user_in_a = _user_with_role(db_session, "na@scope.test", "viewer", a.id)
    db_session.commit()
    proj_b = _create_project(client_as(admin_user), t_b.id)
    r = client_as(user_in_a).get(f"/api/projects/{proj_b['id']}/notes")
    assert r.status_code == 404


def test_cor_create_in_other_dept_403(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, _ = _make_dept_with_template(db_session, "SCRA")
    b, t_b = _make_dept_with_template(db_session, "SCRB")
    pe_in_a = _user_with_role(
        db_session, "cra@scope.test", "project_editor", a.id
    )
    db_session.commit()
    proj_b = _create_project(client_as(admin_user), t_b.id)
    r = client_as(pe_in_a).post(
        f"/api/projects/{proj_b['id']}/cors",
        json={
            "number": "1",
            "description": "x",
            "amount": "100.00",
            "status": "submitted",
        },
    )
    # Project-edit assertion fires before COR-row work → 403.
    assert r.status_code == 403


def test_project_contact_attach_in_other_dept_forbidden(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, _ = _make_dept_with_template(db_session, "SPCA")
    b, t_b = _make_dept_with_template(db_session, "SPCB")
    contact_b = Contact(
        name="Other Person",
        email="other-pc@example.com",
        department_id=b.id,
    )
    db_session.add(contact_b)
    db_session.flush()
    pe_in_a = _user_with_role(
        db_session, "pca@scope.test", "project_editor", a.id
    )
    db_session.commit()
    proj_b = _create_project(client_as(admin_user), t_b.id)
    r = client_as(pe_in_a).post(
        f"/api/projects/{proj_b['id']}/contacts",
        json={"contact_id": str(contact_b.id), "role": "SME"},
    )
    assert r.status_code == 403


def test_admin_can_act_in_any_dept(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    """Org admin has no scope filter — every read returns all, every
    write succeeds anywhere."""
    a, t_a = _make_dept_with_template(db_session, "AAD_A")
    b, t_b = _make_dept_with_template(db_session, "AAD_B")
    db_session.commit()
    c = client_as(admin_user)
    proj_a = _create_project(c, t_a.id)
    proj_b = _create_project(c, t_b.id)
    body = c.get("/api/projects").json()
    ids = {p["id"] for p in body["items"]}
    assert proj_a["id"] in ids
    assert proj_b["id"] in ids


# Org viewer (Phase 3.0.2) -------------------------------------------------
#
# Org viewer = (role_id='viewer', department_id=NULL). Sees every project
# in every dept (list AND per-project GET) but cannot create / edit / delete
# anywhere. The list path widens via accessible_department_ids → None; the
# per-project GET widens via has_role_in_dept's is_org_role short-circuit;
# the write paths gate on PROJECT_EDITOR which org viewer doesn't satisfy.


def test_org_viewer_sees_projects_in_all_depts(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, t_a = _make_dept_with_template(db_session, "OVL_A")
    b, t_b = _make_dept_with_template(db_session, "OVL_B")
    org_viewer = _user_with_role(
        db_session, "ovlist@scope.test", "viewer", None
    )
    db_session.commit()
    c_admin = client_as(admin_user)
    proj_a = _create_project(c_admin, t_a.id)
    proj_b = _create_project(c_admin, t_b.id)
    body = client_as(org_viewer).get("/api/projects").json()
    ids = {p["id"] for p in body["items"]}
    assert proj_a["id"] in ids
    assert proj_b["id"] in ids


def test_org_viewer_can_get_single_project_in_any_dept(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    """Regression artifact for the has_role_in_dept change in Phase 3.0.2:
    org viewer must see individual projects, not just the list."""
    a, t_a = _make_dept_with_template(db_session, "OVG_A")
    b, t_b = _make_dept_with_template(db_session, "OVG_B")
    org_viewer = _user_with_role(
        db_session, "ovget@scope.test", "viewer", None
    )
    db_session.commit()
    c_admin = client_as(admin_user)
    proj_a = _create_project(c_admin, t_a.id)
    proj_b = _create_project(c_admin, t_b.id)
    c_ov = client_as(org_viewer)
    assert c_ov.get(f"/api/projects/{proj_a['id']}").status_code == 200
    assert c_ov.get(f"/api/projects/{proj_b['id']}").status_code == 200


def test_org_viewer_cannot_patch_project(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, t_a = _make_dept_with_template(db_session, "OVP_A")
    org_viewer = _user_with_role(
        db_session, "ovpatch@scope.test", "viewer", None
    )
    db_session.commit()
    proj = _create_project(client_as(admin_user), t_a.id)
    r = client_as(org_viewer).patch(
        f"/api/projects/{proj['id']}", json={"title": "ov-renamed"}
    )
    assert r.status_code == 403


def test_org_viewer_cannot_create_project(
    db_session: Session,
    client_as: Callable[[User], TestClient],
):
    a, t_a = _make_dept_with_template(db_session, "OVC_A")
    org_viewer = _user_with_role(
        db_session, "ovcreate@scope.test", "viewer", None
    )
    db_session.commit()
    r = client_as(org_viewer).post(
        "/api/projects",
        json={
            "project_number": "OVCREATE1",
            "title": "ov-create",
            "template_id": str(t_a.id),
        },
    )
    assert r.status_code == 403


def test_org_viewer_cannot_delete_project(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, t_a = _make_dept_with_template(db_session, "OVD_A")
    org_viewer = _user_with_role(
        db_session, "ovdel@scope.test", "viewer", None
    )
    db_session.commit()
    proj = _create_project(client_as(admin_user), t_a.id)
    r = client_as(org_viewer).delete(f"/api/projects/{proj['id']}")
    assert r.status_code == 403


def test_project_detail_can_edit_per_dept(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    """Mixed-scope user (org viewer + dept-A editor) gets can_edit=True
    on dept-A projects and can_edit=False on dept-B projects via the
    detail endpoint. Without the per-project flag, the frontend would
    derive a flat 'has project_editor' bool from the user's role list
    and incorrectly ungrey controls on dept-B projects.
    """
    a, t_a = _make_dept_with_template(db_session, "CED_A")
    b, t_b = _make_dept_with_template(db_session, "CED_B")
    user = _user_with_role(
        db_session, "ced@scope.test", "viewer", None
    )
    # Add a second grant on the same user: project_editor in dept A.
    db_session.add(
        UserRole(user_id=user.id, role_id="project_editor", department_id=a.id)
    )
    db_session.flush()
    db_session.commit()
    proj_a = _create_project(client_as(admin_user), t_a.id)
    proj_b = _create_project(client_as(admin_user), t_b.id)
    c = client_as(user)
    detail_a = c.get(f"/api/projects/{proj_a['id']}").json()
    detail_b = c.get(f"/api/projects/{proj_b['id']}").json()
    assert detail_a["can_edit"] is True
    assert detail_b["can_edit"] is False


def test_project_detail_can_edit_true_for_admin(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    """Org admin's can_edit is True on every project regardless of dept."""
    a, t_a = _make_dept_with_template(db_session, "CEA_A")
    db_session.commit()
    proj = _create_project(client_as(admin_user), t_a.id)
    detail = client_as(admin_user).get(f"/api/projects/{proj['id']}").json()
    assert detail["can_edit"] is True


def test_project_detail_can_edit_false_for_org_viewer(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    """Pure org viewer (no per-dept editor grants) gets can_edit=False
    on every project — they can read but not edit."""
    a, t_a = _make_dept_with_template(db_session, "CEV_A")
    org_viewer = _user_with_role(
        db_session, "ceved@scope.test", "viewer", None
    )
    db_session.commit()
    proj = _create_project(client_as(admin_user), t_a.id)
    detail = client_as(org_viewer).get(f"/api/projects/{proj['id']}").json()
    assert detail["can_edit"] is False


# Direct project-role assignments (Phase 3.0.3) ----------------------------
#
# A user with no dept-scope role grants but a project_role_assignment on
# one specific project sees that project in the list, can GET it, and
# cannot edit it. A user with both a dept-scope grant and a direct grant
# on a project in a different dept sees both (union, no duplicates).


def _grant_direct(db_session: Session, user: User, project_id) -> None:
    db_session.add(
        ProjectRoleAssignment(user_id=user.id, project_id=project_id)
    )
    db_session.flush()


def test_direct_grant_user_sees_only_granted_project(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, t_a = _make_dept_with_template(db_session, "DGS_A")
    b, t_b = _make_dept_with_template(db_session, "DGS_B")
    # User has zero UserRole rows — relies purely on the direct grant.
    user = User(email="dgs@scope.test", display_name="dgs")
    db_session.add(user)
    db_session.flush()
    db_session.add(
        AuthProvider(
            user_id=user.id,
            provider="local",
            password_hash=hash_password("longenoughpw"),
        )
    )
    db_session.flush()
    c_admin = client_as(admin_user)
    proj_a = _create_project(c_admin, t_a.id)
    _create_project(c_admin, t_b.id)  # not granted to `user`
    _grant_direct(db_session, user, proj_a["id"])
    db_session.commit()
    body = client_as(user).get("/api/projects").json()
    ids = {p["id"] for p in body["items"]}
    assert ids == {proj_a["id"]}


def test_dept_plus_direct_grant_union_no_duplicates(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, t_a = _make_dept_with_template(db_session, "DPDU_A")
    b, t_b = _make_dept_with_template(db_session, "DPDU_B")
    # Viewer in dept A; direct grant on a project in dept B.
    user = _user_with_role(db_session, "dpdu@scope.test", "viewer", a.id)
    c_admin = client_as(admin_user)
    proj_a = _create_project(c_admin, t_a.id)
    proj_b = _create_project(c_admin, t_b.id)
    _grant_direct(db_session, user, proj_b["id"])
    db_session.commit()
    body = client_as(user).get("/api/projects").json()
    ids = [p["id"] for p in body["items"]]
    # Both projects visible, neither duplicated.
    assert sorted(ids) == sorted([proj_a["id"], proj_b["id"]])
    assert len(ids) == body["total"] == 2


def test_dept_and_direct_grant_overlap_no_duplicates(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    """Belt + suspenders case: same project visible via *both* mechanisms
    (dept viewer in A + direct grant on a project in A). Must appear once."""
    a, t_a = _make_dept_with_template(db_session, "DAD_A")
    user = _user_with_role(db_session, "dad@scope.test", "viewer", a.id)
    c_admin = client_as(admin_user)
    proj = _create_project(c_admin, t_a.id)
    _grant_direct(db_session, user, proj["id"])
    db_session.commit()
    body = client_as(user).get("/api/projects").json()
    assert body["total"] == 1
    assert len(body["items"]) == 1


def test_direct_grant_user_can_get_single_project(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, t_a = _make_dept_with_template(db_session, "DGG_A")
    user = User(email="dgg@scope.test", display_name="dgg")
    db_session.add(user)
    db_session.flush()
    db_session.add(
        AuthProvider(
            user_id=user.id,
            provider="local",
            password_hash=hash_password("longenoughpw"),
        )
    )
    db_session.flush()
    proj = _create_project(client_as(admin_user), t_a.id)
    _grant_direct(db_session, user, proj["id"])
    db_session.commit()
    assert (
        client_as(user)
        .get(f"/api/projects/{proj['id']}")
        .status_code
        == 200
    )


def test_direct_grant_user_cannot_patch_project(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, t_a = _make_dept_with_template(db_session, "DGP_A")
    user = User(email="dgp@scope.test", display_name="dgp")
    db_session.add(user)
    db_session.flush()
    db_session.add(
        AuthProvider(
            user_id=user.id,
            provider="local",
            password_hash=hash_password("longenoughpw"),
        )
    )
    db_session.flush()
    proj = _create_project(client_as(admin_user), t_a.id)
    _grant_direct(db_session, user, proj["id"])
    db_session.commit()
    r = client_as(user).patch(
        f"/api/projects/{proj['id']}", json={"title": "dg-renamed"}
    )
    assert r.status_code == 403


def test_direct_grant_user_sees_template_metadata_in_list_and_detail(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    """Phase 3.0.3 follow-up bug: direct-grant users had blank template
    name + missing custom-field defs because the frontend's dept-scoped
    /api/admin/templates lookup excluded them. Now embedded in the
    project list + detail responses; this test locks in that they're
    populated for a direct-grant-only user.
    """
    a, t_a = _make_dept_with_template(db_session, "DGM_A")
    user = User(email="dgm@scope.test", display_name="dgm")
    db_session.add(user)
    db_session.flush()
    db_session.add(
        AuthProvider(
            user_id=user.id,
            provider="local",
            password_hash=hash_password("longenoughpw"),
        )
    )
    db_session.flush()
    # Add a custom field so template_field_defs has something to surface.
    from backend.app.db.models import TemplateFieldDef
    db_session.add(
        TemplateFieldDef(
            template_id=t_a.id,
            name="Budget",
            field_type="short_text",
            required=False,
            order_index=0,
        )
    )
    db_session.flush()
    proj = _create_project(client_as(admin_user), t_a.id)
    _grant_direct(db_session, user, proj["id"])
    db_session.commit()
    c = client_as(user)
    # List
    list_body = c.get("/api/projects").json()
    assert list_body["total"] == 1
    item = list_body["items"][0]
    assert item["template_name"]  # non-empty; matches t_a.name
    assert " · " in item["template_intersection"]
    assert "?" not in item["template_intersection"]
    # Detail
    detail = c.get(f"/api/projects/{proj['id']}").json()
    assert detail["template_name"] == item["template_name"]
    assert detail["template_intersection"] == item["template_intersection"]
    assert isinstance(detail["template_field_defs"], list)
    assert any(fd["name"] == "Budget" for fd in detail["template_field_defs"])
