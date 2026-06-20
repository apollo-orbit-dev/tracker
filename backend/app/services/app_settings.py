"""Org-wide key/value settings (Phase 13).

A tiny system-config store. `value` is an arbitrary JSON object; callers
own its shape. `get_setting` returns the caller's `default` when the row
is absent so a never-written setting behaves like its default.
"""
from backend.app.db.models import AppSetting, User
from sqlalchemy.orm import Session


def get_setting(db: Session, key: str, default: dict) -> dict:
    row = db.get(AppSetting, key)
    return row.value if row is not None else default


def set_setting(db: Session, key: str, value: dict, user: User) -> AppSetting:
    row = db.get(AppSetting, key)
    if row is None:
        row = AppSetting(key=key, value=value, updated_by=user.id)
        db.add(row)
    else:
        row.value = value
        row.updated_by = user.id
    db.flush()
    return row
