from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


def _bootstrap_env() -> None:
    # Keep schema export side-effect free.
    os.environ.setdefault("WHEELSENSE_ENABLE_MCP", "0")
    os.environ.setdefault("BOOTSTRAP_ADMIN_ENABLED", "0")
    os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./.openapi-export.db")
    os.environ.setdefault("DATABASE_URL_SYNC", "sqlite:///./.openapi-export.db")


def export_openapi() -> dict:
    root = Path(__file__).resolve().parents[1]
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    _bootstrap_env()

    from app.main import app

    return app.openapi()


def main() -> int:
    parser = argparse.ArgumentParser(description="Export OpenAPI schema JSON.")
    parser.add_argument(
        "output",
        nargs="?",
        default="",
        help="Optional output path. If omitted, writes to stdout.",
    )
    args = parser.parse_args()

    payload = export_openapi()
    if args.output:
        out_path = Path(args.output)
        out_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    else:
        content = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
        sys.stdout.buffer.write(content.encode("utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
