#!/usr/bin/env python3
"""Generate thesis-friendly Chapter 3 architecture figures for WheelSense.

The output targets the current repository truth:
- wheelchair telemetry enters on `WheelSense/data`
- mobile telemetry uses `WheelSense/mobile/{device_id}/telemetry`
- camera nodes use `WheelSense/camera/{device_id}/{registration,status,photo}`
- room prediction readiness is currently max-RSSI based in operations
- AI mutations follow propose -> confirm -> execute on top of MCP tools

The script also emits two optional Chapter 4 synthetic plots using values that
already appear in `content/chapters/chapter4.tex`.
"""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch


ROOT = Path(__file__).resolve().parents[1]
CH3_OUT_DIR = ROOT / "assets" / "figures" / "chapter3"
CH4_OUT_DIR = ROOT / "assets" / "figures" / "chapter4"

PALETTE = {
    "edge": "#fff4db",
    "compute": "#e8f1ff",
    "data": "#e8f7ec",
    "ui": "#f7e8ff",
    "policy": "#ffe8ea",
    "muted": "#f3f4f6",
    "line": "#253046",
    "text": "#1b2430",
    "subtext": "#5a6572",
    "accent": "#166534",
    "warn": "#b45309",
}


def _save(fig: plt.Figure, out_dir: Path, stem: str) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    png_path = out_dir / f"{stem}.png"
    pdf_path = out_dir / f"{stem}.pdf"
    fig.savefig(png_path, dpi=220, bbox_inches="tight", facecolor="white")
    fig.savefig(pdf_path, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"wrote {png_path}")
    print(f"wrote {pdf_path}")


def _figure(width: float, height: float):
    fig, ax = plt.subplots(figsize=(width, height))
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.axis("off")
    return fig, ax


def _box(ax, x, y, w, h, title, body="", fc=None, ec=None, fontsize=9, title_size=10):
    fc = fc or PALETTE["muted"]
    ec = ec or PALETTE["line"]
    patch = FancyBboxPatch(
        (x, y),
        w,
        h,
        boxstyle="round,pad=0.02,rounding_size=1.8",
        linewidth=1.3,
        edgecolor=ec,
        facecolor=fc,
    )
    ax.add_patch(patch)
    ax.text(
        x + w / 2,
        y + h - 4.5,
        title,
        ha="center",
        va="top",
        fontsize=title_size,
        fontweight="bold",
        color=PALETTE["text"],
        wrap=True,
    )
    if body:
        ax.text(
            x + w / 2,
            y + h / 2 - 2,
            body,
            ha="center",
            va="center",
            fontsize=fontsize,
            color=PALETTE["text"],
            wrap=True,
        )


def _arrow(ax, start, end, text="", color=None, style="-|>", lw=1.3, text_offset=(0, 0)):
    color = color or PALETTE["line"]
    ax.add_patch(
        FancyArrowPatch(
            start,
            end,
            arrowstyle=style,
            mutation_scale=12,
            linewidth=lw,
            color=color,
            connectionstyle="arc3,rad=0.0",
        )
    )
    if text:
        mx = (start[0] + end[0]) / 2 + text_offset[0]
        my = (start[1] + end[1]) / 2 + text_offset[1]
        ax.text(
            mx,
            my,
            text,
            ha="center",
            va="center",
            fontsize=7.5,
            color=color,
            bbox={"boxstyle": "round,pad=0.16", "fc": "white", "ec": "none"},
        )


def _section_title(ax, x, y, text):
    ax.text(x, y, text, fontsize=12, fontweight="bold", color=PALETTE["text"])


