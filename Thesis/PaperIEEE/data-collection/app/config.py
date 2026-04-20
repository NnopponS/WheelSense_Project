"""
RSSI Data Collector — Central Configuration.

Directory paths and station definitions.
"""

import os
from pathlib import Path

# ═══════════════════════════════════════════════
# Directory Layout
# ═══════════════════════════════════════════════
PROJECT_ROOT     = Path(__file__).resolve().parent.parent.parent  # PaperIEEE/
DATA_DIR         = PROJECT_ROOT / "data"
EXPERIMENTS_DIR  = DATA_DIR / "experiments"
ARCHIVE_DIR      = DATA_DIR / "archive"

for d in [DATA_DIR, EXPERIMENTS_DIR, ARCHIVE_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# ═══════════════════════════════════════════════
# Station / Zone Map
# ═══════════════════════════════════════════════
EXPECTED_STATIONS = ["S1", "S2", "S3", "S4"]

ZONE_MAP = {
    "S1": "A",
    "S2": "B",
    "S3": "C",
    "S4": "D",
}

# ═══════════════════════════════════════════════
# MQTT Defaults
# ═══════════════════════════════════════════════
MQTT_DEFAULT_HOST = "192.168.137.1"
MQTT_DEFAULT_PORT = 1883
MQTT_TOPIC_PREFIX = "wheelsense/rssi/"
