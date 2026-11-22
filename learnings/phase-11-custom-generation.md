# Phase 11: Advanced AI Generation & Custom Practice

## 1. Executive Summary

Phase 11 introduces **On-Demand AI Generation & Custom Practice** to NoteMint. Prior to this phase, NoteMint generated a single fixed baseline set of study materials upon document upload: 15 important questions, 20 active-recall flashcards, and 10 multiple-choice quiz questions. Once students reviewed those materials, their only recourse was regenerating the entire set—which obliterated previously reviewed flashcards, question bookmarks, and test history.

Phase 11 fundamentally elevates the student workflow by introducing **additive custom practice sets**. Students can request additional questions, flashcards, or quiz questions at any time, choosing from:
- **Difficulty:** `easy`, `medium`, `hard`, or `random` (mixed) with cognitive-tier prompts.
- **Quantity:** 5, 10, 15, 20, or 30 items per request, subject to server-side bounds.
- **Focus Topic (Optional):** Chapter sub-topics automatically discovered from active study notes and summary headings.
- **Two-Layer Deduplication:** Prompt-level avoidance of existing items combined with a deterministic, programmatic token-similarity deduplication engine on the backend.
- **Safe Append Semantics:** Generating additional practice never deletes, replaces, or resets baseline content, bookmarks, flashcard review mastery levels, or historical quiz attempts.
- **Background Orchestration:** Requests process asynchronously via Celery and Redis, providing real-time UI banners and polling while preserving workspace responsiveness.
- **Practice Sets & Aggregated Views:** Clean UI filtering by batch and difficulty, Practice Set selectors for quizzes, and unified deck mastery for flashcards.

---

## 2. System Architecture & Relational Design

The architecture extends NoteMint's existing multi-tier stack without rewriting existing generation engines:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Next.js 16 (App Router)                         │
│  - GenerateMoreDialog (Difficulty, Quantity, Topic)                    │
│  - StudyQuestionsView (Aggregated Questions, Filters, Bookmarks)       │
│  - StudyFlashcardsView (Aggregated Deck, Mastery, Batch Filter)        │
│  - StudyQuizView (Practice Set Selector, Sanitized MCQs, History)      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / JSON (Bearer JWT Auth)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          FastAPI Web Backend                           │
│  - AdditionalGenerationService                                         │
│  - Two-Layer Deduplication Engine (Normalized Jaccard Similarity)      │
│  - Server-Side Practice Set Quiz Grading                               │
│  - Topic Discovery (Notes / Summary Headings)                          │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    ▼                                ▼
   ┌────────────────────────────────┐ ┌────────────────────────────────┐
   │        Celery Task Pool        │ │       Neon PostgreSQL DB       │
   │  - execute_additional_gen     │ │  - study_generation_batches     │
   │  - Idempotent deduplication    │ │  - study_resources (batch_id)   │
   │  - Kilo Gateway AI completion  │ │  - flashcard_progress           │
   │  - Page clamping & validation  │ │  - question_bookmarks           │
   └────────────────────────────────┘ │  - quiz_attempts               │
                                      └────────────────────────────────┘
```

### Relational Invariant
Existing study progress tables (`flashcard_progress`, `question_bookmarks`, and `quiz_attempts`) have non-nullable foreign keys pointing to `study_resources.id`. To guarantee complete referential integrity without breaking existing schemas or requiring complex multi-table joins:
1. Each completed generation batch creates an immutable row in `study_resources` with `generation_batch_id = batch.id` and `is_active = True`.
2. Base resource regeneration (`activate_successful_resource`) scopes its deactivation strictly to `generation_batch_id.is_(None)`. As a result, regenerating baseline notes or flashcards never deactivates practice batches.
3. Batch resources and base resources are aggregated dynamically by `AdditionalGenerationService` to present unified collections to the frontend.

---

## 3. Data Models & Database Migrations (PostgreSQL + Alembic)

### `StudyGenerationBatch` Model (`app/models/study_generation_batch.py`)
```python
class BatchStatus(str, enum.Enum):
    PENDING = "pending"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"

