# Phase 8 - Advanced Study Workspace & Learning Experience

Status: **Complete**. Date: Phase 8 implementation session.

## 1. Phase Overview

Phase 8 elevates NoteMint from an AI generation pipeline into a persistent, interactive, and personalized daily study environment.

Prior to Phase 8, students could upload documents and generate smart notes, questions, flashcards, quizzes, and summaries. However, user interactions were transient: flashcard flips were forgotten on page reload, quiz attempts vanished after navigation, questions could not be bookmarked for exam revision, and students had to manually skim long notes to locate specific concepts.

Phase 8 introduces:
1. **Persistent Flashcard Mastery Engine**: Card-by-card tracking (`mastery_level` 0 to 3, `review_count`, `correct_count`, `incorrect_count`) with three review outcomes (`again`, `learning`, `known`), mastery filter tabs, progress ribbon, and keyboard shortcuts (`1`, `2`, `3`, `Space`).
2. **Question Bookmark System**: One-click toggling of important questions with optimistic UI updates, version-safe resource affinity, and dedicated bookmark filtering.
3. **Persistent Quiz Attempts & History**: Server-side quiz submission evaluation, persisted `QuizAttempt` records with historical answer keys and scored responses, a Quiz History drawer, incorrect question filtering, and retake workflows without question regeneration.
4. **Lightweight Study Activity Logging**: `StudyActivity` ledger recording meaningful study milestones (`quiz_completed`, `flashcard_reviewed`, `question_bookmarked`, `session_completed`).
5. **Cross-Resource Search Dialog**: Fast, debounced, scoped search across all active study resources (notes, summary, questions, flashcards, quiz prompts) with snippet generation, safe term highlighting, and strict quiz answer confidentiality.
6. **Enhanced Notes Reading Experience**: Sticky table of contents pill navigation with smooth scrolling, in-note query search with safe HTML match highlighting (`<mark>`), reading density toggle (`Comfortable` vs `Compact`), and a clean print layout (`window.print()`).
7. **Aggregated Study Progress Ribbon**: Dynamic overview ribbon showing cards mastered/reviewed, questions bookmarked, and quiz attempts with latest/best scores.
8. **Sidebar Recent Studies Status Polling**: Document status badges with real-time polling during `generating` transitions.

---

## 2. Phase Objectives & Completion Status

| Objective | Description | Status |
| --- | --- | --- |
| 1. Persistent Flashcard Progress | `FlashcardProgress` model, 0–3 mastery levels, review/correct/incorrect counters | Complete |
| 2. Flashcard Mastery REST API | `GET /flashcard-progress` & `PUT /flashcards/{res_id}/{card_id}/progress` with strict ownership checks | Complete |
| 3. Question Bookmarks | `QuestionBookmark` model, unique constraint, version-safe validation | Complete |
| 4. Question Bookmark REST API | `GET /bookmarks`, `POST /bookmarks`, `DELETE /bookmarks/{id}` | Complete |
| 5. Persistent Quiz Attempts | `QuizAttempt` model with persisted submitted answers and full graded results | Complete |
| 6. Quiz History API & Client Drawer | `GET /quiz-attempts` and `GET /quiz-attempts/{id}` with historical attempt review drawer | Complete |
| 7. Study Activity Ledger | `StudyActivity` model with structured `ActivityType` enum | Complete |
| 8. Cross-Resource Search API | `GET /search` returning scoped snippets, matching sections, and strict answer masking | Complete |
| 9. Frontend Search Modal | Debounced search dialog with keyboard shortcut (`⌘K` / `Ctrl+K`) and tab deep-linking | Complete |
| 10. Enhanced Notes Reader | Local TOC pills, query highlighting, density switch, print styling | Complete |
| 11. Study Progress Overview | Aggregated metrics ribbon (`GET /study-progress`) in workspace header | Complete |
| 12. Alembic Migration | `49033a748435_add_phase_8_study_progress_tables.py` applied to Neon PostgreSQL | Complete |
| 13. Automated Test Suite | 222 backend unit/integration tests passing with 0 failures | Complete |
| 14. Frontend Verification | Clean Next.js 16 build (`npm run build`), 0 TypeScript errors, 0 ESLint errors | Complete |

