"""add_study_resources_table

Revision ID: 3689644b7f14
Revises: 624960d625f2
Create Date: 2026-11-20 14:01:29.267326

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '3689644b7f14'
down_revision: Union[str, None] = '624960d625f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'study_resources',
        sa.Column('id', sa.Uuid(), nullable=False, comment='Unique identifier for the generated resource'),
        sa.Column('document_id', sa.Uuid(), nullable=False, comment='Associated document ID'),
        sa.Column(
            'resource_type',
            sa.Enum('notes', 'questions', 'flashcards', 'quiz', 'summary', name='study_resource_type', native_enum=False, length=32),
            nullable=False,
            comment='Type of learning resource',
        ),
        sa.Column(
            'status',
            sa.Enum('pending', 'generating', 'completed', 'failed', name='study_resource_status', native_enum=False, length=32),
            server_default='pending',
            nullable=False,
            comment='Generation status',
        ),
        sa.Column('content', sa.JSON(), nullable=True, comment='Validated structured JSON content of the generated resource'),
        sa.Column('model_name', sa.String(length=128), nullable=False, comment='AI model identifier used for generation'),
        sa.Column('prompt_version', sa.String(length=32), server_default='v1', nullable=False, comment='Version of the prompt template used'),
        sa.Column('version', sa.Integer(), server_default='1', nullable=False, comment='Generation version number'),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False, comment='Whether this version is currently the active viewable resource'),
        sa.Column('input_tokens', sa.Integer(), nullable=True, comment='Reported or estimated input token count'),
        sa.Column('output_tokens', sa.Integer(), nullable=True, comment='Reported or estimated output token count'),
        sa.Column('error_message', sa.Text(), nullable=True, comment='Sanitized error description if generation failed'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], name=op.f('fk_study_resources_document_id_documents'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_study_resources')),
    )
    op.create_index(op.f('ix_study_resources_document_id'), 'study_resources', ['document_id'], unique=False)
    op.create_index('ix_study_resources_doc_type_active', 'study_resources', ['document_id', 'resource_type', 'is_active'], unique=False)
    op.create_index('ix_study_resources_status', 'study_resources', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_study_resources_status', table_name='study_resources')
    op.drop_index('ix_study_resources_doc_type_active', table_name='study_resources')
    op.drop_index(op.f('ix_study_resources_document_id'), table_name='study_resources')
    op.drop_table('study_resources')
