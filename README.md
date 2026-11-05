# NoteMint

**NoteMint** is an AI-powered personalized learning platform that helps students transform study materials into interactive learning resources.

Upload a PDF, choose the resources you want — smart notes, important questions, MCQ quizzes, flashcards, mind maps, chapter summaries — and let NoteMint's AI processing engine build your study workspace. An AI Teacher can later answer questions grounded in your own documents, in Hindi and English.

## Technology Stack

| Layer | Technologies |
| --- | --- |
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui, Lucide icons |
| Backend | Python 3.11+, FastAPI, Pydantic, Pydantic Settings |
| Database | Neon PostgreSQL, SQLAlchemy 2.x (Psycopg 3), Alembic |
| File storage | Neon Object Storage (S3-compatible), boto3 |
| AI | Kilo Gateway, OpenAI-compatible API, provider abstraction (Phase 7+) |
| Auth | Clerk, backend JWT verification (Phase 2) |
| Background jobs | Redis, Celery (Phase 7+) |
| Deployment | Vercel (frontend), Python host/VPS (backend), Neon (DB + storage) |

## Repository Structure

```text
notemint/
├── frontend/          Next.js application (App Router)
│   ├── app/           Routes, root layout, global styles
│   ├── components/    Shared UI components (shadcn/ui + app components)
│   ├── lib/           Utilities and API client
│   └── public/        Static assets
├── backend/           FastAPI application
│   ├── app/
│   │   ├── api/v1/    Versioned API routers (health, auth, users)
│   │   ├── core/      Configuration, logging, JWT verification
│   │   ├── db/        SQLAlchemy engine, sessions, get_db dependency
│   │   ├── models/    SQLAlchemy models (users, documents)
│   │   ├── repositories/ Data-access layer
│   │   ├── integrations/ Neon Object Storage (boto3) client
│   │   ├── services/  Business logic / storage service
│   │   └── main.py    App entry point
│   ├── alembic/       Alembic migrations (env.py + versions/)
│   ├── alembic.ini    Alembic configuration
│   ├── tests/         Pytest suite
│   ├── pyproject.toml Python dependencies
│   └── .env.example   Environment template
├── docs/              Project documentation
├── learnings/         Phase-by-phase implementation learnings
├── README.md
└── .gitignore
```

## Local Development Setup

### Prerequisites

- Node.js 20.9+ (Node 26 recommended)
- npm
- Python 3.11+
- pip

### 1. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # optional, defaults to http://localhost:8000
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start dev server (Turbopack) |
| `npm run build` | Production build + type check |
| `npm run start` | Serve production build |
| `npm run lint` | Run ESLint |

### 2. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate       # Windows
# source .venv/bin/activate  # macOS/Linux
pip install -e ".[dev]"
cp .env.example .env         # then fill in DATABASE_URL + Clerk keys (see below)
python -m alembic upgrade head   # create schema in Neon (first run only)
uvicorn app.main:app --reload --port 8000
```

API base: [http://localhost:8000](http://localhost:8000) - Docs: [http://localhost:8000/docs](http://localhost:8000/docs)

| Command | Purpose |
| --- | --- |
| `uvicorn app.main:app --reload` | Start API with auto-reload |
| `python -m pytest` | Run backend tests |
| `python -m alembic upgrade head` | Apply pending migrations |
| `python -m alembic revision --autogenerate -m "msg"` | Generate a migration from model changes |
| `python -m alembic check` | Verify schema matches models (no drift) |
| `python -m alembic downgrade -1` | Roll back the last migration |
| `python -m alembic current` / `history` | Show applied/available revisions |

### 3. Environment Configuration

**Frontend** (`frontend/.env.local`):

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard
```

Only `NEXT_PUBLIC_*` variables are exposed to the browser. Never put secrets in frontend env vars. Populate Clerk keys with `npx -y clerk@latest init` or from the Clerk dashboard.

**Backend** (`backend/.env`):

```env
APP_NAME=NoteMint API
APP_ENV=development
API_V1_PREFIX=/api/v1
FRONTEND_URL=http://localhost:3000
LOG_LEVEL=INFO
CLERK_JWKS_URL=https://your-instance.clerk.accounts.dev/.well-known/jwks.json
CLERK_ISSUER=https://your-instance.clerk.accounts.dev
CLERK_AUTHORIZED_PARTIES=http://localhost:3000
CLERK_AUDIENCE=

# Neon PostgreSQL (Phase 3)
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST/neondb?sslmode=require&channel_binding=require
DIRECT_DATABASE_URL=            # direct (non-pooler) URL for migrations, optional

# Neon Object Storage (Phase 3) — server-side secrets only
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_ENDPOINT_URL_S3=https://<branch-storage-endpoint>
AWS_REGION=ap-southeast-1
NEON_STORAGE_BUCKET=notemint-files
```

