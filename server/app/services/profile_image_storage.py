from __future__ import annotations

"""Local profile image files saved under `settings.profile_image_storage_dir`."""

import re
import secrets
from pathlib import Path

from app.config import settings

_HOSTED_PATH = re.compile(r"^/api/public/profile-images/([a-f0-9]{32}\.jpg)$")

MAX_PROFILE_JPEG_BYTES = 600 * 1024


def store_hosted_profile_jpeg_bytes(data: bytes) -> str:
    """
    Validate JPEG bytes, write under profile_image_storage_dir, return hosted relative URL
    e.g. /api/public/profile-images/<hex>.jpg
    """
    if len(data) > MAX_PROFILE_JPEG_BYTES:
        raise ValueError("Image too large")
    if len(data) < 3 or data[:3] != b"\xff\xd8\xff":
        raise ValueError("Please upload a JPEG image")
    token = f"{secrets.token_hex(16)}.jpg"
    dirpath = Path(settings.profile_image_storage_dir)
    dirpath.mkdir(parents=True, exist_ok=True)
    out_path = dirpath / token
    out_path.write_bytes(data)
    return f"/api/public/profile-images/{token}"


def remove_hosted_profile_file_if_any(profile_image_url: str | None) -> None:
    """Delete a previously stored avatar file when the URL matches our public path pattern."""
    if not profile_image_url:
        return
    m = _HOSTED_PATH.fullmatch(profile_image_url.strip())
    if not m:
        return
    path = Path(settings.profile_image_storage_dir) / m.group(1)
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass
