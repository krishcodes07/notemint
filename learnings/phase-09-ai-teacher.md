# Phase 9: AI Teacher & Interactive Chat Tutor

Status: **Complete**. Date: Phase 9 implementation session.

---

## 1. Phase Overview

Phase 9 transforms NoteMint's study workspace into an interactive, conversational learning environment. Prior to Phase 9, students had access to four generated static study resources (Smart Notes, Important Questions, Flashcards, Practice Quiz), while the fifth workspace tab, **AI Talk**, presented a coming-soon placeholder.

Phase 9 replaces this placeholder with a context-aware, document-grounded **AI Teacher**. Built on NoteMint's existing extracted textbook pages and the Kilo Gateway provider abstraction, the AI Teacher behaves like a patient, knowledgeable academic tutor: explaining complex mechanisms step-by-step, adapting its teaching mode (Explain, Simplify, Socratic), dynamically matching the student's language (English, Hindi, Hinglish), preserving conversation history across sessions, and providing verified, interactive original PDF citations that directly navigate the embedded document viewer.

---

## 2. Implemented Features

1. **Persistent Conversation Sessions**:
   - Multiple distinct chat sessions per document (`TeacherConversation`).
   - Create, list, switch, rename, and cascade-delete conversations.
   - Preserved across browser reloads, page navigation, and mobile viewports.

2. **Document-Grounded AI Explanations**:
   - High-fidelity grounding based strictly on extracted PDF page records (`DocumentPage`).
   - Dynamic prompt boundary defenses protecting against prompt injections in untrusted PDF text.
   - Safe fallbacks when queried concepts are missing from the uploaded textbook.

3. **Deterministic Relevance & Continuity Retrieval**:
   - Query normalization and stopword filtering (English and Hinglish).
   - Priority boosting for explicit page references (e.g. "on page 5", "page 12").
   - Term frequency and coverage ranking with neighbor continuity (e.g. including page N+1/N-1 when context warrants).
   - Follow-up query resolution extracting substantive concepts from recent conversational turns.
   - Modular retrieval interface (`TeacherContextRetriever`) for future Phase 10 pgvector RAG swap.

4. **Teaching Modes & Explanation Depth**:
   - **Explain**: Default balanced academic tutor clarifying concepts, terminology, and mechanisms.
   - **Simplify**: Plain words, shorter sentences, and everyday analogies for difficult concepts.
   - **Socratic**: Progressive guidance, intuitive clues, and leading questions without infinite loops.
   - **Depths**: Quick (concise 1-2 paragraphs), Standard (balanced), and Detailed (deep step-by-step reasoning).

5. **Trilingual Language Flexibility**:
   - Support for **Auto**, **English**, **Hindi** (Devanagari script), and **Hinglish** (natural conversational Hindi with standard technical terms in English).
   - Preserves scientific and domain terminology across all languages without awkward transliterations.

6. **Source Citations with Verification**:
   - Server-side parsing of `[Page X]` or `Page X` references.
   - Strict validation: citations are validated against actual retrieved context pages; hallucinated page references are filtered out before persistence.
   - Interactive UI pills: clicking `[Page 4]` opens the PDF viewer modal and automatically scrolls to `#page=4`.

7. **Dual-Mode Response Generation (SSE Streaming + Sync)**:
   - Server-Sent Events endpoint (`POST /conversations/{id}/messages/stream`) streaming real token deltas.
   - Synchronous endpoint (`POST /conversations/{id}/messages`) providing a robust non-streaming fallback.
   - Client cancellation via `AbortSignal` with clean stop-generation controls.

8. **Reliability & Idempotent Retry Support**:
   - Client-generated idempotency keys (`client_message_id`) prevent duplicate user submissions.
   - Failed assistant responses preserve user prompts and provide a one-click Retry button.
   - Never leaves conversations stranded in an unrecoverable "processing" state.

9. **Polished Workspace UI**:
   - Minimalist, responsive chat interface inside NoteMint's study workspace.
   - Welcome empty state with contextual starter prompts.
   - Safe Markdown rendering (headings, bullet points, numbers, bold, code blocks) without XSS risks.
   - Integrated Conversation History drawer and compact Teaching Controls popover.

---

