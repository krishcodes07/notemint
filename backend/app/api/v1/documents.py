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

