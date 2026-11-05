# Phase 3 - Database & Storage Foundation

Status: **Complete**. Date: Phase 3 implementation session.

## 1. Phase Overview

Phase 3 established NoteMint's persistent data infrastructure: a Neon PostgreSQL connection through SQLAlchemy 2.0 (sync + Psycopg 3), Alembic-managed schema with an initial migration applied to the live Neon database, application-level user persistence keyed by verified Clerk identities, a private Neon Object Storage service (S3-compatible boto3), and infrastructure health checks. All existing Phase 1/2 functionality was preserved and re-verified.

## 2. Objectives

- Connect FastAPI to Neon PostgreSQL with SQLAlchemy 2.x + Psycopg 3 (sync sessions).
- Centralized database/storage configuration through Pydantic Settings.
- Modular `db/` layer: engine, session factory, `get_db` dependency, health probe.
- Models: `users` (Clerk-keyed profiles) and `documents` (Phase 5+ foundation).
- Race-safe user upsert; `GET /api/v1/users/me` creating/retrieving profiles.
- Alembic initialized, initial migration generated, reviewed, applied, verified, downgrade/upgrade tested.
- Neon Object Storage integration (private `notemint-files` bucket, backend-generated keys).
- Health endpoints: `/health/database`, `/health/storage` with generic, secret-free payloads.
- Automated tests (SQLite/mocked) + live Neon integration verification.
- Learning documentation and README updates.

Out of scope (per instructions): PDF upload/extract, AI, RAG, dashboards, Redis/Celery, pgvector, frontend screens.

## 3. Dependencies Installed

| Package | Version | Why |
| --- | --- | --- |
| sqlalchemy | 2.1.8 | ORM 2.x (Mapped/mapped_column), engine/session |
| psycopg[binary] | 3.3.8 | PostgreSQL driver (sync) for SQLAlchemy |
| alembic | 1.20.1 | Schema migrations |
| boto3 | 1.43.124 | S3-compatible Neon Object Storage client |

No other runtime or dev dependencies were added. Existing: fastapi, uvicorn, pydantic-settings, PyJWT[crypto], pytest, httpx.

## 4. Files Created

### Backend — database layer

- `backend/app/db/__init__.py` — package exports.
- `backend/app/db/base.py` — `DeclarativeBase` with shared constraint naming convention (`pk_/uq_/ck_/fk_/ix_`).
- `backend/app/db/session.py` — lazy `build_engine`/`get_engine` (lru_cache), `get_session_factory`, `session_scope`, `get_db`-support, `check_database_connection` (`SELECT 1`), `DatabaseNotConfiguredError`/`DatabaseUnavailableError`, `reset_database_resources`.
- `backend/app/db/dependencies.py` — `get_db()` FastAPI dependency (commit on success, rollback on error, always close).

### Backend — models & repositories

- `backend/app/models/__init__.py`, `user.py`, `document.py` — `User`, `Document`, `DocumentStatus`.
- `backend/app/repositories/__init__.py`, `user_repository.py` — `UserRepository` (`get_by_clerk_id`, `list_for_user`, `create`, race-safe `upsert`, `delete`).
- `backend/app/schemas/user.py` — `UserProfileResponse`.

### Backend — API

- `backend/app/api/v1/users.py` — `GET /api/v1/users/me`.

### Backend — storage

- `backend/app/integrations/__init__.py`, `neon_storage.py` — boto3 client factory (path-style, cached), config guards, typed storage errors.
- `backend/app/services/storage_service.py` — `StorageService` (upload/download/delete/exists/health), `build_document_key`, `get_storage_service`.

### Backend — migrations

- `backend/alembic.ini`, `backend/alembic/env.py`, `backend/alembic/script.py.mako`.
- `backend/alembic/versions/adf661b7463a_initial_schema.py` — `users` + `documents` (revision `adf661b7463a`).

### Backend — tests

- `backend/tests/conftest.py` — SQLite fixtures (`sqlite_engine`, `db_sessionmaker`, `db_session`, `client` with `get_db` override), mocked-Clerk JWT helpers (`rsa_keys`, `make_token`, `make_jwks`, `clerk_env`, `mock_jwks`).
- `backend/tests/test_database.py` — engine/session/model/repository tests (28 tests).
- `backend/tests/test_users_api.py` — `/users/me` + health endpoint API tests (18 tests).
- `backend/tests/test_storage.py` — key generation, mocked boto3 operations, config wiring, live round-trip (32 tests, 1 conditional skip).
- `backend/tests/test_migrations.py` — Alembic config, upgrade/downgrade on temp SQLite (10 tests).

