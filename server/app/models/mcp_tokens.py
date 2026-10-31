from __future__ import annotations

"""MCP OAuth Token model for external MCP client authentication."""

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, text

from .base import Base, utcnow


class MCPToken(Base):
    """Server-tracked MCP access token for external MCP clients.

    MCP tokens are short-lived (1 hour) and scope-narrowed for specific
    MCP operations. They are linked to parent AuthSessions for
    cascading revocation when a session is revoked.
    """

    __tablename__ = "mcp_tokens"
    __table_args__ = (
        Index("ix_mcp_tokens_workspace_id", "workspace_id"),
        Index("ix_mcp_tokens_user_id", "user_id"),
        Index("ix_mcp_tokens_auth_session_id", "auth_session_id"),
        Index("ix_mcp_tokens_revoked_at", "revoked_at"),
        Index("ix_mcp_tokens_expires_at", "expires_at"),
    )

    id = Column(String(64), primary_key=True)
    workspace_id = Column(
        Integer,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Link to parent auth session for cascade revocation
    auth_session_id = Column(
        String(64),
        ForeignKey("auth_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Client metadata
    client_name = Column(String(128), nullable=False, default="")
    client_origin = Column(String(512), nullable=False, default="")

    # Scopes granted to this token (space-separated for easy querying)
    scopes = Column(String(1024), nullable=False, default="")

    # Token lifecycle
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    last_used_at = Column(DateTime(timezone=True), nullable=True)

    @property
    def is_active(self) -> bool:
        """Check if token is not revoked and not expired."""
        from datetime import datetime, timezone

        if self.revoked_at is not None:
            return False
        if self.expires_at is None:
            return False
        # Handle both offset-aware and offset-naive datetimes
        now = datetime.now(timezone.utc)
        if self.expires_at.tzinfo is None:
            # If expires_at is naive, assume UTC
            return self.expires_at.replace(tzinfo=timezone.utc) > now
        return self.expires_at > now

    def get_scopes_list(self) -> list[str]:
        """Return scopes as a list of strings."""
        if not self.scopes:
            return []
        return [s.strip() for s in self.scopes.split() if s.strip()]

    def set_scopes_list(self, scopes: list[str]) -> None:
        """Set scopes from a list of strings."""
        self.scopes = " ".join(sorted(set(scopes)))
