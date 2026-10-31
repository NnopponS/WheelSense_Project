"""Add mcp_tokens table for MCP OAuth authentication.

Revision ID: u5v6w7x8y9z0
Revises: t4u5v6w7x8y9
Create Date: 2026-04-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "u5v6w7x8y9z0"
down_revision: Union[str, None] = "t4u5v6w7x8y9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mcp_tokens",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("auth_session_id", sa.String(length=64), nullable=False),
        sa.Column("client_name", sa.String(length=128), nullable=False, server_default=""),
        sa.Column("client_origin", sa.String(length=512), nullable=False, server_default=""),
        sa.Column("scopes", sa.String(length=1024), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["auth_session_id"], ["auth_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_mcp_tokens_auth_session_id", "mcp_tokens", ["auth_session_id"], unique=False)
    op.create_index("ix_mcp_tokens_expires_at", "mcp_tokens", ["expires_at"], unique=False)
    op.create_index("ix_mcp_tokens_revoked_at", "mcp_tokens", ["revoked_at"], unique=False)
    op.create_index("ix_mcp_tokens_user_id", "mcp_tokens", ["user_id"], unique=False)
    op.create_index("ix_mcp_tokens_workspace_id", "mcp_tokens", ["workspace_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_mcp_tokens_workspace_id", table_name="mcp_tokens")
    op.drop_index("ix_mcp_tokens_user_id", table_name="mcp_tokens")
    op.drop_index("ix_mcp_tokens_revoked_at", table_name="mcp_tokens")
    op.drop_index("ix_mcp_tokens_expires_at", table_name="mcp_tokens")
    op.drop_index("ix_mcp_tokens_auth_session_id", table_name="mcp_tokens")
    op.drop_table("mcp_tokens")
