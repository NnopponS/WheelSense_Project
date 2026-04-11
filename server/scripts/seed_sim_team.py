#!/usr/bin/env python3
"""Seed a minimal simulator-ready workspace: rooms, 5 patients + devices, 4 staff users.

Does not create a second admin account — use the bootstrap admin (BOOTSTRAP_ADMIN_*).
Aligns workspace name with BOOTSTRAP_ADMIN_ATTACH_DEMO_WORKSPACE / bootstrap_demo_workspace_name.

Usage:
    cd server
    python scripts/seed_sim_team.py
    python scripts/seed_sim_team.py --reset
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from app.config import settings


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Seed sim team + 5 patients for MQTT simulator")
    p.add_argument(
        "--workspace",
        default=(settings.bootstrap_demo_workspace_name or "WheelSense Demo Workspace").strip(),
        help="Workspace name (default from BOOTSTRAP_DEMO_WORKSPACE_NAME)",
    )
    p.add_argument(
        "--reset",
        action="store_true",
        help="Delete existing workspace with this name before re-seeding",
    )
    return p.parse_args()


def _configure_console_utf8() -> None:
    out = getattr(sys.stdout, "reconfigure", None)
    if callable(out):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass


def main() -> None:
    _configure_console_utf8()
    args = parse_args()
    from seed_demo import run_sim_team_seed

    asyncio.run(run_sim_team_seed(args.workspace, args.reset))


if __name__ == "__main__":
    main()
