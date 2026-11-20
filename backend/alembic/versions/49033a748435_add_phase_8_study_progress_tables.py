"""add_phase_8_study_progress_tables

Revision ID: 49033a748435
Revises: 3689644b7f14
Create Date: 2026-11-20 16:11:33.917683

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '49033a748435'
down_revision: Union[str, None] = '3689644b7f14'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'flashcard_progress',
        sa.Column('id', sa.Uuid(), nullable=False, comment='Unique identifier for the flashcard progress entry'),
        sa.Column('clerk_user_id', sa.String(length=128), nullable=False, comment='Owner user ID'),
        sa.Column('document_id', sa.Uuid(), nullable=False, comment='Associated document ID'),
        sa.Column('resource_id', sa.Uuid(), nullable=False, comment='Associated flashcards StudyResource ID'),
        sa.Column('card_id', sa.String(length=64), nullable=False, comment='Stable flashcard identifier from generated content'),
        sa.Column('mastery_level', sa.Integer(), server_default='0', nullable=False, comment='Mastery level: 0=Not studied, 1=Learning, 2=Familiar, 3=Mastered'),
        sa.Column('review_count', sa.Integer(), server_default='0', nullable=False, comment='Total times card has been reviewed'),
        sa.Column('correct_count', sa.Integer(), server_default='0', nullable=False, comment='Number of times answered as known'),
        sa.Column('incorrect_count', sa.Integer(), server_default='0', nullable=False, comment='Number of times answered as again'),
        sa.Column('last_reviewed_at', sa.DateTime(timezone=True), nullable=True, comment='Timestamp of most recent review'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], name=op.f('fk_flashcard_progress_document_id_documents'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['resource_id'], ['study_resources.id'], name=op.f('fk_flashcard_progress_resource_id_study_resources'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_flashcard_progress')),
        sa.UniqueConstraint('clerk_user_id', 'resource_id', 'card_id', name='uq_flashcard_progress_user_resource_card'),
    )
    op.create_index(op.f('ix_flashcard_progress_clerk_user_id'), 'flashcard_progress', ['clerk_user_id'], unique=False)
    op.create_index('ix_flashcard_progress_resource', 'flashcard_progress', ['resource_id'], unique=False)
    op.create_index('ix_flashcard_progress_user_doc', 'flashcard_progress', ['clerk_user_id', 'document_id'], unique=False)

    op.create_table(
        'question_bookmarks',
        sa.Column('id', sa.Uuid(), nullable=False, comment='Unique identifier for the bookmark'),
        sa.Column('clerk_user_id', sa.String(length=128), nullable=False, comment='Owner user ID'),
        sa.Column('document_id', sa.Uuid(), nullable=False, comment='Associated document ID'),
        sa.Column('resource_id', sa.Uuid(), nullable=False, comment='Associated questions StudyResource ID'),
        sa.Column('question_id', sa.String(length=64), nullable=False, comment='Stable question identifier from generated content'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], name=op.f('fk_question_bookmarks_document_id_documents'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['resource_id'], ['study_resources.id'], name=op.f('fk_question_bookmarks_resource_id_study_resources'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_question_bookmarks')),
        sa.UniqueConstraint('clerk_user_id', 'resource_id', 'question_id', name='uq_question_bookmarks_user_resource_question'),
    )
    op.create_index(op.f('ix_question_bookmarks_clerk_user_id'), 'question_bookmarks', ['clerk_user_id'], unique=False)
    op.create_index('ix_question_bookmarks_resource', 'question_bookmarks', ['resource_id'], unique=False)
    op.create_index('ix_question_bookmarks_user_doc', 'question_bookmarks', ['clerk_user_id', 'document_id'], unique=False)

    op.create_table(
        'quiz_attempts',
        sa.Column('id', sa.Uuid(), nullable=False, comment='Unique identifier for the quiz attempt'),
        sa.Column('clerk_user_id', sa.String(length=128), nullable=False, comment='Owner user ID'),
        sa.Column('document_id', sa.Uuid(), nullable=False, comment='Associated document ID'),
        sa.Column('resource_id', sa.Uuid(), nullable=False, comment='Associated quiz StudyResource ID'),
        sa.Column('total_questions', sa.Integer(), nullable=False, comment='Total questions in this quiz attempt'),
        sa.Column('correct_answers', sa.Integer(), nullable=False, comment='Number of correct answers'),
        sa.Column('score_percentage', sa.Float(), nullable=False, comment='Score percentage (0.0 to 100.0)'),
        sa.Column('submitted_answers', sa.JSON(), nullable=False, comment="User's submitted answers {question_id: option_index}"),
        sa.Column('graded_result', sa.JSON(), nullable=False, comment='Complete graded evaluation with explanations'),
        sa.Column('completed_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], name=op.f('fk_quiz_attempts_document_id_documents'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['resource_id'], ['study_resources.id'], name=op.f('fk_quiz_attempts_resource_id_study_resources'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_quiz_attempts')),
    )
    op.create_index(op.f('ix_quiz_attempts_clerk_user_id'), 'quiz_attempts', ['clerk_user_id'], unique=False)
    op.create_index('ix_quiz_attempts_completed_at', 'quiz_attempts', ['completed_at'], unique=False)
    op.create_index('ix_quiz_attempts_resource', 'quiz_attempts', ['resource_id'], unique=False)
    op.create_index('ix_quiz_attempts_user_doc', 'quiz_attempts', ['clerk_user_id', 'document_id'], unique=False)

    op.create_table(
        'study_activities',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('clerk_user_id', sa.String(length=128), nullable=False, comment='Owner user ID'),
        sa.Column('document_id', sa.Uuid(), nullable=False, comment='Associated document ID'),
        sa.Column('activity_type', sa.String(length=64), nullable=False, comment='Activity type (e.g. flashcard_reviewed, question_bookmarked, quiz_completed)'),
        sa.Column('resource_id', sa.Uuid(), nullable=True, comment='Optional associated study resource ID'),
        sa.Column('activity_metadata', sa.JSON(), nullable=True, comment='Optional activity metadata'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], name=op.f('fk_study_activities_document_id_documents'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['resource_id'], ['study_resources.id'], name=op.f('fk_study_activities_resource_id_study_resources'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_study_activities')),
    )
    op.create_index(op.f('ix_study_activities_clerk_user_id'), 'study_activities', ['clerk_user_id'], unique=False)
    op.create_index('ix_study_activities_created_at', 'study_activities', ['created_at'], unique=False)
    op.create_index('ix_study_activities_user_doc', 'study_activities', ['clerk_user_id', 'document_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_study_activities_user_doc', table_name='study_activities')
    op.drop_index('ix_study_activities_created_at', table_name='study_activities')
    op.drop_index(op.f('ix_study_activities_clerk_user_id'), table_name='study_activities')
    op.drop_table('study_activities')

    op.drop_index('ix_quiz_attempts_user_doc', table_name='quiz_attempts')
    op.drop_index('ix_quiz_attempts_resource', table_name='quiz_attempts')
    op.drop_index('ix_quiz_attempts_completed_at', table_name='quiz_attempts')
    op.drop_index(op.f('ix_quiz_attempts_clerk_user_id'), table_name='quiz_attempts')
    op.drop_table('quiz_attempts')

    op.drop_index('ix_question_bookmarks_user_doc', table_name='question_bookmarks')
    op.drop_index('ix_question_bookmarks_resource', table_name='question_bookmarks')
    op.drop_index(op.f('ix_question_bookmarks_clerk_user_id'), table_name='question_bookmarks')
    op.drop_table('question_bookmarks')

    op.drop_index('ix_flashcard_progress_user_doc', table_name='flashcard_progress')
    op.drop_index('ix_flashcard_progress_resource', table_name='flashcard_progress')
    op.drop_index(op.f('ix_flashcard_progress_clerk_user_id'), table_name='flashcard_progress')
    op.drop_table('flashcard_progress')
