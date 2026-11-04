# NoteMint - Project Overview

Last updated: Phase 1 completion.

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
| Database | Neon PostgreSQL, SQLAlchemy, Alembic, pgvector | Planned (Phase 3) |
| File storage | Neon Object Storage (S3-compatible), boto3 | Planned (Phase 3) |
| AI | Kilo Gateway, OpenAI-compatible API, provider abstraction | Planned (Phase 7) |
| Auth | Clerk, backend JWT verification | Planned (Phase 2) |
| Background jobs | Redis, Celery | Planned (Phase 7) |
| Deployment | Vercel (frontend), Python host/VPS (backend), Neon | Planned (Phase 12) |

## Repository Structure

```text
notemint/
├── frontend/                 Next.js app
│   ├── app/                  App Router: layout.tsx, page.tsx, globals.css
│   ├── components/
│   │   ├── ui/               shadcn/ui primitives (button, badge, card)
│   │   ├── site-header.tsx   Landing header + theme toggle
│   │   ├── site-footer.tsx
│   │   ├── theme-toggle.tsx  Light/dark switch (useSyncExternalStore)
│   │   └── health-status.tsx Backend connectivity card
│   ├── lib/
│   │   ├── api.ts            Centralized API client (NEXT_PUBLIC_API_URL)
│   │   └── utils.ts          cn() re-export (shadcn)
│   ├── components.json       shadcn configuration
│   └── .env.example          NEXT_PUBLIC_API_URL template
├── backend/                  FastAPI app
│   ├── app/
│   │   ├── api/v1/           Versioned routers (health.py)
│   │   ├── core/             config.py (Settings), logging.py
│   │   ├── services/         Empty — business logic from later phases
│   │   └── main.py           App factory, CORS, exception handlers
│   ├── tests/                Pytest (health endpoint tests)
│   ├── pyproject.toml        Dependencies + pytest config
│   └── .env.example          Backend env template
├── docs/                     Project docs (empty so far)
├── learnings/                Phase-by-phase implementation notes
├── README.md                 Setup and commands
└── .gitignore                Root ignores (.env, .venv, node_modules, ...)
```

## Architectural Boundaries

- **Frontend** owns UI, client-side state, and calls the backend through `frontend/lib/api.ts`. It never holds backend secrets — only `NEXT_PUBLIC_*` variables.
- **Backend** owns business logic, AI integrations (future), database access (future), and token verification (Phase 2). API routes live under a versioned prefix (`/api/v1`).
- **Cross-cutting**: configuration is centralized (Pydantic Settings on the backend, `.env.local` on the frontend). CORS on the backend explicitly allows the frontend origin.
- Keep API routes, business logic (services), and integrations separated as the backend grows.

## Design System (Frontend)

- Brand color: green. Tokens are centralized in `frontend/app/globals.css` as `--brand-*` CSS variables and mapped to shadcn semantic variables (`--primary`, `--secondary`, `--background`, ...).
- Light theme: default (`:root`). Dark theme: `.dark` class on `<html>`, toggled by `ThemeToggle`, persisted in `localStorage("theme")`, initialized pre-hydration by an inline script (no flash).
- Typography: Geist (sans) + Geist Mono via `next/font/google`, exposed as `--font-geist-sans` / `--font-geist-mono` and wired into Tailwind's `font-sans` / `font-mono`.
- Radius is moderate (`--radius: 0.5rem`); avoid excessive gradients, animations, and shadows.

## Current Development Status

- **Completed**: Phase 1 (project foundation).
- **Next**: Phase 2 (Clerk authentication) — not started.
- Live endpoints: `GET /api/v1/health`, `GET /api/v1/health/info` (dev only detail).

## Key Conventions

- One phase at a time; never implement future phases early.
- Document actual implementation (not plans) in `learnings/`.
- TypeScript strict mode; Python type hints; Pydantic for validation.
- Never commit `.env` files or secrets; commit `.env.example` templates only.
- Test after changes: `npm run lint`, `npm run build`, `python -m pytest`.
