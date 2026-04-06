"""Add unique patient link per workspace on users

Revision ID: i4j5k6l7m8n9
Revises: h3i4j5k6l7m8
Create Date: 2026-04-06
"""

from typing import Sequence, Union

from alembic import op


revision: str = "i4j5k6l7m8n9"
down_revision: Union[str, None] = "h3i4j5k6l7m8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_users_workspace_patient_link
        ON users (workspace_id, patient_id)
        WHERE patient_id IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP INDEX IF EXISTS uq_users_workspace_patient_link
        """
    )
