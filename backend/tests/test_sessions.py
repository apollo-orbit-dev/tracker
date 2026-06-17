import time
import uuid
from unittest.mock import patch

from backend.app.auth.sessions import (
    SESSION_TTL,
    sign_session,
    unsign_session,
)

SECRET = "test-secret-not-real"


def test_sign_then_unsign_roundtrip():
    uid = uuid.uuid4()
    token = sign_session(uid, SECRET)
    assert unsign_session(token, SECRET) == uid


def test_unsign_rejects_tampered_payload():
    uid = uuid.uuid4()
    token = sign_session(uid, SECRET)
    # Flip a character in the payload portion (before the first '.').
    # Tampering the trailing signature byte can be a no-op due to base64url
    # unused-bit slack, so we tamper the payload itself — the signature is
    # then computed over different bytes and verification fails.
    payload, rest = token.split(".", 1)
    new_first = "a" if payload[0] != "a" else "b"
    tampered = new_first + payload[1:] + "." + rest
    assert unsign_session(tampered, SECRET) is None


def test_unsign_rejects_wrong_secret():
    uid = uuid.uuid4()
    token = sign_session(uid, SECRET)
    assert unsign_session(token, "different-secret") is None


def test_unsign_rejects_expired_token():
    uid = uuid.uuid4()
    token = sign_session(uid, SECRET)
    far_future = time.time() + SESSION_TTL.total_seconds() + 60
    with patch("itsdangerous.timed.time.time", return_value=far_future):
        assert unsign_session(token, SECRET) is None


def test_unsign_rejects_garbage():
    assert unsign_session("garbage", SECRET) is None
    assert unsign_session("", SECRET) is None
