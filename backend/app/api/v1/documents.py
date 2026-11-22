"""Document management API endpoints for NoteMint."""

from __future__ import annotations

import logging
import urllib.parse
import uuid

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.dependencies import get_db
from app.dependencies.auth import get_current_user
from app.integrations.neon_storage import (
    StorageObjectNotFoundError,
    StorageUnavailableError,
)
from app.schemas.auth import AuthenticatedUser
from app.schemas.document import (
    DocumentDeleteResponse,
    DocumentListResponse,
    DocumentResponse,
)
from app.schemas.extraction import (
    DocumentExtractionResponse,
    DocumentReprocessResponse,
)
from app.schemas.rag import (
    DocumentIndexStatusResponse,
    DocumentReindexResponse,
)
from app.services.document_service import (
    DocumentNotFoundError,
    DocumentService,
    DocumentServiceError,
    FileTooLargeError,
    InvalidPDFError,
)
from app.services.storage_service import StorageService, get_storage_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])


def get_document_service(
    session: Session = Depends(get_db),
    storage_service: StorageService = Depends(get_storage_service),
    settings: Settings = Depends(get_settings),
) -> DocumentService:
    """Dependency provider for DocumentService."""
    return DocumentService(
        session=session,
        storage_service=storage_service,
        settings=settings,
    )


@router.post(
    "",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a PDF document",
)
def upload_document(
    file: UploadFile = File(..., description="PDF file to upload"),
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentResponse:
    """Upload a study document in PDF format.

    Validates file extension, MIME type, PDF magic header, and size limit.
    Stores the file in private Neon Object Storage and persists metadata in PostgreSQL.
    """
    try:
        doc = service.validate_and_upload(
            clerk_user_id=current_user.user_id,
            upload_file=file,
        )
        return DocumentResponse.model_validate(doc)
    except InvalidPDFError as exc:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=str(exc),
        ) from None
    except FileTooLargeError as exc:
        raise HTTPException(
            status_code=413,
            detail=str(exc),
        ) from None
    except StorageUnavailableError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Storage service unavailable. Please try again later.",
        ) from None
    except DocumentServiceError as exc:
        logger.exception("Upload processing failure for user %s", current_user.user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process document upload",
        ) from None


