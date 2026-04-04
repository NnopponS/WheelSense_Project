"""User authentication and Role-Based Access Control models."""

from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
)

from .base import Base, utcnow


class User(Base):
    """System users with Role-Based Access Control."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(
        Integer,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    
    username = Column(String(128), unique=True, index=True, nullable=False)
    hashed_password = Column(String(256), nullable=False)
    
    # admin, supervisor, head_nurse, observer, patient
    role = Column(String(32), nullable=False, default="observer")
    
    is_active = Column(Boolean, default=True)
    
    # Links to domain models (nullable because Admin might not be a Caregiver or Patient)
    caregiver_id = Column(
        Integer, ForeignKey("caregivers.id", ondelete="SET NULL"), nullable=True
    )
    patient_id = Column(
        Integer, ForeignKey("patients.id", ondelete="SET NULL"), nullable=True
    )

    # Optional AI preferences (override workspace defaults when set)
    ai_provider = Column(String(32), nullable=True)
    ai_model = Column(String(128), nullable=True)

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
