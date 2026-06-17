from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.auth.sessions import SESSION_COOKIE_NAME, unsign_session
from backend.app.config import settings
from backend.app.db.session import get_db
from backend.app.db.models import User


def get_current_user(
    db: Session = Depends(get_db),
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> User:
    if not session_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )
    user_id = unsign_session(session_token, settings.session_secret)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )
    user = db.get(User, user_id)
    if (
        user is None
        or user.deleted_at is not None
        or user.lifecycle_state != "active"
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )
    return user
