"""Study resource repository: data-access operations for AI-generated learning materials."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.models.study_resource import (
    ResourceStatus,
    ResourceType,
    StudyResource,
)

logger = logging.getLogger(__name__)


class StudyResourceRepository:
    """Data-access operations for the ``study_resources`` table."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def create(
        self,
        document_id: uuid.UUID,
        resource_type: ResourceType,
        model_name: str,
        *,
        resource_id: uuid.UUID | None = None,
        prompt_version: str = "v1",
        status: ResourceStatus = ResourceStatus.PENDING,
        content: dict[str, Any] | None = None,
        version: int = 1,
        is_active: bool = True,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
        error_message: str | None = None,
        generation_batch_id: uuid.UUID | None = None,
        difficulty: str | None = None,
        topic: str | None = None,
    ) -> StudyResource:
        """Create and persist a new study resource record."""
        resource = StudyResource(
            id=resource_id or uuid.uuid4(),
            document_id=document_id,
            resource_type=resource_type,
            status=status,
            content=content,
            model_name=model_name,
            prompt_version=prompt_version,
            version=version,
            is_active=is_active,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            error_message=error_message,
            generation_batch_id=generation_batch_id,
            difficulty=difficulty,
            topic=topic,
        )
        self._session.add(resource)
        self._session.flush()
        return resource

    def get_by_id(self, resource_id: uuid.UUID) -> StudyResource | None:
        """Find a study resource by its ID."""
        return self._session.get(StudyResource, resource_id)

    def get_active_by_type(
        self, document_id: uuid.UUID, resource_type: ResourceType
    ) -> StudyResource | None:
        """Retrieve the currently active resource of a specific type for a document."""
        statement = (
            select(StudyResource)
            .where(
                StudyResource.document_id == document_id,
                StudyResource.resource_type == resource_type,
                StudyResource.generation_batch_id.is_(None),
                StudyResource.is_active == True,  # noqa: E712
            )
            .order_by(StudyResource.version.desc())
        )
        return self._session.execute(statement).scalars().first()

    def list_active_by_document(self, document_id: uuid.UUID) -> list[StudyResource]:
        """List all active study resources for a document."""
        statement = (
            select(StudyResource)
            .where(
                StudyResource.document_id == document_id,
                StudyResource.generation_batch_id.is_(None),
                StudyResource.is_active == True,  # noqa: E712
            )
            .order_by(StudyResource.created_at.asc())
        )
        return list(self._session.execute(statement).scalars())

    def list_active_batches_by_type(
        self, document_id: uuid.UUID, resource_type: ResourceType
    ) -> list[StudyResource]:
        """List all active generation batch resources of a specific type for a document."""
        statement = (
            select(StudyResource)
            .where(
                StudyResource.document_id == document_id,
                StudyResource.resource_type == resource_type,
                StudyResource.generation_batch_id.is_not(None),
                StudyResource.is_active == True,  # noqa: E712
            )
            .order_by(StudyResource.created_at.asc())
        )
        return list(self._session.execute(statement).scalars())

    def list_all_active_by_type(
        self, document_id: uuid.UUID, resource_type: ResourceType
    ) -> list[StudyResource]:
        """List base active resource and all active batch resources for a resource type."""
        statement = (
            select(StudyResource)
            .where(
                StudyResource.document_id == document_id,
                StudyResource.resource_type == resource_type,
                StudyResource.is_active == True,  # noqa: E712
            )
            .order_by(StudyResource.created_at.asc())
        )
        return list(self._session.execute(statement).scalars())

    def list_all_by_document(self, document_id: uuid.UUID) -> list[StudyResource]:
        """List all study resources (active and historical) for a document."""
        statement = (
            select(StudyResource)
            .where(StudyResource.document_id == document_id)
            .order_by(StudyResource.created_at.desc())
        )
        return list(self._session.execute(statement).scalars())

    def get_latest_version(
        self, document_id: uuid.UUID, resource_type: ResourceType
    ) -> int:
        """Get the highest version number recorded for a resource type on a document."""
        statement = select(func.coalesce(func.max(StudyResource.version), 0)).where(
            StudyResource.document_id == document_id,
            StudyResource.resource_type == resource_type,
        )
        return int(self._session.execute(statement).scalar_one())

    def get_generation_statuses(
        self, document_id: uuid.UUID
    ) -> dict[ResourceType, StudyResource]:
        """Return a mapping of resource types to their latest resource record."""
        # Query newest resource per type
        all_resources = self.list_all_by_document(document_id)
        latest_map: dict[ResourceType, StudyResource] = {}
        for r in all_resources:
            if r.resource_type not in latest_map:
                latest_map[r.resource_type] = r
        return latest_map

    def mark_generating(self, resource_id: uuid.UUID) -> StudyResource:
        """Update resource status to GENERATING."""
        resource = self._session.get(StudyResource, resource_id)
        if not resource:
            raise ValueError(f"Resource {resource_id} not found")
        resource.status = ResourceStatus.GENERATING
        resource.error_message = None
        self._session.flush()
        return resource

    def mark_failed(
        self, resource_id: uuid.UUID, error_message: str
    ) -> StudyResource:
        """Update resource status to FAILED with error message."""
        resource = self._session.get(StudyResource, resource_id)
        if not resource:
            raise ValueError(f"Resource {resource_id} not found")
        resource.status = ResourceStatus.FAILED
        resource.error_message = error_message[:2048]
        self._session.flush()
        return resource

    def activate_successful_resource(
        self,
        resource_id: uuid.UUID,
        content: dict[str, Any],
        *,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
    ) -> StudyResource:
        """Set newly generated resource to COMPLETED and mark it active.

        In the same transaction, sets any previously active resources for the
        same (document_id, resource_type) to is_active=False.
        """
        resource = self._session.get(StudyResource, resource_id)
        if not resource:
            raise ValueError(f"Resource {resource_id} not found")

        # Deactivate previous active versions for this document and type (only base resources)
        deactivate_stmt = (
            update(StudyResource)
            .where(
                StudyResource.document_id == resource.document_id,
                StudyResource.resource_type == resource.resource_type,
                StudyResource.id != resource.id,
                StudyResource.generation_batch_id.is_(None),
                StudyResource.is_active == True,  # noqa: E712
            )
            .values(is_active=False)
        )
        self._session.execute(deactivate_stmt)

        resource.content = content
        resource.status = ResourceStatus.COMPLETED
        resource.is_active = True
        resource.input_tokens = input_tokens
        resource.output_tokens = output_tokens
        resource.error_message = None
        self._session.flush()
        return resource

    def delete_by_document(self, document_id: uuid.UUID) -> int:
        """Delete all resources for a document."""
        statement = delete(StudyResource).where(
            StudyResource.document_id == document_id
        )
        result = self._session.execute(statement)
        self._session.flush()
        return result.rowcount or 0