## 3. AI Teacher Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                  Frontend Study Workspace                    │
│      (TeacherChatView, TeacherMessage, TeacherChatInput)     │
└──────────────────────────────┬───────────────────────────────┘
                               │ Authenticated JWT Request
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                    FastAPI Router (v1)                       │
│        /api/v1/documents/{doc_id}/conversations/...          │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                    TeacherChatService                        │
│   - Validates Clerk JWT & Document Ownership                 │
│   - Enforces ExtractionStatus == COMPLETED                   │
│   - Manages Idempotency & Message History Memory             │
└──────────────┬───────────────────────────────┬───────────────┘
               │                               │
               ▼                               ▼
┌──────────────────────────────┐ ┌─────────────────────────────┐
│    TeacherContextService     │ │       KiloAIProvider        │
│ - Deterministic Keyword TF   │ │ - Chat completions          │
│ - Explicit Page Mention Boost│ │ - SSE Chunk Streaming       │
│ - Neighbor Continuity        │ │ - Multi-turn Messages       │
│ - Context Budget (12k tokens)│ └─────────────┬───────────────┘
└──────────────┬───────────────┘               │
               │                               ▼
               ▼                         Kilo Gateway
┌──────────────────────────────┐   (nemotron-3-ultra-550b)
│    Neon PostgreSQL (Sync)    │
│ - teacher_conversations      │
│ - teacher_messages           │
└──────────────────────────────┘
```

---

## 4. Kilo Gateway Integration & Streaming

The AI Teacher extends NoteMint's Phase 7 provider abstraction:

```python
class BaseAIProvider(ABC):
    @abstractmethod
    def generate(self, messages: list[dict[str, str]], ...) -> AICompletionResult:
        ...

    def generate_stream(self, messages: list[dict[str, str]], ...) -> Iterator[str]:
        ...
```

`KiloAIProvider` implements native streaming over the OpenAI-compatible Kilo Gateway endpoint (`https://api.kilo.ai/api/gateway/chat/completions`):
- Sets `"stream": True` in the payload.
- Consumes HTTP streaming lines via `httpx.Client.stream("POST", ...)`.
- Parses SSE `data: {"choices": [{"delta": {"content": "..."}}]}` chunks and yields raw token deltas.
- Maps HTTP 401/403 to `AIAuthenticationError`, 402 to `AIQuotaExceededError`, 429 to `AIRateLimitError`, and timeouts to `AITimeoutError`.
- Yields SSE events formatted as:
  - `message_started`: carries user message id and assistant placeholder id.
  - `text_delta`: carries live model-generated token deltas.
  - `message_completed`: carries persisted message record, verified source pages, and token counts.
  - `message_failed`: carries safe error details on failure.

---

## 5. Prompt Construction & Personality Design

Implemented in `backend/app/ai/prompts/teacher.py`:
- **Role**: NoteMint's AI Teacher — patient, encouraging, supportive personal academic tutor.
- **Teaching Principles**:
  1. Identify student doubt.
  2. Ground explanation in textbook context.
  3. Provide concrete analogies/examples.
  4. Ask a follow-up check question only when pedagogically helpful.
- **Untrusted Context Defense**:
  - Textbook excerpts are placed inside demarcated `<textbook_context>` tags.
  - Prompt instructions explicitly prohibit following prompt injections or role-reversals found within textbook text or student queries.
- **Citation Directives**:
  - Explicit rule to cite source pages as `[Page X]` or `[Page X, Page Y]`.
  - For topics not in the textbook: clearly state the textbook does not contain sufficient details.

---

## 6. Teaching Modes & Explanation Depth

| Mode | Pedagogical Strategy | Primary Use Case |
| --- | --- | --- |
| **Explain** | Structured academic explanations with terminology, definitions, and connections | Standard exam prep & general doubt clearing |
| **Simplify** | Plain vocabulary, short sentences, and everyday analogies | Initial learning of difficult topics & beginners |
| **Socratic** | Guides with progressive clues, leading questions, and step-by-step reasoning | Problem-solving & deep conceptual testing |

Depth options:
- `quick`: 1-2 concise paragraphs summarizing the core mechanism.
- `standard`: Balanced explanation with key details and one example.
- `detailed`: Comprehensive breakdown with principles, mechanisms, and examples.

---

## 7. Language Handling

- **Auto**: Detects student language. Hinglish questions receive natural Hinglish answers.
- **English**: Fluent, grammatically structured academic English.
- **Hindi**: Natural Hindi written in Devanagari script.
- **Hinglish**: Conversational Hinglish (e.g. *"Photosynthesis ek biological process hai jisme plants sunlight aur chlorophyll use karke glucose banate hain."*).
- **Terminology Protection**: Core scientific terms (e.g. *Chloroplast*, *Thylakoid*, *Mitosis*, *Stomata*) are kept in English to preserve academic accuracy.