class StudyGenerationBatch(Base):
    __tablename__ = "study_generation_batches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    resource_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("study_resources.id", ondelete="SET NULL", use_alter=True, name="fk_study_generation_batches_resource_id"), nullable=True)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    difficulty: Mapped[str] = mapped_column(String(20), nullable=False, default="random")
    requested_count: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    generated_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    topic: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[BatchStatus] = mapped_column(Enum(BatchStatus, native_enum=False), nullable=False, default=BatchStatus.PENDING)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

### `StudyResource` Additions (`app/models/study_resource.py`)
- `generation_batch_id`: `UUID | None` (Foreign Key to `study_generation_batches.id`, indexed).
- `difficulty`: `String(20) | None` (`easy`, `medium`, `hard`, `random`).
- `topic`: `String(255) | None`.

### Alembic Migration (`8d9e0f1a2b3c_add_phase_11_generation_batches.py`)
Tested bidirectionally against Neon PostgreSQL:
- `upgrade()`: Creates `study_generation_batches` table with indices on `document_id`, `status`, and `resource_type`. Adds `generation_batch_id`, `difficulty`, and `topic` columns to `study_resources`. Establishes foreign keys with `use_alter=True` to resolve circular dependencies.
- `downgrade()`: Safely drops foreign keys, columns, and tables without data corruption.

---

## 4. AI Provider & Kilo Gateway Difficulty-Tuned Prompts

### Cognitive Tier Definitions

Prompt templates (`app/ai/prompts/questions.py`, `flashcards.py`, `quiz.py`) were updated with explicit cognitive tiers rather than naive labels:

| Tier | Questions Focus | Flashcards Focus | Quiz MCQs Focus |
| :--- | :--- | :--- | :--- |
| **Easy** | Definitions, factual recall, foundational terminology, direct textbook statements. | Direct definitions, simple formulas, key dates, basic terms. Answers < 25 words. | Factual recall, standard terminology, unambiguous single-step distractors. |
| **Medium** | Concept application, mechanisms, cause-and-effect, moderate explanations. | Process steps, relationships between principles, moderate recall. Answers < 35 words. | Conceptual application, comparative scenarios, plausible distractors testing common misconceptions. |
| **Hard** | Multi-step reasoning, analytical comparison, edge cases, higher-order synthesis. | Deep active recall, comparative differences, complex mechanics. Concise answers < 45 words. | Higher-order reasoning, multi-stage deductions, subtlety in distractors requiring deep understanding. |
| **Random / Mixed** | Calculated balanced distribution: e.g., for 10 items: 3 Easy, 4 Medium, 3 Hard. | Balanced distribution matching student level across all document concepts. | Balanced distribution across all three cognitive tiers with explicit count quotas. |

### Balanced Distribution Formula
In `compute_questions_difficulty_distribution(count, difficulty)`:
- `easy`: 100% easy.
- `medium`: 100% medium.
- `hard`: 100% hard.
- `random`: 30% easy, 40% medium, 30% hard (adjusted with remainder distribution so total equals `count` exactly).

---

## 5. Programmatic Deduplication & Token Similarity Engine

To guarantee students never receive repeated or thinly paraphrased items, Phase 11 implements a **two-layer deduplication architecture**:

### Layer 1: Prompt-Level Duplicate Avoidance
Before invoking Kilo Gateway, the backend extracts the text of all existing items for that document (questions, flashcard fronts, or quiz question stems) and passes them into the prompt under a `<do_not_repeat>` instruction block.

### Layer 2: Deterministic Programmatic Deduplication
LLMs can occasionally disregard negative prompt constraints. Therefore, `AdditionalGenerationService._deduplicate_and_stabilize` applies deterministic programmatic deduplication:
1. **Text Normalization:**
   - Lowercases text.
   - Strips non-alphanumeric punctuation.
   - Normalizes whitespace.
   - Strips leading question words ("what is", "explain", "describe", "define", "how does").
