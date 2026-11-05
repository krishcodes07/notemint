# Phase 2 - Clerk Authentication

Status: **Complete**. Date: Phase 2 implementation session.

## 1. Phase Overview

Phase 2 added end-to-end authentication with Clerk on the Next.js frontend and independent JWT verification on the FastAPI backend. Users sign in through branded Clerk UI, the Next.js proxy protects `/dashboard`, and the backend verifies session tokens against Clerk's JWKS without trusting the frontend.

## 2. Objectives

- Provision a Clerk development instance and wire keys into frontend/backend env.
- Protect `/dashboard` with Clerk middleware (`proxy.ts` in Next.js 16).
- Branded sign-in / sign-up pages NoteMint-styled via `@clerk/ui` shadcn theme.
- Auth-aware header (signed-in UserButton vs. Sign in / Get started).
- Dashboard shows frontend session + backend identity (`GET /api/v1/auth/me`).
- Backend verifies Clerk session JWTs independently (JWKS, iss, exp, azp, aud).
- Tests (30 backend + live browser E2E) and learning docs.

Out of scope: database, user profiles persistence, PDF/AI (Phase 3+).

## 3. Technologies and Dependencies

### Frontend

| Package | Version | Why |
| --- | --- | --- |
| @clerk/nextjs | ^7.9.24 | ClerkProvider, auth(), clerkMiddleware, SignIn/SignUp |
| @clerk/ui | — | shadcn theme mapping for Clerk components |
| puppeteer-core | (dev, not saved) | One-off live E2E verification against system Edge |

### Backend

| Package | Version | Why |
| --- | --- | --- |
| pyjwt[crypto] | 2.10.1 | RS256 JWT verification via PyJWKClient |

## 4. Architecture

```text
Browser ──► Next.js (proxy.ts / clerkMiddleware)
              │  protects /dashboard
              │  auth() for server components
              ▼
           Clerk FAPI (accounts.dev)
              │  session cookie / getToken()
              ▼
           FastAPI GET /api/v1/auth/me
              │  Bearer JWT
              ▼
           PyJWKClient ──► Clerk JWKS (.well-known/jwks.json)
              verify: RS256, exp/nbf, iss, azp, optional aud
```

Frontend never receives backend secrets. Backend never trusts client-supplied user ids — only cryptographically verified tokens.

## 5. Files Created

### Frontend

- `frontend/proxy.ts` — Next.js 16 middleware (not `middleware.ts`); `clerkMiddleware` + `createRouteMatcher(["/dashboard(.*)"])` → `auth.protect()`.
- `frontend/app/sign-in/[[...sign-in]]/page.tsx` — branded SignIn, `fallbackRedirectUrl="/dashboard"`.
- `frontend/app/sign-up/[[...sign-up]]/page.tsx` — branded SignUp, same redirect.
- `frontend/app/dashboard/page.tsx` — protected page + `DashboardGuard` (async `auth()` + `redirect`) wrapped in Suspense (required by `cacheComponents`).
- `frontend/components/auth-controls.tsx` — Clerk `<Show>` + UserButton vs. links (async Show wrapped in Suspense in header).
- `frontend/components/auth-connectivity.tsx` — client component calling `GET /api/v1/auth/me` with `authenticatedRequest`.
- Updated: `layout.tsx` (ClerkProvider + shadcn theme), `site-header.tsx`, `page.tsx` (CTA → /sign-up), `globals.css` (`@import "@clerk/ui/themes/shadcn.css"`), `lib/api.ts` (`authenticatedRequest`, `getMe`, `UnauthorizedError`), `.env.example`.

### Backend

- `backend/app/core/security.py` — `AuthenticationError`, cached `get_jwks_client()` / `reset_jwks_client()`, `verify_clerk_token()` (RS256, exp/nbf leeway 60s, iss, azp in authorized parties, optional aud).
- `backend/app/core/config.py` — `clerk_jwks_url`, `clerk_issuer`, `clerk_authorized_parties`, `clerk_audience` + `authorized_parties` property.
- `backend/app/schemas/auth.py` — `AuthenticatedUser`, `MeResponse`.
- `backend/app/dependencies/auth.py` — `get_current_user` (HTTPBearer → generic 401).
- `backend/app/api/v1/auth.py` — `GET /auth/me`.
- `backend/tests/test_auth.py` — 30 tests (verify scenarios, JWKS cache/rotation, endpoint matrix, public health).
- Updated: `api/v1/__init__.py`, `pyproject.toml`, `.env.example`.

