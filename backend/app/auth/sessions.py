import uuid
from datetime import timedelta

import itsdangerous
from fastapi import Response

SESSION_COOKIE_NAME = "tracker_session"
SESSION_TTL = timedelta(hours=8)
_SERIALIZER_SALT = "tracker-session-v1"


def _serializer(secret: str) -> itsdangerous.URLSafeTimedSerializer:
    return itsdangerous.URLSafeTimedSerializer(secret, salt=_SERIALIZER_SALT)


def sign_session(user_id: uuid.UUID, secret: str) -> str:
    return _serializer(secret).dumps({"user_id": str(user_id)})


def unsign_session(token: str, secret: str) -> uuid.UUID | None:
    try:
        payload = _serializer(secret).loads(
            token, max_age=int(SESSION_TTL.total_seconds())
        )
    except (itsdangerous.BadSignature, itsdangerous.SignatureExpired):
        return None
    if not isinstance(payload, dict):
        return None
    raw = payload.get("user_id")
    if not isinstance(raw, str):
        return None
    try:
        return uuid.UUID(raw)
    except ValueError:
        return None


def _cookie_kwargs(*, secure: bool) -> dict:
    return {
        "httponly": True,
        "samesite": "lax",
        "secure": secure,
        "path": "/",
    }


def set_session_cookie(response: Response, token: str, *, secure: bool) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=int(SESSION_TTL.total_seconds()),
        **_cookie_kwargs(secure=secure),
    )


def clear_session_cookie(response: Response, *, secure: bool) -> None:
    response.delete_cookie(key=SESSION_COOKIE_NAME, **_cookie_kwargs(secure=secure))