2. **Jaccard Token Similarity:**
   $$\text{Similarity}(A, B) = \frac{|T_A \cap T_B|}{|T_A \cup T_B|}$$
   If similarity exceeds the configured threshold ($0.75$), the newly generated item is classified as a duplicate and pruned before database insertion.
3. **ID Stabilization:** All generated IDs are sanitized and prefixed with the batch ID (e.g. `batch-b7a1f...-q1`) to avoid collision with base item identifiers.

---

## 6. Study Generation Batch Lifecycle & State Machine

```
              ┌───────────────┐
              │    PENDING    │
              └───────┬───────┘
                      │ Celery task dequeued
                      ▼
              ┌───────────────┐
              │  GENERATING   │
              └───────┬───────┘
                      │
         ┌────────────┴────────────┐
         │ Valid items > 0         │ Exception / 0 valid items
         ▼                         ▼
  ┌───────────────┐         ┌───────────────┐
  │   COMPLETED   │         │    FAILED     │
  └───────────────┘         └───────────────┘
```

1. **Pending:** Batch row created in DB, Celery task enqueued.
2. **Generating:** Task picks up request, updates status to `GENERATING`, extracts document context and active items.
3. **Completed:** AI generates items, Pydantic parses output, Layer 2 deduplication validates items, an immutable `StudyResource` row is persisted, and batch is marked `COMPLETED` with token usage and execution metrics.
4. **Failed:** If context is missing, model fails, or all items are duplicates, the batch records the exact error message in `error_message` and marks status `FAILED`. Transient errors trigger bounded Celery exponential backoff retries.

---

## 7. Asynchronous Task Orchestration (Celery + Redis)

- **Task Name:** `app.tasks.ai_generation_tasks.generate_additional_study_items_task`
- **Queue:** Celery default queue backed by Redis broker.
- **Idempotency:** Re-running a task with the same `batch_id` verifies batch status; completed batches are not re-executed.
- **Concurrent Batch Throttling:** `AdditionalGenerationService.create_batch` checks if an active batch (`PENDING` or `GENERATING`) already exists for that `(document_id, resource_type)`. If so, it returns an HTTP 409 Conflict with a helpful warning.
- **Detached Instance Safety:** Session management in `execute_additional_generation` scopes database commits and cleanly separates worker processes from FastAPI request threads.

---

## 8. Safe Append Semantics & Relational Integrity

A core mandate of Phase 11 was ensuring that generating additional practice sets never overwrites or invalidates existing materials:
- **Zero-Overwrite Guarantee:** Batch creations use `INSERT` operations on `study_resources` rather than updating existing rows.
- **Selective Deactivation:** Baseline regeneration (`StudyResourceRepository.activate_successful_resource`) applies `is_active = False` solely where `generation_batch_id.is_(None)`. Batch-generated resources remain active and unaffected.
- **Progress Preservation:** `FlashcardProgress` records link to `resource_id`. New cards start at mastery level 0 (`Not studied`), while older cards retain their mastery scores (`Learning`, `Familiar`, `Mastered`).

---

## 9. Important Questions Custom Generation & Aggregation

### Endpoint: `GET /api/v1/documents/{document_id}/aggregated/questions`
Aggregates the baseline question set and all completed practice batches into a unified list.
- Each question is decorated with:
  - `resource_id`: The ID of the owning `StudyResource` (for bookmark foreign keys).
  - `batch_id`: The UUID of the generation batch (`None` for original).
  - `batch_label`: e.g. `"Original"`, `"Batch 1 (Hard)"`, `"Batch 2 (Medium)"`.
- **UI Enhancements (`study-questions-view.tsx`):**
  - "+ Generate More" button opening the custom generation modal.
  - Active background generation banner with polling.
  - Multi-level filters: Bookmark filter, Difficulty pills (`All`, `Easy`, `Medium`, `Hard`), Answer Type (`Very Short`, `Short`, `Long`), and Batch dropdown.
  - Persistent bookmarking that functions seamlessly across both baseline and batch-generated questions.

