import uuid
from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.db.models import CustomView, CustomViewBlock, User


def _mk_view(db: Session, owner_id: uuid.UUID, name: str = "My view") -> CustomView:
    v = CustomView(owner_user_id=owner_id, name=name)
    db.add(v)
    db.flush()
    return v


def test_views_require_auth(client: TestClient):
    assert client.get("/api/views").status_code == 401


def test_create_list_rename_delete_view(
    client_as: Callable[[User], TestClient], viewer_user: User
):
    c = client_as(viewer_user)
    created = c.post("/api/views", json={"name": "Budget health"})
    assert created.status_code == 201
    vid = created.json()["id"]

    listed = c.get("/api/views").json()["items"]
    assert [v["name"] for v in listed] == ["Budget health"]

    assert (
        c.patch(f"/api/views/{vid}", json={"name": "Budget"}).json()["name"]
        == "Budget"
    )
    assert c.delete(f"/api/views/{vid}").status_code == 204
    assert c.get("/api/views").json()["items"] == []


def test_views_are_owner_scoped(
    client_as: Callable[[User], TestClient],
    viewer_user: User,
    project_editor_user: User,
    db_session: Session,
):
    v = _mk_view(db_session, viewer_user.id)
    db_session.commit()
    c = client_as(project_editor_user)
    assert c.get("/api/views").json()["items"] == []
    assert c.patch(f"/api/views/{v.id}", json={"name": "x"}).status_code == 404
    assert c.delete(f"/api/views/{v.id}").status_code == 404


def test_view_reorder(
    client_as: Callable[[User], TestClient],
    viewer_user: User,
    db_session: Session,
):
    a = _mk_view(db_session, viewer_user.id, "A")
    b = _mk_view(db_session, viewer_user.id, "B")
    db_session.commit()
    c = client_as(viewer_user)
    r = c.post("/api/views/reorder", json={"ordered_ids": [str(b.id), str(a.id)]})
    assert r.status_code == 204
    assert [v["name"] for v in c.get("/api/views").json()["items"]] == ["B", "A"]


def test_block_crud_and_reorder(
    client_as: Callable[[User], TestClient],
    viewer_user: User,
    db_session: Session,
):
    v = _mk_view(db_session, viewer_user.id)
    db_session.commit()
    c = client_as(viewer_user)

    # text blocks accept config now; metric configs are validated in 7.2
    made = c.post(
        f"/api/views/{v.id}/blocks",
        json={"block_type": "text", "config": {"md": "hello", "size_preset": "body"}},
    )
    assert made.status_code == 201
    b1 = made.json()
    assert b1["width"] == 2 and b1["accent"] == "indigo"  # text default is 2 (Phase 7.12.1)

    b2 = c.post(
        f"/api/views/{v.id}/blocks",
        json={"block_type": "text", "title": "Second", "width": 2},
    ).json()

    patched = c.patch(
        f"/api/views/{v.id}/blocks/{b1['id']}",
        json={"title": "Notes", "width": 4, "accent": "rose"},
    ).json()
    assert (patched["title"], patched["width"], patched["accent"]) == ("Notes", 4, "rose")

    r = c.post(
        f"/api/views/{v.id}/blocks/reorder",
        json={"ordered_ids": [b2["id"], b1["id"]]},
    )
    assert r.status_code == 204
    items = c.get(f"/api/views/{v.id}/blocks").json()["items"]
    assert [x["id"] for x in items] == [b2["id"], b1["id"]]

    dup = c.post(f"/api/views/{v.id}/blocks/{b1['id']}/duplicate")
    assert dup.status_code == 201
    assert dup.json()["title"] == "Notes"
    assert len(c.get(f"/api/views/{v.id}/blocks").json()["items"]) == 3

    assert c.delete(f"/api/views/{v.id}/blocks/{b1['id']}").status_code == 204