def fig_architecture() -> None:
    fig, ax = _figure(13, 9)
    ax.text(
        50,
        97,
        "WheelSense system topology aligned to current repository truth",
        ha="center",
        fontsize=15,
        fontweight="bold",
        color=PALETTE["text"],
    )

    _section_title(ax, 6, 88, "Field and companion devices")
    _box(
        ax,
        4,
        66,
        18,
        16,
        "Wheelchair node",
        "M5StickC Plus2\nIMU, battery, motion features,\nBLE RSSI scan\nTopic: WheelSense/data",
        fc=PALETTE["edge"],
    )
    _box(
        ax,
        24,
        66,
        18,
        16,
        "Mobile companion",
        "React Native / Expo\nBLE scan, activity, portal shell\nTopic: WheelSense/mobile/{id}/telemetry",
        fc=PALETTE["edge"],
    )
    _box(
        ax,
        24,
        47,
        18,
        14,
        "Polar companion",
        "Optional linked polar_sense device\nHR / PPG paired through mobile register flow",
        fc=PALETTE["edge"],
    )
    _box(
        ax,
        4,
        47,
        18,
        14,
        "BLE anchors / nodes",
        "WSN / BLE_<MAC> aliases\nSupport room prediction and camera-node merge by MAC",
        fc=PALETTE["edge"],
    )
    _box(
        ax,
        44,
        66,
        18,
        16,
        "Camera node",
        "ESP32-S3 / Tsimcam\nregistration, status, photo chunks\nTopics: WheelSense/camera/{id}/*",
        fc=PALETTE["edge"],
    )

    _section_title(ax, 6, 39, "Transport and edge services")
    _box(
        ax,
        10,
        22,
        22,
        12,
        "MQTT broker",
        "Mosquitto topics for telemetry,\nconfig, alerts, room publish,\nwheelchair and camera control",
        fc=PALETTE["compute"],
    )
    _box(
        ax,
        36,
        18,
        25,
        18,
        "FastAPI + ingestion",
        "mqtt_handler validates payloads,\nresolves workspace device,\nwrites DB rows and derived events",
        fc=PALETTE["compute"],
    )
    _box(
        ax,
        64,
        18,
        17,
        18,
        "Localization",
        "Operational readiness flow is\ncurrently max_rssi based.\nKNN remains thesis evaluation context.",
        fc=PALETTE["compute"],
    )
    _box(
        ax,
        83,
        18,
        13,
        18,
        "PostgreSQL",
        "registry\ntelemetry\nalerts\nroom predictions\nchat actions",
        fc=PALETTE["data"],
    )

    _section_title(ax, 6, 13, "User and AI surfaces")
    _box(
        ax,
        16,
        2,
        18,
        9,
        "Next.js web",
        "Role dashboards\nHttpOnly ws_token proxy",
        fc=PALETTE["ui"],
    )
    _box(
        ax,
        38,
        2,
        20,
        9,
        "Home Assistant",
        "Optional smart-device automation\nthrough REST-owned integrations",
        fc=PALETTE["ui"],
    )
    _box(
        ax,
        62,
        2,
        32,
        9,
        "EaseAI and MCP runtime",
        "Authenticated MCP at /mcp plus first-party\nchat-actions flow for propose, confirm, execute",
        fc=PALETTE["policy"],
    )

    _arrow(ax, (13, 66), (18, 34), "telemetry")
    _arrow(ax, (33, 66), (22, 34), "mobile telemetry")
    _arrow(ax, (33, 61), (33, 47), "BLE pairing")
    _arrow(ax, (13, 61), (13, 47), "RSSI anchors")
    _arrow(ax, (53, 66), (25, 34), "camera topics")
    _arrow(ax, (32, 28), (36, 28), "broker ingest")
    _arrow(ax, (61, 27), (64, 27), "RSSI to room")
    _arrow(ax, (81, 27), (83, 27), "writes / reads")
    _arrow(ax, (48, 18), (48, 11), "REST")
    _arrow(ax, (54, 18), (72, 11), "chat and MCP")
    _arrow(ax, (83, 18), (83, 11), "analytics")
    _arrow(ax, (49, 11), (49, 9.5), color=PALETTE["line"])
    _arrow(ax, (48, 6.5), (58, 6.5), "automation APIs", color=PALETTE["warn"])

    ax.text(
        50,
        92,
        "Data plane, control plane, and AI safety plane are shown separately to keep the thesis diagrams readable.",
        ha="center",
        fontsize=8,
        color=PALETTE["subtext"],
    )

    _save(fig, CH3_OUT_DIR, "ch3-fig01-architecture")


