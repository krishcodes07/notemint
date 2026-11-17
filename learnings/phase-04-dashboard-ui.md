# Phase 4 - Dashboard & Study Workspace UI

Status: **Complete**. Date: Phase 4 implementation session.

## 1. Phase Overview

Phase 4 transformed NoteMint from an authentication foundation into a minimal, distraction-free study environment based directly on the hand-drawn design reference. The interface unites a personal notebook feel with a modern AI learning platform, featuring a persistent slim sidebar, an uncluttered home dashboard with a prominent study entry bar, and a dedicated study workspace with rich notes and a floating 5-tab bottom navigation bar (`Notes`, `Questions`, `Flashcards`, `Quiz`, `AI Talk`).

In addition, the landing page, header, footer, and authentication screens were completely redesigned, replacing initial placeholders with a modern, high-craft editorial design and an interactive live workspace preview.

## 2. Design Philosophy & Fidelity

The implementation strictly honors the two hand-drawn screens from the design reference:

1. **Screen 1 (Home Dashboard `/dashboard`)**:
   - Left sidebar with NoteMint wordmark, `+ New` button, `Recent` study list (`Life Processes`, `Acids, Bases & Salts`, `Trigonometry`, `Light`), and user profile footer.
   - Main content centered and spacious:
     - Personalized greeting: `"Hi [User Name], Let's Study"` with fallback `"Hi there, Let's Study"`.
     - Prominent horizontal pill input: `(+) Class 10th Biology Heredity [X] [Study ->]`.
     - Quick-dive sample topic chips.
     - Polite roadmap modal when staging custom topics (explaining Phase 5 PDF upload and Phase 7 AI generation).

2. **Screen 2 (Study Workspace `/dashboard/study/[documentId]`)**:
   - Persistent slim sidebar across all study routes with active item highlighting.
   - Header with centered document title, subject/class badge, back navigation to dashboard, and subtle divider.
   - Readable study notes area with comfortable line lengths, clear heading hierarchy, structured points, and a minimal circular bio-cycle diagram matching the hand-drawn sketch's circular illustration.
   - Floating docked bottom navigation bar with 5 interactive tools:
     - `Notes`: Formatted study notes with concept diagram.
     - `Questions`: Exam-predicted questions with model answer reveal (Phase 7 preview).
     - `Flashcards`: Interactive active-recall flip card (Phase 7 preview).
     - `Quiz`: Diagnostic MCQ quiz with real-time feedback (Phase 7 preview).
     - `AI Talk`: Context-aware bilingual chat tutor in English/Hindi (Phase 9 preview).

3. **No SaaS Clutter**:
   - Zero analytics dashboards, progress bars, vanity metric cards, or decorative illustrations.
   - Clean Geist typography, thin subtle borders, and restrained green brand accents (`--brand-primary`, `--brand-soft`).
   - Full light and dark theme support.

## 3. Architecture & Component Structure

```text
frontend/
├── app/
│   ├── layout.tsx                              # Root layout with ClerkProvider and theme script
│   ├── page.tsx                                # Redesigned landing page with live interactive preview
│   ├── sign-in/[[...sign-in]]/page.tsx         # Modern branded sign-in
│   ├── sign-up/[[...sign-up]]/page.tsx         # Modern branded sign-up
│   └── dashboard/
│       ├── layout.tsx                          # Protected shell with persistent desktop sidebar
│       ├── page.tsx                            # Home Dashboard (Screen 1)
│       └── study/
│           └── [documentId]/
│               └── page.tsx                    # Dynamic Study Workspace (Screen 2)
├── components/
│   ├── landing/
│   │   └── interactive-preview.tsx             # Interactive workspace mini-frame on landing page
│   ├── dashboard/
│   │   ├── app-sidebar.tsx                     # Desktop & drawer sidebar with brand, new button, user
│   │   ├── recent-studies.tsx                  # Recent items list with active route detection
│   │   ├── sidebar-user.tsx                    # User avatar, name, dropdown menu, Neon sync probe
│   │   ├── mobile-sidebar.tsx                  # Responsive slide-out drawer for mobile screens
│   │   ├── dashboard-header.tsx                # Mobile header bar & top-right theme controls
│   │   ├── dashboard-greeting.tsx              # Personalized "Hi [User], Let's Study"
│   │   ├── new-study-input.tsx                 # Prominent pill study entry component
│   │   ├── new-study-dialog.tsx                # Staging modal triggered by + New button
│   │   ├── study-workspace.tsx                 # Workspace container combining header, content, nav
│   │   ├── workspace-header.tsx                # Balanced title, metadata badge, dashboard back link
│   │   ├── workspace-content.tsx               # Dynamic multi-tab renderer (Notes, Questions, etc.)
│   │   ├── workspace-navigation.tsx            # Floating docked pill bottom navigation
│   │   ├── workspace-empty-state.tsx           # Reusable placeholder with planned capabilities
│   │   └── concept-diagram.tsx                 # Minimal SVG bio-cycle diagram from sketch
│   ├── ui/
│   │   ├── badge.tsx, button.tsx, card.tsx     # Existing shadcn primitives
│   │   ├── dialog.tsx                          # Radix Dialog primitive wrapper
│   │   ├── dropdown-menu.tsx                   # Radix DropdownMenu primitive wrapper
│   │   └── input.tsx                           # Input primitive
│   ├── site-header.tsx                         # Redesigned top navigation
│   ├── site-footer.tsx                         # Minimal, refined footer
│   └── theme-toggle.tsx                        # Light / dark theme toggle
└── lib/
    ├── api.ts                                  # Added UserProfileResponse & getUserProfile()
    └── mock-study-data.ts                      # Isolated mock dataset (4 subjects)
```