def test_block_routes_owner_scoped(
    client_as: Callable[[User], TestClient],
    viewer_user: User,
    project_editor_user: User,
    db_session: Session,
):
    v = _mk_view(db_session, viewer_user.id)
    blk = CustomViewBlock(view_id=v.id, block_type="text", config={"md": "x"})
    db_session.add(blk)
    db_session.commit()
    c = client_as(project_editor_user)
    assert c.get(f"/api/views/{v.id}/blocks").status_code == 404
    assert (
        c.post(f"/api/views/{v.id}/blocks", json={"block_type": "text"}).status_code
        == 404
    )
    assert (
        c.delete(f"/api/views/{v.id}/blocks/{blk.id}").status_code == 404
    )


def test_block_cap(
    client_as: Callable[[User], TestClient],
    viewer_user: User,
    db_session: Session,
):
    v = _mk_view(db_session, viewer_user.id)
    for i in range(30):
        db_session.add(
            CustomViewBlock(view_id=v.id, block_type="text", order_index=i)
        )
    db_session.commit()
    c = client_as(viewer_user)
    r = c.post(f"/api/views/{v.id}/blocks", json={"block_type": "text"})
    assert r.status_code == 422
    assert "30" in str(r.json()["detail"])


def test_metric_block_stores_validated_config_and_serves_data(
    client_as, admin_user, db_session
):
    from decimal import Decimal

    from backend.tests.test_metric_engine import _field, _project, _taxonomy

    _, t = _taxonomy(db_session, "VB1")
    fd = _field(db_session, t.id, "Kickoff", "boolean")
    _project(db_session, t.id, admin_user, cfv={str(fd.id): False})
    db_session.commit()
    c = client_as(admin_user)
    vid = c.post("/api/views", json={"name": "V"}).json()["id"]
    cfg = {
        "metric": {
            "entity": "project",
            "aggregation": "count",
            "template_id": str(t.id),
            "conditions": {"combinator": "and",
                           "items": [{"field": str(fd.id), "op": "is_false"}]},
        },
        "thresholds": {"green": 0, "amber": 3},
    }
    made = c.post(f"/api/views/{vid}/blocks",
                  json={"block_type": "metric", "config": cfg})
    assert made.status_code == 201
    bid = made.json()["id"]
    assert Decimal(c.get(f"/api/views/{vid}/blocks/{bid}/data").json()["value"]) == 1

    # invalid config rejected on write
    bad = dict(cfg, metric={**cfg["metric"], "aggregation": "sum"})
    assert (
        c.post(f"/api/views/{vid}/blocks",
               json={"block_type": "metric", "config": bad}).status_code == 422
    )


def test_chart_block_config_and_data(client_as, admin_user, db_session):
    from backend.tests.test_metric_engine import _field, _project, _taxonomy

    _, t = _taxonomy(db_session, "CB1")
    region = _field(db_session, t.id, "Region", "single_select",
                    options={"choices": ["North", "South"]})
    _project(db_session, t.id, admin_user, cfv={str(region.id): "North"})
    _project(db_session, t.id, admin_user, cfv={str(region.id): "South"})
    _project(db_session, t.id, admin_user, cfv={str(region.id): "South"})
    _project(db_session, t.id, admin_user)  # region unset -> "—" bucket
    db_session.commit()
    c = client_as(admin_user)
    vid = c.post("/api/views", json={"name": "V"}).json()["id"]
    cfg = {
        "metric": {"entity": "project", "aggregation": "count",
                   "template_id": str(t.id)},
        "group_by": str(region.id),
        "kind": "donut",
    }
    made = c.post(f"/api/views/{vid}/blocks",
                  json={"block_type": "chart", "config": cfg})
    assert made.status_code == 201
    bid = made.json()["id"]
    data = c.get(f"/api/views/{vid}/blocks/{bid}/data").json()
    assert data["kind"] == "chart"
    assert data["chart_kind"] == "donut"
    assert [(r["label"], int(float(r["value"]))) for r in data["rows"]] == [
        ("South", 2), ("North", 1), ("—", 1),
    ]
    # 7.5.1 fix 2: sentinel flags ride along in the JSON payload
    assert [(r["is_null"], r["is_other"]) for r in data["rows"]] == [
        (False, False), (False, False), (True, False),
    ]

    # invalid: group by a numeric field -> 422 on write
    num = _field(db_session, t.id, "Budget", "currency")
    db_session.commit()
    bad = dict(cfg, group_by=str(num.id))
    assert c.post(f"/api/views/{vid}/blocks",
                  json={"block_type": "chart", "config": bad}).status_code == 422
    # invalid: pct_of_total chart -> 422
    bad2 = dict(cfg, metric=dict(cfg["metric"], aggregation="pct_of_total"))
    assert c.post(f"/api/views/{vid}/blocks",
                  json={"block_type": "chart", "config": bad2}).status_code == 422


