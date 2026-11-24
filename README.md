<div align="center">

<table align="center">
<tr><td align="center">

```
 ███╗   ██╗ ██████╗ ████████╗███████╗███╗   ███╗██╗███╗   ██╗████████╗
 ████╗  ██║██╔═══██╗╚══██╔══╝██╔════╝████╗ ████║██║████╗  ██║╚══██╔══╝
 ██╔██╗ ██║██║   ██║   ██║   █████╗  ██╔████╔██║██║██╔██╗ ██║   ██║   
 ██║╚██╗██║██║   ██║   ██║   ██╔══╝  ██║╚██╔╝██║██║██║╚██╗██║   ██║   
 ██║ ╚████║╚██████╔╝   ██║   ███████╗██║ ╚═╝ ██║██║██║ ╚████║   ██║   
 ╚═╝  ╚═══╝ ╚═════╝    ╚═╝   ╚══════╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝   ╚═╝   
```

</td></tr>
</table>

<p align="center"><b>The AI-powered intelligent study workspace & learning copilot.</b></p>
<p align="center"><b>Transform textbooks, lecture slides, and notes into smart summaries, KaTeX formulas, interactive flashcards, practice quizzes, and grounded voice tutoring.</b></p>

<p align="center">
  <a href="https://nextjs.org"><img alt="Next.js 16" src="https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" /></a>
  <a href="https://fastapi.tiangolo.com"><img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" /></a>
  <a href="https://www.python.org/downloads/"><img alt="Python 3.11+" src="https://img.shields.io/badge/Python-3.11%2B-3776AB?style=for-the-badge&logo=python&logoColor=white" /></a>
  <a href="https://neon.tech"><img alt="Neon Postgres" src="https://img.shields.io/badge/Neon_Postgres-00E599?style=for-the-badge&logo=postgresql&logoColor=white" /></a>
  <a href="https://github.com/pgvector/pgvector"><img alt="pgvector HNSW" src="https://img.shields.io/badge/pgvector-HNSW_RAG-blue?style=for-the-badge" /></a>
  <a href="https://katex.org"><img alt="KaTeX Math" src="https://img.shields.io/badge/KaTeX-Math_Typesetting-3298dc?style=for-the-badge&logo=latex&logoColor=white" /></a>
  <a href="https://clerk.com"><img alt="Clerk Auth" src="https://img.shields.io/badge/Clerk-Authentication-6C47FF?style=for-the-badge&logo=clerk&logoColor=white" /></a>
  <a href="LICENSE"><img alt="License MIT" src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" /></a>
</p>

</div>

> [!NOTE]
> **Production AI Study Workspace**: NoteMint combines high-performance PyMuPDF document extraction, low-memory Jina AI Embeddings API (`jina-embeddings-v3`, 1024-dim), hybrid pgvector HNSW search, textbook-grade KaTeX mathematical typesetting, and real-time grounded conversational voice tutoring into one cohesive, distraction-free learning ecosystem.

---

## Why NoteMint?

Traditional study methods force students to manually skim hundreds of PDF pages, rewrite notes by hand, create flashcards from scratch, and puzzle through complex formulas alone. **NoteMint transforms static learning materials into an active, intelligent study hub in seconds.**

- ⚡ **From Raw PDF to Full Study Hub in Seconds** — Upload any textbook chapter, syllabus unit, or lecture slide deck (up to 20MB). NoteMint automatically parses the content, cleans formatting, and generates an organized multi-resource study workspace.
- 🧮 **Textbook-Fidelity Mathematical & Chemical Notation** — Built-in KaTeX engine with specialized raw LaTeX command normalization (`\frac`, `\sqrt`, `\text`, `\theta`, `\cos`, `\operatorname{Re}`, matrices, sub/superscripts). Mathematical derivations, equations, and chemical formulas render with crisp textbook elegance — zero mashed words or broken parse markers.
- 🧠 **Dual-Engine Active Recall & Spaced Repetition** — Instant generation of two-sided flip flashcards with mastery confidence ratings (`Again`, `Hard`, `Good`, `Easy`) and 3-tier difficulty practice quizzes (`Easy`, `Medium`, `Hard`) complete with detailed step-by-step explanations and source page references.
- 🎙️ **Grounded AI Teacher with Hands-Free Voice Mode** — Engage with an interactive AI tutor trained exclusively on your uploaded document text. Features streaming responses, multi-conversation history, citation source badges, and a browser-native voice mode with auto-send pause detection and audio visualizers.
- 🔍 **Hybrid RAG & pgvector HNSW Semantic Retrieval** — External Jina AI Embeddings API (`jina-embeddings-v3`, 1024-dim multilingual) with lightweight `httpx`, coupled with PostgreSQL pgvector HNSW indexing and Reciprocal Rank Fusion (65% vector cosine similarity + 35% keyword search) for low-memory hosting (<50 MB RAM).
- 🔒 **Private & Cloud-Isolated Storage** — Secure multi-tenant authentication via Clerk, private server-side presigned streaming from Neon Object Storage (S3-compatible), and isolated per-user PostgreSQL database schemas.