---

## 8. Context Retrieval Algorithm

Implemented in `backend/app/services/teacher_context_service.py`:
1. **Verification**: Checks that `DocumentExtraction` status is `completed`.
2. **Page Loading**: Filters usable pages with text content while preserving 1-based original page numbers.
3. **Explicit Page Detection**: Regex `\b(?:page|pg\.?|p\.?)\s*[:#]?\s*(\d+)\b` detects direct page mentions (e.g. "page 4") and awards a +100.0 relevance boost.
4. **Keyword Tokenization**: Strips punctuation and removes English and Hinglish stopwords.
5. **Follow-Up Query Expansion**: Examines previous conversation messages to harvest substantive topic keywords for pronoun-heavy queries (e.g. "Why is it needed?").
6. **Deterministic Scoring**:
   - Exact query phrase matches: +25.0 points.
   - Term frequency: sublinear weighting up to +10.0 points.
   - Title/heading appearance (first 250 characters): +4.0 points.
   - Keyword coverage ratio: up to +15.0 points.
7. **Neighbor Continuity**: If page N is top-ranked, pages N-1 and N+1 are checked and added if token budget permits.
8. **Token & Page Budgeting**:
   - Maximum source pages: 8 (configurable).
   - Maximum context tokens: 12,000 (configurable).
   - Per-page text length bounded at 8,000 characters to prevent starvation.

---

## 9. Conversation Memory

- Implemented via a rolling window inside `TeacherChatService._build_bounded_conversation_messages`.
- Loads the most recent completed messages from `TeacherRepository.get_recent_messages`.
- Traverses backwards, accumulating messages until the token budget (`ai_teacher_max_history_tokens = 4000`) is reached.
- Preserves chronological order `(user, assistant)` when dispatched to Kilo Gateway.

---

## 10. Database Schema & Migration

### Schema Diagram

```text
┌─────────────────────────┐
│        Document         │
├─────────────────────────┤
│ id: UUID [PK]           │
│ clerk_user_id: str      │
└────────────┬────────────┘
             │ 1:N (ON DELETE CASCADE)
             ▼
┌─────────────────────────┐
│   TeacherConversation   │
├─────────────────────────┤
│ id: UUID [PK]           │
│ document_id: UUID [FK]  │
│ clerk_user_id: str      │
│ title: str              │
│ teaching_mode: str      │
│ explanation_depth: str  │
│ preferred_language: str │
│ created_at: DateTime    │
│ updated_at: DateTime    │
└────────────┬────────────┘
             │ 1:N (ON DELETE CASCADE)
             ▼
┌─────────────────────────┐
│     TeacherMessage      │
├─────────────────────────┤
│ id: UUID [PK]           │
│ conversation_id: [FK]   │
│ role: 'user'|'assistant'│
│ content: Text           │
│ source_pages: JSON      │
│ model_name: str         │
│ input_tokens: int       │
│ output_tokens: int      │
│ status: str             │
│ error_message: Text     │
│ client_message_id: str  │
│ created_at: DateTime    │
└─────────────────────────┘
```

Alembic Migration: `5a8b7c9d0e1f_add_phase_9_teacher_tables.py`
- Upgrades `teacher_conversations` and `teacher_messages` with proper foreign keys (`ON DELETE CASCADE`), indexes on `(clerk_user_id, document_id)`, `updated_at`, and `(conversation_id, created_at)`.
- Tested and verified on SQLite and PostgreSQL.

---

## 11. Chat API Endpoints