def test_breakdown_block_config_and_data(client_as, admin_user, db_session):
    from backend.tests.test_metric_engine import _field, _project, _taxonomy

    _, t = _taxonomy(db_session, "BD1")
    region = _field(db_session, t.id, "Region", "single_select",
                    options={"choices": ["North", "South"]})
    qa = _field(db_session, t.id, "QA done", "boolean")
    _project(db_session, t.id, admin_user,
             cfv={str(region.id): "North", str(qa.id): False})
    _project(db_session, t.id, admin_user,
             cfv={str(region.id): "North", str(qa.id): True})
    _project(db_session, t.id, admin_user,
             cfv={str(region.id): "South", str(qa.id): False})
    db_session.commit()
    c = client_as(admin_user)
    vid = c.post("/api/views", json={"name": "V"}).json()["id"]
    base_metric = {"entity": "project", "aggregation": "count",
                   "template_id": str(t.id)}
    cfg = {
        "group_by": str(region.id),
        "columns": [
            {"label": "Projects", "metric": base_metric},
            {"label": "Missing QA", "metric": {
                **base_metric,
                "conditions": {"combinator": "and",
                               "items": [{"field": str(qa.id), "op": "is_false"}]},
            }},
        ],
    }
    made = c.post(f"/api/views/{vid}/blocks",
                  json={"block_type": "breakdown", "config": cfg})
    assert made.status_code == 201
    bid = made.json()["id"]
    data = c.get(f"/api/views/{vid}/blocks/{bid}/data").json()
    assert data["kind"] == "breakdown"
    assert data["columns"] == ["Projects", "Missing QA"]
    rows = {r["label"]: [int(float(x)) for x in r["cells"]] for r in data["rows"]}
    assert rows == {"North": [2, 1], "South": [1, 1]}

    # mixed templates across columns -> 422
    _, t2 = _taxonomy(db_session, "BD2")
    db_session.commit()
    bad = dict(cfg, columns=[
        cfg["columns"][0],
        {"label": "X", "metric": dict(base_metric, template_id=str(t2.id))},
    ])
    assert c.post(f"/api/views/{vid}/blocks",
                  json={"block_type": "breakdown", "config": bad}).status_code == 422


