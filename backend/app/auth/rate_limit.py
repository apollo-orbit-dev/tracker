"""In-memory leaky-bucket login rate limiter.

Tracks failed login attempts per `(ip, email_lowercased)` tuple over a sliding
15-minute window. Single-process only — fine for the POC single-worker
deployment. Redis-backed limiter is Phase 2+ scope.
"""
import time
from collections import defaultdict, deque
from threading import Lock

WINDOW_SECONDS = 15 * 60
MAX_FAILURES = 5


class LoginRateLimiter:
    def __init__(self) -> None:
        self._buckets: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = Lock()

    @staticmethod
    def _key(ip: str, email: str) -> tuple[str, str]:
        return (ip, email.lower())

    def _prune(self, key: tuple[str, str], now: float) -> None:
        bucket = self._buckets[key]
        cutoff = now - WINDOW_SECONDS
        while bucket and bucket[0] < cutoff:
            bucket.popleft()

    def is_blocked(self, ip: str, email: str, *, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        key = self._key(ip, email)
        with self._lock:
            self._prune(key, now)
            return len(self._buckets[key]) >= MAX_FAILURES

    def record_failure(self, ip: str, email: str, *, now: float | None = None) -> None:
        now = time.monotonic() if now is None else now
        key = self._key(ip, email)
        with self._lock:
            self._buckets[key].append(now)
            self._prune(key, now)

    def reset(self, ip: str, email: str) -> None:
        key = self._key(ip, email)
        with self._lock:
            self._buckets.pop(key, None)

    def clear_all(self) -> None:
        with self._lock:
            self._buckets.clear()


login_rate_limiter = LoginRateLimiter()
