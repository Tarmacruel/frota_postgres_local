"""Personal justification suggestions, learned only from new successful operations."""
from alembic import op
import sqlalchemy as sa

revision = "0049_justification_suggestions"
down_revision = "0048_possession_rectification"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("justification_suggestions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("context", sa.String(64), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("normalized_key", sa.String(64), nullable=False),
        sa.Column("use_count", sa.BigInteger(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("uq_justification_user_context_key", "justification_suggestions",
                    ["user_id", "context", "normalized_key"], unique=True)


def downgrade():
    op.drop_table("justification_suggestions")
