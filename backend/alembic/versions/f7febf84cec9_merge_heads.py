"""merge heads

Revision ID: f7febf84cec9
Revises: 0016_fso_org_index, 10d2f34e089d
Create Date: 2026-04-20 19:28:43.417458
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f7febf84cec9'
down_revision = ('0016_fso_org_index', '10d2f34e089d')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
