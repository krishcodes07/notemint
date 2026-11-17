# Phase 5 - PDF Upload System

Status: **Complete**. Date: Phase 5 implementation session.

## 1. Phase Overview

Phase 5 transitioned NoteMint from a static study interface with mock demo materials into a fully integrated, document-based platform. Authenticated students can now upload real PDF files directly from the dashboard via drag-and-drop or file selection. Uploads are strictly validated on the backend, streamed securely to private Neon Object Storage, indexed in Neon PostgreSQL with owner isolation, displayed in real-time in the Recent study list, and viewable in the study workspace with full authenticated PDF streaming.

## 2. Phase Objectives & Completion Status

| Objective | Description | Status |
| --- | --- | --- |
| 1. Dashboard PDF Upload | Upload PDFs from sidebar `+ New` button and dashboard pill input | Complete |
| 2. Drag-and-Drop & Picker | Support drag-and-drop zones and native file browser picker | Complete |
| 3. Backend PDF Validation | Verify `.pdf` extension, MIME type, and `%PDF-` binary magic header | Complete |
| 4. Configurable Size Limits | Enforce `MAX_UPLOAD_SIZE_MB=20` streamed during upload with 413 response | Complete |
| 5. Neon Object Storage | Store in private `notemint-files` S3-compatible bucket via boto3 | Complete |
| 6. Neon PostgreSQL Persistence | Save document metadata using existing `Document` SQLAlchemy model | Complete |
| 7. Authenticated Ownership | Bind all documents to verified Clerk `sub` identity from JWT | Complete |
| 8. Real Recent Documents | Replace mock list with real user documents in sidebar | Complete |
| 9. Document CRUD APIs | Upload, list, detail, file stream download, and delete endpoints | Complete |
| 10. Real Progress & Errors | Real XMLHttpRequest progress tracking and friendly error messages | Complete |
| 11. Study Workspace Integration | Load real document metadata and original PDF in `/dashboard/study/[id]` | Complete |
| 12. Storage/DB Consistency | Automatic S3 object cleanup if database commit or persistence fails | Complete |
| 13. Comprehensive Tests | Unit, API, isolation, pagination, storage, and live E2E tests | Complete |
| 14. Documentation | Document implementation learnings and architecture updates | Complete |

## 3. Upload Architecture

```text
Student Browser (Next.js 16)
  │
  ├─ 1. Select / Drop PDF (client validation <= 20 MB, .pdf)
  ├─ 2. uploadDocument() with XMLHttpRequest & Clerk Bearer JWT
  │      └─ Real-time progress events (xhr.upload.onprogress)
  ▼
FastAPI Router (/api/v1/documents)
  │
  ├─ 3. get_current_user dependency (verifies JWT via Clerk JWKS)
  ├─ 4. DocumentService.validate_and_upload()
  │      ├─ File signature check: inspect first 5 bytes (%PDF-)
  │      ├─ Chunked stream size counter (enforce MAX_UPLOAD_SIZE_MB)
  │      ├─ Sanitize original filename (neutralize path traversal)
  │      └─ Build canonical safe key: users/{user_id}/documents/{uuid}/original.pdf
  │
  ├─ 5. Neon Object Storage (boto3)
  │      └─ upload_fileobj() streams bytes to private notemint-files bucket
  │
  ├─ 6. Neon PostgreSQL (SQLAlchemy 2.x + Psycopg 3)
  │      ├─ UserRepository.upsert() ensures user row exists
  │      ├─ DocumentRepository.create() saves metadata (status='uploaded')
  │      └─ Commit transaction (if DB fails, S3 object is deleted immediately)
  ▼
Response (201 Created)
  │
  └─ Frontend dispatches 'notemint:documents-changed' -> Sidebar updates -> Workspace opens
```

## 4. Backend API Endpoints

All document endpoints live under prefix `/api/v1/documents` and require Bearer authentication.

| Method | Path | Status | Auth | Description |
| --- | --- | --- | --- | --- |
| `POST` | `/api/v1/documents` | 201 | Bearer | Upload PDF file (multipart/form-data, field `file`) |
| `GET` | `/api/v1/documents` | 200 | Bearer | List documents owned by user (supports `limit`, `offset`) |
| `GET` | `/api/v1/documents/{id}` | 200 | Bearer | Get document metadata (404 if not found or not owned) |
| `DELETE`| `/api/v1/documents/{id}` | 200 | Bearer | Delete document from storage and database |
| `GET` | `/api/v1/documents/{id}/file` | 200 | Bearer | Stream original PDF with safe RFC 5987 headers |

### Standard Error Handling Matrix