---

## Architecture & Technology Stack

| Layer | Subsystem / Capability | Status | Technical Stack |
| --- | --- | :---: | --- |
| **Frontend Web App** | Modern Study Dashboard & Workspace | 🟢 **Active** | Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS v4, shadcn/ui |
| **Math & Formula Engine** | Textbook Equation Rendering | 🟢 **Active** | KaTeX, Custom LaTeX Prose Parser, Regex Normalization |
| **Voice Interface** | Hands-Free Speech Interaction | 🟢 **Active** | Web Speech API (STT & TTS), Audio Visualizers, SpeechSynthesis |
| **Backend REST API** | Business Logic & Workflow Engine | 🟢 **Active** | Python 3.11+, FastAPI, Pydantic v2, Pydantic Settings |
| **Asynchronous Workers** | Background PDF Extraction & AI Jobs | 🟢 **Active** | Celery, Redis, Solo Pool worker orchestration |
| **PDF Extraction Engine** | Text, Layout & Structure Ingestion | 🟢 **Active** | PyMuPDF (`fitz`), Structural Cleaning Pipeline |
| **Database & Vector Store** | Relational Data & Semantic Embeddings | 🟢 **Active** | Neon PostgreSQL, SQLAlchemy 2.x, Psycopg 3, pgvector (HNSW Indexing) |
| **Object Storage** | Encrypted Document Store | 🟢 **Active** | Neon Object Storage (S3-compatible), `boto3` client, private bucket |
| **AI Generation Engine** | Structured Study Artifact Generation | 🟢 **Active** | Kilo Gateway, OpenAI-compatible Provider Abstraction, JSON Schema healing |
| **Semantic Retrieval (RAG)** | Document Chunking & Hybrid Search | 🟢 **Active** | Jina AI Embeddings (`jina-embeddings-v3`, 1024-dim), HNSW Cosine Similarity, RRF |
| **Authentication & IAM** | Identity, Sessions & Protected Routes | 🟢 **Active** | Clerk, Asymmetric RS256 JWKS JWT verification |

---

## Core Capabilities & Features

### 📚 1. Document Intelligence & Structural Extraction
- **PyMuPDF Pipeline**: High-speed extraction of text, headers, sub-sections, and page boundaries while filtering out visual noise and redundant whitespace.
- **Smart Title Extraction**: Automated heuristic and AI-powered document naming that replaces cryptic file hashes (e.g. `ch_05_final_v2.pdf`) with clean, syllabus-accurate names (e.g. *CBSE Class 11 Mathematics: Complex Numbers and Quadratic Equations*).
- **Asynchronous Task Reconciler**: Background Celery job reconciliation (`python -m app.cli reconcile`) to seamlessly resume extraction or processing tasks across server restarts.

### 🧮 2. Textbook-Grade KaTeX Math & Science Typesetting
- **Zero-Error Parsing**: Handles complex inline and block mathematical equations, fractions (`\frac{a}{b}`), roots (`\sqrt{x}`), trigonometric identities, Greek symbols (`\alpha`, `\beta`, `\theta`, `\pi`), and complex number operators (`\operatorname{Re}`, `\operatorname{Im}`, `\bar{z}`).
- **Prose vs. Math Auto-Separation**: Distinguishes English sentences from raw LaTeX snippets even when AI output omits explicit `$...$` delimiters, completely eliminating mashed word strings (e.g., prevents `themodulusis` or `apositiverealnumbera`).

### 📝 3. Smart Interactive Study Notes
- **Structured Overview & Key Takeaways**: Multi-section chapter breakdown with page citations, bulleted revision points, and essential terminology glossaries.
- **Collapsible Section Navigation**: Interactive chapter navigation drawer with page-range indicators and instant section jumps.
- **Dynamic Content Regeneration**: Generate additional notes or re-synthesize summary points tailored to specific exam boards or study goals.

### 🧠 4. Active Recall Flashcards
- **Interactive 3D Flip Cards**: Sleek animated flashcards covering core definitions, formulas, and conceptual laws.
- **SM-2 Spaced Repetition Logic**: Track mastery status with confidence ratings (`Again`, `Hard`, `Good`, `Easy`) and persistent progress indicators.
- **Difficulty & Topic Filtering**: Filter deck by difficulty or shuffle cards for active testing sessions.

