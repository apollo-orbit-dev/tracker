"""Resolve reference-type custom field values to human-readable labels.

The viewing list shows reference fields as names rather than UUIDs.
This module walks a page of projects, collects the UUIDs referenced
by each reference-typed custom field, and returns one bulk lookup per
entity type. Soft-deleted entities fall back to "(deleted)" so the
cell still shows something readable.

Reference field types covered (per docs/architecture.md):
- user_picker_single (value: uuid)
- user_picker_multi (value: list[uuid])
- contact_picker (value: uuid)
- project_reference (value: uuid)
- client_reference (value: uuid)
"""
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db.models import (
    Client,
    Contact,
    Project,
    TemplateFieldDef,
    User,
)

SCALAR_UUID_TYPES = {
    "user_picker_single": "users",
    "contact_picker": "contacts",
    "project_reference": "projects",
    "client_reference": "clients",
}
DELETED_LABEL = "(deleted)"


def _maybe_uuid(s: Any) -> uuid.UUID | None:
    if not isinstance(s, str):
        return None
    try:
        return uuid.UUID(s)
    except (ValueError, TypeError):
        return None


def collect_ref_labels(
    db: Session,
    *,
    projects: list[Project],
    live_field_defs: list[TemplateFieldDef],
) -> dict[str, dict[str, str]]:
    """Return {entity_type: {uuid_str: display_name}} for every reference
    field UUID found in `projects`' custom_field_values.

    Always returns all four entity-type keys (empty dicts if none).
    """
    by_id: dict[str, dict[str, str]] = {
        "users": {},
        "contacts": {},
        "projects": {},
        "clients": {},
    }

    # Build a lookup of {field_def_id_str: field_type} so we know how
    # to interpret each key in custom_field_values.
    type_by_field_id = {str(fd.id): fd.field_type for fd in live_field_defs}

    user_ids: set[uuid.UUID] = set()
    contact_ids: set[uuid.UUID] = set()
    project_ids: set[uuid.UUID] = set()
    client_ids: set[uuid.UUID] = set()

    for p in projects:
        for field_id, value in (p.custom_field_values or {}).items():
            field_type = type_by_field_id.get(field_id)
            if field_type is None:
                continue
            if field_type == "user_picker_multi":
                if not isinstance(value, list):
                    continue
                for v in value:
                    u = _maybe_uuid(v)
                    if u is not None:
                        user_ids.add(u)
                continue
            entity_type = SCALAR_UUID_TYPES.get(field_type)
            if entity_type is None:
                continue
            u = _maybe_uuid(value)
            if u is None:
                continue
            if entity_type == "users":
                user_ids.add(u)
            elif entity_type == "contacts":
                contact_ids.add(u)
            elif entity_type == "projects":
                project_ids.add(u)
            elif entity_type == "clients":
                client_ids.add(u)

    # Bulk lookups — one query per entity type. Include soft-deleted so
    # we can label them "(deleted)" rather than omit them.
    if user_ids:
        for u in db.execute(select(User).where(User.id.in_(user_ids))).scalars():
            label = DELETED_LABEL if u.deleted_at is not None else u.display_name
            by_id["users"][str(u.id)] = label
        # Fill in unknown (never existed) UUIDs as "(deleted)" too.
        for uid in user_ids:
            by_id["users"].setdefault(str(uid), DELETED_LABEL)
    if contact_ids:
        for c in db.execute(
            select(Contact).where(Contact.id.in_(contact_ids))
        ).scalars():
            label = DELETED_LABEL if c.deleted_at is not None else c.name
            by_id["contacts"][str(c.id)] = label
        for cid in contact_ids:
            by_id["contacts"].setdefault(str(cid), DELETED_LABEL)
    if project_ids:
        for pr in db.execute(
            select(Project).where(Project.id.in_(project_ids))
        ).scalars():
            label = (
                DELETED_LABEL
                if pr.deleted_at is not None
                else f"{pr.project_number} — {pr.title}"
            )
            by_id["projects"][str(pr.id)] = label
        for pid in project_ids:
            by_id["projects"].setdefault(str(pid), DELETED_LABEL)
    if client_ids:
        for cl in db.execute(
            select(Client).where(Client.id.in_(client_ids))
        ).scalars():
            label = (
                DELETED_LABEL
                if cl.deleted_at is not None
                else f"{cl.code} — {cl.name}"
            )
            by_id["clients"][str(cl.id)] = label
        for cid in client_ids:
            by_id["clients"].setdefault(str(cid), DELETED_LABEL)

    return by_id
