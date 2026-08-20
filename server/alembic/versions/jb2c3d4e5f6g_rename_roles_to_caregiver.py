"""Rename roles: supervisor→head_caregiver, head_nurse→head_caregiver, observer→caregiver.

Revision ID: jb2c3d4e5f6g
Revises: ia2b3c4d5e6f
Create Date: 2026-08-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "jb2c3d4e5f6g"
down_revision: str | None = "ia2b3c4d5e6f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Every table+column that stores a role string value.
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

# Legacy → canonical mapping. Order matters: update supervisor/head_nurse first,
# then observer, so there is no collision when both old names map to the same
# new name.
ROLE_RENAMES: tuple[tuple[str, str], ...] = (
    ("supervisor", "head_caregiver"),
    ("head_nurse", "head_caregiver"),
    ("observer", "caregiver"),
)


def upgrade() -> None:
    connection = op.get_bind()

    # Revoke active sessions for all affected users so they get fresh JWTs
    # with the new canonical role on next login.
    connection.execute(
        sa.text(
            """
            UPDATE auth_sessions
            SET revoked_at = CURRENT_TIMESTAMP
            WHERE revoked_at IS NULL
              AND user_id IN (
                  SELECT id FROM users
                  WHERE role IN ('supervisor', 'head_nurse', 'observer')
              )
            """
        ),
    )

    for old_role, new_role in ROLE_RENAMES:
        params = {"old": old_role, "new": new_role}
        for table, column in ROLE_COLUMNS:
            connection.execute(
                sa.text(
                    f'UPDATE "{table}" SET "{column}" = :new '
                    f'WHERE "{column}" = :old'
                ),
                params,
            )


def downgrade() -> None:
    raise RuntimeError(
        "Role rename is irreversible (supervisor and head_nurse both map to "
        "head_caregiver; cannot distinguish originals). Restore the "
        "pre-migration database backup instead."
    )
