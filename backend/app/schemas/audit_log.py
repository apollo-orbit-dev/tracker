"""Schemas for the admin audit log viewer (Phase 3.1)."""
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AuditLogItem(BaseModel):
    id: int
    entity_type: str
    entity_id: uuid.UUID
    project_id: uuid.UUID | None
    operation: str
    changes: dict[str, Any]
    changed_by: uuid.UUID | None
    # Resolved at read time from a JOIN against users.email. Renders as
    # "(deleted user)" when the FK is NULL or the user is soft-deleted —
    # the audit row outlives the user it referenced.
    changed_by_email: str
    changed_at: datetime


class AuditLogListResponse(BaseModel):
    items: list[AuditLogItem]
    total: int
    limit: int
    offset: int