---

## 3. Database Schema & Architecture

### Entity Relationship Diagram

```text
┌─────────────────────────┐
│          User           │
├─────────────────────────┤
│ id: UUID [PK]           │
│ clerk_user_id: str [UQ] │
└────────────┬────────────┘
             │ 1:N
             ▼
┌─────────────────────────┐         ┌─────────────────────────┐
│        Document         │ 1:N     │      StudyResource      │
├─────────────────────────┼────────►├─────────────────────────┤
│ id: UUID [PK]           │         │ id: UUID [PK]           │
│ clerk_user_id: str      │         │ document_id: UUID [FK]  │
│ status: enum            │         │ resource_type: enum     │
└────────────┬────────────┘         │ content: JSONB          │
             │                      │ is_active: bool         │
             │                      │ version: int            │
             │                      └────────────┬────────────┘
             │                                   │
             ├─────────────────┬─────────────────┼─────────────────┐
             │ 1:N             │ 1:N             │ 1:N             │ 1:N
             ▼                 ▼                 ▼                 ▼
┌─────────────────────┐ ┌───────────────────┐ ┌──────────────────┐ ┌───────────────────┐
│  FlashcardProgress  │ │ QuestionBookmark  │ │   QuizAttempt    │ │   StudyActivity   │
├─────────────────────┤ ├───────────────────┤ ├──────────────────┤ ├───────────────────┤
│ id: UUID [PK]       │ │ id: UUID [PK]     │ │ id: UUID [PK]    │ │ id: UUID [PK]     │
│ clerk_user_id: str  │ │ clerk_user_id: str│ │ clerk_user_id:str│ │ clerk_user_id: str│
│ document_id: [FK]   │ │ document_id: [FK] │ │ document_id:[FK] │ │ document_id: [FK] │
│ resource_id: [FK]   │ │ resource_id: [FK] │ │ resource_id:[FK] │ │ resource_id: [FK] │
│ card_id: str        │ │ question_id: str  │ │ total_questions  │ │ activity_type:enum│
│ mastery_level: 0..3 │ │ created_at        │ │ correct_answers  │ │ created_at        │
│ review_count: int   │ └───────────────────┘ │ score_percentage │ └───────────────────┘
│ correct_count: int  │                       │ submitted_answers│
│ incorrect_count: int│                       │ graded_result    │
│ last_reviewed_at    │                       │ completed_at     │
└─────────────────────┘                       └──────────────────┘
```

### Table Definitions & Constraints

1. **`flashcard_progress`**:
   - Foreign Keys: `document_id -> documents.id ON DELETE CASCADE`, `resource_id -> study_resources.id ON DELETE CASCADE`.
   - Unique Constraint: `uq_flashcard_progress_user_resource_card (clerk_user_id, resource_id, card_id)`.
   - Indexes: `ix_flashcard_progress_user_doc (clerk_user_id, document_id)`.
2. **`question_bookmarks`**:
   - Foreign Keys: `document_id -> documents.id ON DELETE CASCADE`, `resource_id -> study_resources.id ON DELETE CASCADE`.
   - Unique Constraint: `uq_question_bookmarks_user_res_question (clerk_user_id, resource_id, question_id)`.
   - Indexes: `ix_question_bookmarks_user_doc (clerk_user_id, document_id)`.
3. **`quiz_attempts`**:
   - Foreign Keys: `document_id -> documents.id ON DELETE CASCADE`, `resource_id -> study_resources.id ON DELETE CASCADE`.
   - Indexes: `ix_quiz_attempts_user_doc (clerk_user_id, document_id)`.
4. **`study_activities`**:
   - Foreign Keys: `document_id -> documents.id ON DELETE CASCADE`, `resource_id -> study_resources.id ON DELETE SET NULL`.
   - Indexes: `ix_study_activities_user_doc (clerk_user_id, document_id)`.

---

## 4. Key Implementation Details