def test_breakdown_shared_label_set_and_single_other(
    client_as, admin_user, db_session
):
    """7.5.1 fix 1: breakdown columns join on ONE label set ranked by
    the FIRST column. Before the fix each column was truncated to its
    own top-12 independently, so b00 (column 1's top group, column 2's
    tail) rendered column 2's true value as a false 0, b12 leaked in as
    an extra row with a false 0 in column 1, and each column's "Other"
    summed a different group set."""
    from backend.tests.test_metric_engine import _field, _project, _taxonomy

    _, t = _taxonomy(db_session, "BD3")
    sel = _field(db_session, t.id, "Bucket", "single_select",
                 options={"choices": [f"b{i:02d}" for i in range(14)]})
    qa = _field(db_session, t.id, "QA done", "boolean")

    def seed(bucket: str, n_true: int, n_false: int) -> None:
        for flag, n in ((True, n_true), (False, n_false)):
            for _ in range(n):
                _project(db_session, t.id, admin_user,
                         cfv={str(sel.id): bucket, str(qa.id): flag})

    # Column 1 (count all): b00=5, b01..b11=3 each, tail b12=b13=2.
    # Column 2 (count qa=False): b00=1 while b01..b13=2 each — 13 groups
    # outrank b00, putting it in column 2's OWN tail.
    seed("b00", 4, 1)
    for i in range(1, 12):
        seed(f"b{i:02d}", 1, 2)
    seed("b12", 0, 2)
    seed("b13", 0, 2)
    db_session.commit()

    c = client_as(admin_user)
    vid = c.post("/api/views", json={"name": "V"}).json()["id"]
    base_metric = {"entity": "project", "aggregation": "count",
                   "template_id": str(t.id)}
    cfg = {
        "group_by": str(sel.id),
        "columns": [
            {"label": "Projects", "metric": base_metric},
            {"label": "Missing QA", "metric": {
                **base_metric,
                "conditions": {"combinator": "and",
                               "items": [{"field": str(qa.id), "op": "is_false"}]},
            }},
        ],
    }
    made = c.post(f"/api/views/{vid}/blocks",
                  json={"block_type": "breakdown", "config": cfg})
    assert made.status_code == 201
    data = c.get(f"/api/views/{vid}/blocks/{made.json()['id']}/data").json()

    # one shared label set: column 1's top 12, then exactly ONE Other
    labels = [r["label"] for r in data["rows"]]
    assert labels == [f"b{i:02d}" for i in range(12)] + ["Other"]
    rows = {r["label"]: [int(float(x)) for x in r["cells"]] for r in data["rows"]}
    # column 2's TRUE value for b00 (not a false 0)
    assert rows["b00"] == [5, 1]
    assert rows["b01"] == [3, 2]
    # both Other cells sum the SAME hidden labels (b12 + b13)
    assert rows["Other"] == [4, 4]
    assert [r["is_other"] for r in data["rows"]] == [False] * 12 + [True]


def test_breakdown_real_dash_option_distinct_from_null_bucket(
    client_as, admin_user, db_session
):
    """Open item 29: the breakdown join must key on (is_null, label),
    not the display label, so a select option literally named "—" stays
    a separate row from the synthetic NULL (unset) bucket."""
    from backend.tests.test_metric_engine import _field, _project, _taxonomy

    _, t = _taxonomy(db_session, "BD4")
    region = _field(db_session, t.id, "Region", "single_select",
                    options={"choices": ["—", "North"]})
    qa = _field(db_session, t.id, "QA done", "boolean")
    # the REAL "—" option: 2 projects, 1 missing QA
    _project(db_session, t.id, admin_user,
             cfv={str(region.id): "—", str(qa.id): True})
    _project(db_session, t.id, admin_user,
             cfv={str(region.id): "—", str(qa.id): False})
    # the unset bucket: 1 project, 1 missing QA
    _project(db_session, t.id, admin_user, cfv={str(qa.id): False})
    # a normal label for contrast
    _project(db_session, t.id, admin_user,
             cfv={str(region.id): "North", str(qa.id): True})
    db_session.commit()

    c = client_as(admin_user)
    vid = c.post("/api/views", json={"name": "V"}).json()["id"]
    base_metric = {"entity": "project", "aggregation": "count",
                   "template_id": str(t.id)}
    cfg = {
        "group_by": str(region.id),
        "columns": [
            {"label": "Projects", "metric": base_metric},
            {"label": "Missing QA", "metric": {
                **base_metric,
                "conditions": {"combinator": "and",
                               "items": [{"field": str(qa.id), "op": "is_false"}]},
            }},
        ],
    }
    made = c.post(f"/api/views/{vid}/blocks",
                  json={"block_type": "breakdown", "config": cfg})
    assert made.status_code == 201
    data = c.get(f"/api/views/{vid}/blocks/{made.json()['id']}/data").json()

    rows = {
        (r["is_null"], r["label"]): [int(float(x)) for x in r["cells"]]
        for r in data["rows"]
    }
    # TWO distinct "—" rows with independent values
    assert rows[(False, "—")] == [2, 1]   # the real option
    assert rows[(True, "—")] == [1, 1]    # the unset bucket
    assert rows[(False, "North")] == [1, 0]
    assert len(data["rows"]) == 3


