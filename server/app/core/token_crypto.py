from __future__ import annotations

"""Fernet helpers for storing OAuth tokens at rest (uses SECRET_KEY-derived key)."""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

def _fernet() -> Fernet:
    digest = hashlib.sha256(settings.secret_key.encode("utf-8")).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)

def encrypt_secret(plain: str) -> str:
    return _fernet().encrypt(plain.encode("utf-8")).decode("ascii")

def decrypt_secret(token: str) -> str | None:
    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except InvalidToken:
        return None