### 🎯 5. Adaptive Practice Quizzes & Questions
- **Graded Multiple-Choice Questions**: 3 difficulty tiers (`Easy`, `Medium`, `Hard`) with randomized distractors and immediate validation feedback.
- **Explanatory Answer Keys**: Step-by-step mathematical derivations and conceptual explanations explaining why each option is correct or incorrect.
- **Custom Practice Set Generation**: On-demand "Generate More" and "Regenerate" actions allowing students to expand quiz decks on difficult sub-topics.

### 🎙️ 6. Grounded AI Teacher & Hands-Free Voice Mode
- **Zero Hallucination Grounding**: The AI Teacher answers questions exclusively using citations from the student's uploaded document.
- **Multi-Turn Chat History**: Persistent conversation drawer enabling students to branch into different topics or retain context across study sessions.
- **Hands-Free Real-Time Voice Overlay**: Integrated speech recognition (STT) with silence-detection auto-send and crystal-clear speech synthesis (TTS) in both English and Hindi.
- **Audio-Reactive Visualizer**: Animated sound wave Orb providing visual feedback during listening, thinking, and speaking states.

### ⚡ 7. Hybrid RAG & Vector Intelligence
- **Low-Memory Jina AI Embeddings**: High-performance multilingual embeddings (`jina-embeddings-v3`, 1024 dimensions) via lightweight HTTP API (`httpx`), slashing RAM usage from 300MB to <50MB on budget hosts like Wispbyte.
- **pgvector HNSW Indexing**: High-performance approximate nearest neighbor search directly inside PostgreSQL.
- **Reciprocal Rank Fusion (RRF)**: Combines dense vector cosine similarity (65% weight) with sparse keyword matching (35% weight) for exact formula and definition lookups with graceful fallback.

---

## Two Components, One Repository

```text
notemint/
├── frontend/                     # Next.js 16 Web Application (App Router)
│   ├── app/                      # Page routes (/dashboard, /study/[id], /sign-in, /sign-up)
│   ├── components/               # UI components & Design System
│   │   ├── brand/                # NoteMint logo, badges, and brand assets
│   │   ├── dashboard/            # Workspaces, sidebar, study tabs, AI Teacher chat, voice
│   │   └── ui/                   # Button, Card, FormattedMathText, Dialogs, Tooltips
│   ├── hooks/                    # Custom React hooks (useAudioPlayback, useSpeechRecognition)
│   ├── lib/                      # Backend API client, Clerk helpers, utilities
│   └── public/                   # Static assets, logos, and icons
├── backend/                      # High-Performance FastAPI Application
│   ├── alembic/                  # Database migration versions & env configurations
│   ├── app/
│   │   ├── api/v1/               # API endpoints (health, auth, users, documents, ai, rag)
│   │   ├── core/                 # Config (Pydantic), logging, Celery app, JWT auth
│   │   ├── db/                   # SQLAlchemy engine, session lifecycle, migrations
│   │   ├── integrations/         # Neon S3-compatible Object Storage (boto3) client
│   │   ├── models/               # Database ORM models (User, Document, Chunk, Conversation)
│   │   ├── repositories/         # Database persistence & query layer
│   │   ├── services/             # Extraction, AI generation, FastEmbed RAG, and Vector search
│   │   ├── cli.py                # Maintenance CLI (reconcile, index-documents)
│   │   └── main.py               # Application entry point & CORS middleware
│   ├── tests/                    # Pytest test suite (unit, integration, and auth tests)
│   └── pyproject.toml            # Dependencies and build system
├── docs/                         # Architecture guidelines & specifications
├── learnings/                    # Phase-by-phase implementation logs (Phases 1-11)
├── README.md                     # Project documentation
└── .gitignore                    # Git tracking rules
```

---

## Quick Start

### Prerequisites

- **Node.js**: `20.9+` (Node 22 or 26 recommended) & `npm`
- **Python**: `3.11+` & `pip`
- **PostgreSQL**: Neon PostgreSQL database instance (with `pgvector` extension enabled)
- **Redis**: Local or cloud Redis instance (for Celery background tasks)
- **Clerk Account**: Free Clerk account for authentication keys

---

### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create & activate Python virtual environment
python -m venv .venv
.venv\Scripts\activate            # Windows
# source .venv/bin/activate      # macOS/Linux

# Install backend dependencies in editable mode
pip install -e ".[dev]"

