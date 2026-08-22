"""Seed ADL mock timeline from sim_patient_timelines.csv into activity_timeline."""

from __future__ import annotations

import asyncio
import csv
import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import text

from app.db.session import AsyncSessionLocal
from app.models.activity import ActivityTimeline

CSV_PATH = Path(__file__).resolve().parent.parent / "app" / "services" / "adl" / "sim_patient_timelines.csv"


def parse_data(raw: str) -> dict:
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def _load_rows() -> list[dict]:
    with CSV_PATH.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def _parse_ts(value: str) -> datetime:
    value = value.replace("+00", "+00:00").replace(" ", "T")
    return datetime.fromisoformat(value).replace(tzinfo=timezone.utc)


def _transform(row: dict) -> dict:
    data = parse_data(row.get("data", ""))
    data.setdefault("simulated", True)
    data["patient_id"] = int(row["patient_id"])
    data["caregiver_id"] = (row.get("caregiver_id") or "").strip()
    return {
        "workspace_id": int(row["workspace_id"]),
        "patient_id": int(row["patient_id"]),
        "timestamp": _parse_ts(row["timestamp"]),
        "event_type": row["event_type"],
        "room_id": int(row["room_id"]) if row["room_id"].isdigit() else None,
        "room_name": row["room_name"],
        "description": row["description"],
        "source": row["source"],
        "caregiver_id": None,
        "data": data,
    }


async def _seed() -> int:
    rows = _load_rows()
    events = [_transform(r) for r in rows]

    async with AsyncSessionLocal() as db:
        # Clear existing simulated events to avoid duplicates on re-run.
        await db.execute(text("DELETE FROM activity_timeline WHERE data->>'simulated' = 'true'"))
        for e in events:
            db.add(ActivityTimeline(**e))
        await db.commit()
    return len(events)


if __name__ == "__main__":
    count = asyncio.run(_seed())
    print(f"Seeded {count} ADL timeline events.")
