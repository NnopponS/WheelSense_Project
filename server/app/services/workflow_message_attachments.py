from __future__ import annotations

"""Pending upload + finalize storage for workflow message attachments (images + PDF)."""

import json
import re
import shutil
import uuid
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile

from app.config import settings

_MAX_BYTES = 8 * 1024 * 1024
_MAX_ATTACHMENTS_PER_MESSAGE = 5
_ALLOWED_CONTENT_TYPES = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "application/pdf",
    }
)


def _storage_root() -> Path:
    root = Path(settings.profile_image_storage_dir) / "workflow-messages"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _pending_dir(workspace_id: int, user_id: int) -> Path:
    d = _storage_root() / "pending" / f"ws_{workspace_id}" / f"u_{user_id}"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _final_dir(workspace_id: int, message_id: int) -> Path:
    d = _storage_root() / "final" / f"ws_{workspace_id}" / f"msg_{message_id}"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _final_dir_task(workspace_id: int, task_id: int) -> Path:
    d = _storage_root() / "final" / f"ws_{workspace_id}" / f"task_{task_id}"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _safe_filename(name: str) -> str:
    base = Path(name or "file").name
    base = re.sub(r"[^a-zA-Z0-9._-]+", "_", base)[:180]
    return base or "file"


async def save_pending_upload(
    *,
    workspace_id: int,
    user_id: int,
    file: UploadFile,
) -> dict:
    """Write upload to pending storage. Returns metadata dict for API response."""
    raw = await file.read()
    if len(raw) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="Attachment too large")
    ctype = (file.content_type or "").split(";")[0].strip().lower()
    if ctype not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail="Unsupported file type; allowed: JPEG, PNG, GIF, WebP, PDF",
        )
    pending_id = str(uuid.uuid4())
    pdir = _pending_dir(workspace_id, user_id)
    meta = {
        "pending_id": pending_id,
        "filename": _safe_filename(file.filename or "attachment"),
        "content_type": ctype,
        "byte_size": len(raw),
    }
    data_path = pdir / f"{pending_id}.bin"
    meta_path = pdir / f"{pending_id}.json"
    data_path.write_bytes(raw)
    meta_path.write_text(json.dumps(meta), encoding="utf-8")
    return meta


def _read_pending_meta(workspace_id: int, user_id: int, pending_id: str) -> dict | None:
    pdir = _pending_dir(workspace_id, user_id)
    meta_path = pdir / f"{pending_id}.json"
    if not meta_path.is_file():
        return None
    try:
        return json.loads(meta_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def finalize_pending_attachments(
    *,
    workspace_id: int,
    user_id: int,
    message_id: int,
    pending_ids: list[str],
) -> list[dict]:
    """Move pending files into message final folder; return list for JSONB column."""
    if len(pending_ids) > _MAX_ATTACHMENTS_PER_MESSAGE:
        raise HTTPException(
            status_code=422,
            detail=f"At most {_MAX_ATTACHMENTS_PER_MESSAGE} attachments per message",
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
        final = _final_dir(workspace_id, message_id)
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
        rel = f"workflow-messages/final/ws_{workspace_id}/msg_{message_id}/{dest_name}"
        out.append(
            {
                "id": attach_id,
                "filename": fname,
                "content_type": meta.get("content_type") or "application/octet-stream",
                "byte_size": int(meta.get("byte_size") or dest_path.stat().st_size),
                "storage_relpath": rel,
            }
        )
    return out


def finalize_pending_attachments_for_task(
    *,
    workspace_id: int,
    user_id: int,
    task_id: int,
    pending_ids: list[str],
) -> list[dict]:
    """Move pending uploads into a per-task final folder; return JSONB attachment dicts."""
    if len(pending_ids) > _MAX_ATTACHMENTS_PER_MESSAGE:
        raise HTTPException(
            status_code=422,
            detail=f"At most {_MAX_ATTACHMENTS_PER_MESSAGE} attachments per batch",
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
        final = _final_dir_task(workspace_id, task_id)
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
        rel = f"workflow-messages/final/ws_{workspace_id}/task_{task_id}/{dest_name}"
        out.append(
            {
                "id": attach_id,
                "filename": fname,
                "content_type": meta.get("content_type") or "application/octet-stream",
                "byte_size": int(meta.get("byte_size") or dest_path.stat().st_size),
                "storage_relpath": rel,
            }
        )
    return out


def read_pending_attachment_bytes(
    *,
    workspace_id: int,
    user_id: int,
    pending_id: str,
) -> tuple[Path, str, str]:
    """Return pending file path, content type, download filename for the owning user."""
    meta = _read_pending_meta(workspace_id, user_id, pending_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Attachment not found")
    pdir = _pending_dir(workspace_id, user_id)
    src_bin = pdir / f"{pending_id}.bin"
    if not src_bin.is_file():
        raise HTTPException(status_code=404, detail="Attachment file missing from storage")
    fname = _safe_filename(meta.get("filename") or "download")
    ctype = str(meta.get("content_type") or "application/octet-stream")
    return src_bin, ctype, fname


def delete_attachment_files(attachments: list | None) -> None:
    if not attachments:
        return
    root = Path(settings.profile_image_storage_dir)
    for item in attachments:
        if not isinstance(item, dict):
            continue
        rel = item.get("storage_relpath")
        if not rel or not isinstance(rel, str):
            continue
        path = root / rel
        try:
            if path.is_file():
                path.unlink()
        except OSError:
            pass
        try:
            parent = path.parent
            if parent.is_dir() and not any(parent.iterdir()):
                parent.rmdir()
        except OSError:
            pass


def resolve_attachment_path(attachments: list | None, attachment_id: str) -> tuple[Path, str, str]:
    """Return absolute path, content_type, download filename."""
    if not attachments:
        raise HTTPException(status_code=404, detail="Attachment not found")
    root = Path(settings.profile_image_storage_dir)
    for item in attachments:
        if not isinstance(item, dict):
            continue
        if item.get("id") != attachment_id:
            continue
        rel = item.get("storage_relpath")
        if not rel or not isinstance(rel, str):
            raise HTTPException(status_code=404, detail="Attachment not found")
        path = root / rel
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Attachment file missing from storage")
        return (
            path,
            str(item.get("content_type") or "application/octet-stream"),
            str(item.get("filename") or "download"),
        )
    raise HTTPException(status_code=404, detail="Attachment not found")


def resolve_attachment_from_task_json(
    report_template: dict[str, Any] | None,
    subtasks: list[Any] | None,
    attachment_id: str,
) -> tuple[Path, str, str]:
    """Find attachment id in task.report_template.attachments or subtask report_spec.attachments."""
    buckets: list[list[Any]] = []
    rt = report_template or {}
    att = rt.get("attachments")
    if isinstance(att, list) and att:
        buckets.append(att)
    for st in subtasks or []:
        if not isinstance(st, dict):
            continue
        rs = st.get("report_spec") or {}
        if not isinstance(rs, dict):
            continue
        sa = rs.get("attachments")
        if isinstance(sa, list) and sa:
            buckets.append(sa)
    last_exc: HTTPException | None = None
    for b in buckets:
        try:
            return resolve_attachment_path(b, attachment_id)
        except HTTPException as e:
            last_exc = e
            continue
    if last_exc:
        raise last_exc
    raise HTTPException(status_code=404, detail="Attachment not found")