def test_table_block_config_validation(
    client_as, admin_user, viewer_user, db_session
):
    """Phase 7.9: table blocks store config only (data comes from
    GET /api/projects); the config is validated against the template's
    live fields/milestone defs using the view_columns grammar."""
    from sqlalchemy import func as safunc

    from backend.app.db.models import TemplateMilestoneDef
    from backend.tests.test_metric_engine import _field, _taxonomy

    _, t = _taxonomy(db_session, "TB1")
    fd = _field(db_session, t.id, "Region", "single_select",
                options={"choices": ["North"]})
    md = TemplateMilestoneDef(
        template_id=t.id, name="Kickoff", direction="internal",
        date_model="planned_actual",
    )
    db_session.add(md)
    db_session.flush()
    # a deleted field and a field on ANOTHER template
    dead = _field(db_session, t.id, "Old", "short_text")
    dead.deleted_at = safunc.now()
    _, t2 = _taxonomy(db_session, "TB2")
    foreign_fd = _field(db_session, t2.id, "Other dept field", "short_text")
    db_session.commit()

    c = client_as(admin_user)
    vid = c.post("/api/views", json={"name": "V"}).json()["id"]
    good = {
        "template_id": str(t.id),
        "columns": ["builtin:title", f"custom_field:{fd.id}",
                    f"milestone:{md.id}:planned"],
        "limit": 10,
        "sort": "builtin:title",
        "sort_direction": "asc",
    }
    made = c.post(f"/api/views/{vid}/blocks",
                  json={"block_type": "table", "config": good})
    assert made.status_code == 201
    assert made.json()["config"]["columns"] == good["columns"]

    def post_cfg(cfg):
        return c.post(f"/api/views/{vid}/blocks",
                      json={"block_type": "table", "config": cfg})

    # unknown column grammar
    r = post_cfg(dict(good, columns=["builtin:title", "bogus:thing"]))
    assert r.status_code == 422
    assert any("unknown column key" in x for x in r.json()["detail"])

    # custom field from ANOTHER template
    r = post_cfg(dict(good, columns=[f"custom_field:{foreign_fd.id}"]))
    assert r.status_code == 422
    assert any("not on this template" in x for x in r.json()["detail"])

    # deleted field
    r = post_cfg(dict(good, columns=[f"custom_field:{dead.id}"]))
    assert r.status_code == 422
    assert any("not on this template" in x for x in r.json()["detail"])

    # milestone def from another template (cross-template milestones
    # rejected the same way as fields)
    md2 = TemplateMilestoneDef(
        template_id=t2.id, name="Foreign", direction="internal",
        date_model="single",
    )
    db_session.add(md2)
    db_session.commit()
    r = post_cfg(dict(good, columns=[f"milestone:{md2.id}:date"]))
    assert r.status_code == 422
    assert any("milestone" in x and "not on this template" in x
               for x in r.json()["detail"])

    # sort key outside SORTABLE_BUILTIN_KEYS
    r = post_cfg(dict(good, sort=f"custom_field:{fd.id}"))
    assert r.status_code == 422
    assert any("unsortable column" in x for x in r.json()["detail"])

    # >8 columns (Pydantic shape check)
    r = post_cfg(dict(good, columns=["builtin:title"] * 9))
    assert r.status_code == 422

    # dept-scoped viewer can't reference a foreign template — unified
    # "template not found", no existence leak
    cv = client_as(viewer_user)
    vid2 = cv.post("/api/views", json={"name": "V2"}).json()["id"]
    r = cv.post(f"/api/views/{vid2}/blocks",
                json={"block_type": "table", "config": good})
    assert r.status_code == 422
    assert r.json()["detail"] == ["template not found"]


def test_table_block_rejects_duplicate_columns(
    client_as, admin_user, db_session
):
    """Phase 7.11 carry-over (7.10 review): the table branch rejects
    duplicate column keys, aligned with the viewing page's
    validate_columns ("duplicate column key: ...")."""
    from backend.tests.test_metric_engine import _taxonomy

    _, t = _taxonomy(db_session, "TBD1")
    db_session.commit()

    c = client_as(admin_user)
    vid = c.post("/api/views", json={"name": "V"}).json()["id"]
    r = c.post(
        f"/api/views/{vid}/blocks",
        json={
            "block_type": "table",
            "config": {
                "template_id": str(t.id),
                "columns": ["builtin:title", "builtin:lifecycle",
                            "builtin:title"],
            },
        },
    )
    assert r.status_code == 422
    assert any("duplicate column key" in x for x in r.json()["detail"])


