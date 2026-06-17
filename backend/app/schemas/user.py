import uuid

from pydantic import BaseModel, ConfigDict, EmailStr


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    display_name: str
    roles: list[str]
    # None == org admin (no scope filter). Otherwise the explicit list of
    # department UUIDs this user can view; empty list = no department access.
    accessible_department_ids: list[uuid.UUID] | None