### Documentation

- `learnings/phase-03-database-storage.md` (this file).

## 5. Files Modified

- `backend/app/core/config.py` — added `database_url`, `direct_database_url`, `aws_access_key_id`, `aws_secret_access_key`, `aws_endpoint_url_s3`, `aws_region`, `neon_storage_bucket` + properties `database_configured`, `migration_database_url`, `storage_configured`.
- `backend/app/api/v1/health.py` — added `/health/database` and `/health/storage`.
- `backend/app/api/v1/__init__.py` — registered `users` router.
- `backend/pyproject.toml` — added sqlalchemy, psycopg[binary], alembic, boto3.
- `backend/.env.example` — DATABASE_URL, DIRECT_DATABASE_URL, AWS_* storage templates (empty values).
- `backend/.env` — real credentials (gitignored, never committed).
- `backend/tests/test_auth.py` — `_install_jwks_server` now patches `PyJWKClient.fetch_data` instead of `urllib.request.urlopen` (see §16).
- `learnings/00-project-overview.md`, `README.md` — Phase 3 status, setup, and commands.

Frontend: **no changes** (per scope restrictions).

## 6. Database Architecture

```text
FastAPI route
  └─ Depends(get_db) ──► sessionmaker ──► Engine (lazy, pooled) ──► Neon PostgreSQL
        │                                      │
        │ commit on success / rollback on error│ pool_pre_ping, pool_size=5,
        └─ close always                        │ max_overflow=10, pool_recycle=1800
                                               ▼
                              postgresql+psycopg://...?sslmode=require
```

- **Driver**: SQLAlchemy 2.x sync ORM + Psycopg 3 (`postgresql+psycopg://`).
- **URLs**: `DATABASE_URL` (runtime, Neon pooled `-pooler.` endpoint) and `DIRECT_DATABASE_URL` (migrations; empty → falls back to `DATABASE_URL` with documented implications).
- **Laziness**: importing the app never creates an engine or opens a connection (`get_engine` is lru_cached and only runs on first use; tests assert this).
- **Pooling**: Postgres-only pool options (SQLite rejects `max_overflow`), `pool_pre_ping` to survive Neon compute suspend/pooler drops.
- **No `create_all()`** anywhere in application code — Alembic owns the schema. `create_all` appears only in test fixtures against SQLite.
- **No connection strings/passwords** are ever logged; health endpoints return only `{"status", "service"}`.

## 7. SQLAlchemy Session Management

- `get_session_factory()` — cached `sessionmaker(expire_on_commit=False, autoflush=False)`.
- `get_db()` (FastAPI dependency): yield session → `commit()` on success → `rollback()` on exception → `close()` in `finally`.
- `session_scope()` context manager: same semantics for scripts/background work.
- `check_database_connection()` — lightweight `SELECT 1`; raises typed errors that the health endpoint maps to 503 (never 500, never leaks details).

## 8. Database Models and Relationships

### `users`

| Column | Type | Notes |
| --- | --- | --- |
| clerk_user_id | VARCHAR(64) PK | Verified Clerk `sub` — the only identity source |
| display_name | VARCHAR(255) NULL | From trusted sources only |
| email | VARCHAR(320) NULL | Never assumed present in session JWT |
| created_at / updated_at | timestamptz | `server_default=now()`, `updated_at` also `onupdate=now()` |

### `documents` (Phase 5+ foundation — no upload routes yet)

| Column | Type | Notes |
| --- | --- | --- |
| id | UUID PK | Server-generated (`uuid.uuid4`) |
| clerk_user_id | VARCHAR(64) FK → users, ON DELETE CASCADE, indexed | Owner |
| original_filename | VARCHAR(512) | As supplied at upload |
| storage_key | VARCHAR(1024) UNIQUE | Backend-generated object key |
| mime_type | VARCHAR(127) | e.g. application/pdf |
| file_size_bytes | BIGINT | |
| status | VARCHAR(32) + CHECK | `uploaded / extracting / generating / completed / failed` |
| page_count | INT NULL | Filled after extraction (Phase 6) |
| created_at / updated_at | timestamptz | |

Relationships: `User.documents` ↔ `Document.owner` (`cascade="all, delete-orphan"`, `lazy="selectin"`). DB-level: FK with `ON DELETE CASCADE`, unique `storage_key`, index on `clerk_user_id`, CHECK on `status`.