def fig_wheelchair_localization_flow() -> None:
    fig, ax = _figure(12, 4.6)
    ax.text(
        50,
        92,
        "Wheelchair telemetry and room-localization flow",
        ha="center",
        fontsize=14,
        fontweight="bold",
        color=PALETTE["text"],
    )

    steps = [
        ("1. Sense", "IMU + battery + BLE RSSI\ncollected on M5StickC Plus2", PALETTE["edge"]),
        ("2. Publish", "WheelSense/data\nwith device_id and sequence", PALETTE["compute"]),
        ("3. Ingest", "mqtt_handler validates,\nnormalizes timestamps,\nupdates registry linkage", PALETTE["compute"]),
        ("4. Predict", "RSSI vector -> max_rssi\noperational room estimate\n(KNN remains thesis model)", PALETTE["data"]),
        ("5. Persist", "telemetry rows +\nroom predictions + alerts", PALETTE["data"]),
        ("6. Fan-out", "publish WheelSense/room/{device_id}\nand serve REST/UI reads", PALETTE["ui"]),
    ]

    x = 2.5
    for index, (title, body, color) in enumerate(steps):
        _box(ax, x, 26, 14, 38, title, body, fc=color, fontsize=8)
        if index < len(steps) - 1:
            _arrow(ax, (x + 14, 45), (x + 17, 45))
        x += 15.5

    ax.text(
        50,
        12,
        "Readiness in current operations depends on aligned device assignment, node alias resolution, room binding, and patient room linkage.",
        ha="center",
        fontsize=8,
        color=PALETTE["subtext"],
    )

    _save(fig, CH3_OUT_DIR, "ch3-fig02-localization-pipeline")


def fig_mqtt_topic_map() -> None:
    fig, ax = _figure(12, 7)
    ax.text(
        50,
        94,
        "Current MQTT topic map used by WheelSense",
        ha="center",
        fontsize=14,
        fontweight="bold",
        color=PALETTE["text"],
    )

    rows = [
        ("WheelSense/data", "wheelchair -> server", "IMU, motion, RSSI, battery"),
        ("WheelSense/mobile/{device_id}/telemetry", "mobile -> server", "BLE scans, HR/PPG, steps, phone battery"),
        ("WheelSense/mobile/{device_id}/register", "mobile -> server", "register phone and optional Polar companion"),
        ("WheelSense/config/{device_id}", "server -> mobile / firmware", "retained pairing and portal metadata"),
        ("WheelSense/alerts/{patient_id}", "server -> subscribers", "fall and clinical alert broadcasts"),
        ("WheelSense/room/{device_id}", "server -> subscribers", "predicted room updates"),
        ("WheelSense/camera/{device_id}/registration", "camera -> server", "camera registration"),
        ("WheelSense/camera/{device_id}/status", "camera -> server", "heartbeat and health"),
        ("WheelSense/camera/{device_id}/photo", "camera -> server", "chunked image payloads"),
        ("WheelSense/{device_id}/control", "server -> wheelchair", "wheelchair control channel"),
    ]

    y = 84
    for topic, direction, note in rows:
        _box(ax, 4, y - 8, 92, 7, topic, "", fc=PALETTE["muted"], title_size=8.5)
        ax.text(43, y - 4.9, direction, fontsize=7.3, color=PALETTE["line"], ha="center", va="center")
        ax.text(77, y - 4.9, note, fontsize=7.0, color=PALETTE["subtext"], ha="center", va="center")
        y -= 8

    ax.text(
        50,
        5.5,
        "Topic names follow the current server contract in server/AGENTS.md rather than the original placeholder naming.",
        ha="center",
        fontsize=8,
        color=PALETTE["subtext"],
    )
    _save(fig, CH3_OUT_DIR, "ch3-fig03-mqtt-topic-map")


