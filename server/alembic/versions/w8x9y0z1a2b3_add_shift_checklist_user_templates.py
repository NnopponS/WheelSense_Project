"""Add shift_checklist_user_templates for per-user checklist rows.

Revision ID: w8x9y0z1a2b3
Revises: v6w7x8y9z0a1
Create Date: 2026-04-14
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "w8x9y0z1a2b3"
down_revision: Union[str, None] = "v6w7x8y9z0a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "shift_checklist_user_templates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("items", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "workspace_id",
            "user_id",
            name="uq_shift_checklist_tpl_workspace_user",
        ),
    )
    op.create_index(
        "ix_shift_checklist_user_templates_workspace_id",
        "shift_checklist_user_templates",
        ["workspace_id"],
        unique=False,
    )
    op.create_index(
        "ix_shift_checklist_user_templates_user_id",
        "shift_checklist_user_templates",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_shift_checklist_user_templates_user_id",
        table_name="shift_checklist_user_templates",
    )
    op.drop_index(
        "ix_shift_checklist_user_templates_workspace_id",
        table_name="shift_checklist_user_templates",
    )
    op.drop_table("shift_checklist_user_templates")
