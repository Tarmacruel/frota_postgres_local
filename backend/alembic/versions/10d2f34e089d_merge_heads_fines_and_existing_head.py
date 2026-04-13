"""merge heads fines and existing head

Revision ID: 10d2f34e089d
Revises: 0009_fines_module, 4842680f7abd
Create Date: 2026-04-13 13:29:43.309809
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '10d2f34e089d'
down_revision = ('0009_fines_module', '4842680f7abd')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