@router.get(
    "",
    response_model=DocumentListResponse,
    summary="List uploaded documents",
)
def list_documents(
    limit: int = Query(default=20, ge=1, le=100, description="Items per page"),
    offset: int = Query(default=0, ge=0, description="Pagination offset"),
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentListResponse:
    """Return a paginated list of documents owned by the authenticated user."""
    items, total = service.list_documents(
        clerk_user_id=current_user.user_id,
        limit=limit,
        offset=offset,
    )
    return DocumentListResponse(
        items=[DocumentResponse.model_validate(doc) for doc in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{document_id}",
    response_model=DocumentResponse,
    summary="Get document metadata",
)
def get_document(
    document_id: uuid.UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentResponse:
    """Retrieve metadata for a document owned by the authenticated user."""
    try:
        doc = service.get_document(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
        )
        return DocumentResponse.model_validate(doc)
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None


@router.delete(
    "/{document_id}",
    response_model=DocumentDeleteResponse,
    summary="Delete a document",
)
def delete_document(
    document_id: uuid.UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentDeleteResponse:
    """Delete a document and its stored file, enforcing user ownership."""
    try:
        service.delete_document(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
        )
        return DocumentDeleteResponse(
            id=document_id,
            deleted=True,
            message="Document deleted successfully",
        )
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None
    except StorageUnavailableError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Storage service unavailable. Please try again later.",
        ) from None


@router.get(
    "/{document_id}/file",
    summary="Download or view original PDF",
)
def get_document_file(
    document_id: uuid.UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> StreamingResponse:
    """Stream the original PDF file from private storage.

    Enforces ownership and safe headers without exposing storage keys or credentials.
    """
    try:
        doc, stream_iter = service.get_document_stream(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
        )
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None
    except StorageObjectNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document file not found in storage",
        ) from None
    except StorageUnavailableError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Storage service unavailable. Please try again later.",
        ) from None

    # Safe RFC 5987 / RFC 6266 filename header
    safe_ascii = "".join(
        c if c.isalnum() or c in "._-" else "_" for c in doc.original_filename
    )
    if not safe_ascii:
        safe_ascii = "document.pdf"
    encoded_filename = urllib.parse.quote(doc.original_filename)

    headers = {
        "Content-Disposition": (
            f'inline; filename="{safe_ascii}"; filename*=UTF-8\'\'{encoded_filename}'
        ),
        "Content-Length": str(doc.file_size_bytes),
    }

    return StreamingResponse(
        stream_iter,
        media_type="application/pdf",
        headers=headers,
    )


@router.get(
    "/{document_id}/extraction",
    response_model=DocumentExtractionResponse,
    summary="Get document extraction status and diagnostics",
)
def get_document_extraction(
    document_id: uuid.UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentExtractionResponse:
    """Retrieve extraction processing status, page count, and quality diagnostics.

    Strictly enforces owner identity based on verified Clerk JWT.
    """
    try:
        return service.get_extraction_status(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
        )
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None


@router.post(
    "/{document_id}/reprocess",
    response_model=DocumentReprocessResponse,
    summary="Reprocess a document extraction",
)
def reprocess_document(
    document_id: uuid.UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentReprocessResponse:
    """Idempotent, authenticated document reprocess trigger.

    Resets extraction state and enqueues the extraction background task.
    """
    try:
        return service.reprocess_document(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
        )
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None


@router.get(
    "/{document_id}/index-status",
    response_model=DocumentIndexStatusResponse,
    summary="Get document vector indexing status",
)
def get_document_index_status(
    document_id: uuid.UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> DocumentIndexStatusResponse:
    """Retrieve vector indexing status, chunk count, and model metadata.

    Enforces verified Clerk ownership.
    """
    try:
        service.get_document(clerk_user_id=current_user.user_id, document_id=document_id)
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None

    from app.repositories.document_index_repository import DocumentIndexRepository

    index_repo = DocumentIndexRepository(session)
    idx = index_repo.get_by_document_id(document_id)

    if idx is None:
        return DocumentIndexStatusResponse(
            document_id=document_id,
            status="pending",
            chunk_count=0,
            embedding_provider=getattr(settings, "embedding_provider", "local"),
            embedding_model=getattr(settings, "embedding_model", "BAAI/bge-small-en-v1.5"),
            embedding_dimensions=getattr(settings, "embedding_dimensions", 384),
            indexed_at=None,
            error_message=None,
        )

    return DocumentIndexStatusResponse(
        document_id=document_id,
        status=idx.status,
        chunk_count=idx.chunk_count,
        embedding_provider=idx.embedding_provider,
        embedding_model=idx.embedding_model,
        embedding_dimensions=idx.embedding_dimensions,
        indexed_at=idx.indexed_at,
        error_message=idx.error_message,
    )


@router.post(
    "/{document_id}/reindex",
    response_model=DocumentReindexResponse,
    summary="Re-index document vector embeddings",
)
def reindex_document(
    document_id: uuid.UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
    session: Session = Depends(get_db),
) -> DocumentReindexResponse:
    """Trigger vector reindexing for an extracted document.

    Enforces Clerk ownership, completed text extraction, and duplicate task prevention.
    """
    try:
        service.get_document(clerk_user_id=current_user.user_id, document_id=document_id)
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None

    from app.models.document_extraction import ExtractionStatus
    from app.repositories.document_index_repository import DocumentIndexRepository
    from app.repositories.extraction_repository import ExtractionRepository

    extraction_repo = ExtractionRepository(session)
    extraction = extraction_repo.get_by_document_id(document_id)
    if extraction is None or extraction.status != ExtractionStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot index document: text extraction has not completed.",
        )

    index_repo = DocumentIndexRepository(session)
    idx = index_repo.get_by_document_id(document_id)
    if idx is not None and idx.status == "indexing":
        return DocumentReindexResponse(
            document_id=document_id,
            status="indexing",
            message="Document is currently being indexed.",
            enqueued=False,
        )

    from app.tasks.document_indexing_tasks import enqueue_indexing_task

    enqueued = enqueue_indexing_task(document_id, force=True)
    return DocumentReindexResponse(
        document_id=document_id,
        status="pending" if enqueued else "failed",
        message="Vector indexing task successfully enqueued." if enqueued else "Failed to enqueue indexing task.",
        enqueued=enqueued,
    )