---

## 10. Active Recall Flashcards Custom Generation & Progressive Mastery

### Endpoint: `GET /api/v1/documents/{document_id}/aggregated/flashcards`
Aggregates cards from the baseline flashcard resource and all active batch resources.
- **Unified Mastery Metrics:** Ribbon metrics (`Total Cards`, `Reviewed`, `Mastered`, `Needs Practice`) compute progress across all cards in the document deck.
- **Progress Mapping:** `updateFlashcardProgress` sends `targetResourceId = currentCard.resource_id`. Each review updates the exact `StudyResource` row the card belongs to.
- **UI Enhancements (`study-flashcards-view.tsx`):**
  - "+ Generate More" button with custom difficulty and topic selection.
  - Review status filters (`All`, `Not studied`, `Needs practice`, `Mastered`).
  - Batch dropdown filter and Difficulty selector pills.
  - Batch provenance badges on flashcards (e.g., `Batch 1 (Hard)`).

---

## 11. Practice MCQ Quiz Custom Generation & Practice Sets

### Endpoint: `GET /api/v1/documents/{document_id}/aggregated/quiz`
Returns structured practice sets and sanitized questions.
- **Practice Sets Structure:**
  - `All Combined Questions (X Questions)` (if multiple sets exist).
  - `Original Quiz (Y Questions)`.
  - `Set 1: Hard - Topic (Z Questions)`.
- **Sanitized Questions:** Correct answers and explanations are stripped before reaching the client.
- **UI Enhancements (`study-quiz-view.tsx`):**
  - Practice Set selector allowing students to take sets individually or as a comprehensive master test.
  - "+ Generate More Questions" modal integration.
  - Active generation banner with polling.
  - Post-grading review toggle (`All Questions` vs `Incorrect Only`).
  - Full historical attempt drawer tracking past scores and answers.

---

## 12. Server-Side Quiz Grading & Answer Key Security

### Critical Security Rule
**The frontend never receives `correct_option_index` or question explanations prior to grading submission.**

### Grading Endpoint: `POST /api/v1/documents/{document_id}/quiz/submit`
- **Request Body:**
  ```json
  {
    "practice_set_id": "<uuid-or-all>",
    "answers": {
      "batch-b7...-q1": 2,
      "batch-b7...-q2": 0
    }
  }
  ```
- **Evaluation Mechanism:**
  - If `practice_set_id == "all"`, evaluates against questions across all active quiz resources for that document.
  - If a specific `practice_set_id` is supplied, fetches the target `StudyResource`.
  - Calculates score percentage, counts correct answers, builds detailed `QuestionGradeResult` objects, and records an immutable `QuizAttempt` row in the database.
  - Returns `QuizSubmissionResponse` containing grades and explanations.

---

## 13. Source Attribution & Page Range Clamping

All generated items must ground themselves in the uploaded document:
- Every question, card, and quiz item includes `source_pages: list[int]`.
- Prompt instructions enforce citing only valid page numbers from the extracted document context.
- The backend validation layer clamps cited pages to `[1, document.page_count]` to prevent hallucinated references.

---

## 14. Topic Discovery & Chapter Focus Generation

### Endpoint: `GET /api/v1/documents/{document_id}/topics`
Instead of requiring manual topic entry, NoteMint automatically discovers topics from already-synthesized study notes and summary resources:
1. Inspects active `ResourceType.NOTES` content and extracts headings from `sections[].heading`.
2. Inspects active `ResourceType.SUMMARY` content and extracts items from `main_topics[].topic`.
3. Cleans, normalizes, deduplicates, and sorts the topic strings.
4. Returns an `AvailableTopicsResponse`.
5. Frontend displays these topics in the `Focus Topic (Optional)` dropdown within `GenerateMoreDialog`, along with an optional custom topic text input.

---

## 15. Workspace UI & User Experience Enhancements

