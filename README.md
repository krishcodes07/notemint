# NoteMint

**NoteMint** is an AI-powered personalized learning platform that helps students transform study materials into interactive learning resources.

Upload a PDF, choose the resources you want — smart notes, important questions, MCQ quizzes, flashcards, mind maps, chapter summaries — and let NoteMint's AI processing engine build your study workspace. An AI Teacher can later answer questions grounded in your own documents, in Hindi and English.

## Technology Stack

| Layer | Technologies |
| --- | --- |
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui, Lucide icons |
| Backend | Python 3.11+, FastAPI, Pydantic, Pydantic Settings |
| Database | Neon PostgreSQL, SQLAlchemy, Alembic, pgvector (Phase 3+) |
| File storage | Neon Object Storage (S3-compatible), boto3 (Phase 3+) |
| AI | Kilo Gateway, OpenAI-compatible API, provider abstraction (Phase 7+) |
| Auth | Clerk, backend JWT verification (Phase 2+) |
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
│   │   ├── api/v1/    Versioned API routers
│   │   ├── core/      Configuration, logging
│   │   ├── services/  Business logic (future phases)
│   │   └── main.py    App entry point
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
cp .env.example .env         # optional, defaults work for local dev
uvicorn app.main:app --reload --port 8000
```

API base: [http://localhost:8000](http://localhost:8000) - Docs: [http://localhost:8000/docs](http://localhost:8000/docs)

| Command | Purpose |
| --- | --- |
| `uvicorn app.main:app --reload` | Start API with auto-reload |
| `python -m pytest` | Run backend tests |

### 3. Environment Configuration

**Frontend** (`frontend/.env.local`):

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Only `NEXT_PUBLIC_*` variables are exposed to the browser. Never put secrets in frontend env vars.

**Backend** (`backend/.env`):

```env
APP_NAME=NoteMint API
APP_ENV=development
API_V1_PREFIX=/api/v1
FRONTEND_URL=http://localhost:3000
LOG_LEVEL=INFO
```

Copy `.env.example` to `.env` in each app. `.env` files are gitignored; only `.env.example` templates are committed.

### 4. Verify connectivity

With both servers running, the landing page **System status** card calls `GET /api/v1/health` and shows loading, success, or error states.

```bash
curl http://localhost:8000/api/v1/health
# {"status":"healthy","service":"notemint-api"}
```

## Development Roadmap

Development proceeds in strict phases. See `learnings/` for what has been implemented in each phase.

- **Phase 1** - Project foundation: design system, FastAPI skeleton, health endpoint, frontend-backend connectivity
- **Phase 2** - Authentication (Clerk)
- **Phase 3** - Database and storage (Neon)
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

## License

Private - all rights reserved.
