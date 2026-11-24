"""update_vector_dimensions_to_1024

Revision ID: 9e0f1a2b3c4d
Revises: 8d9e0f1a2b3c
Create Date: 2026-11-24 20:30:00.000000

Safely migrates document vector embeddings from Vector(384) (FastEmbed BAAI/bge-small-en-v1.5)
to Vector(1024) (Jina AI jina-embeddings-v3) for low-memory cloud hosting.
Drops and rebuilds the HNSW cosine index, nullifies incompatible legacy vectors, and
resets index statuses to 'pending' for reindexing.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision: str = '9e0f1a2b3c4d'
down_revision: Union[str, None] = '8d9e0f1a2b3c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"

    if is_postgres:
        # 1. Drop old HNSW index prior to column alteration
        op.execute("DROP INDEX IF EXISTS ix_document_chunks_embedding;")

        # 2. Reset legacy 384-d embeddings to NULL to avoid incompatible dimension cast errors
        op.execute("UPDATE document_chunks SET embedding = NULL;")

        # 3. Alter vector column to 1024 dimensions
        op.execute("ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector(1024);")

        # 4. Rebuild HNSW vector cosine index
        op.execute(
            "CREATE INDEX ix_document_chunks_embedding ON document_chunks "
            "USING hnsw (embedding vector_cosine_ops);"
        )

        # 5. Mark existing indexes with old dimensions as pending for reindexing
        # Sets updated_at timestamp safely via sa.func.now() compatibility
        op.execute(
            "UPDATE document_indexes SET status = 'pending', chunk_count = 0, "
            "embedding_provider = 'jina', embedding_model = 'jina-embeddings-v3', "
            "embedding_dimensions = 1024 WHERE embedding_dimensions != 1024;"
        )

        # 6. Update server defaults
        op.alter_column('document_indexes', 'embedding_provider', server_default='jina')
        op.alter_column('document_indexes', 'embedding_dimensions', server_default='1024')
    else:
        with op.batch_alter_table("document_chunks") as batch_op:
            batch_op.alter_column(
                "embedding",
                type_=Vector(1024),
                existing_type=Vector(384),
                existing_nullable=True,
            )
        with op.batch_alter_table("document_indexes") as batch_op:
            batch_op.alter_column(
                "embedding_provider",
                server_default="jina",
                existing_type=sa.String(length=64),
                existing_nullable=False,
            )
            batch_op.alter_column(
                "embedding_dimensions",
                server_default="1024",
                existing_type=sa.Integer(),
                existing_nullable=False,
            )


def downgrade() -> None:
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"

    if is_postgres:
        # 1. Drop HNSW index
        op.execute("DROP INDEX IF EXISTS ix_document_chunks_embedding;")

        # 2. Reset embeddings to NULL to avoid casting error
        op.execute("UPDATE document_chunks SET embedding = NULL;")

        # 3. Revert vector column to 384 dimensions
        op.execute("ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector(384);")

        # 4. Rebuild HNSW vector cosine index
        op.execute(
            "CREATE INDEX ix_document_chunks_embedding ON document_chunks "
            "USING hnsw (embedding vector_cosine_ops);"
        )

        # 5. Revert server defaults
        op.alter_column('document_indexes', 'embedding_provider', server_default='local')
        op.alter_column('document_indexes', 'embedding_dimensions', server_default='384')
    else:
        with op.batch_alter_table("document_chunks") as batch_op:
            batch_op.alter_column(
                "embedding",
                type_=Vector(384),
                existing_type=Vector(1024),
                existing_nullable=True,
            )
        with op.batch_alter_table("document_indexes") as batch_op:
            batch_op.alter_column(
                "embedding_provider",
                server_default="local",
                existing_type=sa.String(length=64),
                existing_nullable=False,
            )
            batch_op.alter_column(
                "embedding_dimensions",
                server_default="384",
                existing_type=sa.Integer(),
                existing_nullable=False,
            )
