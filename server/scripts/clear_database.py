#!/usr/bin/env python3
"""
WheelSense Database Clear Script
=================================
Clears all application data. By default keeps the bootstrap admin user and
resets their password to a known value (see `--full`).

Usage:
    cd server
    python scripts/clear_database.py
    python scripts/clear_database.py --full  # Remove all users; recreate bootstrap admin
    python scripts/clear_database.py --force  # Skip confirmation

Admin identity follows BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD in app config.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from app.config import settings
from app.core.security import get_password_hash
from app.db.session import AsyncSessionLocal
from app.models.users import User
from app.models.core import Workspace
from app.services.database_clear import clear_application_data


async def _resolve_preserve_user_id(session: AsyncSession) -> int | None:
    res = await session.execute(
        select(User).where(User.username == settings.bootstrap_admin_username)
    )
    u = res.scalar_one_or_none()
    return u.id if u else None


async def create_bootstrap_admin_after_full_wipe(session: AsyncSession) -> User:
    """Recreate workspace + admin when no user is preserved."""
    ws = Workspace(name="System Workspace", mode="real", is_active=True)
    session.add(ws)
    await session.flush()
    pwd = settings.bootstrap_admin_password or ""
    if not pwd:
        raise RuntimeError(
            "BOOTSTRAP_ADMIN_PASSWORD must be set to recreate admin after --full clear."
        )
    admin = User(
        username=settings.bootstrap_admin_username,
        hashed_password=get_password_hash(pwd),
        role="admin",
        workspace_id=ws.id,
        is_active=True,
    )
    session.add(admin)
    await session.commit()
    await session.refresh(admin)
    return admin


async def run_clear(full: bool = False) -> None:
    print("=" * 60)
    print("WheelSense Database Clear Script")
    print("=" * 60)
    print()

    async with AsyncSessionLocal() as session:
        if full:
            await clear_application_data(session, preserve_user_id=None)
            print("Recreating bootstrap admin + workspace...")
            admin = await create_bootstrap_admin_after_full_wipe(session)
            print(f"  ✓ Admin id={admin.id} workspace_id={admin.workspace_id}")
        else:
            preserve_id = await _resolve_preserve_user_id(session)
            if preserve_id is None:
                print(
                    f"  ! No user with username {settings.bootstrap_admin_username!r}; "
                    "running full wipe then bootstrap admin."
                )
                await clear_application_data(session, preserve_user_id=None)
                admin = await create_bootstrap_admin_after_full_wipe(session)
                print(f"  ✓ Created admin id={admin.id}")
            else:
                pwd = settings.bootstrap_admin_password or ""
                if not pwd:
                    print(
                        "  ! BOOTSTRAP_ADMIN_PASSWORD empty — preserved user password not reset."
                    )
                await clear_application_data(
                    session,
                    preserve_user_id=preserve_id,
                    reset_preserved_password_to=pwd or None,
                )
                print(f"  ✓ Cleared data; preserved user id={preserve_id}")

    print()
    print("[OK] Database cleared.")
    print()
    print("Bootstrap admin (from environment / .env):")
    print(f"  username: {settings.bootstrap_admin_username}")
    print("  password: (value of BOOTSTRAP_ADMIN_PASSWORD)")
    print()
    print("Optional: python scripts/seed_production.py")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Clear WheelSense database data")
    parser.add_argument(
        "--full",
        action="store_true",
        help="Delete all users and workspaces, then recreate bootstrap admin",
    )
    parser.add_argument("--force", action="store_true", help="Skip confirmation prompt")
    return parser.parse_args()


def _configure_console_utf8() -> None:
    out = getattr(sys.stdout, "reconfigure", None)
    if callable(out):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass


async def main_async() -> None:
    args = parse_args()

    if not args.force and not args.full:
        print("This clears all application data.")
        print(
            f"Default: keep user {settings.bootstrap_admin_username!r} and align password "
            "with BOOTSTRAP_ADMIN_PASSWORD when set."
        )
        print()
        response = input("Are you sure? [y/N]: ")
        if response.lower() not in ("y", "yes"):
            print("Aborted.")
            return
        print()
    elif not args.force and args.full:
        print("WARNING: This deletes ALL users and workspaces, then recreates bootstrap admin.")
        print()
        response = input("Are you absolutely sure? [yes/no]: ")
        if response.lower() != "yes":
            print("Aborted.")
            return
        print()

    await run_clear(full=args.full)


def main() -> None:
    _configure_console_utf8()
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
