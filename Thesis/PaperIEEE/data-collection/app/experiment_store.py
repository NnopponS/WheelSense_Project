"""
Experiment Store — Manage experiment-based RSSI data collection.

Directory layout per experiment:
    data/experiments/EXP_001_WalkingZoneA/
        experiment_meta.json
        actions/
            action_001_standing.csv
            action_002_walking.csv
        all_data.csv
        all_data.xlsx
        floorplan_config.json
"""

import csv
import json
import shutil
import re
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

import pandas as pd

import config


EXPERIMENTS_DIR = config.DATA_DIR / "experiments"
EXPERIMENTS_DIR.mkdir(parents=True, exist_ok=True)

CSV_COLUMNS = ["timestamp", "S1_RSSI", "S2_RSSI", "S3_RSSI", "S4_RSSI", "action_label", "experiment_id"]


# ═══════════════════════════════════════════════
# Experiment CRUD
# ═══════════════════════════════════════════════

def _safe_dirname(name: str) -> str:
    """Sanitise name for use as directory component."""
    return re.sub(r"[^a-zA-Z0-9_\-]", "_", name.strip())[:60]


def create_experiment(name: str, description: str = "", stations: List[str] = None) -> Dict[str, Any]:
    """Create a new experiment folder and metadata file."""
    if stations is None:
        stations = list(config.EXPECTED_STATIONS)

    # Find next experiment number
    existing = sorted(EXPERIMENTS_DIR.glob("EXP_*"))
    next_num = 1
    for d in existing:
        match = re.match(r"EXP_(\d+)", d.name)
        if match:
            next_num = max(next_num, int(match.group(1)) + 1)

    exp_id = f"EXP_{next_num:03d}"
    safe_name = _safe_dirname(name) if name else "unnamed"
    dir_name = f"{exp_id}_{safe_name}"
    exp_dir = EXPERIMENTS_DIR / dir_name

    exp_dir.mkdir(parents=True, exist_ok=True)
    (exp_dir / "actions").mkdir(exist_ok=True)

    meta = {
        "experiment_id": exp_id,
        "dir_name": dir_name,
        "name": name,
        "description": description,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "stations": stations,
        "actions": [],
        "total_samples": 0,
        "floorplan": None,
    }

    _write_json(exp_dir / "experiment_meta.json", meta)
    return meta


def list_experiments() -> List[Dict[str, Any]]:
    """List all experiments sorted by creation date (newest first)."""
    experiments = []
    if not EXPERIMENTS_DIR.exists():
        return experiments

    for d in sorted(EXPERIMENTS_DIR.iterdir(), reverse=True):
        if d.is_dir() and d.name.startswith("EXP_"):
            meta_path = d / "experiment_meta.json"
            if meta_path.exists():
                experiments.append(_read_json(meta_path))

    return experiments


def load_experiment(exp_id: str) -> Optional[Dict[str, Any]]:
    """Load experiment metadata by experiment_id (e.g. 'EXP_001')."""
    exp_dir = _find_exp_dir(exp_id)
    if exp_dir is None:
        return None
    return _read_json(exp_dir / "experiment_meta.json")


def delete_experiment(exp_id: str):
    """Delete an experiment and all its data."""
    exp_dir = _find_exp_dir(exp_id)
    if exp_dir and exp_dir.exists():
        shutil.rmtree(exp_dir)


def archive_experiment(exp_id: str):
    """Move an experiment directory to the archive folder."""
    exp_dir = _find_exp_dir(exp_id)
    if not exp_dir or not exp_dir.exists():
        return

    dest_dir = config.ARCHIVE_DIR / exp_dir.name
    
    # Handle naming collision in archive
    if dest_dir.exists():
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        dest_dir = config.ARCHIVE_DIR / f"{exp_dir.name}_{ts}"

    shutil.move(str(exp_dir), str(dest_dir))