- **`GenerateMoreDialog` (`generate-more-dialog.tsx`):** Small, focused modal with:
  - Difficulty selection radio cards (`Random / Mixed`, `Easy`, `Medium`, `Hard`) with descriptive badges.
  - Number of items selector chips (`5`, `10`, `15`, `20`, `30`).
  - Focus topic selector with chapter discovery and custom topic input.
  - Responsive validation and submission states.
- **Background Banner:** Displays active generation progress with spinning loader and clean dismiss buttons upon completion or failure.
- **Consistent Design Language:** Strictly adheres to NoteMint's minimalist green-accent UI tokens (`bg-brand-soft`, `text-primary`, `border-primary/20`).

---

## 16. Security, Ownership, & Multi-Tenant Authorization

- All endpoints verify Clerk JWT authentication via `get_current_clerk_user_id`.
- Document ownership is verified on every request using `DocumentRepository.get_by_id(document_id, clerk_user_id)`. If unauthorized, endpoints return HTTP 404 or 403.
- Rate limiting and size bounding prevent abuse:
  - Max items per request: `30` (configurable via `AI_ADDITIONAL_GENERATION_MAX_ITEMS`).
  - Concurrency checks prevent rapid duplicate batch generation.

---

## 17. Backend API Specification & Contract

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/documents/{id}/generate-more` | Create and enqueue an additional practice generation batch. |
| `GET` | `/api/v1/documents/{id}/generation-batches` | List generation batches with optional `?resource_type=` filter. |
| `GET` | `/api/v1/documents/{id}/generation-batches/{batch_id}` | Retrieve status and details of a specific batch. |
| `GET` | `/api/v1/documents/{id}/topics` | Retrieve auto-discovered chapter topics for focused generation. |
| `GET` | `/api/v1/documents/{id}/aggregated/questions` | Retrieve all baseline and batch questions with provenance. |
| `GET` | `/api/v1/documents/{id}/aggregated/flashcards` | Retrieve all baseline and batch flashcards with provenance. |
| `GET` | `/api/v1/documents/{id}/aggregated/quiz` | Retrieve sanitized practice sets and quiz questions. |
| `POST` | `/api/v1/documents/{id}/quiz/submit` | Grade a practice set server-side and log a quiz attempt. |

---

## 18. Frontend API Client & State Management

- **API Client (`frontend/lib/api.ts`):** Added complete TypeScript interfaces and strongly-typed request functions (`generateMoreStudyItems`, `getGenerationBatches`, `getGenerationBatch`, `getAvailableTopics`, `getAggregatedQuestions`, `getAggregatedFlashcards`, `getAggregatedQuiz`, `submitPracticeSetQuiz`).
- **State Management:**
  - Used React 19-compliant asynchronous effects with reload triggers (`reloadCardsTrigger`, `reloadQuizTrigger`) to prevent cascading renders and satisfy `react-hooks/set-state-in-effect`.
  - Optimistic bookmark toggling and flashcard rating with automatic rollback on network failure.

---

## 19. Edge Cases, Race Conditions & Failure Recovery

1. **Concurrent Duplicate Batch Prevention:** Rejecting overlapping active generation requests for the same resource type prevents race conditions and excess API consumption.
2. **Empty Generation / Total Duplicate Pruning:** If an LLM returns items identical to existing items, the programmatic deduplication engine prunes them. If zero unique items remain, the batch transitions to `FAILED` with a clear explanation rather than saving an empty resource.
3. **Detached ORM Instance Resilience:** Celery workers close and refresh DB sessions across long-running AI completion calls to prevent stale ORM object states.
4. **Network Reconnects & Polling:** Polling intervals (2.5 seconds) automatically clear on unmount or completion, preventing memory leaks and zombie loops.

---

## 20. Performance Considerations & Model Context Window Limits

- **Context Selection:** Only high-relevance extracted pages and document structure are passed to the prompt, avoiding context window exhaustion.
- **Cost Minimization:** Additional generation generates only the requested count ($5$–$30$) rather than regenerating entire sets, reducing token usage by up to 75%.
- **Token Usage Logging:** `input_tokens` and `output_tokens` are captured and stored in `study_generation_batches` and `study_resources` for billing auditability.

---

## 21. Test Strategy & Verification Results

### Backend Automated Tests (`backend/tests/test_additional_generation.py`)
20 comprehensive unit and integration tests covering:
- Cognitive tier distribution calculations (`test_compute_distribution_for_easy_medium_hard`, `test_compute_distribution_for_random_mixed`).
- Explicit difficulty, topic focus, and duplicate avoidance instructions in prompt builders.
- Two-layer deduplication (punctuation normalization, exact match, semantic paraphrase detection, distinct concept allowance).
- Service-level batch creation, authorization, and concurrency prevention.
- Persistent resource creation and batch state updates.
- Aggregated question, flashcard, and quiz response synthesis.
- Server-side practice set quiz grading and answer key concealment.
- API route status codes and payload contracts.
- Celery task execution, idempotency, and error handling.

### Test Execution Results
- `pytest tests/test_additional_generation.py`: **20 passed in 1.48s**
- Full backend suite (`pytest`): **323 passed, 3 skipped, 0 failures**

### Frontend Build & Lint Verification
- `npx eslint`: **0 errors, 0 warnings** across all Phase 11 components.
- `npx tsc --noEmit`: **0 type errors**.
- `npm run build`: **Next.js 16.4.6 production build passed in 716ms**.

---

## 22. Key Learnings & Architecture Patterns

1. **Relational Anchoring over Polymorphism:** By giving each completed generation batch an immutable `StudyResource` row with a `generation_batch_id` foreign key, we preserved all existing foreign keys from `FlashcardProgress`, `QuestionBookmark`, and `QuizAttempt` without schema refactoring.
2. **Selective Deactivation over Global Updates:** Base regeneration now explicitly filters for `generation_batch_id.is_(None)`, cleanly isolating baseline resources from user-initiated practice batches.
3. **Two-Layer Deduplication is Essential:** Models will occasionally ignore negative prompt instructions when under constrained contexts. A deterministic token similarity filter ($> 0.75$ Jaccard index) guarantees students never receive redundant questions.
4. **React 19 Linting Rules:** Calling state setters synchronously within effect bodies causes cascading render warnings in modern React. Moving fetches inside effects with reload trigger states provides idiomatic, bug-free reactivity.

---

## 23. Cross-Phase Compatibility (Phases 1-10)

- **Phase 1-6 (Core & PDF Processing):** PDF rendering, metadata extraction, and multi-tenant document ownership remain fully intact.
- **Phase 7 (AI Generation):** Base prompt builders, schemas, and Celery tasks continue to generate initial study sets upon upload.
- **Phase 8 (Persistent Progress):** Flashcard mastery, question bookmarks, and quiz attempts are completely preserved and aggregated across batches.
- **Phase 9 (AI Teacher & Chat):** Grounded chat tutor operates alongside new practice batches without conflict.
- **Phase 10 (Vector Search & RAG):** Vector chunking, indexing, and hybrid semantic retrieval remain fully operational across all document pages.

---

## 24. Verification Checklist & Sign-Off

- [x] Backend database migration applied cleanly (`8d9e0f1a2b3c_add_phase_11_generation_batches.py`).
- [x] Cognitive tier prompts (`easy`, `medium`, `hard`, `random`) implemented for questions, flashcards, and quizzes.
- [x] Programmatic deduplication engine active and tested.
- [x] Asynchronous Celery task enqueuing and execution tested with error resilience.
- [x] Safe append behavior verified: existing materials, bookmarks, and quiz attempts are never deleted.
- [x] Server-side practice set quiz grading operational; correct answers hidden from client.
- [x] Chapter topic discovery implemented from notes and summaries.
- [x] Frontend `GenerateMoreDialog` built and integrated in all study views.
- [x] Background generation status banner with polling functional in UI.
- [x] Full backend test suite passing (323 passed, 0 failures).
- [x] Frontend TypeScript type check and production build passing with 0 errors.
- [x] Documentation complete and verified.

