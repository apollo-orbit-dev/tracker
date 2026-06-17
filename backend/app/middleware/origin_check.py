"""Origin/Referer check on unsafe API requests — CSRF defense.

For every POST/PUT/PATCH/DELETE under /api/*, the request must carry an
Origin header (or fall back to Referer) whose origin matches one of the
allowlist values. Missing or mismatched → 403.

Combined with SameSite=Lax on the session cookie, this blocks the standard
cross-site form-submit and fetch-with-credentials CSRF patterns without
requiring CSRF tokens.
"""
from urllib.parse import urlparse

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _origin_from_referer(referer: str) -> str | None:
    """Extract scheme://host[:port] from a Referer header value."""
    try:
        parsed = urlparse(referer)
    except ValueError:
        return None
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


def _normalize(origin: str) -> str:
    return origin.rstrip("/")


class OriginCheckMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, allowed_origins: list[str]) -> None:
        super().__init__(app)
        self.allowed: set[str] = {_normalize(o) for o in allowed_origins}

    async def dispatch(self, request: Request, call_next):
        if request.method in UNSAFE_METHODS and request.url.path.startswith("/api/"):
            origin = request.headers.get("origin")
            if not origin:
                referer = request.headers.get("referer")
                if referer:
                    origin = _origin_from_referer(referer)
            if not origin:
                return JSONResponse(
                    {"detail": "Missing Origin header"}, status_code=403
                )
            if _normalize(origin) not in self.allowed:
                return JSONResponse(
                    {"detail": "Origin not allowed"}, status_code=403
                )
        return await call_next(request)
