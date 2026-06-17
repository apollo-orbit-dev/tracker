"""Schemas for `/api/projects/{pid}/access` (Phase 3.0.3).

Direct per-project read-only grants. The response includes the grantee's
email + display name so the UI can render the access list without an
extra user-fetch round-trip.
"""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ProjectAccessGrantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    # Stored email is already validated at create-time; the output schema
    # is plain str so we don't reject test-domain or other legal-but-
    # narrow addresses on round-trip.
    email: str
    display_name: str
    granted_at: datetime
    granted_by: uuid.UUID | None


class ProjectAccessListResponse(BaseModel):
    items: list[ProjectAccessGrantOut]
    total: int


class ProjectAccessGrantCreate(BaseModel):
    user_id: uuid.UUID
