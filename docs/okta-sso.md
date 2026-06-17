# Adding Okta SSO

This guide walks through adding **Okta** (or any OIDC provider) as a sign-in method.
Tracker's auth was built with this migration in mind, so the integration is additive — you
don't have to rewrite the session or authorization layers.

It's written for a developer who knows the stack (FastAPI + React) but not this codebase.
Code blocks are **sketches** — adapt names and error handling to your Okta org and house style.

---

## 1. What you're actually building (and what you're not)

Okta gives you **authentication** — "this request belongs to the person Okta vouched for."
It does **not** give you **authorization**. Tracker's roles (`admin`, `department_manager`,
`project_editor`, `viewer`) and department scoping stay exactly where they are: in the
`user_roles` table, managed in-app. Okta tells you *who* the user is; Tracker still decides
*what they can do*.

The key fact that makes this easy: **the session is provider-agnostic.**

- After any successful login, Tracker sets one signed cookie (`tracker_session`) whose payload
  is just `{"user_id": ...}` (see `backend/app/auth/sessions.py`).
- Every protected endpoint depends on `get_current_user` (`backend/app/auth/dependencies.py`),
  which only verifies that cookie and loads the `User`. It has no idea whether you logged in
  with a password or with Okta.

So an Okta sign-in only has to do three things:

1. Authenticate the user against Okta (OIDC Authorization Code flow).
2. Map the Okta identity to a Tracker `User` row.
3. Call the **existing** `sign_session()` + `set_session_cookie()`.

Everything downstream — RBAC, department scope, the audit log, `/api/auth/me` — works unchanged.

## 2. The flow

```
Browser                     Tracker backend                Okta
  │  click "Sign in w/ Okta"    │                            │
  ├────────────────────────────►  GET /api/auth/okta/login   │
  │                             ├─ build authorize URL ──────►│  (redirect 302)
  │◄───────────────────────────┤  (state + nonce + PKCE)     │
  │  redirected to Okta, user authenticates ─────────────────►│
  │◄──────────────────────────────────── 302 to callback ────┤
  ├────────────────────────────►  GET /api/auth/okta/callback?code=…&state=…
  │                             ├─ exchange code for tokens ─►│
  │                             ├─ validate ID token (JWKS)   │
  │                             ├─ find/link User             │
  │                             ├─ sign_session() + Set-Cookie│
  │◄───────────────────────────┤  302 to the app (/)         │
  │  now authenticated; cookie sent on every request          │
```

Both endpoints are **GET**. That matters: Tracker's CSRF defense
(`backend/app/middleware/origin_check.py`) only challenges `POST/PUT/PATCH/DELETE` under
`/api/*`, so a GET redirect coming back from Okta's domain is not blocked. Keep Okta's
`response_mode` at the default `query` (a GET redirect). Do **not** use `form_post` — that
posts to the callback from Okta's origin and the Origin check will 403 it.

## 3. Prerequisites

- An Okta org and admin access to it.
- In Okta, create an **OIDC → Web Application** (it has a client secret; the flow runs
  server-side):
  - **Grant type:** Authorization Code.
  - **Sign-in redirect URI:** `https://<your-tracker-host>/api/auth/okta/callback`.
  - **Sign-out redirect URI** (optional): `https://<your-tracker-host>/`.
  - Assign the people/groups who should have access.
- Note the **Issuer** (e.g. `https://<org>.okta.com/oauth2/default` or a custom auth server),
  **Client ID**, and **Client Secret**.

> **Same-origin assumption.** This flow assumes the SPA and the API are served from the same
> origin in production — which Tracker's prod stack does (Caddy serves the built SPA and proxies
> `/api/*`; see `docs/operations.md`). The cookie is `SameSite=Lax`, which permits it to be set
> on the top-level redirect back from Okta and sent thereafter. In split-origin local dev
> (Vite on `:5181`, API on `:8011`) the cookie won't follow cleanly — test SSO against the
> prod-style stack, or run the API and a built SPA behind one origin.

## 4. Configuration

Add the Okta settings to `backend/app/config.py` (`Settings`) and `.env.example`:

```python
# backend/app/config.py — inside Settings
okta_issuer: str = Field(default="", alias="OKTA_ISSUER")
okta_client_id: str = Field(default="", alias="OKTA_CLIENT_ID")
okta_client_secret: str = Field(default="", alias="OKTA_CLIENT_SECRET")
okta_redirect_uri: str = Field(default="", alias="OKTA_REDIRECT_URI")

@property
def okta_enabled(self) -> bool:
    return bool(self.okta_issuer and self.okta_client_id and self.okta_client_secret)
```