def test_metric_block_data_now_carries_kind(client_as, admin_user, db_session):
    from backend.tests.test_metric_engine import _project, _taxonomy

    _, t = _taxonomy(db_session, "MK1")
    _project(db_session, t.id, admin_user)
    db_session.commit()
    c = client_as(admin_user)
    vid = c.post("/api/views", json={"name": "V"}).json()["id"]
    bid = c.post(f"/api/views/{vid}/blocks", json={
        "block_type": "metric",
        "config": {"metric": {"entity": "project", "aggregation": "count",
                              "template_id": str(t.id)}},
    }).json()["id"]
    data = c.get(f"/api/views/{vid}/blocks/{bid}/data").json()
    assert data["kind"] == "metric"
    assert int(float(data["value"])) == 1


def test_block_default_widths_per_type(
    client_as: "Callable[[User], TestClient]",
    viewer_user: "User",
    db_session: "Session",
):
    """Phase 7.12.1: block types carry spec-defined default widths when
    no width is supplied (metric→1, chart→2, breakdown→2, table→4,
    text→2); explicit width still overrides the default."""
    from backend.app.db.models import TemplateMilestoneDef
    from backend.tests.test_metric_engine import _field, _taxonomy

    _, t = _taxonomy(db_session, "DW1")
    _field(db_session, t.id, "Bucket", "single_select",
           options={"choices": ["A"]})
    md = TemplateMilestoneDef(
        template_id=t.id, name="Kickoff", direction="internal",
        date_model="planned_actual",
    )
    db_session.add(md)
    db_session.commit()

    c = client_as(viewer_user)
    vid = c.post("/api/views", json={"name": "Width test"}).json()["id"]

    def add(block_type: str, extra: dict | None = None) -> dict:
        body: dict = {"block_type": block_type}
        if extra:
            body.update(extra)
        r = c.post(f"/api/views/{vid}/blocks", json=body)
        assert r.status_code == 201, r.json()
        return r.json()

    assert add("metric")["width"] == 1
    assert add("chart")["width"] == 2
    assert add("breakdown")["width"] == 2
    assert add("table")["width"] == 4
    assert add("text")["width"] == 2

    # explicit width overrides the default
    assert add("chart", {"width": 1})["width"] == 1
    assert add("table", {"width": 2})["width"] == 2


# --- Phase 7.15: sharing (publish/unpublish + duplicate + shared visibility) ---

from backend.app.db.models import UserRole


def _publish(db: Session, view: CustomView, dept_id) -> None:
    view.published_department_id = dept_id
    db.flush()


def _grant(db: Session, user: User, dept_id, role_id: str = "viewer") -> None:
    db.add(UserRole(user_id=user.id, role_id=role_id, department_id=dept_id))
    db.flush()


def test_list_views_includes_published_to_my_dept(
    client_as, viewer_user, department_manager_user, db_session
):
    # department_manager_user owns a view published to their managed dept;
    # viewer_user is granted viewer on that same dept -> should see it shared.
    dm_dept = next(
        ur.department_id
        for ur in department_manager_user.user_roles
        if ur.department_id is not None
    )
    v = _mk_view(db_session, department_manager_user.id, name="Shared one")
    _publish(db_session, v, dm_dept)
    _grant(db_session, viewer_user, dm_dept, "viewer")
    db_session.commit()

    items = client_as(viewer_user).get("/api/views").json()["items"]
    shared = [i for i in items if i["id"] == str(v.id)]
    assert len(shared) == 1
    assert shared[0]["is_owner"] is False
    assert shared[0]["owner_name"] == department_manager_user.display_name
    assert shared[0]["published_department_id"] == str(dm_dept)

    # owner sees it as their own
    owner_items = client_as(department_manager_user).get("/api/views").json()["items"]
    assert any(i["id"] == str(v.id) and i["is_owner"] is True for i in owner_items)


