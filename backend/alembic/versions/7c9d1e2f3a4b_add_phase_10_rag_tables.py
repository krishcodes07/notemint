"""add_phase_10_rag_tables

Revision ID: 7c9d1e2f3a4b
Revises: 5a8b7c9d0e1f
Create Date: 2026-11-20 21:50:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision: str = '7c9d1e2f3a4b'
down_revision: Union[str, None] = '5a8b7c9d0e1f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"

    # 1. Enable pgvector extension on PostgreSQL
    if is_postgres:
        op.execute("CREATE EXTENSION IF NOT EXISTS vector;")

    # 2. Create document_indexes table
    op.create_table(
        'document_indexes',
        sa.Column('id', sa.Uuid(), nullable=False, comment='Unique identifier for the index record'),
        sa.Column('document_id', sa.Uuid(), nullable=False, comment='One-to-one foreign key to documents table'),
        sa.Column('status', sa.String(length=32), server_default='pending', nullable=False, comment='Indexing status: pending, indexing, completed, failed'),
        sa.Column('embedding_provider', sa.String(length=64), server_default='local', nullable=False, comment='Provider used for vector embeddings'),
        sa.Column('embedding_model', sa.String(length=128), nullable=False, comment='Embedding model identifier'),
        sa.Column('embedding_dimensions', sa.Integer(), server_default='384', nullable=False, comment='Embedding vector dimension'),
        sa.Column('chunk_count', sa.Integer(), server_default='0', nullable=False, comment='Number of chunks successfully indexed'),
        sa.Column('indexed_at', sa.DateTime(timezone=True), nullable=True, comment='Timestamp when indexing completed'),
        sa.Column('error_message', sa.Text(), nullable=True, comment='Error message if indexing failed'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], name=op.f('fk_document_indexes_document_id_documents'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_document_indexes')),
        sa.UniqueConstraint('document_id', name=op.f('uq_document_indexes_document_id')),
    )
    op.create_index(op.f('ix_document_indexes_document_id'), 'document_indexes', ['document_id'], unique=True)
    op.create_index('ix_document_indexes_status', 'document_indexes', ['status'], unique=False)

    # 3. Create document_chunks table
    op.create_table(
        'document_chunks',
        sa.Column('id', sa.Uuid(), nullable=False, comment='Unique identifier for the chunk'),
        sa.Column('document_id', sa.Uuid(), nullable=False, comment='Foreign key to documents table'),
        sa.Column('chunk_index', sa.Integer(), nullable=False, comment='Zero-based sequence index within the document'),
        sa.Column('text', sa.Text(), nullable=False, comment='Cleaned passage text content'),
        sa.Column('page_start', sa.Integer(), nullable=False, comment='Starting 1-based original PDF page number'),
        sa.Column('page_end', sa.Integer(), nullable=False, comment='Ending 1-based original PDF page number'),
        sa.Column('page_numbers', sa.JSON(), nullable=False, comment='All original PDF page numbers covered by this chunk'),
        sa.Column('token_count', sa.Integer(), nullable=False, comment='Estimated or exact token count'),
        sa.Column('content_hash', sa.String(length=64), nullable=False, comment='SHA-256 hash of the chunk text'),
        sa.Column('embedding', Vector(384), nullable=True, comment='pgvector dense embedding vector'),
        sa.Column('embedding_model', sa.String(length=128), nullable=False, comment='Model identifier used to produce the embedding'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], name=op.f('fk_document_chunks_document_id_documents'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_document_chunks')),
    )
    op.create_index(op.f('ix_document_chunks_document_id'), 'document_chunks', ['document_id'], unique=False)
    op.create_index('ix_document_chunks_doc_chunk', 'document_chunks', ['document_id', 'chunk_index'], unique=False)
    op.create_index('ix_document_chunks_doc_page', 'document_chunks', ['document_id', 'page_start', 'page_end'], unique=False)

    # 4. HNSW Vector Index on PostgreSQL
    if is_postgres:
        op.create_index(
            'ix_document_chunks_embedding',
            'document_chunks',
            ['embedding'],
            unique=False,
            postgresql_using='hnsw',
            postgresql_ops={'embedding': 'vector_cosine_ops'},
        )


def downgrade() -> None:
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"

    if is_postgres:
        op.drop_index('ix_document_chunks_embedding', table_name='document_chunks', postgresql_using='hnsw')

    op.drop_table('document_chunks')
    op.drop_table('document_indexes')

