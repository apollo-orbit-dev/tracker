from backend.app.auth.rate_limit import (
    MAX_FAILURES,
    WINDOW_SECONDS,
    LoginRateLimiter,
)


def test_initially_not_blocked():
    rl = LoginRateLimiter()
    assert rl.is_blocked("1.2.3.4", "user@example.com") is False


def test_blocks_after_max_failures():
    rl = LoginRateLimiter()
    for _ in range(MAX_FAILURES):
        rl.record_failure("1.2.3.4", "user@example.com", now=100.0)
    assert rl.is_blocked("1.2.3.4", "user@example.com", now=100.0) is True


def test_does_not_block_before_threshold():
    rl = LoginRateLimiter()
    for _ in range(MAX_FAILURES - 1):
        rl.record_failure("1.2.3.4", "user@example.com", now=100.0)
    assert rl.is_blocked("1.2.3.4", "user@example.com", now=100.0) is False


def test_sliding_window_releases_after_expiry():
    rl = LoginRateLimiter()
    base = 100.0
    for _ in range(MAX_FAILURES):
        rl.record_failure("1.2.3.4", "user@example.com", now=base)
    assert rl.is_blocked("1.2.3.4", "user@example.com", now=base) is True
    # After the window passes, all failures should have aged out.
    later = base + WINDOW_SECONDS + 1
    assert rl.is_blocked("1.2.3.4", "user@example.com", now=later) is False


def test_email_lowercased_in_key():
    rl = LoginRateLimiter()
    for _ in range(MAX_FAILURES):
        rl.record_failure("1.2.3.4", "User@Example.com", now=100.0)
    assert rl.is_blocked("1.2.3.4", "user@example.com", now=100.0) is True


def test_different_ip_or_email_isolated():
    rl = LoginRateLimiter()
    for _ in range(MAX_FAILURES):
        rl.record_failure("1.2.3.4", "user@example.com", now=100.0)
    assert rl.is_blocked("9.9.9.9", "user@example.com", now=100.0) is False
    assert rl.is_blocked("1.2.3.4", "other@example.com", now=100.0) is False


def test_reset_clears_bucket():
    rl = LoginRateLimiter()
    for _ in range(MAX_FAILURES):
        rl.record_failure("1.2.3.4", "user@example.com", now=100.0)
    rl.reset("1.2.3.4", "user@example.com")
    assert rl.is_blocked("1.2.3.4", "user@example.com", now=100.0) is False
