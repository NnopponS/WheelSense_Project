"""Add shift_checklist_states for persisted observer shift checklists.

Revision ID: s2t3u4v5w6x7
Revises: q1r2s3t4u5v6
Create Date: 2026-04-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "s2t3u4v5w6x7"
down_revision: Union[str, None] = "q1r2s3t4u5v6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "shift_checklist_states",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("shift_date", sa.Date(), nullable=False),
        sa.Column("items", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "workspace_id",
            "user_id",
            "shift_date",
            name="uq_shift_checklist_workspace_user_date",
        ),
    )
    op.create_index(
        "ix_shift_checklist_states_workspace_id",
        "shift_checklist_states",
        ["workspace_id"],
        unique=False,
    )
    op.create_index(
        "ix_shift_checklist_states_user_id",
        "shift_checklist_states",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_shift_checklist_states_shift_date",
        "shift_checklist_states",
        ["shift_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_shift_checklist_states_shift_date", table_name="shift_checklist_states")
    op.drop_index("ix_shift_checklist_states_user_id", table_name="shift_checklist_states")
    op.drop_index("ix_shift_checklist_states_workspace_id", table_name="shift_checklist_states")
    op.drop_table("shift_checklist_states")