def test_unpublished_view_not_visible_to_others(
    client_as, viewer_user, project_editor_user, db_session
):
    v = _mk_view(db_session, viewer_user.id)
    db_session.commit()
    assert client_as(project_editor_user).get("/api/views").json()["items"] == []


def test_reader_in_other_dept_cannot_read_published_view(
    client_as, viewer_user, department_manager_user, db_session
):
    # Published to the DM's dept; viewer_user belongs only to its own
    # (different) fixture dept and is NOT granted on the DM's dept.
    dm_dept = next(
        ur.department_id
        for ur in department_manager_user.user_roles
        if ur.department_id is not None
    )
    v = _mk_view(db_session, department_manager_user.id)
    db_session.add(
        CustomViewBlock(view_id=v.id, block_type="text", config={"md": "x"})
    )
    _publish(db_session, v, dm_dept)
    db_session.commit()
    c = client_as(viewer_user)
    assert all(i["id"] != str(v.id) for i in c.get("/api/views").json()["items"])
    assert c.get(f"/api/views/{v.id}/blocks").status_code == 404
    assert c.post(f"/api/views/{v.id}/duplicate").status_code == 404


def test_admin_sees_all_published_views(
    client_as, admin_user, department_manager_user, db_session
):
    dm_dept = next(
        ur.department_id
        for ur in department_manager_user.user_roles
        if ur.department_id is not None
    )
    v = _mk_view(db_session, department_manager_user.id)
    _publish(db_session, v, dm_dept)
    db_session.commit()
    items = client_as(admin_user).get("/api/views").json()["items"]
    assert any(
        i["id"] == str(v.id) and i["is_owner"] is False for i in items
    )


def test_reader_can_list_blocks_of_published_view(
    client_as, viewer_user, department_manager_user, db_session
):
    dm_dept = next(
        ur.department_id
        for ur in department_manager_user.user_roles
        if ur.department_id is not None
    )
    v = _mk_view(db_session, department_manager_user.id)
    db_session.add(CustomViewBlock(view_id=v.id, block_type="text", config={"md": "hi"}))
    _publish(db_session, v, dm_dept)
    _grant(db_session, viewer_user, dm_dept, "viewer")
    db_session.commit()
    r = client_as(viewer_user).get(f"/api/views/{v.id}/blocks")
    assert r.status_code == 200
    assert len(r.json()["items"]) == 1


def test_reader_cannot_write_published_view(
    client_as, viewer_user, department_manager_user, db_session
):
    dm_dept = next(
        ur.department_id
        for ur in department_manager_user.user_roles
        if ur.department_id is not None
    )
    v = _mk_view(db_session, department_manager_user.id)
    _publish(db_session, v, dm_dept)
    _grant(db_session, viewer_user, dm_dept, "viewer")
    db_session.commit()
    c = client_as(viewer_user)
    assert c.patch(f"/api/views/{v.id}", json={"name": "x"}).status_code == 404
    assert c.post(f"/api/views/{v.id}/blocks", json={"block_type": "text"}).status_code == 404
    assert c.delete(f"/api/views/{v.id}").status_code == 404


def test_publish_requires_owner_and_dm(
    client_as, viewer_user, department_manager_user, admin_user, db_session
):
    dm_dept = next(
        ur.department_id
        for ur in department_manager_user.user_roles
        if ur.department_id is not None
    )
    # owner is the DM -> can publish to their dept
    v = _mk_view(db_session, department_manager_user.id)
    db_session.commit()
    ok = client_as(department_manager_user).post(
        f"/api/views/{v.id}/publish", json={"department_id": str(dm_dept)}
    )
    assert ok.status_code == 200
    assert ok.json()["published_department_id"] == str(dm_dept)

    # a non-owner cannot publish it (404 -- not their view)
    assert client_as(admin_user).post(
        f"/api/views/{v.id}/publish", json={"department_id": str(dm_dept)}
    ).status_code == 404