def _find_exp_dir(exp_id: str) -> Optional[Path]:
    """Find the directory for a given experiment ID."""
    if not EXPERIMENTS_DIR.exists():
        return None
    for d in EXPERIMENTS_DIR.iterdir():
        if d.is_dir() and d.name.startswith(exp_id):
            return d
    return None


# ═══════════════════════════════════════════════
# Action Recording
# ═══════════════════════════════════════════════

def start_action(exp_id: str, label: str) -> Dict[str, Any]:
    """Start a new action within an experiment. Returns action info."""
    exp_dir = _find_exp_dir(exp_id)
    if exp_dir is None:
        raise FileNotFoundError(f"Experiment not found: {exp_id}")

    meta = _read_json(exp_dir / "experiment_meta.json")

    # Determine action number
    action_num = len(meta["actions"]) + 1
    safe_label = _safe_dirname(label) if label else "unlabeled"
    csv_filename = f"action_{action_num:03d}_{safe_label}.csv"

    action_info = {
        "id": action_num,
        "label": label,
        "csv_file": csv_filename,
        "start_time": datetime.now().isoformat(),
        "end_time": None,
        "sample_count": 0,
    }

    # Create empty CSV with headers
    csv_path = exp_dir / "actions" / csv_filename
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(CSV_COLUMNS)

    # Update meta
    meta["actions"].append(action_info)
    meta["updated_at"] = datetime.now().isoformat()
    _write_json(exp_dir / "experiment_meta.json", meta)

    return action_info


