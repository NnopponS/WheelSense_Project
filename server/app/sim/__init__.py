"""Simulation-mode-only runtime.

Contract:
  * Code in `app.sim.*` only runs when `settings.env_mode == "simulator"`.
  * Production boot MUST NOT mount routers or spin up services from this
    package (`app/api/router.py` enforces this with `if settings.is_simulator_mode`).
  * Shared logic used by both modes stays under `app/` *outside* this package
    (services, models, schemas, etc.) and is conceptually the "core" layer.
  * `app.core`/`app.prod`/top-level `app.services` MUST NOT import from `app.sim`.
    A static lint test (`tests/test_mode_boundaries.py`) enforces this.

Why a soft guard (no `raise` here):
  * Tests frequently import sim modules directly and flip `settings.env_mode`
    via `monkeypatch` after import. A hard guard at import time would block
    that pattern for no real safety benefit — the real protection is
    conditional router mount + static import lint.

See docs/adr/0018-game-sim-bridge.md.
"""
