"""Static import-lint tests enforcing the mode-split boundary.

Rules (see app/sim/__init__.py):
  * Nothing outside `app.sim` may import from `app.sim.*`
    — EXCEPT `app/api/router.py` (conditional mount) and test files.
  * Nothing outside `app.prod` may import from `app.prod.*`
    — EXCEPT `app/api/router.py` and test files.
  * `app.sim` may import from shared code (`app.models`, `app.services`, etc.)
    but NOT from `app.prod`, and vice versa.

These tests run via plain AST scanning — no app import required, so they
are fast and don't depend on ENV_MODE.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

SERVER_ROOT = Path(__file__).resolve().parent.parent
APP_ROOT = SERVER_ROOT / "app"


def _iter_py_files(root: Path):
    for path in root.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        yield path


def _module_imports(path: Path) -> list[str]:
    """Return list of fully-qualified module names imported by `path`."""
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError:
        return []
    names: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            names.append(node.module)
        elif isinstance(node, ast.Import):
            names.extend(alias.name for alias in node.names)
    return names


# Files that are explicitly allowed to bridge between mode-specific packages
# and the rest of the app. Keep this list tiny.
_ALLOWED_SIM_IMPORTERS = frozenset({
    APP_ROOT / "api" / "router.py",
    APP_ROOT / "mqtt_handler.py",
    APP_ROOT / "config.py",  # Settings needs to check simulator mode
    SERVER_ROOT / "tests",  # Test files allowed to import anywhere
})
_ALLOWED_PROD_IMPORTERS = {
    APP_ROOT / "api" / "router.py",
    SERVER_ROOT / "tests",  # Test files allowed to import anywhere
}


def _relative(path: Path) -> str:
    return str(path.relative_to(SERVER_ROOT)).replace("\\", "/")


@pytest.mark.parametrize(
    "forbidden_prefix, allowlist, banned_root",
    [
        ("app.sim", _ALLOWED_SIM_IMPORTERS, APP_ROOT / "sim"),
        ("app.prod", _ALLOWED_PROD_IMPORTERS, APP_ROOT / "prod"),
    ],
)
def test_no_outside_imports_into_mode_package(
    forbidden_prefix: str, allowlist: set[Path], banned_root: Path
) -> None:
    """Code outside `app.sim`/`app.prod` must not import from those packages."""
    violations: list[str] = []
    for path in _iter_py_files(APP_ROOT):
        # Files inside the mode package itself are allowed to self-import.
        if banned_root in path.parents:
            continue
        if path in allowlist:
            continue
        for module in _module_imports(path):
            if module == forbidden_prefix or module.startswith(forbidden_prefix + "."):
                violations.append(f"{_relative(path)} imports {module}")
    assert not violations, (
        f"Boundary violation: {forbidden_prefix} must only be imported from "
        f"{{{', '.join(_relative(p) for p in allowlist)}}}. "
        f"Offenders:\n  " + "\n  ".join(violations)
    )


def test_sim_and_prod_do_not_cross_import() -> None:
    """`app.sim` must not import `app.prod` and vice versa."""
    violations: list[str] = []
    pairs = [
        (APP_ROOT / "sim", "app.prod"),
        (APP_ROOT / "prod", "app.sim"),
    ]
    for root, forbidden in pairs:
        if not root.exists():
            continue
        for path in _iter_py_files(root):
            for module in _module_imports(path):
                if module == forbidden or module.startswith(forbidden + "."):
                    violations.append(f"{_relative(path)} imports {module}")
    assert not violations, (
        "sim/prod cross-import detected:\n  " + "\n  ".join(violations)
    )