## 4. Routing & Protection

- `/dashboard`: Protected by `proxy.ts` middleware and server-level `AuthGuard` in `layout.tsx`. Unauthenticated visitors are redirected to `/sign-in?redirect_url=...`.
- `/dashboard/study/[documentId]`: Protected under the `/dashboard(.*)` matcher. Dynamic route params handled asynchronously as required by Next.js 16 (`await params`).
- `/sign-in` and `/sign-up`: Branded Clerk auth screens with `fallbackRedirectUrl="/dashboard"`.

## 5. Backend & Authentication Integration

- **Clerk Identity**: Used for session authentication on both frontend and backend.
- **Backend API Client (`frontend/lib/api.ts`)**:
  - `getUserProfile(getSessionToken)` calls `GET /api/v1/users/me` with `Authorization: Bearer <token>`.
  - The backend returns `UserProfileResponse` (`clerk_user_id`, `display_name`, `email`, `created_at`), creating the Neon database record on first access if absent.
  - The sidebar component (`SidebarUser`) gracefully handles `loading`, `connected`, and `error` states with a live Neon PostgreSQL sync indicator dot.

## 6. Mock Data Strategy

Mock documents are strictly isolated in `frontend/lib/mock-study-data.ts`:
- Four curated study subjects:
  1. `life-processes`: Biology, Class 10th (detailed notes, sections, definitions)
  2. `acids-bases-salts`: Chemistry, Class 10th
  3. `trigonometry`: Mathematics, Class 10th
  4. `light`: Physics, Class 10th
- Document records are typed with `StudyDocument`, `StudySection`, and metadata ready for Phase 5 to swap with real backend PostgreSQL documents.

## 7. Responsive Design

- **Desktop (1024px+)**: Persistent slim sidebar on the left, centered spacious content, bottom floating navigation pill bar.
- **Tablet (768px - 1023px)**: Slim sidebar preserved with balanced reading column width.
- **Mobile (< 768px)**:
  - Sidebar transitions to a smooth slide-out drawer accessible via hamburger menu.
  - Main workspace content utilizes full screen width with comfortable padding.
  - Workspace navigation adapts into a compact touch-friendly bottom bar without horizontal overflow.

## 8. Verification & Testing

| Test / Check | Command / Tool | Result |
| --- | --- | --- |
| TypeScript check | `npx tsc --noEmit` | Clean (0 errors) |
| ESLint check | `npm run lint` | Clean (0 warnings, 0 errors) |
| Production build | `npm run build` | Success (all 8 static/PPR routes generated) |
| Backend test suite | `pytest` | 117 passed, 1 skipped (0 failures) |
| Backend health | `GET /api/v1/health` | `healthy` |
| Database health | `GET /api/v1/health/database` | `ok` (Neon PostgreSQL) |
| Storage health | `GET /api/v1/health/storage` | `ok` (Neon Object Storage) |
| Route protection | Puppeteer Edge headless | Unauthenticated `/dashboard` -> 307 to `/sign-in` |
| Live authenticated E2E | Puppeteer Edge headless | Session verified -> `/dashboard` rendered with user greeting |
| Sidebar interactions | Puppeteer Edge headless | All 4 documents clickable, active indicator verified |
| Workspace bottom nav | Puppeteer Edge headless | All 5 tabs switch workspace content seamlessly |
| Modal staging | Puppeteer Edge headless | Custom query stages roadmap dialog |
| Responsive layout | Puppeteer Edge headless | Tested at 1280x850 (desktop) and 375x812 (mobile) |
| Theme toggle | Puppeteer Edge headless | Light and dark themes verified |

### Captured Screenshots

Screenshots saved to the artifact directory:
- `screenshot-dashboard.png`: Screen 1 desktop matching sketch.
- `screenshot-dashboard-modal.png`: Topic staging dialog.
- `screenshot-study-notes.png`: Screen 2 desktop notes with bio-cycle diagram.
- `screenshot-study-questions.png`: Questions tab with model answer reveal.
- `screenshot-study-flashcards.png`: Flashcards tab with interactive flip card.
- `screenshot-study-quiz.png`: Quiz tab with diagnostic options.
- `screenshot-study-aitalk.png`: AI Talk tab with bilingual tutor chat.
- `screenshot-study-mobile.png`: Mobile study workspace layout.
- `screenshot-dashboard-mobile.png`: Mobile dashboard layout.
- `screenshot-landing-desktop.png`: Redesigned desktop landing page.
- `screenshot-landing-mobile.png`: Redesigned mobile landing page.
- `screenshot-sign-in.png`: Redesigned sign-in screen.

## 9. Current Limitations

- Documents currently load from `frontend/lib/mock-study-data.ts`; backend document upload and ingestion are not yet connected.
- Questions, flashcards, quizzes, and AI Talk tabs display interactive preview states and roadmap summaries.
- PDF upload dropzone and OCR processing are scheduled for upcoming phases.

## 10. What Phase 5 Needs to Know

- The study workspace route `/dashboard/study/[documentId]` and `getStudyDocument(id)` are designed to easily map to the SQLAlchemy `documents` table (`backend/app/models/document.py`).
- The `+ New` button in the sidebar and the dashboard input bar (`NewStudyInput`) are ready to trigger the Phase 5 PDF upload dropzone dialog.
- The `SidebarUser` component already establishes the authenticated session and verifies the backend profile via `GET /api/v1/users/me`.