**Upsert**: `UserRepository.upsert()` — SELECT first; INSERT inside a savepoint (`begin_nested`) so a concurrent first-request race loses cleanly on `IntegrityError`, re-reads the winner's row, and never produces duplicates. Non-`None` profile fields update existing rows; `None` means "not provided" and never wipes data.

## 9. Alembic Configuration and Migrations

- `alembic.ini`: `script_location = alembic`, `prepend_sys_path = .`, `path_separator = os`, empty `sqlalchemy.url` (credentials never in the file).
- `env.py`: URL resolution order — programmatic override (tests) → `DIRECT_DATABASE_URL` → `DATABASE_URL`; imports `app.models` so `Base.metadata` is complete; supports offline mode and programmatic `connection` attributes.
- Initial migration `adf661b7463a_initial_schema` generated with `alembic revision --autogenerate`, then **reviewed and hand-adjusted**:
  - `server_default=sa.text('now()')` → `sa.func.now()` (compiles per-dialect: `now()` on PG, `CURRENT_TIMESTAMP` on SQLite — keeps migrations testable on SQLite).
  - Added explicit `CHECK (status IN (...))` — SQLAlchemy 2.1 does **not** emit a CHECK for `native_enum=False` enums (verified by compiling DDL).
- Applied to Neon: `alembic upgrade head` → tables verified via `information_schema`/`pg_indexes`/`pg_constraint`.
- `alembic check` → **"No new upgrade operations detected"** (schema == models, no drift).
- Downgrade/upgrade tested on Neon (`downgrade -1` → `upgrade head`, twice) and on temp SQLite in unit tests.

Commands (from `backend/`):

```bash
python -m alembic revision --autogenerate -m "description"
python -m alembic upgrade head
python -m alembic downgrade -1
python -m alembic check
python -m alembic current / history
```

## 10. Clerk-to-Database User Integration

- `GET /api/v1/users/me` — requires `get_current_user` (unchanged Phase 2 verification); identity comes **only** from the verified JWT `sub`.
- First authenticated visit → INSERT (upsert); subsequent visits → same row (no duplicates, stable `created_at`).
- Response: `{"clerk_user_id", "display_name", "email", "created_at"}` — `display_name`/`email` are `null` (not available from the session JWT; deliberately not fetched from Clerk).
- `GET /api/v1/auth/me` untouched and still DB-free (verified by test).
- Query/body user-id parameters are ignored — covered by `test_client_supplied_user_id_is_ignored`.

## 11. Neon Object Storage Architecture

- **Region check**: official docs list `aws-ap-southeast-1` (Singapore) as supported — matches the project's region. Endpoint `https://br-steep-hat-a163e2pi.storage.c-1.ap-southeast-1.aws.neon.tech`, live-verified.
- **Bucket**: `notemint-files` already existed on the branch; confirmed **private** — an anonymous HTTPS GET of a temp object returned **403**, authenticated read succeeded, temp object deleted.
- **Client**: boto3 with `endpoint_url`, `region_name`, explicit credentials, `Config(s3={"addressing_style": "path"})` (Neon requires path-style), standard retry mode, cached via `lru_cache` (created lazily).
- **Separation**: `integrations/neon_storage.py` owns the client/config; `services/storage_service.py` owns operations; routes never touch boto3 directly.
- **Privacy rules**: no public URLs are ever generated; all objects private; credentials server-side only (never in Next.js env, never logged).

## 12. Storage Service Methods

| Method | Behavior |
| --- | --- |
| `upload_fileobj(key, fileobj, content_type, length)` | Streams via `upload_fileobj` (no full buffering); wraps connectivity/ClientError as `StorageUnavailableError` |
| `upload_bytes(key, data, content_type)` | Small payloads (tests/metadata) |
| `download_fileobj(key, fileobj)` | Streams out; missing key → `StorageObjectNotFoundError` |
| `download_bytes(key)` | Small objects only |
| `delete(key)` | `True` deleted / `False` already absent |
| `exists(key)` | `head_object`; 404/403 → `False`; connectivity → `StorageUnavailableError` |
| `health_check()` | `head_bucket` only — no file mutation; errors wrapped, messages never leaked |
| `build_document_key(user_id, doc_id, filename)` | `users/{clerk_user_id}/documents/{uuid}/original.pdf`; strict regex on user id (`^user_[A-Za-z0-9]+$`), UUID validation, unsafe filenames fall back to `original.pdf`, `..`/`/` traversal impossible |

## 13. Environment Variables

**Backend `.env.example` additions (templates only, values empty):**

```env
DATABASE_URL=
DIRECT_DATABASE_URL=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_ENDPOINT_URL_S3=
AWS_REGION=
NEON_STORAGE_BUCKET=notemint-files
```

