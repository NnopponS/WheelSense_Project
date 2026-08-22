"""Merge the legacy head_nurse role into canonical supervisor.

Revision ID: ia2b3c4d5e6f
Revises: ha1b2c3d4e5f
Create Date: 2026-08-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "ia2b3c4d5e6f"
down_revision: str | None = "ha1b2c3d4e5f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ROLE_COLUMNS: tuple[tuple[str, str], ...] = (
    ("care_directives", "target_role"),
    ("care_schedules", "assigned_role"),
    ("care_tasks", "assigned_role"),
    ("care_workflow_job_assignees", "role_hint"),
    ("caregivers", "role"),
    ("handover_notes", "target_role"),
    ("role_messages", "recipient_role"),
    ("routine_tasks", "assigned_role"),
    ("support_ticket_comments", "author_role"),
    ("support_tickets", "reporter_role"),
    ("tasks", "assigned_role"),
    ("users", "role"),
)


def upgrade() -> None:
    connection = op.get_bind()
    params = {"legacy": "head_nurse", "canonical": "supervisor"}

    connection.execute(
        sa.text(
            """
            UPDATE auth_sessions
            SET revoked_at = CURRENT_TIMESTAMP
            WHERE revoked_at IS NULL
              AND user_id IN (SELECT id FROM users WHERE role = :legacy)
            """
        ),
        params,
    )
    for table, column in ROLE_COLUMNS:
        connection.execute(
            sa.text(
                f'UPDATE "{table}" SET "{column}" = :canonical '
                f'WHERE "{column}" = :legacy'
            ),
            params,
        )


def downgrade() -> None:
    raise RuntimeError(
        "Role merge cannot distinguish original supervisors from migrated head nurses; "
        "restore the pre-migration database backup instead."
    )
