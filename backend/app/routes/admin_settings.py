"""Org-admin system settings (Phase 13).

A small registry of writable keys, each with a validator + default.
Today the only key is `holidays`. Reads/writes are org-admin only and
writes are audit-logged.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.auth.permissions import require_role
from backend.app.db.models import User
from backend.app.db.session import get_db
from backend.app.schemas.app_settings import AppSettingOut, AppSettingUpdate
from backend.app.services.app_settings import get_setting, set_setting
from backend.app.services.audit import record_audit

router = APIRouter(prefix="/api/admin/settings", tags=["admin-settings"])

HOLIDAYS_SETTING_KEY = "holidays"
HOLIDAYS_DEFAULT = {"enabled": False, "countries": ["US"]}
SUPPORTED_HOLIDAY_COUNTRIES = {"US"}


def _validate_holidays(value: dict) -> dict:
    if not isinstance(value, dict):
        raise HTTPException(status_code=422, detail="value must be an object")
    enabled = value.get("enabled")
    countries = value.get("countries")
    if not isinstance(enabled, bool):
        raise HTTPException(status_code=422, detail="enabled must be a boolean")
    if not isinstance(countries, list) or not all(isinstance(c, str) for c in countries):
        raise HTTPException(status_code=422, detail="countries must be a list of strings")
    bad = [c for c in countries if c not in SUPPORTED_HOLIDAY_COUNTRIES]
    if bad:
        raise HTTPException(status_code=422, detail=f"unsupported countries: {bad}")
    return {"enabled": enabled, "countries": list(countries)}


# key -> (validator, default)
_WRITABLE = {
    HOLIDAYS_SETTING_KEY: (_validate_holidays, HOLIDAYS_DEFAULT),
}


def _audit_entity_id(key: str) -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_URL, f"app_setting:{key}")


@router.get("/{key}", response_model=AppSettingOut)
def get_app_setting(
    key: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
) -> AppSettingOut:
    if key not in _WRITABLE:
        raise HTTPException(status_code=404, detail="unknown setting")
    _, default = _WRITABLE[key]
    return AppSettingOut(key=key, value=get_setting(db, key, default))


@router.put("/{key}", response_model=AppSettingOut)
def put_app_setting(
    key: str,
    payload: AppSettingUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role("admin")),
) -> AppSettingOut:
    if key not in _WRITABLE:
        raise HTTPException(status_code=404, detail="unknown setting")
    validate, default = _WRITABLE[key]
    clean = validate(payload.value)
    before = get_setting(db, key, default)
    set_setting(db, key, clean, admin)
    record_audit(
        db,
        user=admin,
        entity_type="app_setting",
        entity_id=_audit_entity_id(key),
        operation="update",
        changes={"before": before, "after": clean},
    )
    db.commit()
    return AppSettingOut(key=key, value=clean)