**Real values** live only in gitignored `backend/.env`. `DATABASE_URL` uses the `postgresql+psycopg://` driver prefix with `sslmode=require&channel_binding=require`. `DIRECT_DATABASE_URL` is empty (only the pooled URL was provided) — Alembic therefore migrates over the pooled endpoint; documented in §16.

## 14. API Endpoints

| Method | Path | Auth | Response |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | public | `{"status":"healthy","service":"notemint-api"}` (unchanged) |
| GET | `/api/v1/health/info` | public (dev) | env info (unchanged) |
| GET | `/api/v1/health/database` | public | 200 `{"status":"ok","service":"database"}` / 503 `{"status":"unavailable",...}` |
| GET | `/api/v1/health/storage` | public | 200 `{"status":"ok","service":"storage"}` / 503 `{"status":"unavailable",...}` |
| GET | `/api/v1/auth/me` | Bearer | unchanged Phase 2 response |
| GET | `/api/v1/users/me` | Bearer | `{"clerk_user_id","display_name","email","created_at"}` |

**Health endpoint visibility decision**: all three health checks are **public** — uptime monitors cannot authenticate, and payloads contain only `status`/`service` (no credentials, connection strings, exception text; failure details are logged server-side only). If this becomes a concern (e.g., recon during an outage), move `/health/database` and `/health/storage` behind `get_current_user` without touching `/health`.

## 15. Testing Results

`python -m pytest` → **117 passed, 1 skipped** (12.3s). The single skip is `test_unconfigured_storage_raises` — it only runs when storage credentials are *absent* (they are present here).

| Suite | Tests | Result |
| --- | --- | --- |
| test_auth.py (Phase 2, preserved) | 27 | all pass (2 adapted — §16) |
| test_health.py (Phase 1, preserved) | 3 | all pass |
| test_database.py | 28 | all pass (engine lazy init, session lifecycle/pool return, user/document models, upsert ×5, isolation, cascade, CHECK, FK, schema) |
| test_users_api.py | 18 | all pass (401 matrix, first-create, repeat-no-dup, client-id-ignored, isolation, auth/me preserved, health 200/503, no-leak assertions) |
| test_storage.py | 32 | 31 pass + 1 conditional skip (key safety ×7, upload/download/delete/exists/health mocked, client config, **3 live Neon round-trip tests**) |
| test_migrations.py | 10 | all pass (config, portable defaults, upgrade schema assertions, idempotency, downgrade→upgrade, ORM rows on migrated schema) |

**Mocked vs live — clearly separated:**

- *Mocked/unit (no credentials needed)*: all SQLite database tests, all API tests (JWKS mocked, `get_db` overridden), all boto3 storage tests (MagicMock), migration tests (temp SQLite).
- *Live Neon (real credentials, ran during this session)*:
  - PostgreSQL 18.6 connectivity; empty schema before migration.
  - `alembic upgrade head` → tables/columns/indexes/FK/CHECK verified via catalog queries.
  - `alembic downgrade -1` + `upgrade head` cycle (×2) — clean.
  - `alembic check` → no drift.
  - Live repository upsert on Neon (2 upserts → 1 row, tz-aware `created_at`, cleanup).
  - Live FK enforcement (ghost owner INSERT rejected).
  - Storage: `head_bucket` OK; upload → exists → download → delete round-trip; anonymous read **403** (privacy); missing-object handling.
  - **E2E**: temporary Clerk test user → Backend-API session token → real JWKS verification → `GET /users/me` ×2 → 200 both, same `created_at`, Neon row count = 1 → `/auth/me` 200 → full cleanup (DB row + Clerk user deleted).
  - Live HTTP against the running dev server: `/health`, `/health/info`, `/health/database`, `/health/storage` → 200; `/users/me`, `/auth/me` without token → 401.

Frontend: `npx tsc --noEmit` clean, `npm run lint` clean (no frontend changes made).

## 16. Important Technical Decisions

