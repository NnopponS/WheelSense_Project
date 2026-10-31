"""service_requests: optional title and observer claim fields

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-04-17

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d6e7f8a9b0c1"
down_revision: Union[str, None] = "c5d6e7f8a9b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("service_requests", sa.Column("title", sa.String(length=200), nullable=True))
    op.add_column(
        "service_requests",
        sa.Column("claimed_by_user_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "service_requests",
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_service_requests_claimed_by_user_id",
        "service_requests",
        "users",
        ["claimed_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_service_requests_claimed_by_user_id"),
        "service_requests",
        ["claimed_by_user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_service_requests_claimed_by_user_id"), table_name="service_requests")
    op.drop_constraint("fk_service_requests_claimed_by_user_id", "service_requests", type_="foreignkey")
    op.drop_column("service_requests", "claimed_at")
    op.drop_column("service_requests", "claimed_by_user_id")
    op.drop_column("service_requests", "title")