| Scenario | HTTP Status | Response Payload |
| --- | ---: | --- |
| Missing file | 422 | `{"detail": "Validation failed", "errors": [...]}` |
| Invalid extension / MIME / header | 415 | `{"detail": "File does not start with a valid PDF signature (%PDF-)"}` |
| File exceeds `MAX_UPLOAD_SIZE_MB` | 413 | `{"detail": "File exceeds maximum allowed size of 20 MB"}` |
| Missing or invalid Clerk token | 401 | `{"detail": "Not authenticated"}` or `{"detail": "Invalid or expired token"}` |
| Document not found / not owned | 404 | `{"detail": "Document not found"}` |
| Neon Object Storage unavailable | 503 | `{"detail": "Storage service unavailable. Please try again later."}` |
| Unexpected backend failure | 500 | `{"detail": "Internal server error"}` |

## 5. Document Service & Repository

### `DocumentRepository` (`backend/app/repositories/document_repository.py`)
Encapsulates all database operations on the `documents` table, strictly enforcing user ownership on every query:
- `create`: Inserts a `Document` with status `uploaded` and initial `page_count=None`.
- `get_by_id`: Selects by `Document.id == id` and `Document.clerk_user_id == clerk_user_id`.
- `list_for_user`: Selects user's documents ordered by `Document.created_at.desc()` with `limit` and `offset`.
- `count_for_user`: Counts total documents owned by the user.
- `delete`: Removes the database row.

### `DocumentService` (`backend/app/services/document_service.py`)
Orchestrates business logic, stream validation, storage uploads, and consistency:
- `validate_and_upload`: Inspects `%PDF-` signature, counts bytes in 64 KB chunks, enforces limit, uploads to S3, writes to DB, and handles compensation rollback on failure.
- `get_document`: Retrieves metadata with verified ownership.
- `list_documents`: Returns paginated list and total count.
- `delete_document`: Deletes from object storage first; if storage fails with `StorageUnavailableError`, the database record is preserved so files are never orphaned in S3 without tracking.
- `get_document_stream`: Retrieves streaming generator from `StorageService.get_object_stream()`.

## 6. File Validation Strategy

