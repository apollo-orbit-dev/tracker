def test_get_holidays_default(client_as, admin_user):
    c = client_as(admin_user)
    r = c.get("/api/admin/settings/holidays")
    assert r.status_code == 200
    assert r.json() == {"key": "holidays", "value": {"enabled": False, "countries": ["US"]}}


def test_put_holidays_enables(client_as, admin_user):
    c = client_as(admin_user)
    r = c.put("/api/admin/settings/holidays", json={"value": {"enabled": True, "countries": ["US"]}})
    assert r.status_code == 200, r.text
    assert r.json()["value"]["enabled"] is True
    # persisted
    assert c.get("/api/admin/settings/holidays").json()["value"]["enabled"] is True


def test_put_rejects_bad_country(client_as, admin_user):
    c = client_as(admin_user)
    r = c.put("/api/admin/settings/holidays", json={"value": {"enabled": True, "countries": ["ZZ"]}})
    assert r.status_code == 422


def test_put_rejects_bad_shape(client_as, admin_user):
    c = client_as(admin_user)
    r = c.put("/api/admin/settings/holidays", json={"value": {"enabled": "yes"}})
    assert r.status_code == 422


def test_unknown_key_404(client_as, admin_user):
    c = client_as(admin_user)
    assert c.get("/api/admin/settings/nope").status_code == 404
    assert c.put("/api/admin/settings/nope", json={"value": {}}).status_code == 404


def test_non_admin_forbidden(client_as, viewer_user, project_editor_user):
    body = {"value": {"enabled": True, "countries": ["US"]}}
    assert client_as(viewer_user).get("/api/admin/settings/holidays").status_code == 403
    assert client_as(viewer_user).put("/api/admin/settings/holidays", json=body).status_code == 403
    assert client_as(project_editor_user).get("/api/admin/settings/holidays").status_code == 403
    assert client_as(project_editor_user).put("/api/admin/settings/holidays", json=body).status_code == 403


def test_put_writes_audit(client_as, admin_user, db_session):
    from sqlalchemy import select
    from backend.app.db.models import AuditLog
    client_as(admin_user).put(
        "/api/admin/settings/holidays", json={"value": {"enabled": True, "countries": ["US"]}}
    )
    rows = db_session.execute(
        select(AuditLog).where(AuditLog.entity_type == "app_setting")
    ).scalars().all()
    assert len(rows) >= 1 and rows[-1].operation == "update"
