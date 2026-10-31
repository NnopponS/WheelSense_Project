from __future__ import annotations

"""Finalize pending uploads into care_workflow_job_steps.attachments JSONB.

Pending files are stored by `save_pending_upload` in workflow_message_attachments
(same pending folder as message attachments).
"""

import json
import re
import shutil
import uuid
from pathlib import Path

from fastapi import HTTPException

from app.config import settings

_MAX_ATTACHMENTS_PER_STEP = 5


def _storage_root() -> Path:
    root = Path(settings.profile_image_storage_dir) / "workflow-jobs"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _pending_dir(workspace_id: int, user_id: int) -> Path:
    """Must match app.services.workflow_message_attachments._pending_dir."""
    d = Path(settings.profile_image_storage_dir) / "workflow-messages" / "pending" / f"ws_{workspace_id}" / f"u_{user_id}"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _final_dir(workspace_id: int, job_id: int, step_id: int) -> Path:
    d = _storage_root() / "final" / f"ws_{workspace_id}" / f"job_{job_id}" / f"step_{step_id}"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _safe_filename(name: str) -> str:
    base = Path(name or "file").name
    base = re.sub(r"[^a-zA-Z0-9._-]+", "_", base)[:180]
    return base or "file"


def _read_pending_meta(workspace_id: int, user_id: int, pending_id: str) -> dict | None:
    pdir = _pending_dir(workspace_id, user_id)
    meta_path = pdir / f"{pending_id}.json"
    if not meta_path.is_file():
        return None
    try:
        return json.loads(meta_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def finalize_pending_for_step(
    *,
    workspace_id: int,
    user_id: int,
    job_id: int,
    step_id: int,
    pending_ids: list[str],
    existing: list | None,
) -> list[dict]:
    """Merge new finalized attachments into existing JSONB list."""
    if len(pending_ids) > _MAX_ATTACHMENTS_PER_STEP:
        raise HTTPException(
            status_code=422,
            detail=f"At most {_MAX_ATTACHMENTS_PER_STEP} attachments per step",
        )
    base = list(existing or [])
    if len(base) + len(pending_ids) > _MAX_ATTACHMENTS_PER_STEP:
        raise HTTPException(
            status_code=422,
            detail=f"At most {_MAX_ATTACHMENTS_PER_STEP} attachments per step",
        )
    seen: set[str] = set()
    out: list[dict] = []
    for pid in pending_ids:
        if pid in seen:
            continue
        seen.add(pid)
        meta = _read_pending_meta(workspace_id, user_id, pid)
        if meta is None:
            raise HTTPException(status_code=400, detail=f"Unknown or expired pending attachment: {pid}")
        pdir = _pending_dir(workspace_id, user_id)
        src_bin = pdir / f"{pid}.bin"
        if not src_bin.is_file():
            raise HTTPException(status_code=400, detail=f"Missing pending attachment data: {pid}")
        attach_id = str(uuid.uuid4())
        fname = _safe_filename(meta.get("filename") or "file")
        final = _final_dir(workspace_id, job_id, step_id)
        ext = Path(fname).suffix.lower()
        if ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf"}:
            if (meta.get("content_type") or "") == "application/pdf":
                ext = ".pdf"
            elif "jpeg" in (meta.get("content_type") or "") or "jpg" in (meta.get("content_type") or ""):
                ext = ".jpg"
            elif "png" in (meta.get("content_type") or ""):
                ext = ".png"
            elif "gif" in (meta.get("content_type") or ""):
                ext = ".gif"
            elif "webp" in (meta.get("content_type") or ""):
                ext = ".webp"
            else:
                ext = ".bin"
        dest_name = f"{attach_id}{ext}"
        dest_path = final / dest_name
        shutil.move(str(src_bin), str(dest_path))
        meta_path = pdir / f"{pid}.json"
        if meta_path.is_file():
            meta_path.unlink()
        rel = f"workflow-jobs/final/ws_{workspace_id}/job_{job_id}/step_{step_id}/{dest_name}"
        out.append(
            {
                "id": attach_id,
                "filename": fname,
                "content_type": meta.get("content_type") or "application/octet-stream",
                "byte_size": int(meta.get("byte_size") or dest_path.stat().st_size),
                "storage_relpath": rel,
            }
        )
    merged = base + out
    return merged


def resolve_step_attachment_path(attachments: list | None, attachment_id: str) -> tuple[Path, str, str]:
    from app.services.workflow_message_attachments import resolve_attachment_path

    return resolve_attachment_path(attachments, attachment_id)
