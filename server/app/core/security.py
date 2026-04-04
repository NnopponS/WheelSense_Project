"""Security utilities for WheelSense."""

from datetime import datetime, timedelta, timezone
from typing import Any, Union

from jose import jwt
import bcrypt

from app.config import settings


def validate_runtime_settings() -> None:
    """Block unsafe runtime startup outside debug/local flows."""
    if not settings.has_secure_secret_key and not settings.debug:
        raise RuntimeError(
            "SECRET_KEY is using the default insecure value. "
            "Set SECRET_KEY before starting the server."
        )


def create_access_token(
    subject: Union[str, Any], role: str, expires_delta: timedelta | None = None
) -> str:
    """Create a JWT Access token."""
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.access_token_expire_minutes
        )
        
    to_encode = {"exp": expire, "sub": str(subject), "role": role}
    encoded_jwt = jwt.encode(
        to_encode, settings.secret_key, algorithm=settings.algorithm
    )
    return encoded_jwt


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plain password against hashed password."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), hashed_password.encode("utf-8")
        )
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """Generate bcrypt hash from plain password."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")