1. **Extension Check**: Filename must end with `.pdf` (case-insensitive).
2. **MIME Type Check**: Content type must be `application/pdf`.
3. **Magic Signature Check**: The first 5 bytes are read and verified against `b"%PDF-"`. Renamed `.exe`, `.zip`, or text files with `.pdf` extensions are rejected with HTTP 415.
4. **Chunked Size Enforcement**: Files are read in 64 KB chunks up to `MAX_UPLOAD_SIZE_MB` (default 20 MB). If the byte counter exceeds the threshold, upload is aborted immediately with HTTP 413 without buffering excess bytes.
5. **Filename Sanitization**: Path separators (`/`, `\`), control characters, and dangerous characters are neutralized using `sanitize_filename()`. Base names are clamped to safe length (255 chars) while preserving the `.pdf` extension. Client filenames are never used as storage keys.

## 7. Storage and Database Consistency

- Object keys follow the strict backend template:
  `users/{clerk_user_id}/documents/{document_uuid}/{safe_filename}`
- Traversal segments (`../`) and unauthorized user namespaces are structurally rejected by regex.
- If database insertion or session flush fails after S3 upload succeeds:
  1. The service immediately attempts `storage_service.delete(storage_key)`.
  2. The cleanup outcome is logged without leaking credentials or file contents.
  3. The database session is rolled back.
  4. A generic 500 or typed error is returned to the client.
- Boto3 integration fix: `s3transfer` prohibits `ContentLength` in `ExtraArgs`. `upload_fileobj` automatically manages content length and chunking; removing `ContentLength` from `ExtraArgs` ensures reliable S3 uploads against Neon Object Storage.

## 8. Frontend Upload Dialog & Real Progress

- Implemented in `frontend/components/dashboard/upload-dialog.tsx`.
- Integrated directly with:
  - Sidebar `+ New` button.
  - Dashboard study input `+` icon and submit action.
- Features:
  - Drag-and-drop zone with active visual feedback (`ring-4 ring-primary/10`).
  - Native file picker with `.pdf` filtering.
  - Client-side size and type checks with immediate alert feedback.
  - Selected file badge showing filename and human-formatted size (`2.4 MB`).
  - Real upload progress tracking via `XMLHttpRequest` (`xhr.upload.onprogress`).
  - Double-click and duplicate submission prevention (buttons disabled while uploading).
  - Clear success screen displaying uploaded metadata and "Open Study Workspace" action.

## 9. Recent Documents Integration

- In `frontend/components/dashboard/recent-studies.tsx`:
  - Fetches real documents from `GET /api/v1/documents`.
  - Shows uploaded documents ordered newest first with relative timestamp (`Just now`, `5m ago`, `Yesterday`).
  - Listens to the `notemint:documents-changed` event to auto-refresh whenever an upload or deletion occurs.
  - Preserves Phase 4 sample preview topics (`Life Processes`, `Acids, Bases & Salts`, `Trigonometry`, `Light`) in a dedicated "Sample Previews" section with clear `Demo` tags.
  - Mock IDs (slug strings) and real IDs (UUIDs) are cleanly separated, preventing mock IDs from ever hitting backend database APIs.

## 10. Study Workspace Integration

- Route: `/dashboard/study/[documentId]`.
- Handled by `DynamicStudyLoader`:
  - Sample documents render the interactive Phase 4 demo workspace (`StudyWorkspace`).
  - Real document UUIDs render `UploadedStudyWorkspace`:
    - Shows real filename, size, upload timestamp, and `Uploaded` status badge.
    - "View Original PDF" action streams the PDF from `/api/v1/documents/{id}/file` using the authenticated Clerk token into a safe embedded viewer modal.
    - "Open in Tab" action enables native browser PDF viewing.
    - "Delete Document" action with confirmation dialog, which cleans up S3 and DB records and redirects back to the dashboard.
    - The 5 tabs (`Notes`, `Questions`, `Flashcards`, `Quiz`, `AI Talk`) explain NoteMint's processing roadmap: Phase 5 established secure storage; Phase 6 will extract content; Phase 7 will generate smart AI resources.

## 11. Testing Results

### Backend Automated Tests (`pytest`)
- **138 passed, 1 skipped** in 6.71 seconds.
- Suite breakdown:
  - `tests/test_documents.py`: 21 tests covering upload validation, MIME rejection, header signature validation, oversized file rejection, filename path traversal neutralization, auth rejection matrix (401), cross-user isolation, pagination, S3 failure 503 handling, compensation cleanup on DB failure, and document deletion.
  - `tests/test_storage.py`: 31 passed (1 conditional skip).
  - `tests/test_database.py`: 28 passed.
  - `tests/test_auth.py`: 27 passed.
  - `tests/test_users_api.py`: 18 passed.
  - `tests/test_migrations.py`: 10 passed.
  - `tests/test_health.py`: 3 passed.

### Frontend Quality Checks
- `npx tsc --noEmit`: Clean (0 errors).
- `npm run lint`: Clean (0 warnings, 0 errors).
- `npm run build`: Production build succeeded; all 12 routes generated cleanly with Partial Prerendering.

### Live E2E Integration Test
- Automated headless browser test (`frontend/test-phase5-e2e.mjs`) verified:
  1. Authenticated session using live Clerk token.
  2. Opening upload dialog from sidebar `+ New`.
  3. Selecting and uploading a real PDF to Neon Object Storage.
  4. Real-time progress and success notification.
  5. Navigation to study workspace `/dashboard/study/[documentId]`.
  6. Viewing original PDF inside embedded viewer modal via authenticated stream.
  7. Verification of uploaded document appearing in the Recent sidebar list.
- Screenshots captured and stored in artifact directory:
  - `phase5-dashboard-initial.png`
  - `phase5-upload-dialog-empty.png`
  - `phase5-upload-dialog-selected.png`
  - `phase5-upload-dialog-success.png`
  - `phase5-uploaded-workspace.png`
  - `phase5-pdf-viewer-modal.png`
  - `phase5-dashboard-with-recent.png`

## 12. Problems Encountered and Solutions

1. **`python-multipart` missing**: FastAPI's `UploadFile` requires `python-multipart`. Added `python-multipart>=0.0.12` to `pyproject.toml` and installed it in the backend virtual environment.
2. **Boto3 `upload_fileobj` ExtraArgs error**: S3Transfer rejects `ContentLength` in `ExtraArgs`. Removed `extra["ContentLength"]` from `StorageService.upload_fileobj`, allowing boto3's transfer manager to handle streaming file lengths automatically.
3. **React 19 ESLint `react-hooks/set-state-in-effect`**: Next.js 16 flagged synchronous `setState` in `useEffect` when checking mock vs real documents. Refactored `DynamicStudyLoader` so mock documents render synchronously, and real document fetch state changes occur strictly inside asynchronous callbacks.
4. **Next.js 16 `dynamicParams` conflict**: Next.js 16 with cacheComponents flagged `export const dynamicParams = true;`. Removed the redundant segment config as dynamic routes are handled automatically by App Router.

## 13. Current Limitations

- Documents remain in `uploaded` status; text extraction, OCR, and AI generation are scheduled for Phase 6 and Phase 7.
- Upload size is capped at 20 MB; multi-part chunked resume is not implemented as 20 MB fits comfortably in standard streaming uploads.

## 14. What Phase 6 Needs to Know

- Document metadata is stored in the `documents` table with primary key `id` (UUID), `clerk_user_id`, `storage_key`, `original_filename`, and `status`.
- Files can be retrieved via `StorageService.get_object_stream(doc.storage_key)` or `StorageService.download_fileobj(doc.storage_key, temp_file)`.
- When Phase 6 extracts PDF text and page counts:
  - Update `document.page_count` with the integer total.
  - Update `document.status` from `uploaded` to `extracting` then `completed` (or `failed`).
  - Store extracted text and sections in the upcoming extraction models.