def fig_latency_timeline() -> None:
    fig, ax = _figure(12, 3.8)
    ax.text(
        50,
        88,
        "End-to-end latency instrumentation path",
        ha="center",
        fontsize=14,
        fontweight="bold",
        color=PALETTE["text"],
    )

    stages = [
        ("Device sample", 5),
        ("MQTT broker", 19),
        ("Ingest", 33),
        ("DB write", 47),
        ("Room / alert derivation", 61),
        ("REST or MCP read", 77),
        ("UI render", 91),
    ]
    for index, (label, x) in enumerate(stages):
        _box(ax, x - 5.5, 34, 11, 24, label, "", fc=PALETTE["compute"], title_size=8.7)
        if index < len(stages) - 1:
            _arrow(ax, (x + 5.5, 46), (stages[index + 1][1] - 5.5, 46))

    ax.text(
        50,
        18,
        "Recommended timestamps: device publish, broker receive, ingest enter, DB commit, room publish, API response, UI paint.",
        ha="center",
        fontsize=8,
        color=PALETTE["subtext"],
    )
    ax.text(
        50,
        11,
        "This preserves the thesis latency figure while keeping it aligned with the current runtime path through REST and MCP.",
        ha="center",
        fontsize=8,
        color=PALETTE["subtext"],
    )

    _save(fig, CH3_OUT_DIR, "ch3-fig04-latency-timeline")


def fig_db_logical_model() -> None:
    fig, ax = _figure(10, 6)
    ax.text(
        50,
        93,
        "Logical data model used across WheelSense flows",
        ha="center",
        fontsize=14,
        fontweight="bold",
        color=PALETTE["text"],
    )

    _box(ax, 8, 65, 34, 16, "Registry and scope", "users\npatients\ncaregivers\ndevices\nrooms\nworkspace-scoped auth", fc=PALETTE["data"])
    _box(ax, 58, 65, 34, 16, "Operational observations", "telemetry rows\nphoto metadata\nvital readings\nroom predictions\nalerts", fc=PALETTE["data"])
    _box(ax, 8, 35, 34, 16, "Workflow and surfaces", "workflow tasks\nmessages\nsmart-device context\nfloorplan presence", fc=PALETTE["ui"])
    _box(ax, 58, 35, 34, 16, "AI and control audit", "chat actions\npipeline events\nMCP authorization\ncommand acknowledgements", fc=PALETTE["policy"])

    _arrow(ax, (42, 73), (58, 73), "device_id / patient_id")
    _arrow(ax, (25, 65), (25, 51), "room_id / assignee links")
    _arrow(ax, (75, 65), (75, 51), "action and alert lineage")
    _arrow(ax, (42, 43), (58, 43), "chat and workflow references")

    ax.text(
        50,
        12,
        "The figure stays simplified for thesis readability; exact table names remain in the code and migration history.",
        ha="center",
        fontsize=8,
        color=PALETTE["subtext"],
    )
    _save(fig, CH3_OUT_DIR, "ch3-fig05-db-logical-model")


def fig_mobile_polar_flow() -> None:
    fig, ax = _figure(11.5, 4.8)
    ax.text(
        50,
        92,
        "Mobile companion and Polar flow",
        ha="center",
        fontsize=14,
        fontweight="bold",
        color=PALETTE["text"],
    )

    _box(ax, 4, 28, 16, 40, "Mobile app", "Expo shell\nportal bootstrap\nBLE scan\nwalkstep uploads", fc=PALETTE["edge"])
    _box(ax, 24, 28, 16, 40, "Polar device", "Paired as companion_polar\nlinked to mobile register flow", fc=PALETTE["edge"])
    _box(ax, 44, 28, 18, 40, "MQTT topics", "register\ntelemetry\nwalkstep\nconfig", fc=PALETTE["compute"])
    _box(ax, 66, 28, 14, 40, "Server", "upsert mobile_phone\noptional polar_sense\nderive vitals\npush config", fc=PALETTE["compute"])
    _box(ax, 84, 28, 12, 40, "Portal and alerts", "portal_base_url\nlinked patient\nalerts subscribe", fc=PALETTE["ui"])

    _arrow(ax, (20, 48), (24, 48), "BLE")
    _arrow(ax, (40, 48), (44, 48), "publish")
    _arrow(ax, (62, 48), (66, 48), "ingest")
    _arrow(ax, (80, 48), (84, 48), "serve")
    _arrow(ax, (73, 28), (53, 22), "retained config")
    _arrow(ax, (53, 22), (12, 22), "WheelSense/config/{device_id}", color=PALETTE["warn"])

    ax.text(
        50,
        10,
        "The mobile path is modeled as a first-class telemetry source, not just a viewer app.",
        ha="center",
        fontsize=8,
        color=PALETTE["subtext"],
    )
    _save(fig, CH3_OUT_DIR, "ch3-fig06-mobile-polar-flow")


