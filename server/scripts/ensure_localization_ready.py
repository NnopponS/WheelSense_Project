#!/usr/bin/env python3

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from app.db.session import AsyncSessionLocal
from app.services.localization_setup import repair_localization_readiness


async def main(workspace_id: int) -> None:
    async with AsyncSessionLocal() as session:
        payload = await repair_localization_readiness(session, workspace_id)
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Repair the default strongest-RSSI localization linkage for a workspace",
    )
    parser.add_argument("--workspace-id", type=int, required=True)
    args = parser.parse_args()
    asyncio.run(main(args.workspace_id))
