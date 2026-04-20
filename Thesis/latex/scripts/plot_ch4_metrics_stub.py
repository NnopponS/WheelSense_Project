#!/usr/bin/env python3
"""Input-contract scaffold for real Chapter 4 plots.

This file does not replace the generated placeholders. It documents the planned
controller surface for the data-driven figures in THESIS_IMPROVEMENT_PLAN.md.
"""

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = ROOT / "latex" / "assets" / "figures" / "chapter4"

PLOT_TARGETS = {
    "ch4-fig04-imu-rate.pdf": {
        "figure_label": "fig:ch4_imu_rate",
        "expected_input": "CSV with imu timestamp deltas or effective sample-rate buckets",
        "status": "controller not implemented yet",
    },
    "ch4-fig05-telem-gap.pdf": {
        "figure_label": "fig:ch4_telemetry_gap",
        "expected_input": "CSV with telemetry interval gaps in ms",
        "status": "controller not implemented yet",
    },
    "ch4-fig06-loc-confusion.pdf": {
        "figure_label": "fig:ch4_loc_confusion",
        "expected_input": "CSV or JSON with y_true/y_pred room labels",
        "status": "controller not implemented yet",
    },
    "ch4-fig07-loc-robust.pdf": {
        "figure_label": "fig:ch4_loc_robust",
        "expected_input": "CSV with sigma_noise and accuracy columns",
        "status": "controller not implemented yet",
    },
    "ch4-fig08-throughput.pdf": {
        "figure_label": "fig:ch4_server_throughput",
        "expected_input": "CSV with api_rps, mqtt_msgs_per_sec, and load profile",
        "status": "controller not implemented yet",
    },
    "ch4-fig09-llm-latency.pdf": {
        "figure_label": "fig:ch4_llm_latency_box",
        "expected_input": "JSON export of per-scenario LLM latency",
        "status": "controller not implemented yet",
    },
    "ch4-fig10-llm-similarity.pdf": {
        "figure_label": "fig:ch4_llm_similarity_bar",
        "expected_input": "JSON export with cosine similarity per scenario",
        "status": "controller not implemented yet",
    },
    "ch4-fig12-ux-likert.pdf": {
        "figure_label": "fig:ch4_ux_likert_chart",
        "expected_input": "CSV with Likert response counts by prompt",
        "status": "controller not implemented yet",
    },
    "ch4-fig13-e2e-latency.pdf": {
        "figure_label": "fig:ch4_e2e_latency",
        "expected_input": "CSV with normal/stress path latency samples",
        "status": "controller not implemented yet",
    },
}


def main() -> int:
    print("Chapter 4 plot-controller scaffold")
    print(f"Output dir: {OUTPUT_DIR}")
    for filename, meta in PLOT_TARGETS.items():
        print(f"- {filename}")
        print(f"  label: {meta['figure_label']}")
        print(f"  input: {meta['expected_input']}")
        print(f"  status: {meta['status']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
