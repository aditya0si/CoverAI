"""google_oauth_and_nullable_password

Revision ID: a1b2c3d4e5f6
Revises: 91ad5093ccc4
Create Date: 2026-05-27 20:30:00.000000

Changes:
- Add google_id column (unique, indexed, nullable) to users table
- Add avatar_url column (nullable) to users table
- Make hashed_password nullable (Google OAuth users have no password)
- Make phone nullable (Google OAuth users may not provide a phone number)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '91ad5093ccc4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add Google OAuth columns and make password/phone nullable."""
    # Add google_id column for linking Google accounts
    op.add_column('users',
        sa.Column('google_id', sa.String(length=255), nullable=True)
    )
    op.create_index(op.f('ix_users_google_id'), 'users', ['google_id'], unique=True)

    # Add avatar_url column for Google profile pictures
    op.add_column('users',
        sa.Column('avatar_url', sa.String(length=512), nullable=True)
    )

    # Make hashed_password nullable (Google OAuth users have no password)
    op.alter_column('users', 'hashed_password',
        existing_type=sa.String(length=255),
        nullable=True
    )

    # Make phone nullable (Google OAuth users may not have a phone number)
    op.alter_column('users', 'phone',
        existing_type=sa.String(length=255),
        nullable=True
    )


def downgrade() -> None:
    """Reverse Google OAuth column additions."""
    # Drop google_id index and column
    op.drop_index(op.f('ix_users_google_id'), table_name='users')
    op.drop_column('users', 'google_id')

    # Drop avatar_url column
    op.drop_column('users', 'avatar_url')

    # Restore hashed_password to NOT NULL
    # Note: This may fail if any Google-only users exist (they have NULL passwords)
    op.alter_column('users', 'hashed_password',
        existing_type=sa.String(length=255),
        nullable=False
    )

    # Restore phone to NOT NULL
    # Note: This may fail if any Google-only users exist (they have NULL phones)
    op.alter_column('users', 'phone',
        existing_type=sa.String(length=255),
        nullable=False
    )