def test_publish_owner_without_dm_is_forbidden(
    client_as, viewer_user, db_session
):
    # viewer_user owns a view but is not a DM of their dept -> 403
    dept = next(
        ur.department_id for ur in viewer_user.user_roles if ur.department_id is not None
    )
    v = _mk_view(db_session, viewer_user.id)
    db_session.commit()
    r = client_as(viewer_user).post(
        f"/api/views/{v.id}/publish", json={"department_id": str(dept)}
    )
    assert r.status_code == 403


def test_unpublish_by_owner(
    client_as, department_manager_user, db_session
):
    dm_dept = next(
        ur.department_id
        for ur in department_manager_user.user_roles
        if ur.department_id is not None
    )
    v = _mk_view(db_session, department_manager_user.id)
    v.published_department_id = dm_dept
    db_session.commit()
    r = client_as(department_manager_user).post(f"/api/views/{v.id}/unpublish")
    assert r.status_code == 200
    assert r.json()["published_department_id"] is None


def test_duplicate_own_view_copies_blocks(
    client_as, viewer_user, db_session
):
    v = _mk_view(db_session, viewer_user.id, name="Orig")
    db_session.add(CustomViewBlock(view_id=v.id, block_type="text",
                                   title="B", width=2, accent="rose",
                                   config={"md": "x"}, order_index=0))
    db_session.commit()
    r = client_as(viewer_user).post(f"/api/views/{v.id}/duplicate")
    assert r.status_code == 201
    new_id = r.json()["id"]
    assert r.json()["name"] == "Orig (copy)"
    assert r.json()["is_owner"] is True
    assert r.json()["published_department_id"] is None
    blocks = client_as(viewer_user).get(f"/api/views/{new_id}/blocks").json()["items"]
    assert len(blocks) == 1
    assert (blocks[0]["title"], blocks[0]["width"], blocks[0]["accent"]) == ("B", 2, "rose")


def test_duplicate_shared_view_into_personal_copy(
    client_as, viewer_user, department_manager_user, db_session
):
    dm_dept = next(
        ur.department_id
        for ur in department_manager_user.user_roles
        if ur.department_id is not None
    )
    v = _mk_view(db_session, department_manager_user.id, name="Team")
    v.published_department_id = dm_dept
    db_session.add(CustomViewBlock(view_id=v.id, block_type="text", config={"md": "y"}))
    _grant(db_session, viewer_user, dm_dept, "viewer")
    db_session.commit()
    r = client_as(viewer_user).post(f"/api/views/{v.id}/duplicate")
    assert r.status_code == 201
    assert r.json()["is_owner"] is True
    assert r.json()["published_department_id"] is None  # copy is personal


def test_duplicate_unreadable_view_404(
    client_as, viewer_user, project_editor_user, db_session
):
    v = _mk_view(db_session, project_editor_user.id)  # private, not shared
    db_session.commit()
    assert client_as(viewer_user).post(f"/api/views/{v.id}/duplicate").status_code == 404


def test_table_block_config_accepts_conditions(client_as, admin_user, db_session):
    from backend.tests.test_metric_engine import _taxonomy, _field
    _, t = _taxonomy(db_session, "TBC")
    qa = _field(db_session, t.id, "QA done", "boolean")
    db_session.commit()
    c = client_as(admin_user)
    vid = c.post("/api/views", json={"name": "V"}).json()["id"]
    cfg = {
        "template_id": str(t.id),
        "columns": ["builtin:title"],
        "conditions": {"combinator": "and",
                       "items": [{"field": str(qa.id), "op": "is_false"}]},
    }
    assert c.post(f"/api/views/{vid}/blocks",
                  json={"block_type": "table", "config": cfg}).status_code == 201
    # bad: condition on a field from another template
    _, t2 = _taxonomy(db_session, "TBC2")
    other = _field(db_session, t2.id, "X", "boolean")
    db_session.commit()
    bad = dict(cfg, conditions={"combinator": "and",
                                "items": [{"field": str(other.id), "op": "is_false"}]})
    assert c.post(f"/api/views/{vid}/blocks",
                  json={"block_type": "table", "config": bad}).status_code == 422
