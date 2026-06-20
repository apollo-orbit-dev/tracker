from pydantic import BaseModel


class AppSettingOut(BaseModel):
    key: str
    value: dict


class AppSettingUpdate(BaseModel):
    value: dict
