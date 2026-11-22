"""add_phase_11_generation_batches

Revision ID: 8d9e0f1a2b3c
Revises: 7c9d1e2f3a4b
Create Date: 2026-11-22 15:15:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "8d9e0f1a2b3c"
down_revision: Union[str, None] = "7c9d1e2f3a4b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create study_generation_batches table
    op.create_table(
        "study_generation_batches",
        sa.Column(
            "id",
            sa.Uuid(),
            nullable=False,
            comment="Unique identifier for the generation batch",
        ),
        sa.Column(
            "document_id",
            sa.Uuid(),
            nullable=False,
            comment="Associated document ID",
        ),
        sa.Column(
            "resource_id",
            sa.Uuid(),
            nullable=True,
            comment="Associated StudyResource created by this completed batch",
        ),
        sa.Column(
            "resource_type",
            sa.String(length=32),
            nullable=False,
            comment="Type of study resource (questions, flashcards, quiz)",
        ),
        sa.Column(
            "difficulty",
            sa.String(length=32),
            server_default="random",
            nullable=False,
            comment="Selected difficulty: easy, medium, hard, random",
        ),
        sa.Column(
            "requested_count",
            sa.Integer(),
            server_default="10",
            nullable=False,
            comment="Number of items requested by student",
        ),
        sa.Column(
            "generated_count",
            sa.Integer(),
            server_default="0",
            nullable=False,
            comment="Number of validated unique items successfully generated",
        ),
        sa.Column(
            "topic",
            sa.String(length=256),
            nullable=True,
            comment="Optional focus topic for generation",
        ),
        sa.Column(
            "status",
            sa.String(length=32),
            server_default="pending",
            nullable=False,
            comment="Batch lifecycle status: pending, generating, completed, failed",
        ),
        sa.Column(
            "model_name",
            sa.String(length=128),
            nullable=False,
            comment="AI model used for generation",
        ),
        sa.Column(
            "prompt_version",
            sa.String(length=32),
            server_default="v1",
            nullable=False,
            comment="Prompt template version used",
        ),
        sa.Column(
            "error_message",
            sa.Text(),
            nullable=True,
            comment="Sanitized error description if batch failed",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "completed_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Timestamp when batch generation completed",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["documents.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["resource_id"],
            ["study_resources.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_study_generation_batches_doc",
        "study_generation_batches",
        ["document_id"],
        unique=False,
    )
    op.create_index(
        "ix_study_generation_batches_doc_type",
        "study_generation_batches",
        ["document_id", "resource_type"],
        unique=False,
    )
    op.create_index(
        "ix_study_generation_batches_status",
        "study_generation_batches",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_study_generation_batches_resource_id",
        "study_generation_batches",
        ["resource_id"],
        unique=False,
    )

    # 2. Add columns to study_resources
    with op.batch_alter_table("study_resources", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "generation_batch_id",
                sa.Uuid(),
                nullable=True,
                comment="Associated generation batch ID if created on-demand in Phase 11",
            )
        )
        batch_op.add_column(
            sa.Column(
                "difficulty",
                sa.String(length=32),
                nullable=True,
                comment="Difficulty level for this resource: easy, medium, hard, random",
            )
        )
        batch_op.add_column(
            sa.Column(
                "topic",
                sa.String(length=256),
                nullable=True,
                comment="Topic focus if generated on-demand",
            )
        )
        batch_op.create_foreign_key(
            "fk_study_resources_batch_id",
            "study_generation_batches",
            ["generation_batch_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_index(
            "ix_study_resources_batch_id",
            ["generation_batch_id"],
            unique=False,
        )


def downgrade() -> None:
    # 1. Revert columns on study_resources
    with op.batch_alter_table("study_resources", schema=None) as batch_op:
        batch_op.drop_index("ix_study_resources_batch_id")
        batch_op.drop_constraint("fk_study_resources_batch_id", type_="foreignkey")
        batch_op.drop_column("topic")
        batch_op.drop_column("difficulty")
        batch_op.drop_column("generation_batch_id")

    # 2. Drop study_generation_batches table
    op.drop_index(
        "ix_study_generation_batches_resource_id",
        table_name="study_generation_batches",
    )
    op.drop_index(
        "ix_study_generation_batches_status",
        table_name="study_generation_batches",
    )
    op.drop_index(
        "ix_study_generation_batches_doc_type",
        table_name="study_generation_batches",
    )
    op.drop_index(
        "ix_study_generation_batches_doc",
        table_name="study_generation_batches",
    )
    op.drop_table("study_generation_batches")

