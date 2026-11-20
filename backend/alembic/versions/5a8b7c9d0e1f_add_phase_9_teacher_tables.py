"""add_phase_9_teacher_tables

Revision ID: 5a8b7c9d0e1f
Revises: 49033a748435
Create Date: 2026-11-20 17:15:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '5a8b7c9d0e1f'
down_revision: Union[str, None] = '49033a748435'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'teacher_conversations',
        sa.Column('id', sa.Uuid(), nullable=False, comment='Unique identifier for the teacher conversation'),
        sa.Column('document_id', sa.Uuid(), nullable=False, comment='Associated document ID'),
        sa.Column('clerk_user_id', sa.String(length=128), nullable=False, comment='Owner Clerk user ID'),
        sa.Column('title', sa.String(length=256), server_default='New Conversation', nullable=False, comment='Human-readable conversation title'),
        sa.Column('teaching_mode', sa.String(length=32), server_default='explain', nullable=False, comment='Pedagogical mode: explain, simplify, socratic'),
        sa.Column('explanation_depth', sa.String(length=32), server_default='standard', nullable=False, comment='Explanation depth: quick, standard, detailed'),
        sa.Column('preferred_language', sa.String(length=32), server_default='auto', nullable=False, comment='Preferred language: auto, en, hi, hinglish'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False, comment='Conversation creation timestamp'),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False, comment='Conversation last updated timestamp'),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], name=op.f('fk_teacher_conversations_document_id_documents'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_teacher_conversations')),
    )
    op.create_index(op.f('ix_teacher_conversations_clerk_user_id'), 'teacher_conversations', ['clerk_user_id'], unique=False)
    op.create_index(op.f('ix_teacher_conversations_document_id'), 'teacher_conversations', ['document_id'], unique=False)
    op.create_index('ix_teacher_conversations_updated_at', 'teacher_conversations', ['updated_at'], unique=False)
    op.create_index('ix_teacher_conversations_user_doc', 'teacher_conversations', ['clerk_user_id', 'document_id'], unique=False)

    op.create_table(
        'teacher_messages',
        sa.Column('id', sa.Uuid(), nullable=False, comment='Unique identifier for the message'),
        sa.Column('conversation_id', sa.Uuid(), nullable=False, comment='Parent conversation ID'),
        sa.Column('role', sa.String(length=32), nullable=False, comment='Message role: user or assistant'),
        sa.Column('content', sa.Text(), nullable=False, comment='Full message text'),
        sa.Column('source_pages', sa.JSON(), nullable=True, comment='Verified original PDF page numbers cited in assistant explanation'),
        sa.Column('model_name', sa.String(length=128), nullable=True, comment='Model identifier used for assistant completion'),
        sa.Column('input_tokens', sa.Integer(), nullable=True, comment='Input prompt tokens consumed'),
        sa.Column('output_tokens', sa.Integer(), nullable=True, comment='Output completion tokens generated'),
        sa.Column('status', sa.String(length=32), server_default='completed', nullable=False, comment='Message status: completed, processing, failed'),
        sa.Column('error_message', sa.Text(), nullable=True, comment='Error message if generation failed'),
        sa.Column('client_message_id', sa.String(length=128), nullable=True, comment='Client-supplied idempotency key for deduplication'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False, comment='Message timestamp'),
        sa.ForeignKeyConstraint(['conversation_id'], ['teacher_conversations.id'], name=op.f('fk_teacher_messages_conversation_id_teacher_conversations'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_teacher_messages')),
    )
    op.create_index(op.f('ix_teacher_messages_client_message_id'), 'teacher_messages', ['client_message_id'], unique=False)
    op.create_index(op.f('ix_teacher_messages_conversation_id'), 'teacher_messages', ['conversation_id'], unique=False)
    op.create_index('ix_teacher_messages_conv_created', 'teacher_messages', ['conversation_id', 'created_at'], unique=False)


def downgrade() -> None:
    op.drop_table('teacher_messages')
    op.drop_table('teacher_conversations')

