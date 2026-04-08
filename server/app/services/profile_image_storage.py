from __future__ import annotations

"""Local profile image files saved under `settings.profile_image_storage_dir`."""

import re
from pathlib import Path

from app.config import settings

_HOSTED_PATH = re.compile(r"^/api/public/profile-images/([a-f0-9]{32}\.jpg)$")

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