def fig_camera_ble_flow() -> None:
    fig, ax = _figure(11.5, 4.8)
    ax.text(
        50,
        92,
        "Camera and BLE-node flow",
        ha="center",
        fontsize=14,
        fontweight="bold",
        color=PALETTE["text"],
    )

    _box(ax, 4, 28, 18, 42, "ESP32-S3 camera node", "registration\nstatus heartbeat\nphoto chunks\nble_mac identity", fc=PALETTE["edge"])
    _box(ax, 26, 28, 18, 42, "BLE stub / alias", "BLE_<MAC> can be auto-registered\nfrom wheelchair RSSI batches", fc=PALETTE["edge"])
    _box(ax, 48, 28, 16, 42, "MQTT ingest", "registration or status\ncan merge BLE stub -> CAM_*\nby shared MAC", fc=PALETTE["compute"])
    _box(ax, 68, 28, 14, 42, "Registry + room link", "canonical camera row\nroom.node_device_id update\nphoto metadata", fc=PALETTE["data"])
    _box(ax, 86, 28, 10, 42, "Web control", "capture and room inspector\ntrigger camera operations", fc=PALETTE["ui"])

    _arrow(ax, (22, 56), (26, 56), "same radio MAC")
    _arrow(ax, (44, 56), (48, 56), "merge / upsert")
    _arrow(ax, (64, 56), (68, 56), "persist")
    _arrow(ax, (82, 56), (86, 56), "read / trigger")
    _arrow(ax, (91, 28), (56, 18), "camera/{id}/control")
    _arrow(ax, (56, 18), (14, 18), "camera/{id}/ack", color=PALETTE["warn"])

    ax.text(
        50,
        10,
        "This reflects the current merge-by-MAC invariant used to avoid duplicate BLE and camera rows.",
        ha="center",
        fontsize=8,
        color=PALETTE["subtext"],
    )
    _save(fig, CH3_OUT_DIR, "ch3-fig07-camera-ble-node-flow")


def fig_ai_pipeline() -> None:
    fig, ax = _figure(12, 4.8)
    ax.text(
        50,
        92,
        "Safe AI propose-confirm-execute pipeline",
        ha="center",
        fontsize=14,
        fontweight="bold",
        color=PALETTE["text"],
    )

    _box(ax, 4, 28, 14, 44, "User message", "chat popup in web UI\nrole-scoped request", fc=PALETTE["ui"])
    _box(ax, 22, 28, 17, 44, "Propose", "POST /api/chat/actions/propose\nroute intent or llm_tools\nanswer or ExecutionPlan", fc=PALETTE["compute"])
    _box(ax, 43, 28, 14, 44, "Safety gate", "read-only actions may answer now\nmutations require confirmation", fc=PALETTE["policy"])
    _box(ax, 61, 28, 14, 44, "Confirm / reject", "POST /api/chat/actions/{id}/confirm\nActionPlanPreview in UI", fc=PALETTE["policy"])
    _box(ax, 79, 28, 17, 44, "Execute", "POST /api/chat/actions/{id}/execute\nMCP tools run with actor context\nresults streamed to UI", fc=PALETTE["compute"])

    _arrow(ax, (18, 50), (22, 50))
    _arrow(ax, (39, 50), (43, 50), "plan")
    _arrow(ax, (57, 50), (61, 50), "needs approval")
    _arrow(ax, (75, 50), (79, 50), "confirmed")
    _arrow(ax, (30.5, 28), (30.5, 18), "read-only direct answer", color=PALETTE["accent"])
    ax.text(30.5, 12.5, "answer path", ha="center", fontsize=8, color=PALETTE["accent"])

    ax.text(
        50,
        8,
        "Current repo truth: writes do not execute immediately from chat; the explicit confirm step remains visible in the product flow.",
        ha="center",
        fontsize=8,
        color=PALETTE["subtext"],
    )
    _save(fig, CH3_OUT_DIR, "ch3-fig08-ai-propose-confirm-execute")


