from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.middleware.origin_check import OriginCheckMiddleware


def _build_app(allowed: list[str]) -> FastAPI:
    app = FastAPI()
    app.add_middleware(OriginCheckMiddleware, allowed_origins=allowed)

    @app.get("/api/safe")
    def safe():
        return {"ok": True}

    @app.post("/api/unsafe")
    def unsafe():
        return {"ok": True}

    @app.post("/not-api")
    def not_api():
        return {"ok": True}

    return app


def test_get_passes_without_origin():
    c = TestClient(_build_app(["http://localhost:5181"]))
    assert c.get("/api/safe").status_code == 200


def test_unsafe_without_origin_blocked():
    c = TestClient(_build_app(["http://localhost:5181"]))
    r = c.post("/api/unsafe")
    assert r.status_code == 403
    assert "Origin" in r.json()["detail"]


def test_unsafe_with_disallowed_origin_blocked():
    c = TestClient(_build_app(["http://localhost:5181"]))
    r = c.post("/api/unsafe", headers={"Origin": "http://evil.example"})
    assert r.status_code == 403
    assert "not allowed" in r.json()["detail"]


def test_unsafe_with_allowed_origin_passes():
    c = TestClient(_build_app(["http://localhost:5181"]))
    r = c.post("/api/unsafe", headers={"Origin": "http://localhost:5181"})
    assert r.status_code == 200


def test_referer_falls_back_when_origin_missing():
    c = TestClient(_build_app(["http://localhost:5181"]))
    r = c.post(
        "/api/unsafe", headers={"Referer": "http://localhost:5181/some/path"}
    )
    assert r.status_code == 200


def test_referer_with_disallowed_origin_blocked():
    c = TestClient(_build_app(["http://localhost:5181"]))
    r = c.post(
        "/api/unsafe", headers={"Referer": "http://evil.example/x"}
    )
    assert r.status_code == 403


def test_unsafe_non_api_not_checked():
    c = TestClient(_build_app(["http://localhost:5181"]))
    # Middleware only checks /api/* — other paths flow through unchanged.
    r = c.post("/not-api")
    assert r.status_code == 200


def test_trailing_slash_in_allowlist_normalized():
    c = TestClient(_build_app(["http://localhost:5181/"]))
    r = c.post("/api/unsafe", headers={"Origin": "http://localhost:5181"})
    assert r.status_code == 200
