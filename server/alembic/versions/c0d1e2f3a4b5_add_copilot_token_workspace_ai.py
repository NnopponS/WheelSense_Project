"""Add encrypted Copilot OAuth token column to workspace_ai_settings.

Revision ID: c0d1e2f3a4b5
Revises: b7c8d9e0f1a2
Create Date: 2026-04-04
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c0d1e2f3a4b5"
down_revision: Union[str, None] = "b7c8d9e0f1a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "workspace_ai_settings",
        sa.Column("copilot_token_encrypted", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("workspace_ai_settings", "copilot_token_encrypted")
