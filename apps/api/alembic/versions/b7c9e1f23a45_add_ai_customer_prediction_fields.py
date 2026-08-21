"""add ai customer prediction fields

Revision ID: b7c9e1f23a45
Revises: f20495d74324
Create Date: 2026-05-30 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7c9e1f23a45'
down_revision: Union[str, Sequence[str], None] = 'f20495d74324'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('claims', sa.Column('ai_customer_prediction', sa.String(50), nullable=True))
    op.add_column('claims', sa.Column('ai_customer_explanation', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('claims', 'ai_customer_explanation')
    op.drop_column('claims', 'ai_customer_prediction')
