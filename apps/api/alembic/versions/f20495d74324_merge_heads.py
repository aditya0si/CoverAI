"""merge heads

Revision ID: f20495d74324
Revises: 3e709ee74280, a1b2c3d4e5f6
Create Date: 2026-05-27 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f20495d74324'
down_revision: Union[str, Sequence[str], None] = ('3e709ee74280', 'a1b2c3d4e5f6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
