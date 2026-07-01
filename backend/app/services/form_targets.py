"""Registry describing where a form field's value can be written on approve.

Phase 17 populates only the COR target. Adding a new target entity later is
a new dict entry here plus a writer in form_push.py — no schema change.
"""

FORM_TARGETS: dict[str, dict] = {
    "cor": {
        "label": "Change order",
        "requires_project": True,
        "writer": "cor",
        "fields": [
            # `group` lets the builder's WiringSummary cluster mapped fields by
            # section (#49). COR is a single group today; multi-group targets
            # (e.g. project intake) arrive in Phase 20.
            {"key": "description", "label": "Description", "type": "long_text",
             "group": "Change order"},
            {"key": "amount", "label": "Amount", "type": "currency",
             "group": "Change order"},
        ],
    },
    "assignment": {
        "label": "Assignment",
        "requires_project": True,
        "writer": "assignment",
        # description + due_date + assignee come from form fields; the reviewer can
        # still override the assignee at approval (Phase 27.9). status defaults to
        # "open" (#20.2). A user-picker field maps to `assignee`.
        "fields": [
            {"key": "description", "label": "Description", "type": "long_text",
             "group": "Assignment"},
            {"key": "due_date", "label": "Due date", "type": "date",
             "group": "Assignment"},
            {"key": "assignee", "label": "Assignee", "type": "user",
             "group": "Assignment"},
        ],
    },
    "milestone": {
        "label": "Milestone",
        "requires_project": True,
        "writer": "milestone",
        # name + planned_date come from form fields; direction + date_model are
        # chosen by the reviewer at approval (Pattern B). Ad-hoc milestone (#20.3).
        "fields": [
            {"key": "name", "label": "Name", "type": "short_text",
             "group": "Milestone"},
            {"key": "planned_date", "label": "Planned date", "type": "date",
             "group": "Milestone"},
        ],
    },
    "event": {
        "label": "Event",
        # No-project target (Pattern D): the event lands in the FORM's department.
        "requires_project": False,
        "writer": "event",
        # All fields come from the form; a single all-day, non-recurring event (#20.4).
        "fields": [
            {"key": "title", "label": "Title", "type": "short_text",
             "group": "Event"},
            {"key": "start_date", "label": "Start date", "type": "date",
             "group": "Event"},
            {"key": "end_date", "label": "End date", "type": "date",
             "group": "Event"},
            {"key": "description", "label": "Description", "type": "long_text",
             "group": "Event"},
        ],
    },
    "intake": {
        "label": "Project intake",
        # Creates a NEW project (no existing target project); the form is bound
        # to a template at build time (#20.5). project_number is entered by the
        # reviewer at approval. The static fields here are the project's built-ins;
        # the bound template's custom-field defs are dynamic, per-form targets
        # surfaced by the builder (Phase 20.5c).
        "requires_project": False,
        "requires_template": True,
        "writer": "intake",
        "fields": [
            {"key": "title", "label": "Project title", "type": "short_text",
             "group": "Project"},
        ],
    },
}

# A form field's type and a target field's declared `type` are BOTH expressed
# with the concrete field_type names, so ONE map normalizes either side to the
# abstract "type" used for compatibility. (Was two byte-identical dicts — #49.)
_FIELD_TYPE_TO_ABSTRACT: dict[str, str] = {
    "short_text": "text",
    "long_text": "text",
    "integer": "number",
    "decimal": "number",
    "currency": "currency",
    "date": "date",
    "single_select": "select",
    "boolean": "toggle",
    # Phase 27.9: a user-picker field binds only to user-typed targets
    # (e.g. an assignment's assignee).
    "user": "user",
}


def field_type_map() -> dict[str, str]:
    """The field_type → abstract-type map, exposed in the /targets payload so the
    frontend derives compatibility from this single source of truth instead of
    re-declaring the map (#49)."""
    return dict(_FIELD_TYPE_TO_ABSTRACT)


def target_descriptor(entity):
    if not entity:
        return None
    return FORM_TARGETS.get(entity)


def bindable_targets(entity):
    d = target_descriptor(entity)
    return list(d["fields"]) if d else []


def target_field(entity, key):
    for f in bindable_targets(entity):
        if f["key"] == key:
            return f
    return None


def is_compatible(field_type, target_type):
    left = _FIELD_TYPE_TO_ABSTRACT.get(field_type)
    right = _FIELD_TYPE_TO_ABSTRACT.get(target_type, target_type)
    return left is not None and left == right
