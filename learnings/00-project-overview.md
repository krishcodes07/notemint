# NoteMint - Project Overview

Last updated: Phase 8 completion.

## Purpose

NoteMint is an AI-powered personalized learning platform. Students upload educational documents (initially PDFs), select which learning resources to generate, and an internal AI pipeline produces interactive study materials inside a dedicated workspace.

Core generated resources:

- Smart notes
- Important questions
- Short and long answer questions
- MCQ quizzes
- Flashcards
- Mind maps
- Chapter summaries

An AI Teacher (later phases) answers questions about uploaded materials with context-aware conversations, step-by-step explanations, Hindi/English support, and eventually voice.

## Technology Stack

| Layer | Technologies | Status |
| --- | --- | --- |
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui, Lucide | In use |
| Backend | Python 3.11+, FastAPI, Pydantic, Pydantic Settings | In use |
| Database | Neon PostgreSQL, SQLAlchemy 2.x (sync + Psycopg 3), Alembic | In use (Phase 3) |
| File storage | Neon Object Storage (S3-compatible), boto3 | In use (Phase 3) |
| PDF Extraction | PyMuPDF (pymupdf) | In use (Phase 6) |
| AI | Kilo Gateway, OpenAI-compatible API, provider abstraction | In use (Phase 7) |
| Auth | Clerk, backend JWT verification | In use (Phase 2) |
| Background jobs | Redis, Celery | In use (Phase 6) |
| Deployment | Vercel (frontend), Python host/VPS (backend), Neon | Planned (Phase 12) |

## Repository Structure

```text
notemint/
├── frontend/                 Next.js app
│   ├── app/                  App Router: layout, pages, globals.css
│   │   ├── dashboard/        Protected dashboard (auth guard)
│   │   ├── sign-in/          Branded Clerk sign-in
│   │   └── sign-up/          Branded Clerk sign-up
│   ├── proxy.ts              Next.js 16 middleware (clerkMiddleware)
│   ├── components/
│   │   ├── ui/               shadcn/ui primitives (button, badge, card)
│   │   ├── site-header.tsx   Landing/dashboard header + auth controls
│   │   ├── site-footer.tsx
│   │   ├── theme-toggle.tsx  Light/dark switch (useSyncExternalStore)
│   │   ├── health-status.tsx Backend connectivity card
│   │   ├── auth-controls.tsx Clerk UserButton / sign-in links
│   │   └── auth-connectivity.tsx Calls GET /api/v1/auth/me
│   ├── lib/
│   │   ├── api.ts            API client + authenticatedRequest/getMe
│   │   └── utils.ts          cn() re-export (shadcn)
│   ├── components.json       shadcn configuration
│   └── .env.example          API URL + Clerk key template
├── backend/                  FastAPI app
│   ├── app/
│   │   ├── api/v1/           health.py (+/database, /storage), auth.py, users.py
│   │   ├── core/             config.py, logging.py, security.py (JWKS)
│   │   ├── db/               base.py (DeclarativeBase), session.py (lazy engine),
│   │   │                     dependencies.py (get_db)
│   │   ├── models/           user.py, document.py (SQLAlchemy 2.x)
│   │   ├── repositories/     user_repository.py (race-safe upsert)
│   │   ├── integrations/     neon_storage.py (boto3 S3 client factory)
│   │   ├── services/         storage_service.py (private bucket operations)
│   │   ├── dependencies/     auth.py (get_current_user)
│   │   ├── schemas/          auth.py, user.py
│   │   └── main.py           App factory, CORS, exception handlers
│   ├── alembic/              env.py + versions/ (initial schema migration)
│   ├── alembic.ini           Alembic config (no credentials)
│   ├── tests/                Pytest (health, auth, database, users, storage, migrations)
│   ├── pyproject.toml        Dependencies + pytest config
│   └── .env.example          Backend env + Clerk + DATABASE_URL + AWS_* templates
├── docs/                     Project docs (empty so far)
├── learnings/                Phase-by-phase implementation notes
├── README.md                 Setup and commands
└── .gitignore                Root ignores (.env, .venv, node_modules, ...)
```

## Architectural Boundaries

- **Frontend** owns UI, client-side state, and calls the backend through `frontend/lib/api.ts`. It never holds backend secrets — only `NEXT_PUBLIC_*` variables. Clerk session tokens are attached via `authenticatedRequest`.
- **Backend** owns business logic, AI integrations (future), database access, storage access, and independent JWT verification against Clerk JWKS. API routes live under a versioned prefix (`/api/v1`). Authenticated handlers use `get_current_user`. Database and storage are only reachable through FastAPI — never from the browser.
- **Cross-cutting**: configuration is centralized (Pydantic Settings on the backend, `.env.local` on the frontend). CORS on the backend explicitly allows the frontend origin.
- Keep API routes, business logic (services), and integrations separated as the backend grows.

## Design System (Frontend)

- Brand color: green. Tokens are centralized in `frontend/app/globals.css` as `--brand-*` CSS variables and mapped to shadcn semantic variables (`--primary`, `--secondary`, `--background`, ...).
- Light theme: default (`:root`). Dark theme: `.dark` class on `<html>`, toggled by `ThemeToggle`, persisted in `localStorage("theme")`, initialized pre-hydration by an inline script (no flash).
- Typography: Geist (sans) + Geist Mono via `next/font/google`, exposed as `--font-geist-sans` / `--font-geist-mono` and wired into Tailwind's `font-sans` / `font-mono`.
- Radius is moderate (`--radius: 0.5rem`); avoid excessive gradients, animations, and shadows.

