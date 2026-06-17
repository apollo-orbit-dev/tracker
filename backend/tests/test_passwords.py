from backend.app.auth.passwords import hash_password, needs_rehash, verify_password


def test_hash_is_not_plaintext():
    h = hash_password("hunter2hunter2")
    assert h != "hunter2hunter2"
    assert h.startswith("$argon2")


def test_hash_is_per_call_random():
    a = hash_password("samepass1234")
    b = hash_password("samepass1234")
    assert a != b


def test_verify_accepts_correct_password():
    h = hash_password("correct horse battery staple")
    assert verify_password(h, "correct horse battery staple") is True


def test_verify_rejects_wrong_password():
    h = hash_password("correct horse battery staple")
    assert verify_password(h, "wrong horse battery staple") is False


def test_verify_rejects_garbage_hash():
    assert verify_password("not-a-hash", "anything") is False
    assert verify_password("", "anything") is False


def test_needs_rehash_false_for_fresh_hash():
    assert needs_rehash(hash_password("freshpass1234")) is False