1. **Sync SQLAlchemy + Psycopg 3** (per instructions) — FastAPI runs sync endpoints in a threadpool; no async driver complexity yet. Revisit only if a concrete async need appears.
2. **Lazy cached engine** — module import never dials the database (tests assert cache stays empty after `import app.main`).
3. **`DIRECT_DATABASE_URL` support with fallback** — only the pooled URL was provided, so migrations currently run over Neon's pooler. Works (verified), but direct connections are preferred for DDL; drop the direct URL in when available.
4. **Portable migrations** — `sa.func.now()` instead of `sa.text('now()')` so the same migration runs on Postgres (production) and SQLite (unit tests).
5. **Explicit CHECK constraint for `status`** — SQLAlchemy 2.1 renders `Enum(native_enum=False)` as bare `VARCHAR(32)` (no CHECK); added `CheckConstraint(name="document_status")` so the database enforces the status vocabulary (verified live + SQLite).
6. **Race-safe portable upsert** — SELECT + savepoint INSERT + IntegrityError re-read, instead of dialect-specific `ON CONFLICT` (works on both PG and SQLite; duplicates impossible).
7. **Path-style S3 addressing** — required by Neon's endpoint; encoded in `botocore Config`.
8. **Backend-generated object keys only** — user id regex + UUID validation + filename sanitization make path traversal structurally impossible; client-supplied paths are never used.
9. **Public generic health checks** — see §14 for the reasoning and how to lock them down later.
10. **`get_db` overrides in tests** — API tests run against isolated SQLite with the real route/auth code; external services mocked at dependency boundaries, so ordinary tests never need credentials.

## 17. Problems and Solutions

1. **PyJWT upgraded to 2.15.1** (env drift): `PyJWKClient` now fetches via an internal opener — Phase 2's `urllib.request.urlopen` patch no longer intercepted fetches, breaking 2 caching tests. Fixed by patching `PyJWKClient.fetch_data` (still the single choke point; real caching/refresh logic preserved; fetch-count assertions unchanged). Production verification logic untouched.
2. **`max_overflow` rejected on SQLite** — pool sizing only applies to PostgreSQL; `build_engine` now adds pool kwargs conditionally by backend.
3. **SQLAlchemy 2.1 enum CHECK regression** — no auto-CHECK for non-native enums → explicit `CheckConstraint` (see §16.5).
4. **`sa.text('now()')` breaks SQLite DDL** — replaced with `sa.func.now()` in the generated migration (review step caught it).
5. **Clerk Backend-API tokens have `azp=None`** — the azp policy (correctly) rejected them; browser sessions carry `azp=http://localhost:3000`. The live E2E relaxed only the azp check in-process while still verifying signature/iss/exp/sid against the real JWKS; azp behavior itself remains proven by Phase 2's browser E2E.
6. **Clerk user creation 422** — instance requires a password even with `skip_password_checks`; supplied a random per-run password (never printed).
7. **Port 8000 occupied** by an already-running dev server (auto-reloaded Phase 3 routes) — used it for live HTTP checks instead of starting a duplicate.
8. **`create_engine` import-time concerns** — engine creation is verified lazy; reload-based import tests were replaced with cache-state assertions to avoid module-reload side effects.

## 18. Current Limitations

- `DIRECT_DATABASE_URL` unset — migrations run over Neon's pooled endpoint (works; direct preferred for DDL at scale).
- `display_name`/`email` are always `null` — not present in session JWTs; profile enrichment (Clerk Backend API or onboarding) is future work.
- No document upload endpoints/routes (Phase 5), no PDF processing, no AI (Phase 7).
- Storage service is synchronous and process-local; no multipart/resumable uploads yet (boto3 `upload_fileobj` handles large files by streaming, but no upload orchestration exists).
- Infrastructure health checks are unauthenticated (decision + lockdown path in §14).
- `pgvector` not enabled (belongs to AI Teacher phase); Redis/Celery absent by design.
- Only one live test user flow verified end-to-end; multi-user concurrency against Neon not load-tested (savepoint race covered by unit tests).

## 19. Pending Work for Phase 4

- Dashboard/application UI consuming `GET /api/v1/users/me` (profile display).
- Decide profile enrichment strategy (store display name from trusted Clerk data at first login).
- Consider adding `DIRECT_DATABASE_URL` once available; revisit pool settings under real load.
- Keep migration discipline: every schema change via `alembic revision --autogenerate` + review + `alembic check`.
- Continue Phase-by-phase docs; update this file's sibling docs as phases complete.

## Appendix - Key Commands

```bash
# Backend
cd backend
.venv\Scripts\activate          # Windows
python -m pytest -v             # 117 passed, 1 skipped
uvicorn app.main:app --reload --port 8000

# Migrations (from backend/)
python -m alembic revision --autogenerate -m "description"
python -m alembic upgrade head
python -m alembic downgrade -1
python -m alembic check

# Live health checks
curl http://localhost:8000/api/v1/health
curl http://localhost:8000/api/v1/health/database
curl http://localhost:8000/api/v1/health/storage
# users/me without a token — expect 401
curl http://localhost:8000/api/v1/users/me
```
