from sqlalchemy.orm import Session

from backend.app.db.models import User
from backend.app.services.app_settings import get_setting, set_setting


def test_get_returns_default_when_unset(db_session: Session):
    assert get_setting(db_session, "holidays", {"enabled": False}) == {"enabled": False}


def test_set_then_get_round_trips(db_session: Session):
    u = User(email="a@x.com", display_name="A")
    db_session.add(u)
    db_session.flush()
    set_setting(db_session, "holidays", {"enabled": True, "countries": ["US"]}, u)
    assert get_setting(db_session, "holidays", {}) == {"enabled": True, "countries": ["US"]}
