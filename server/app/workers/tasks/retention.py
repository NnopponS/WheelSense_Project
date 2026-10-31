"""Background retention jobs."""

from __future__ import annotations

import logging

from app.workers.taskiq_app import task

logger = logging.getLogger("wheelsense.taskiq.retention")


@task(task_name="retention.run_cycle")
async def run_retention_cycle(workspace_id: int | None = None) -> dict[str, int | str | None]:
    """Taskiq entrypoint placeholder for retention cutover."""
    logger.info("Queued retention cycle task for workspace_id=%s", workspace_id)
    return {"status": "queued", "workspace_id": workspace_id}