### Flashcard Mastery Logic
- Review outcome mapping:
  - `known`: `mastery_level = min(3, mastery_level + 1)`, `correct_count += 1`.
  - `learning`: `mastery_level = 1` (transitions unstudied, familiar, or mastered cards directly to Level 1 "Learning").
  - `again`: `mastery_level = max(0, mastery_level - 1)`, `incorrect_count += 1`.
- Both review count and `last_reviewed_at` update on every interaction.
- Front-end keyboard shortcuts: `1` = Again, `2` = Learning, `3` = Know It, `Space` = Flip card.

### Question Bookmark System
- Client displays interactive bookmark ribbon on each question card.
- Supports filtering: `All Questions`, `Bookmarked`, and difficulty levels (`easy`, `medium`, `hard`).
- Resource version isolation: Bookmarks are scoped to `(resource_id, question_id)`. If a student regenerates questions, older bookmarks remain intact in the database for the previous version without contaminating the new generation.

### Persistent Quiz Submissions & Review Drawer
- On quiz submission, `AIGenerationService.grade_quiz` computes the score server-side against the secret answer key stored in `study_resources.content`.
- The submission creates a `QuizAttempt` row storing `total_questions`, `correct_answers`, `score_percentage`, `submitted_answers` (map of question ID to chosen option), and `graded_result` (full breakdown with explanations and page citations).
- A `quiz_completed` event is logged to `study_activities`.
- Historical attempts are viewable in the Quiz History drawer, allowing students to inspect previous scores and review exactly which questions were correct or missed.
- An "Incorrect only" filter switch allows rapid targeted revision of weak areas.

### Scoped Search Across Active Resources
- Scoped strictly to the active version of resources belonging to the authenticated user's document.
- Matches across:
  - Notes: section headings, body paragraphs, bullet points, terminology terms/definitions.
  - Summaries: overview, key takeaways, rapid revision summaries.
  - Questions: question text, model answers, scoring criteria.
  - Flashcards: front prompts and back answers.
  - Quizzes: question prompts and options.
- **Security Guarantee**: Unsubmitted quiz correct answer keys and answer explanations are explicitly masked from search results to prevent students from cheating during an active quiz attempt.

### Notes Reading Enhancements
- Sticky Table of Contents navigation pills with smooth element scrolling (`scrollIntoView({ behavior: 'smooth' })`).
- In-page search bar with query counter and `<mark className="bg-brand-100 text-brand-900 rounded px-0.5">` safe highlighting.
- Density toggle: `Comfortable` (spacious reading) vs `Compact` (dense revision mode).
- Dedicated print stylesheet hiding navigation chrome, buttons, and sidebars for clean paper or PDF printing.

---

## 5. Verification & Testing

### Backend Test Suite
- `tests/test_study_progress.py`: 17 dedicated tests covering:
  - Mastery progression logic (`again`, `learning`, `known`).
  - Bookmark creation, listing, duplicate rejection, and deletion.
  - Quiz attempt persistence, calculation verification, and attempt retrieval.
  - Quiz answer key confidentiality during cross-resource search.
  - Study progress overview metrics aggregation.
  - Cross-user authorization isolation.
- `tests/test_migrations.py`: 10 migration tests verifying migration consistency, bidirectional execution, and schema constraints.
- Total Backend Suite: **222 passed, 2 skipped, 0 failures**.

### Frontend Build & Lint Verification
- `npx tsc --noEmit`: 0 errors.
- `npm run lint`: 0 errors, 0 warnings.
- `npm run build`: Production build completed successfully via Next.js 16 (Turbopack) with static and partial-prerendered routes.

---

## 6. Scope Boundaries & Next Steps

Phase 8 strictly focuses on the study workspace experience and learning state persistence. The following capabilities are explicitly reserved for future phases:
- **Phase 9**: AI Teacher / interactive chat tutor with context-aware document grounding.
- **Phase 10**: Retrieval-Augmented Generation (RAG) with vector embeddings (`pgvector`) and semantic similarity search.
- **Phase 11**: Multi-modal enhancements, audio narration, and speech-to-text.
- **Phase 12**: Production deployment, telemetry, and automated performance monitoring.

