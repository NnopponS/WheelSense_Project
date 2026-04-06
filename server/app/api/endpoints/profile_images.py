"""Public profile image files (unguessable names; no auth on GET for <img src>)."""

from __future__ import annotations

import re
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import settings

router = APIRouter()

_FILENAME_RE = re.compile(r"^[a-f0-9]{32}\.jpg$")


def _resolved_file_path(filename: str) -> Path:
    if not _FILENAME_RE.fullmatch(filename):
        raise HTTPException(status_code=404, detail="Not found")
    try:
        base = Path(settings.profile_image_storage_dir).resolve()
        path = (base / filename).resolve()
        path.relative_to(base)
    except (OSError, ValueError):
        raise HTTPException(status_code=404, detail="Not found")
    return path


@router.get("/{filename}")
async def get_profile_image(filename: str):
    path = _resolved_file_path(filename)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(path, media_type="image/jpeg")
