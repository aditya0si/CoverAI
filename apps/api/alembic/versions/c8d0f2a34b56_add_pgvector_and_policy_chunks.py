"""add pgvector and policy chunks

Revision ID: c8d0f2a34b56
Revises: b7c9e1f23a45
Create Date: 2026-07-14 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector


# revision identifiers, used by Alembic.
revision: str = 'c8d0f2a34b56'
down_revision: Union[str, Sequence[str], None] = 'b7c9e1f23a45'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Ensure pgvector extension exists
    op.execute('CREATE EXTENSION IF NOT EXISTS vector;')
    
    op.create_table(
        'policy_chunks',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('policy_id', sa.UUID(), nullable=False),
        sa.Column('chunk_index', sa.Integer(), nullable=False),
        sa.Column('content', sa.String(), nullable=False),
        sa.Column('embedding', Vector(768), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['policy_id'], ['policies.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_policy_chunks_policy_id'), 'policy_chunks', ['policy_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_policy_chunks_policy_id'), table_name='policy_chunks')
    op.drop_table('policy_chunks')