## 6. Key Decisions & Learnings

### Next.js 16 specifics

- Middleware file is **`proxy.ts`**, not `middleware.ts`.
- `auth()` is **async** — must be awaited.
- `cacheComponents: true` requires **Suspense** around session-dependent server UI.
- Clerk's server `<Show>` is async — wrap in Suspense when used in headers.

### Clerk instance (user-created dev app)

- Keys provided by the user from their own Clerk application (accountless-style dev instance).
- Issuer: `https://equipped-skink-2305.clerk.accounts.dev`
- JWKS: `https://equipped-skink-2305.clerk.accounts.dev/.well-known/jwks.json`
- Authorized party (azp): `http://localhost:3000`
- No audience configured (skip aud check).
- **Use `localhost:3000`, not `127.0.0.1:3000`** — Clerk handshake/cookies fail on 127.0.0.1 for this instance.

### Device Trust / Client Trust

- Apps created after 2025-11-14 have Device Trust on by default: password sign-in from a "new device" requires an email code (`needs_client_trust`).
- Dev **test mode** (default on): verification code is always **`424242`**; emails to `+clerk_test` addresses are never sent.
- Live E2E used a `+clerk_test` user on the previous instance; after switching instances, create a new test user the same way (Backend API + `skip_password_checks`) if re-running browser E2E.
- Form inputs: prefer native value setter + `input`/`change` events over `page.type` (React controlled inputs; `!` and rapid typing can drop characters).
- Auto-submit: 6-digit code field often submits on complete input — don't double-click Continue (causes rate limits / "Update operations are not allowed on older sign ins").

### Backend JWT verification

- `PyJWKClient` caches JWKS; refresh on unknown `kid` handles key rotation.
- Tests must patch **`urllib.request.urlopen`** (not `PyJWKClient.fetch_data`) to preserve cache behavior across test cases.
- Testing tokens from Clerk are opaque, not JWTs — live tests need a real browser session JWT.
- 401 responses use a generic `{"detail":"Not authenticated"}` — no token leakage.

### Secrets

- Frontend `.env.local` holds publishable + secret keys (gitignored).
- Backend `.env` holds JWKS URL / issuer / azp (gitignored).
- Never print secrets in logs or docs; only `.env.example` templates committed.

## 7. Verification

| Check | Result |
| --- | --- |
| `python -m pytest` | 30 passed |
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npm run build` | success (routes: `/`, `/dashboard`, sign-in, sign-up, Proxy) |
| Unauthenticated `GET /auth/me` | 401 |
| Invalid JWT → `/auth/me` | 401 |
| Unauthenticated `/dashboard` | 307 → `/sign-in?redirect_url=...` |
| **Live browser E2E** | sign-in (password + Device Trust 424242) → JWT → backend 200 with `user_id` → tampered 401 → no-token 401 → sign-out → `/dashboard` blocked |

Live E2E user id: `user_3LdjYS7LmhISGeOGyxAt9cKdZ1A`.

## 8. Environment Templates

**Frontend** (`.env.example`):

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard
```

**Backend** (`.env.example`):

```env
CLERK_JWKS_URL=
CLERK_ISSUER=
CLERK_AUTHORIZED_PARTIES=http://localhost:3000
CLERK_AUDIENCE=
```

## 9. Conventions Going Forward

- Any new protected route: add matcher in `proxy.ts` (or rely on path-based defaults) and keep server pages behind Suspense when reading `auth()`.
- Backend handlers that need the user: depend on `get_current_user` → `AuthenticatedUser`.
- Never log full JWTs; log `user_id` only.
- When adding auth tests, reset JWKS client cache between cases (`reset_jwks_client()`).