def append_samples(exp_id: str, action_id: int, rows: List[Dict[str, Any]]):
    """
    Append sample rows to the action's CSV file.
    Each row should have keys: timestamp, S1_RSSI, S2_RSSI, S3_RSSI
    """
    exp_dir = _find_exp_dir(exp_id)
    if exp_dir is None:
        return

    meta = _read_json(exp_dir / "experiment_meta.json")

    # Find the action
    action = None
    for a in meta["actions"]:
        if a["id"] == action_id:
            action = a
            break
    if action is None:
        return

    csv_path = exp_dir / "actions" / action["csv_file"]

    with open(csv_path, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        for row in rows:
            writer.writerow([
                row.get("timestamp", ""),
                row.get("S1_RSSI", ""),
                row.get("S2_RSSI", ""),
                row.get("S3_RSSI", ""),
                row.get("S4_RSSI", ""),
                action["label"],
                exp_id,
            ])

    # Update counts
    action["sample_count"] += len(rows)
    meta["total_samples"] += len(rows)
    meta["updated_at"] = datetime.now().isoformat()
    _write_json(exp_dir / "experiment_meta.json", meta)


def stop_action(exp_id: str, action_id: int):
    """Stop an action — record end time."""
    exp_dir = _find_exp_dir(exp_id)
    if exp_dir is None:
        return

    meta = _read_json(exp_dir / "experiment_meta.json")
    for a in meta["actions"]:
        if a["id"] == action_id:
            a["end_time"] = datetime.now().isoformat()
            break

    meta["updated_at"] = datetime.now().isoformat()
    _write_json(exp_dir / "experiment_meta.json", meta)


def delete_action(exp_id: str, action_id: int):
    """Delete an action and its CSV file."""
    exp_dir = _find_exp_dir(exp_id)
    if exp_dir is None:
        return

    meta = _read_json(exp_dir / "experiment_meta.json")
    action_to_delete = None
    for a in meta["actions"]:
        if a["id"] == action_id:
            action_to_delete = a
            break

    if action_to_delete is None:
        return

    # Delete CSV file
    csv_path = exp_dir / "actions" / action_to_delete["csv_file"]
    if csv_path.exists():
        csv_path.unlink()

    # Update metadata
    meta["total_samples"] -= action_to_delete.get("sample_count", 0)
    meta["actions"] = [a for a in meta["actions"] if a["id"] != action_id]
    meta["updated_at"] = datetime.now().isoformat()
    _write_json(exp_dir / "experiment_meta.json", meta)


# ===============================================
# Data Loading
# ===============================================

def load_action_data(exp_id: str, action_id: int) -> Optional[pd.DataFrame]:
    """Load CSV data for a specific action as a DataFrame."""
    exp_dir = _find_exp_dir(exp_id)
    if exp_dir is None:
        return None

    meta = _read_json(exp_dir / "experiment_meta.json")
    for a in meta["actions"]:
        if a["id"] == action_id:
            csv_path = exp_dir / "actions" / a["csv_file"]
            if csv_path.exists():
                df = pd.read_csv(csv_path)
                for col in df.columns:
                    if col.endswith("_RSSI"):
                        df[col] = pd.to_numeric(df[col], errors="coerce")
                return df
    return None


def load_all_data(exp_id: str) -> Optional[pd.DataFrame]:
    """Load and combine all action CSVs for an experiment."""
    exp_dir = _find_exp_dir(exp_id)
    if exp_dir is None:
        return None

    actions_dir = exp_dir / "actions"
    if not actions_dir.exists():
        return None

    dfs = []
    for csv_file in sorted(actions_dir.glob("action_*.csv")):
        try:
            df = pd.read_csv(csv_file)
            if not df.empty:
                dfs.append(df)
        except Exception:
            continue

    if dfs:
        combined = pd.concat(dfs, ignore_index=True)
        # Coerce RSSI columns to numeric (empty strings → NaN)
        for col in combined.columns:
            if col.endswith("_RSSI"):
                combined[col] = pd.to_numeric(combined[col], errors="coerce")
        return combined
    return None


# ═══════════════════════════════════════════════
# Export
# ═══════════════════════════════════════════════

def export_csv(exp_id: str, filtered: bool = False, ema_alpha: float = 0.15) -> Optional[Path]:
    """
    Export experiment data to CSV.
    If filtered=True, applies EMA smoothing to RSSI columns and saves as *_filtered.csv.
    """
    exp_dir = _find_exp_dir(exp_id)
    if exp_dir is None:
        return None

    df = load_all_data(exp_id)
    if df is None or df.empty:
        return None

    if filtered:
        # Apply EMA to each station RSSI column
        rssi_cols = [c for c in df.columns if c.endswith("_RSSI")]
        for col in rssi_cols:
            ema_values = []
            ema = None
            for val in df[col]:
                try:
                    v = float(val)
                    if ema is None:
                        ema = v
                    else:
                        ema = ema_alpha * v + (1 - ema_alpha) * ema
                    ema_values.append(round(ema, 2))
                except (ValueError, TypeError):
                    ema_values.append("")
            df[col] = ema_values

        csv_path = exp_dir / "all_data_filtered.csv"
    else:
        csv_path = exp_dir / "all_data_raw.csv"

    df.to_csv(csv_path, index=False)
    return csv_path


# ═══════════════════════════════════════════════
# Floorplan
# ═══════════════════════════════════════════════

def save_floorplan(exp_id: str, floorplan_config: Dict[str, Any]):
    """Save floorplan configuration for an experiment."""
    exp_dir = _find_exp_dir(exp_id)
    if exp_dir is None:
        return

    _write_json(exp_dir / "floorplan_config.json", floorplan_config)

    # Also update meta
    meta = _read_json(exp_dir / "experiment_meta.json")
    meta["floorplan"] = floorplan_config
    meta["updated_at"] = datetime.now().isoformat()
    _write_json(exp_dir / "experiment_meta.json", meta)


def load_floorplan(exp_id: str) -> Optional[Dict[str, Any]]:
    """Load floorplan configuration."""
    exp_dir = _find_exp_dir(exp_id)
    if exp_dir is None:
        return None

    fp_path = exp_dir / "floorplan_config.json"
    if fp_path.exists():
        return _read_json(fp_path)
    return None


# ═══════════════════════════════════════════════
# JSON Helpers
# ═══════════════════════════════════════════════

def _read_json(path: Path) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_json(path: Path, data: Any):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