# Configure environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL, CLERK_*, NEON_STORAGE_*, and KILO_API_KEY

# Run database migrations
python -m alembic upgrade head

# Start FastAPI development server (defaults to http://localhost:8000)
uvicorn app.main:app --reload --port 8000
```

*Interactive API Docs*: [http://localhost:8000/docs](http://localhost:8000/docs)  
*Alternative ReDoc*: [http://localhost:8000/redoc](http://localhost:8000/redoc)

#### Start Background Processing Worker (Optional but recommended for PDF extraction)

```bash
# In a separate terminal with .venv activated:
celery -A app.core.celery_app worker --loglevel=info -P solo
```

---

### 2. Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local
# Edit .env.local with NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY

# Start Next.js development server with Turbopack
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## Environment Configuration

### Frontend (`frontend/.env.local`)

```env
# Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:8000

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard
```

### Backend (`backend/.env`)

```env
# Application Settings
APP_NAME=NoteMint API
APP_ENV=development
API_V1_PREFIX=/api/v1
FRONTEND_URL=http://localhost:3000
LOG_LEVEL=INFO

# Clerk Authentication (JWT Verification)
CLERK_JWKS_URL=https://your-instance.clerk.accounts.dev/.well-known/jwks.json
CLERK_ISSUER=https://your-instance.clerk.accounts.dev
CLERK_AUTHORIZED_PARTIES=http://localhost:3000
CLERK_AUDIENCE=

# Neon PostgreSQL Database
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST/neondb?sslmode=require
DIRECT_DATABASE_URL=              # Optional direct connection string for migrations

# Neon Object Storage (S3-Compatible Private Storage)
AWS_ACCESS_KEY_ID=nak_live_...
AWS_SECRET_ACCESS_KEY=nsk_live_...
AWS_ENDPOINT_URL_S3=https://<branch-endpoint>.storage.neon.tech
AWS_REGION=ap-southeast-1
NEON_STORAGE_BUCKET=notemint-files

# Background Task Queue
REDIS_URL=redis://localhost:6379/0
CELERY_TASK_ALWAYS_EAGER=false

# AI Generation Engine (Kilo Gateway / OpenAI-Compatible)
KILO_API_KEY=kilo_live_...
KILO_BASE_URL=https://api.kilo.ai/api/gateway
KILO_MODEL=kilo-auto/free
AI_REQUEST_TIMEOUT_SECONDS=120
AI_MAX_OUTPUT_TOKENS=4096
AI_TEMPERATURE=0.3
AI_MAX_CONTEXT_TOKENS=16000
AI_MAX_RETRIES=3

# Semantic RAG & Vector Intelligence
RAG_ENABLED=true
EMBEDDING_PROVIDER=local
EMBEDDING_MODEL=BAAI/bge-small-en-v1.5
EMBEDDING_DIMENSIONS=384
RAG_CHUNK_TARGET_TOKENS=450
RAG_CHUNK_OVERLAP_TOKENS=75
RAG_TOP_K=8
RAG_MAX_CONTEXT_TOKENS=12000
RAG_VECTOR_WEIGHT=0.65
RAG_KEYWORD_WEIGHT=0.35
RAG_INDEX_BATCH_SIZE=32
RAG_MAX_INDEX_RETRIES=3
```

---

## Maintenance & CLI Commands

NoteMint includes built-in operational CLI commands for managing documents, database states, and embeddings:

| Command | Subsystem | Description |
| --- | --- | --- |
| `python -m app.cli reconcile` | Backend CLI | Scans for pending or interrupted PDF extractions and re-enqueues them to Celery. |
| `python -m app.cli index-documents` | Vector RAG | Generates Jina AI embeddings and backfills pgvector tables for all documents. |
| `python -m alembic upgrade head` | Migrations | Applies all pending database migrations to the PostgreSQL database. |
| `python -m alembic revision --autogenerate -m "msg"` | Migrations | Creates a new auto-generated migration based on SQLAlchemy model changes. |
| `python -m alembic check` | Migrations | Detects schema drift between SQLAlchemy ORM models and live PostgreSQL schema. |
| `python -m pytest` | Testing | Runs the backend unit and integration test suite. |
| `npm run build` | Frontend | Runs Next.js production build, bundling, and strict TypeScript verification. |
| `npm run lint` | Frontend | Checks code formatting and ESLint rules. |

---

## Health & Verification Endpoints

The FastAPI backend exposes deep health probes to verify live database, object storage, and service states:

```bash
# Core API Service Check
curl http://localhost:8000/api/v1/health
# => {"status":"healthy","service":"notemint-api"}

