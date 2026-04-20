#!/usr/bin/env python3
"""Legacy entry shim — delegates to the game-aligned simulator seeder.

Kept only so existing Docker compose commands and developer muscle memory
(`python scripts/seed_sim_team.py`) keep working. All real logic lives in
`app.sim.runtime.sim_game_seed`.
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
from app.sim.runtime.sim_game_seed import seed_sim_game_workspace


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Seed simulator workspace (delegates to sim_game_seed)."
    )
    p.add_argument(
        "--workspace",
        default=(settings.bootstrap_demo_workspace_name or "WheelSense Simulation").strip(),
        help="Workspace name (default from BOOTSTRAP_DEMO_WORKSPACE_NAME).",
    )
    p.add_argument(
        "--reset",
        action="store_true",
        help="Clear workspace-scoped dynamic data before re-seeding.",
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
    args = _parse_args()
    ws_id = asyncio.run(
        seed_sim_game_workspace(workspace_name=args.workspace, reset=args.reset)
    )
    print(f"[seed_sim_team] workspace_id={ws_id} reset={args.reset}")


if __name__ == "__main__":
    main()
