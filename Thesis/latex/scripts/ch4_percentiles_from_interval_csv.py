#!/usr/bin/env python3
"""
Compute p50/p95 and n from a CSV of end-to-end or path intervals for Chapter 4 tables.

Expected CSV columns (header row):
  load_profile,path_key,latency_ms

  load_profile: "normal" | "stress" (must match sec:ch4_e2e_results definitions)
  path_key: matches data/analysis/thesis_ch4_aggregate.json e2e.latency_ms_by_path[].key
  latency_ms: float, one row per measured interval

Example:
  load_profile,path_key,latency_ms
  normal,device_to_db_telemetry,45.2
  normal,device_to_db_telemetry,52.1

Writes a JSON snippet to stdout suitable for pasting into data/analysis/thesis_ch4_aggregate.json
under e2e.latency_ms_by_path (manual merge) or use --patch (optional future).

Usage:
  python latex/scripts/ch4_percentiles_from_interval_csv.py intervals.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import statistics
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Tuple


def _percentile(sorted_vals: List[float], p: float) -> float:
    if not sorted_vals:
        return float("nan")
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    k = (len(sorted_vals) - 1) * (p / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_vals[int(k)]
    return sorted_vals[f] + (sorted_vals[c] - sorted_vals[f]) * (k - f)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path", type=Path)
    args = parser.parse_args()
    path: Path = args.csv_path
    if not path.is_file():
        print(f"Not found: {path}", file=sys.stderr)
        return 1

    # (load_profile, path_key) -> list of ms
    buckets: Dict[Tuple[str, str], List[float]] = defaultdict(list)

    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            lp = (row.get("load_profile") or "").strip().lower()
            pk = (row.get("path_key") or "").strip()
            raw = row.get("latency_ms") or row.get("delta_ms") or ""
            try:
                ms = float(raw)
            except ValueError:
                continue
            if lp not in ("normal", "stress"):
                print(f"Skip row: invalid load_profile {lp!r}", file=sys.stderr)
                continue
            if not pk:
                continue
            buckets[(lp, pk)].append(ms)

    out_paths: Dict[str, Dict[str, Dict[str, float | int]]] = defaultdict(dict)

    for (lp, pk), vals in sorted(buckets.items()):
        vals_sorted = sorted(vals)
        n = len(vals_sorted)
        out_paths[pk][lp] = {
            "p50_ms": round(_percentile(vals_sorted, 50), 3),
            "p95_ms": round(_percentile(vals_sorted, 95), 3),
            "n": n,
        }

    summary = {"e2e_latency_ms_by_path": []}
    for pk in sorted(out_paths.keys()):
        entry = {"key": pk, "normal": {"p50": None, "p95": None, "n": None}, "stress": {"p50": None, "p95": None, "n": None}}
        for lp in ("normal", "stress"):
            if lp in out_paths[pk]:
                entry[lp] = {
                    "p50_ms": out_paths[pk][lp]["p50_ms"],
                    "p95_ms": out_paths[pk][lp]["p95_ms"],
                    "n": int(out_paths[pk][lp]["n"]),
                }
        summary["e2e_latency_ms_by_path"].append(entry)

    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