def fig_ch4_mqtt_latency_plot() -> None:
    fig, ax = plt.subplots(figsize=(8.4, 5.2))
    topics = ["WheelSense/data", "camera photo", "alerts"]
    p50 = [44, 61, 38]
    p95 = [178, 221, 155]
    p99 = [312, 390, 268]
    x = range(len(topics))
    width = 0.23

    ax.bar([i - width for i in x], p50, width=width, color="#9ec5fe", label="P50")
    ax.bar(x, p95, width=width, color="#60a5fa", label="P95")
    ax.bar([i + width for i in x], p99, width=width, color="#1d4ed8", label="P99")

    ax.set_title("Synthetic latency profile from Chapter 4 MQTT table", fontsize=13, fontweight="bold")
    ax.set_ylabel("Latency (ms)")
    ax.set_xticks(list(x), topics)
    ax.grid(axis="y", linestyle="--", alpha=0.3)
    ax.legend(frameon=False)
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)
    fig.tight_layout()
    CH4_OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = CH4_OUT_DIR / "plot-mqtt-latency-box.png"
    fig.savefig(path, dpi=220, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"wrote {path}")


def fig_ch4_llm_latency_plot() -> None:
    fig, ax1 = plt.subplots(figsize=(8.4, 5.2))
    scenarios = ["short", "1 tool", "multi-turn"]
    ttft = [312, 355, 368]
    prompt_tok = [420, 390, 370]
    gen_tok = [16.2, 14.1, 12.8]
    x = list(range(len(scenarios)))

    ax1.plot(x, ttft, marker="o", linewidth=2.0, color="#dc2626", label="TTFT (ms)")
    ax1.set_ylabel("TTFT (ms)", color="#dc2626")
    ax1.tick_params(axis="y", labelcolor="#dc2626")
    ax1.set_xticks(x, scenarios)
    ax1.grid(axis="y", linestyle="--", alpha=0.25)
    for spine in ("top",):
        ax1.spines[spine].set_visible(False)

    ax2 = ax1.twinx()
    ax2.plot(x, prompt_tok, marker="s", linewidth=1.8, color="#2563eb", label="Prompt tok/s")
    ax2.plot(x, gen_tok, marker="^", linewidth=1.8, color="#16a34a", label="Gen tok/s")
    ax2.set_ylabel("Token throughput", color=PALETTE["line"])
    ax2.tick_params(axis="y", labelcolor=PALETTE["line"])
    ax2.spines["top"].set_visible(False)

    handles1, labels1 = ax1.get_legend_handles_labels()
    handles2, labels2 = ax2.get_legend_handles_labels()
    ax1.legend(handles1 + handles2, labels1 + labels2, frameon=False, loc="upper right")
    ax1.set_title("Synthetic LLM latency and token-rate trend from Chapter 4", fontsize=13, fontweight="bold")
    fig.tight_layout()
    CH4_OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = CH4_OUT_DIR / "plot-llm-ttft-tokens.png"
    fig.savefig(path, dpi=220, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"wrote {path}")


def main() -> None:
    fig_architecture()
    fig_wheelchair_localization_flow()
    fig_mqtt_topic_map()
    fig_latency_timeline()
    fig_db_logical_model()
    fig_mobile_polar_flow()
    fig_camera_ble_flow()
    fig_ai_pipeline()
    fig_ch4_mqtt_latency_plot()
    fig_ch4_llm_latency_plot()


if __name__ == "__main__":
    main()
