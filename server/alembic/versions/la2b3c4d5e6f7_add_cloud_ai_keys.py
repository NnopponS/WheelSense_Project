"""Store encrypted workspace keys for OpenAI and OpenRouter."""

import sqlalchemy as sa
from alembic import op

revision = "la2b3c4d5e6f7"
down_revision = "ka1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("workspace_ai_settings", sa.Column("openai_api_key_encrypted", sa.Text(), nullable=True))
    op.add_column("workspace_ai_settings", sa.Column("openrouter_api_key_encrypted", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("workspace_ai_settings", "openrouter_api_key_encrypted")
    op.drop_column("workspace_ai_settings", "openai_api_key_encrypted")