```sh
# .env.example
# --- Okta SSO (optional; leave blank to keep local password auth only) ---
OKTA_ISSUER=
OKTA_CLIENT_ID=
OKTA_CLIENT_SECRET=
OKTA_REDIRECT_URI=https://tracker.example.com/api/auth/okta/callback
```

The client secret is a secret — it lives in `.env` (gitignored), never in code or the image.

## 5. Backend

**Use a maintained OIDC client; don't hand-roll token validation.** The recommended choice is
[**Authlib**](https://docs.authlib.org/) — it discovers the issuer metadata, fetches and caches
the JWKS, and validates the ID token signature, `iss`, `aud`, `exp`, and `nonce` for you.
(`pip install authlib`. A from-scratch alternative is `httpx` + `pyjwt[crypto]` + manual JWKS
handling, but that's exactly where SSO integrations get subtly wrong.)

Create `backend/app/routes/okta.py` with two GET endpoints. Sketch:

```python
from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.auth.sessions import set_session_cookie, sign_session
from backend.app.db.models import AuthProvider, User
from backend.app.db.session import get_db

router = APIRouter(prefix="/api/auth/okta", tags=["auth"])

oauth = OAuth()
oauth.register(
    name="okta",
    client_id=settings.okta_client_id,
    client_secret=settings.okta_client_secret,
    server_metadata_url=f"{settings.okta_issuer}/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)

@router.get("/login")
async def okta_login(request: Request):
    if not settings.okta_enabled:
        raise HTTPException(404, "Okta not configured")
    # Authlib stores state + nonce + PKCE verifier in the session for the callback to verify.
    return await oauth.okta.authorize_redirect(request, settings.okta_redirect_uri)

@router.get("/callback")
async def okta_callback(request: Request, db: Session = Depends(get_db)):
    token = await oauth.okta.authorize_access_token(request)  # exchanges code, validates ID token
    claims = token["userinfo"]                                # sub, email, name, …
    sub, email = claims["sub"], claims["email"].lower().strip()

    user = _find_or_link_user(db, sub, email, claims.get("name") or email)  # see §6
    if user is None or user.lifecycle_state != "active":
        # Unknown / not-yet-provisioned / deactivated → bounce to a friendly page.
        return RedirectResponse("/login?sso=denied")

    resp = RedirectResponse("/")  # back into the SPA
    set_session_cookie(
        resp,
        sign_session(user.id, settings.session_secret),
        secure=settings.is_production,
    )
    return resp
```

Authlib needs Starlette's `SessionMiddleware` (a separate signed cookie, used only to carry
the OAuth `state`/`nonce`/PKCE verifier across the redirect — distinct from Tracker's
`tracker_session`). Add it in `backend/app/main.py` and register the router:

```python
from starlette.middleware.sessions import SessionMiddleware
app.add_middleware(SessionMiddleware, secret_key=settings.session_secret, same_site="lax", https_only=settings.is_production)
...
from backend.app.routes import okta as okta_routes
app.include_router(okta_routes.router)
```

> Order note: `OriginCheckMiddleware` is already installed; it ignores GET, so the Okta GET
> endpoints pass through. No change needed there.

## 6. Mapping an Okta identity to a Tracker user

This is the one real **decision**, and it's about provisioning policy. The schema gives you the
pieces: `User.okta_subject` (unique), and an `AuthProvider` row with `provider="okta"` whose
check constraint requires `okta_subject` set and `password_hash` NULL.

Lookup order in `_find_or_link_user`:

1. **By `okta_subject`** — the OIDC `sub` is stable and the right long-term key. If found, log in.
2. **By `email`** (lowercased) — a known user signing in via Okta for the first time. Link them:
   set `user.okta_subject = sub` and insert `AuthProvider(provider="okta", okta_subject=sub)`.
3. **Neither** — apply your provisioning policy (below).

```python
def _find_or_link_user(db, sub, email, name):
    user = db.execute(select(User).where(User.okta_subject == sub)).scalar_one_or_none()
    if user:
        return user
    user = db.execute(
        select(User).where(User.email == email, User.deleted_at.is_(None))
    ).scalar_one_or_none()
    if user:
        user.okta_subject = sub
        db.add(AuthProvider(user_id=user.id, provider="okta", okta_subject=sub))
        db.commit()
        return user
    return _provision(db, sub, email, name)  # see policy below
```

**Provisioning policy — pick one:**

- **Link-only (most controlled).** `_provision` returns `None` for unknown emails; an admin must
  create the user first (via `/admin/users`) and assign roles. The first Okta sign-in then links
  by email. No one gets in without being pre-provisioned.
- **Just-in-time, no privileges (recommended default).** Create the `User` as
  `lifecycle_state="pending"` with **no roles**, link the Okta provider, and surface them in the
  admin UI for role assignment. They authenticate but can't see anything until an admin grants a
  role. This scales to a large org without manual pre-creation while keeping authorization gated.

Either way, **roles are never granted from Okta claims by default** — that keeps the
authorization decision inside Tracker. (If you want group-driven roles, see §8.)

## 7. Frontend

The redirect flow is a full-page navigation, **not** a `fetch` — the browser has to leave for
Okta and come back. Add a button to `frontend/src/pages/Login.tsx`:

```tsx
<Button variant="outline" onClick={() => { window.location.href = "/api/auth/okta/login" }}>
  Sign in with Okta
</Button>
```

After the callback redirects to `/`, the SPA's existing `/api/auth/me` call finds the session
cookie and loads the user as usual. Decide whether to keep the email/password form visible
(useful for break-glass admin access) or hide it once Okta is the norm.

## 8. Optional: Okta groups → Tracker roles

If you want Okta to drive roles, add a `groups` claim to the Okta app and map group names to
`user_roles` rows during `_find_or_link_user` (e.g. `Tracker-Admins → admin`,
`Tracker-PD1-Editors → project_editor` scoped to a department). Treat Okta as the source of
truth for those roles and reconcile on every login. This is powerful but couples your role
model to Okta group hygiene — start without it unless you have a reason.

## 9. Security checklist

- [ ] ID token fully validated: signature against the issuer JWKS, plus `iss`, `aud`, `exp`,
      and `nonce`. (Authlib does this in `authorize_access_token`; verify you didn't disable it.)
- [ ] `state` checked on the callback (CSRF for the OAuth handshake) and **PKCE** enabled.
- [ ] Client secret only in `.env`; never logged, never in the repo or image.
- [ ] Callback served over **HTTPS**; redirect URI in Okta matches `OKTA_REDIRECT_URI` exactly.
- [ ] `response_mode=query` (GET), so the Origin/CSRF middleware isn't tripped.
- [ ] The Tracker session cookie keeps its existing flags (`HttpOnly`, `SameSite=Lax`,
      `Secure` in prod) — you're reusing `set_session_cookie`, so this is automatic.
- [ ] Deactivated users (`lifecycle_state != "active"`) are rejected at the callback, same as
      the password login does.
- [ ] No role is ever inferred from an unauthenticated claim.

## 10. Testing

- **Unit:** test `_find_or_link_user` for all three branches (by-subject, by-email link,
  unknown→policy). Test the callback by stubbing Authlib's token exchange so you can assert it
  issues a valid `tracker_session` and rejects non-active users — no live Okta needed.
- **Integration:** point at an Okta dev org and walk the real redirect against the prod-style
  stack. Confirm `/api/auth/me` returns the right user and roles afterward.
- The existing auth tests (`backend/tests/test_auth_*.py`) already cover that a valid session
  cookie authorizes requests — Okta just produces that same cookie, so those stay green.

## 11. Where it touches the code

| File | Change |
|------|--------|
| `backend/app/config.py` | `OKTA_*` settings + `okta_enabled` |
| `.env.example` | document the `OKTA_*` vars |
| `backend/app/routes/okta.py` | **new** — `/login` + `/callback` GET endpoints |
| `backend/app/main.py` | add `SessionMiddleware`; include the okta router |
| `backend/app/db/models.py` | none — `User.okta_subject` + `AuthProvider('okta')` already exist |
| `backend/app/auth/sessions.py` | none — reuse `sign_session` / `set_session_cookie` |
| `frontend/src/pages/Login.tsx` | "Sign in with Okta" button |
| dependencies | add `authlib` (and `itsdangerous`/`httpx`, already present) |

No database migration is required: the `okta_subject` column and the `provider IN
('local','okta')` constraint shipped in the initial schema.
