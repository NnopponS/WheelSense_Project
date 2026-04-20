"""Production-mode-only runtime.

Anything in this package MUST NOT be imported when ENV_MODE=simulator.
Reserved for real-hardware integrations that have no simulator equivalent
(e.g., production Home Assistant bridge, real device OTA flows).
"""

# Soft guard — see app/sim/__init__.py for rationale. Enforcement happens
# at router mount time and via tests/test_mode_boundaries.py.
