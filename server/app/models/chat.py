"""AI chat persistence — conversations and messages per workspace user."""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from .base import Base, utcnow


class ChatConversation(Base):
    """A chat thread owned by a user within a workspace."""

    __tablename__ = "chat_conversations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(
        Integer,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(String(256), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ChatMessage(Base):
    """Single message in a conversation."""

    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(
        Integer,
        ForeignKey("chat_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role = Column(String(32), nullable=False)  # user | assistant | system
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class WorkspaceAISettings(Base):
    """Workspace-level default AI provider/model (admin-configurable)."""

    __tablename__ = "workspace_ai_settings"

    workspace_id = Column(
        Integer,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        primary_key=True,
    )
    default_provider = Column(String(32), nullable=False, default="ollama")
    default_model = Column(String(128), nullable=False, default="gemma4:e4b")
    copilot_token_encrypted = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