Copy `.env.example` to `.env` in each app. `.env` files are gitignored; only `.env.example` templates are committed. Never expose `AWS_*`, `DATABASE_URL`, or `CLERK_SECRET_KEY` through Next.js environment variables.

### 4. Neon project setup (database + storage)

NoteMint uses one Neon project for both PostgreSQL and Object Storage.

**PostgreSQL**

1. Create a Neon project (Console or `neonctl init`) in a supported region (Object Storage requires `aws-us-east-1`, `aws-us-east-2`, `aws-eu-central-1`, or `aws-ap-southeast-1`).
2. Copy the **pooled** connection string into `DATABASE_URL`, prefixing it with the SQLAlchemy driver: `postgresql+psycopg://...?sslmode=require`.
3. Optionally copy the **direct** (non-pooler) connection string into `DIRECT_DATABASE_URL` — preferred for Alembic DDL. If only the pooled URL exists, migrations still work over it.
4. Apply the schema (first run): `python -m alembic upgrade head`. This creates `users`, `documents`, indexes, and the Alembic version table.

**Object Storage**

1. Enable Object Storage for the branch (Neon Console, or `neon deploy` / `neon config add bucket notemint-files` — see [Neon Object Storage docs](https://neon.com/docs/storage/get-started)).
2. Create a storage credential scoped `storage:read` + `storage:write` (Console or `neon credentials create --scope storage:read --scope storage:write`) and store the `nak_live_...` / `nsk_live_...` pair.
3. Fill `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3` (branch storage endpoint), `AWS_REGION` in `backend/.env`. The bucket `notemint-files` stays **private** — no public URLs are ever generated.
4. Verify: `curl http://localhost:8000/api/v1/health/storage` → `{"status":"ok","service":"storage"}`.

Never run provisioning commands against an unverified project/branch, and never commit real credentials.

### 5. Verify connectivity

With both servers running, the landing page **System status** card calls `GET /api/v1/health` and shows loading, success, or error states. After signing in, `/dashboard` calls `GET /api/v1/auth/me` with the Clerk session token.

```bash
curl http://localhost:8000/api/v1/health
# {"status":"healthy","service":"notemint-api"}

curl http://localhost:8000/api/v1/health/database   # {"status":"ok","service":"database"}
curl http://localhost:8000/api/v1/health/storage    # {"status":"ok","service":"storage"}

# Without a token — expect 401
curl http://localhost:8000/api/v1/auth/me
# {"detail":"Not authenticated"}

# Signed-in application profile (creates the DB row on first call)
curl http://localhost:8000/api/v1/users/me -H "Authorization: Bearer <CLERK_SESSION_TOKEN>"
# {"clerk_user_id":"user_...","display_name":null,"email":null,"created_at":"..."}
```

## Development Roadmap

Development proceeds in strict phases. See `learnings/` for what has been implemented in each phase.

- **Phase 1** - Project foundation: design system, FastAPI skeleton, health endpoint, frontend-backend connectivity ✅
- **Phase 2** - Authentication (Clerk): protected routes, branded sign-in/up, backend JWT verification ✅
- **Phase 3** - Database and storage (Neon): SQLAlchemy models, Alembic migrations, user persistence, Object Storage ✅
- **Phase 4** - Dashboard and application UI
- **Phase 5** - PDF upload system
- **Phase 6** - PDF extraction engine
- **Phase 7** - AI integration and generation engine
- **Phase 8** - Study workspace
- **Phase 9** - AI Teacher
- **Phase 10** - AI voice teacher
- **Phase 11** - Learning intelligence
- **Phase 12** - Testing, security, and deployment

## Learning Documentation

- [`learnings/00-project-overview.md`](learnings/00-project-overview.md) - Project-wide overview
- [`learnings/phase-01-foundation.md`](learnings/phase-01-foundation.md) - Phase 1 implementation details
- [`learnings/phase-02-authentication.md`](learnings/phase-02-authentication.md) - Phase 2 Clerk auth implementation
- [`learnings/phase-03-database-storage.md`](learnings/phase-03-database-storage.md) - Phase 3 database & storage foundation

## License

Private - all rights reserved.