All endpoints require Clerk Bearer JWT and verify document ownership:

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/v1/documents/{document_id}/conversations` | Create a new AI Teacher conversation |
| `GET` | `/api/v1/documents/{document_id}/conversations` | List paginated conversations for document |
| `GET` | `/api/v1/documents/{document_id}/conversations/{id}` | Get conversation metadata + chronological messages |
| `PATCH` | `/api/v1/documents/{document_id}/conversations/{id}` | Rename conversation or update mode/depth/language |
| `DELETE` | `/api/v1/documents/{document_id}/conversations/{id}` | Delete conversation and cascade messages |
| `POST` | `/api/v1/documents/{document_id}/conversations/{id}/messages` | Send message (synchronous completion) |
| `POST` | `/api/v1/documents/{document_id}/conversations/{id}/messages/stream` | Send message (Server-Sent Events streaming) |
| `POST` | `/api/v1/documents/{document_id}/conversations/{id}/messages/{msg_id}/retry` | Retry failed assistant message without duplicate prompt |

---

## 12. Citation Validation

- Raw model responses are scanned using `extract_cited_pages`:
  - Matches bracket patterns: `[Page 4]`, `[Pages 4, 5]`, `[Page 4-6]`.
  - Matches direct mentions: `Page 4`, `Page: 4`.
- Verification against retrieved context:
  `sanitize_and_verify_citations(cited_pages, allowed_pages)` verifies that each cited page number was actually retrieved and supplied to the model in `<textbook_context>`.
- Any unverified or hallucinated page numbers are omitted from the persisted `source_pages` array.

---

## 13. Frontend Components

Located in `frontend/components/dashboard/`:
- `teacher-chat-view.tsx`: Orchestrates chat sessions, optimistic messages, streaming consumption, and starter suggestions.
- `teacher-message.tsx`: Safe block and inline Markdown renderer (headings, bullet points, numbered lists, bold, code) with clickable citation pills.
- `teacher-source-citation.tsx`: Pill badge linking to original PDF viewer.
- `teacher-chat-input.tsx`: Textarea with auto-resize, Enter to send, Shift+Enter for newline, character counters, and stop-generation button.
- `teacher-mode-selector.tsx`: Modal dialog for Teaching Mode, Explanation Depth, and Language preference.
- `teacher-conversation-list.tsx`: Conversation management list with New Chat, Rename, and Delete actions.
- `uploaded-study-workspace.tsx`: Replaced tab 5 placeholder with `TeacherChatView` and enhanced `handleOpenPdf(page)` to navigate to `#page={page}&toolbar=1`.

---

## 14. Security and Privacy

- **Owner-Scoped Queries**: All database lookups strictly enforce `document.clerk_user_id == current_user.user_id`. Attempting to access another user's conversation returns HTTP 404 (preventing user enumeration).
- **Prompt Injection Defense**: PDF text is treated as untrusted data and wrapped in boundary tags. The system prompt instructs the model to ignore instructions found within textbook text.
- **Zero Token Leaks**: System tokens, API keys, and internal model configurations are never exposed in frontend responses.
- **XSS Protection**: Markdown rendering uses pure React element trees rather than `dangerouslySetInnerHTML`.

---

## 15. Testing & Verification

### Backend Pytest Suite
- 241 passed, 5 skipped (skipped live provider tests unless enabled), 0 failures across 246 collected items.
- `tests/test_teacher_models_and_repo.py`: CRUD, cascade deletion, message ordering, pagination, user isolation.
- `tests/test_teacher_context.py`: Keyword extraction, explicit page references, scoring, neighbor continuity, follow-up memory.
- `tests/test_teacher_service_and_api.py`: Synchronous send, SSE streaming events, idempotency, retry handling, citation verification, auth isolation.
- `tests/test_migrations.py`: Alembic revision `5a8b7c9d0e1f` verified.

### Frontend Verification
- `npx tsc --noEmit`: 0 TypeScript errors.
- `npm run lint`: 0 ESLint errors and 0 warnings.
- `npm run build`: Production build succeeded in 862ms, all routes compiled cleanly.

---

## 16. Current Limitations

1. **Deterministic Retrieval**: Context selection relies on keyword frequency, phrase matching, and neighbor continuity. Complex semantic synonyms (e.g. searching "energy currency" when the book only says "ATP") require explicit term overlap until vector embeddings are introduced.
2. **Context Budgeting**: Normal class textbooks (10–100 pages) work smoothly. Extremely large single-chapter pages are bounded at 8,000 characters to prevent context window overflow.
3. **No Voice Yet**: Text-based chat only; voice synthesis and transcription are reserved for future phases.

---

## 17. What Phase 10 Needs to Know

1. **Context Retriever Interface**: Phase 9 defines `TeacherContextRetriever` protocol (`retrieve(document_id, query, history, max_pages, max_tokens) -> TeacherContextResult`). Phase 10 can implement a pgvector semantic retriever and inject it into `TeacherChatService` with zero changes to the chat service, API routes, or frontend client.
2. **Page Citations**: Phase 9's citation validation and frontend navigation (`#page=N&toolbar=1`) are fully decoupled and will work seamlessly with vector chunk page metadata.
3. **Streaming Infrastructure**: The SSE streaming endpoint and client reader are fully established and tested.

