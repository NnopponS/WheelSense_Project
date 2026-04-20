#!/usr/bin/env python3
"""
Merge LLM/MCP thesis export into data/analysis/thesis_ch4_aggregate.json (llm_mcp_eval section).

Usage (from Thesis repo root):
  python latex/scripts/merge_ch4_aggregate.py [--llm-json data/analysis/llm_mcp_eval_results.json] [--out data/analysis/thesis_ch4_aggregate.json]

Merge policy:
  - Always refreshes merged["llm_mcp_eval"] from the LLM export JSON.
  - Preserves existing top-level keys not produced by this script: component_metrics,
    e2e, field_observation, irr_human, and any future extensions.
  - Updates metadata.llm_export_source and paths; does not delete manual narrative fields
    under metadata except those explicitly refreshed here.
"""

from __future__ import annotations

import argparse
import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--llm-json", type=Path, default=root / "data/analysis/llm_mcp_eval_results.json")
    parser.add_argument("--aggregate", type=Path, default=root / "data/analysis/thesis_ch4_aggregate.json")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    llm_path: Path = args.llm_json
    out_path: Path = args.aggregate

    if not llm_path.is_file():
        print(f"Missing LLM export: {llm_path}", flush=True)
        return 1

    with open(llm_path, "r", encoding="utf-8") as f:
        llm_data: Dict[str, Any] = json.load(f)

    existing: Dict[str, Any] = {}
    if out_path.is_file():
        with open(out_path, "r", encoding="utf-8") as f:
            existing = json.load(f)

    merged: Dict[str, Any] = deepcopy(existing) if existing else {}
    merged.setdefault("metadata", {})

    try:
        rel_llm = llm_path.relative_to(root)
    except ValueError:
        rel_llm = llm_path
    merged["metadata"]["llm_export_source"] = str(rel_llm)
    merged["metadata"]["paths"] = merged["metadata"].get("paths") or {}
    if isinstance(merged["metadata"]["paths"], dict):
        merged["metadata"]["paths"]["llm_export_source"] = str(rel_llm)

    prev_llm = merged.get("llm_mcp_eval") if isinstance(merged.get("llm_mcp_eval"), dict) else {}
    merged["llm_mcp_eval"] = {
        "source_file": str(rel_llm),
        "metadata": llm_data.get("metadata", {}),
        "latency_ms": llm_data.get("latency_ms", {}),
        "text_similarity": llm_data.get("text_similarity", {}),
        "irr_proxy": llm_data.get("irr_proxy", {}),
    }
    # Preserve extended LLM sub-blocks from export first, else keep prior aggregate copy.
    if isinstance(llm_data.get("batch_quality"), dict):
        merged["llm_mcp_eval"]["batch_quality"] = llm_data["batch_quality"]
    elif isinstance(prev_llm.get("batch_quality"), dict):
        merged["llm_mcp_eval"]["batch_quality"] = deepcopy(prev_llm["batch_quality"])

    merged["metadata"]["generated_at_utc"] = datetime.now(timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )

    if args.dry_run:
        print(json.dumps(merged["llm_mcp_eval"], indent=2, ensure_ascii=False)[:2000])
        print("... [dry-run, not written]")
        return 0

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(merged, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Wrote {out_path.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