## Current Development Status

- **Completed**: Phase 1 (project foundation), Phase 2 (Clerk authentication), Phase 3 (database & storage foundation), Phase 4 (dashboard & study workspace UI), Phase 5 (PDF upload system), Phase 6 (PDF extraction engine), Phase 7 (AI integration & generation engine), Phase 8 (advanced study workspace & learning experience), Phase 9 (AI Teacher & interactive chat tutor), Phase 9.1 (AI Teacher real-time voice conversation mode).
- **Next**: Phase 10 (Grounded RAG & vector intelligence).
- Live endpoints: `GET /api/v1/health`, `GET /api/v1/health/info` (dev only), `GET /api/v1/health/database`, `GET /api/v1/health/storage` (public), `GET /api/v1/auth/me`, `GET /api/v1/users/me`, `POST /api/v1/documents`, `GET /api/v1/documents`, `GET /api/v1/documents/{id}`, `DELETE /api/v1/documents/{id}`, `GET /api/v1/documents/{id}/file`, `GET /api/v1/documents/{id}/extraction`, `POST /api/v1/documents/{id}/reprocess`, `POST /api/v1/documents/{id}/generate`, `GET /api/v1/documents/{id}/resources`, `GET /api/v1/documents/{id}/resources/{id}`, `POST /api/v1/documents/{id}/resources/{type}/regenerate`, `GET /api/v1/documents/{id}/generation-status`, `POST /api/v1/documents/{id}/quiz/{id}/submit`, `GET /api/v1/documents/{id}/flashcard-progress`, `PUT /api/v1/documents/{id}/flashcards/{res_id}/{card_id}/progress`, `GET /api/v1/documents/{id}/bookmarks`, `POST /api/v1/documents/{id}/bookmarks`, `DELETE /api/v1/documents/{id}/bookmarks/{id}`, `GET /api/v1/documents/{id}/quiz-attempts`, `GET /api/v1/documents/{id}/quiz-attempts/{id}`, `GET /api/v1/documents/{id}/study-progress`, `GET /api/v1/documents/{id}/search`, `POST /api/v1/documents/{id}/conversations`, `GET /api/v1/documents/{id}/conversations`, `GET /api/v1/documents/{id}/conversations/{id}`, `PATCH /api/v1/documents/{id}/conversations/{id}`, `DELETE /api/v1/documents/{id}/conversations/{id}`, `POST /api/v1/documents/{id}/conversations/{id}/messages`, `POST /api/v1/documents/{id}/conversations/{id}/messages/stream`, `POST /api/v1/documents/{id}/conversations/{id}/messages/{msg_id}/retry`, `POST /api/v1/documents/{id}/conversations/{id}/messages/{msg_id}/speech`, `GET /api/v1/documents/{id}/conversations/voices` (all document endpoints require Clerk Bearer JWT).
- Schema managed by Alembic (revisions `adf661b7463a`, `624960d625f2`, `3689644b7f14`, `49033a748435`, `5a8b7c9d0e1f`: `users`, `documents`, `document_extractions`, `document_pages`, `study_resources`, `flashcard_progress`, `question_bookmarks`, `quiz_attempts`, `study_activities`, `teacher_conversations`, `teacher_messages`); Neon PostgreSQL + private `notemint-files` Object Storage bucket verified live.
- Protected frontend routes: `/dashboard` and `/dashboard/study/[documentId]` (redirects to `/sign-in` when signed out).
- Live PDF upload, extraction & AI study workspace: Screen 1 (Dashboard) with personalized greeting, search input pill, `+ New` upload dialog, and dynamic recent study list with real-time extraction/generation status badges; Screen 2 (Study Workspace) supporting real AI study resources generated via Kilo Gateway: Smart Notes (with Chapter Summary toggle, TOC navigation, in-note highlighting, density switch, print styling), Important Questions (with collapsible answers, scoring criteria, and bookmark toggling), Active-Recall Flashcards (with 3D flip, keyboard shortcuts, and 0-3 mastery level persistence), Practice Quiz (with 4 options, server-side grading, in-depth explanations, attempt history drawer, and incorrect question filter), and AI Talk (full interactive AI Teacher chat tutor grounded in textbook pages with Explain, Simplify, Socratic modes, English/Hindi/Hinglish language options, persistent multi-conversation history, verified clickable source citations that jump to PDF viewer pages, SSE token streaming, idempotent retry, and hands-free real-time Voice Conversation Mode powered by browser SpeechRecognition and Microsoft Edge TTS neural speech synthesis with automated turn-taking, echo prevention, and custom voice preferences). Non-destructive regeneration, live generation polling, cross-resource scoped search modal (`⌘K`), and study progress overview ribbon. Full light/dark mode and mobile drawer responsive support.

## Key Conventions

- One phase at a time; never implement future phases early.
- Document actual implementation (not plans) in `learnings/`.
- TypeScript strict mode; Python type hints; Pydantic for validation.
- Never commit `.env` files or secrets; commit `.env.example` templates only.
- Schema changes only through Alembic (`revision --autogenerate` → review → `upgrade` → `check`); never `create_all()` in app code.
- Test after changes: `npm run lint`, `npm run build`, `python -m pytest`.
