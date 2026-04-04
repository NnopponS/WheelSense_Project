"""Enforce unique active device assignment per workspace

Revision ID: c1f4e2b7d9aa
Revises: f283dfeb80d0
Create Date: 2026-04-03 13:10:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "c1f4e2b7d9aa"
down_revision: Union[str, None] = "f283dfeb80d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_device_assignments_active_device
        ON patient_device_assignments (workspace_id, device_id)
        WHERE is_active = true
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP INDEX IF EXISTS uq_patient_device_assignments_active_device
        """
    )