# PostgreSQL Database Connection & Vector Check
curl http://localhost:8000/api/v1/health/database
# => {"status":"ok","service":"database"}

# Neon Object Storage S3 Connectivity Check
curl http://localhost:8000/api/v1/health/storage
# => {"status":"ok","service":"storage"}

# User Authentication Profile (requires Clerk JWT)
curl http://localhost:8000/api/v1/users/me -H "Authorization: Bearer <CLERK_TOKEN>"
# => {"clerk_user_id":"user_...","email":"student@example.com",...}
```

---

## Development Roadmap & Milestones

- [x] **Phase 1: Foundation** — Design system, FastAPI skeleton, health check probes, end-to-end connectivity.
- [x] **Phase 2: Authentication** — Clerk integration, protected routing, asymmetric JWT RS256 verification.
- [x] **Phase 3: Database & Storage** — Neon PostgreSQL, SQLAlchemy 2.x, Alembic, S3-compatible private Object Storage.
- [x] **Phase 4: Workspace UI** — Resizable dual-pane study dashboard, fluid navigation, and responsive controls.
- [x] **Phase 5: Document Upload** — Chunked multipart PDF ingestion, SHA-256 deduplication, file validation.
- [x] **Phase 6: PDF Extraction Engine** — PyMuPDF (`fitz`) structural extraction, Celery background workers, Redis queue.
- [x] **Phase 7: AI Generation Engine** — Kilo Gateway integration, structured Pydantic schemas, auto-healing JSON parser.
- [x] **Phase 8: Advanced Study Workspace** — Notes viewer, 3D flip flashcards, graded MCQ quizzes, KaTeX formula formatting.
- [x] **Phase 9: AI Teacher & Interactive Tutor** — Grounded conversational chat, multi-thread history, context window management.
- [x] **Phase 9.1: Real-Time Voice Mode** — Browser-native STT/TTS voice overlay, silence detection, animated audio visualizer.
- [x] **Phase 10: Grounded RAG & Semantic Retrieval** — Jina AI Embeddings (`jina-embeddings-v3`, 1024-d), pgvector HNSW indexing, RRF search.
- [x] **Phase 11: Custom Practice Generation** — On-demand question generation, difficulty filtering, deck expansions.
- [ ] **Phase 12: Production Hardening** — End-to-end test automation, rate limiting, and zero-downtime deployment.

---

## Technical Deep Dives & Learning Logs

Extensive documentation detailing architectural decisions, error recovery recipes, and performance benchmarks is preserved in the [`learnings/`](learnings/) directory:

- 📖 [`learnings/00-project-overview.md`](learnings/00-project-overview.md) — Comprehensive architectural overview
- 📖 [`learnings/phase-01-foundation.md`](learnings/phase-01-foundation.md) — Design system & FastAPI skeleton
- 📖 [`learnings/phase-02-authentication.md`](learnings/phase-02-authentication.md) — Clerk asymmetric JWT verification
- 📖 [`learnings/phase-03-database-storage.md`](learnings/phase-03-database-storage.md) — Neon PostgreSQL & Object Storage
- 📖 [`learnings/phase-04-dashboard-ui.md`](learnings/phase-04-dashboard-ui.md) — Interactive dashboard & workspace UI
- 📖 [`learnings/phase-05-pdf-upload.md`](learnings/phase-05-pdf-upload.md) — Secure document upload system
- 📖 [`learnings/phase-06-pdf-extraction.md`](learnings/phase-06-pdf-extraction.md) — PyMuPDF text & structure extraction
- 📖 [`learnings/phase-07-ai-generation.md`](learnings/phase-07-ai-generation.md) — AI prompt engineering & JSON schema healing
- 📖 [`learnings/phase-08-study-workspace.md`](learnings/phase-08-study-workspace.md) — Interactive study workspace modules
- 📖 [`learnings/phase-09-ai-teacher.md`](learnings/phase-09-ai-teacher.md) — Grounded conversational AI teacher
- 📖 [`learnings/phase-09-voice-mode.md`](learnings/phase-09-voice-mode.md) — Real-time bilingual voice chat tutor
- 📖 [`learnings/phase-10-rag-semantic-retrieval.md`](learnings/phase-10-rag-semantic-retrieval.md) — Jina AI Embeddings, pgvector HNSW & RRF
- 📖 [`learnings/phase-11-custom-generation.md`](learnings/phase-11-custom-generation.md) — Custom practice sets & generation filters

---

## License

This project is licensed under the [MIT License](LICENSE) — see the LICENSE file for details.

---

<div align="center">

*"Turn any document into your personal, interactive classroom."* — **NoteMint**

</div>
