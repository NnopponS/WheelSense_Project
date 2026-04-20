#!/usr/bin/env python3
"""Generate Phase 1 thesis figure placeholders from THESIS_IMPROVEMENT_PLAN.md section 3.

This script only creates files that do not already exist. It is safe to rerun.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch


ROOT = Path(__file__).resolve().parents[2]
FIGURES_ROOT = ROOT / "latex" / "assets" / "figures"


@dataclass(frozen=True)
class Placeholder:
    chapter: str
    filename: str
    title: str
    section: str
    kind: str
    notes: tuple[str, ...]

    @property
    def path(self) -> Path:
        return FIGURES_ROOT / self.chapter / self.filename


PLACEHOLDERS: tuple[Placeholder, ...] = (
    Placeholder("chapter1", "ch1-fig01-nursing-home.jpg", "Chapter 1 Figure 01", "Planned: Chapter 1 context", "photo", ("Real nursing-home site photo pending", "Keep filename aligned with plan section 3", "Replace with approved field photo later")),
    Placeholder("chapter1", "ch1-fig02-problem-tree.pdf", "Problem tree", "Planned: fig:ch1_problem_tree", "diagram", ("Safety risk, paper records, workload", "Vector placeholder for future TikZ redraw")),
    Placeholder("chapter1", "ch1-fig03-wheelsense-overview.pdf", "WheelSense overview", "Planned: fig:ch1_wheelsense_overview", "diagram", ("Platform and stakeholder overview", "Vector placeholder for future TikZ redraw")),
    Placeholder("chapter1", "ch1-fig04-objectives-map.pdf", "Objectives map", "Planned: fig:ch1_objectives_map", "diagram", ("Map Obj-1..8 to system components", "Vector placeholder for future TikZ redraw")),
    Placeholder("chapter1", "ch1-fig05-scope.pdf", "Project scope", "Planned: fig:ch1_scope_diagram", "diagram", ("In-scope vs out-of-scope boundary", "Vector placeholder for future TikZ redraw")),
    Placeholder("chapter3", "ch3-fig01-architecture.pdf", "System architecture", "Planned: fig:ch3_arch_overview / 3.1.3", "diagram", ("Four-layer architecture summary", "Existing PNG kept; PDF placeholder adds exact planned basename")),
    Placeholder("chapter3", "ch3-fig02-role-journey.pdf", "Role journey", "Planned: fig:ch3_role_journey / 3.1.4", "diagram", ("Role-to-workflow journey map", "Vector placeholder for future TikZ redraw")),
    Placeholder("chapter3", "ch3-fig03-wheelchair.jpg", "Wheelchair module", "Planned: fig:ch3_wheelchair_module / 3.2.1", "photo", ("Real M5StickC Plus2 device photo pending",)),
    Placeholder("chapter3", "ch3-fig04-imu-flow.pdf", "IMU processing flow", "Planned: fig:ch3_imu_payload / 3.2.3", "diagram", ("IMU to feature extraction to classification",)),
    Placeholder("chapter3", "ch3-fig05-camera-node.jpg", "Camera node", "Planned: fig:ch3_camera_node / 3.3.1", "photo", ("Real Tsimcam photo pending",)),
    Placeholder("chapter3", "ch3-fig06-loc-pipeline.pdf", "Localization pipeline", "Planned: fig:ch3_loc_pipeline / 3.3.2", "diagram", ("RSSI vector to KNN to room prediction",)),
    Placeholder("chapter3", "ch3-fig07-pi-server.jpg", "Pi server", "Planned: fig:ch3_pi_server / 3.4.1", "photo", ("Real Pi 5 or server-box photo pending",)),
    Placeholder("chapter3", "ch3-fig08-docker.pdf", "Docker topology", "Planned: fig:ch3_docker_topology / 3.4.1", "diagram", ("Compose services and storage layout",)),
    Placeholder("chapter3", "ch3-fig09-mqtt-topics.pdf", "MQTT topic hierarchy", "Planned: fig:ch3_mqtt_topic_map / 3.4.2", "diagram", ("Topic tree aligned to WheelSense runtime", "Existing PNG topic map kept; PDF placeholder adds exact planned basename")),
    Placeholder("chapter3", "ch3-fig10-er-diagram.pdf", "ER diagram", "Planned: fig:ch3_db_er / 3.4.3", "diagram", ("Users, devices, rooms, work items, alerts",)),
    Placeholder("chapter3", "ch3-fig11-easeai.pdf", "EaseAI layers", "Planned: fig:ch3_easeai_pipeline / 3.5.1", "diagram", ("Five-layer EaseAI stack L1-L5",)),
    Placeholder("chapter3", "ch3-fig12-chat-flow.pdf", "Chat action flow", "Planned: fig:ch3_chat_actions_flow / 3.5.1", "diagram", ("Propose to confirm to execute",)),
    Placeholder("chapter3", "ch3-fig13-prompts.pdf", "Prompt taxonomy", "Planned: fig:ch3_prompt_taxonomy / 3.5.2", "diagram", ("Six role prompts and scope boundaries",)),
    Placeholder("chapter3", "ch3-fig14-web-grid.png", "Web dashboard grid", "Planned: fig:ch3_web_dashboards / 3.6.1", "screenshot", ("Final role-based dashboard screenshots pending",)),
    Placeholder("chapter3", "ch3-fig15-mobile-grid.png", "Mobile app grid", "Planned: fig:ch3_mobile_app / 3.6.2", "screenshot", ("Final mobile-app screenshots pending",)),
    Placeholder("chapter4", "ch4-fig01-site.pdf", "Test site floorplan", "Planned: fig:ch4_site_floorplan / 4.3.1", "diagram", ("TU test floorplan placeholder",)),
    Placeholder("chapter4", "ch4-fig02-install.jpg", "Node installation", "Planned: fig:ch4_install_nodes / 4.3.2", "photo", ("Real installation photo pending",)),
    Placeholder("chapter4", "ch4-fig03-server.jpg", "Server installation", "Planned: fig:ch4_install_server / 4.3.2", "photo", ("Real server photo pending",)),
    Placeholder("chapter4", "ch4-fig04-imu-rate.pdf", "IMU effective rate histogram", "Planned: fig:ch4_imu_rate / 4.4.1", "chart", ("Replace with histogram from measured intervals", "Expected controller: plot_ch4_metrics_stub.py")),
    Placeholder("chapter4", "ch4-fig05-telem-gap.pdf", "Telemetry gap distribution", "Planned: fig:ch4_telemetry_gap / 4.4.2", "chart", ("Replace with gap distribution from telemetry CSV", "Expected controller: plot_ch4_metrics_stub.py")),
    Placeholder("chapter4", "ch4-fig06-loc-confusion.pdf", "Localization confusion matrix", "Planned: fig:ch4_loc_confusion / 4.5.2", "chart", ("Replace with confusion matrix from room prediction eval", "Expected controller: plot_ch4_metrics_stub.py")),
    Placeholder("chapter4", "ch4-fig07-loc-robust.pdf", "Localization robustness", "Planned: fig:ch4_loc_robust / 4.5.2", "chart", ("Replace with accuracy vs sigma noise plot", "Expected controller: plot_ch4_metrics_stub.py")),
    Placeholder("chapter4", "ch4-fig08-throughput.pdf", "Server throughput", "Planned: fig:ch4_server_throughput / 4.6.2", "chart", ("Replace with API and MQTT throughput plot", "Expected controller: plot_ch4_metrics_stub.py")),
    Placeholder("chapter4", "ch4-fig09-llm-latency.pdf", "LLM latency boxplot", "Planned: fig:ch4_llm_latency_box / 4.7.3", "chart", ("Replace with JSON-driven boxplot", "Expected controller: plot_ch4_metrics_stub.py")),
    Placeholder("chapter4", "ch4-fig10-llm-similarity.pdf", "LLM similarity", "Planned: fig:ch4_llm_similarity_bar / 4.7.2", "chart", ("Replace with cosine similarity per scenario", "Expected controller: plot_ch4_metrics_stub.py")),
    Placeholder("chapter4", "ch4-fig11-ai-chat.png", "AI conversation screenshot", "Planned: fig:ch4_ai_conversation / 4.7.4", "screenshot", ("Real propose-confirm chat screenshot pending",)),
    Placeholder("chapter4", "ch4-fig12-ux-likert.pdf", "UX Likert chart", "Planned: fig:ch4_ux_likert_chart / 4.8.1", "chart", ("Replace with stacked bar chart from UX CSV", "Expected controller: plot_ch4_metrics_stub.py")),
    Placeholder("chapter4", "ch4-fig13-e2e-latency.pdf", "End-to-end latency", "Planned: fig:ch4_e2e_latency / 4.9.1", "chart", ("Replace with normal vs stress latency plot", "Expected controller: plot_ch4_metrics_stub.py")),
    Placeholder("chapter4", "ch4-fig14-feedback.jpg", "Field feedback session", "Planned: fig:ch4_feedback_session / 4.10.1", "photo", ("Real presentation or feedback-session photo pending",)),
)


KIND_STYLE = {
    "photo": {"accent": "#8b5cf6", "body": "#f5f3ff"},
    "screenshot": {"accent": "#0f766e", "body": "#ecfeff"},
    "chart": {"accent": "#b45309", "body": "#fffbeb"},
    "diagram": {"accent": "#1d4ed8", "body": "#eff6ff"},
}


def draw_placeholder(item: Placeholder) -> None:
    item.path.parent.mkdir(parents=True, exist_ok=True)
    if item.path.exists():
        print(f"skip {item.path}")
        return

    style = KIND_STYLE[item.kind]
    fig = plt.figure(figsize=(11.0, 6.2))
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    ax.add_patch(FancyBboxPatch((0.035, 0.05), 0.93, 0.90, boxstyle="round,pad=0.02,rounding_size=0.025", linewidth=2.0, edgecolor=style["accent"], facecolor=style["body"]))
    ax.add_patch(FancyBboxPatch((0.06, 0.80), 0.88, 0.12, boxstyle="round,pad=0.015,rounding_size=0.02", linewidth=0, facecolor=style["accent"]))
    ax.text(0.08, 0.86, item.filename, fontsize=16, fontweight="bold", color="white", va="center")
    ax.text(0.08, 0.74, item.title, fontsize=18, fontweight="bold", color="#111827", va="center")
    ax.text(0.08, 0.67, item.section, fontsize=11, color="#374151", va="center")
    ax.text(0.08, 0.58, f"Placeholder type: {item.kind}", fontsize=11, color="#111827", va="center")
    ax.text(0.08, 0.49, "Phase 1 scaffold generated automatically. Replace with real asset in Phase 4/5.", fontsize=10, color="#4b5563", va="center")

    y = 0.38
    for note in item.notes:
        ax.text(0.10, y, f"- {note}", fontsize=10, color="#1f2937", va="center")
        y -= 0.07

    ax.text(0.08, 0.10, "Repo: Thesis/latex/assets/figures", fontsize=9, color="#6b7280", va="center")
    fig.savefig(item.path, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"wrote {item.path}")


def main() -> int:
    for item in PLACEHOLDERS:
        draw_placeholder(item)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
