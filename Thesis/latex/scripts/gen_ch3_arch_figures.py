#!/usr/bin/env python3
"""Generate Chapter 3 architecture placeholder PNGs for WheelSense thesis (matplotlib)."""
from __future__ import annotations

import os

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "figures", "chapter3")
OUT_DIR = os.path.normpath(OUT_DIR)


def _save(fig: plt.Figure, name: str) -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name)
    fig.savefig(path, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print("wrote", path)


def fig_architecture() -> None:
    fig, ax = plt.subplots(figsize=(11, 8))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 12)
    ax.axis("off")

    def box(x, y, w, h, text, fc="#e8f4fc"):
        r = FancyBboxPatch(
            (x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.08",
            linewidth=1.2, edgecolor="#333", facecolor=fc,
        )
        ax.add_patch(r)
        ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=8, wrap=True)

    def arrow(x1, y1, x2, y2):
        ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle="-|>", mutation_scale=12, linewidth=1.0, color="#333"))

    ax.text(5, 11.5, "WheelSense — end-to-end data flow (reference)", ha="center", fontsize=11, fontweight="bold")

    # Edge
    box(0.2, 9.5, 2.2, 1.0, "M5StickC Plus2\n(IMU, BLE RSSI,\ntelemetry)", "#fff3e0")
    box(2.6, 9.5, 2.2, 1.0, "ESP32-S3 camera\n(registration, photo\nchunks)", "#fff3e0")
    box(5.0, 9.5, 2.2, 1.0, "Mobile (Expo)\nRSSI, Polar HR", "#fff3e0")
    box(7.4, 9.5, 2.2, 1.0, "BLE beacons\n(reference nodes)", "#e8f5e9")

    box(1.5, 7.8, 7.0, 0.9, "MQTT broker (e.g. Mosquitto) — topics WheelSense/...", "#e3f2fd")
    arrow(1.3, 9.5, 2.5, 8.7)
    arrow(3.7, 9.5, 4.5, 8.7)
    arrow(6.1, 9.5, 5.5, 8.7)
    arrow(8.5, 9.5, 7.5, 8.7)

    box(0.3, 6.0, 3.0, 1.1, "Ingestion + validation\n(mqtt_handler)", "#fce4ec")
    box(3.6, 6.0, 2.6, 1.1, "Localization\n(KNN / max-RSSI)", "#fce4ec")
    box(6.4, 6.0, 3.2, 1.1, "PostgreSQL\n(time-series, registry)", "#e8eaf6")

    arrow(5.0, 7.8, 1.8, 7.1)
    arrow(5.0, 7.8, 4.9, 7.1)
    arrow(5.0, 7.8, 8.0, 7.1)

    box(1.0, 4.2, 8.0, 1.0, "FastAPI — REST /api/*, device registry, alerts, MCP mount /mcp", "#fff9c4")

    arrow(5.0, 6.0, 5.0, 5.2)

    box(0.5, 2.5, 3.5, 1.0, "Next.js dashboard\n(/api proxy, roles)", "#e0f7fa")
    box(4.2, 2.5, 2.5, 1.0, "Home Assistant\n(automation)", "#f3e5f5")
    box(7.0, 2.5, 2.5, 1.0, "Agent runtime +\nMCP client / LLM", "#f3e5f5")

    arrow(3.5, 4.2, 2.2, 3.5)
    arrow(5.0, 4.2, 5.4, 3.5)
    arrow(6.5, 4.2, 8.2, 3.5)

    ax.text(5, 1.5, "Browser: HttpOnly session; MQTT for devices only.", ha="center", fontsize=7, style="italic", color="#555")

    _save(fig, "ch3-fig01-architecture.png")


def fig_mqtt_map() -> None:
    fig, ax = plt.subplots(figsize=(10, 7))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 10)
    ax.axis("off")
    ax.text(5, 9.5, "MQTT topic map (subset)", ha="center", fontsize=11, fontweight="bold")
    rows = [
        ("WheelSense/data", "wheelchair → server", "telemetry"),
        ("WheelSense/mobile/{id}/telemetry", "mobile → server", "RSSI, HR, steps"),
        ("WheelSense/camera/{id}/photo", "camera → server", "image chunks"),
        ("WheelSense/room/{id}", "server → clients", "predicted room"),
        ("WheelSense/alerts/{patient_id}", "server → clients", "clinical alerts"),
        ("WheelSense/config/{id}", "server → device", "retained config"),
    ]
    y = 8.5
    for topic, direction, note in rows:
        ax.add_patch(FancyBboxPatch((0.5, y), 9, 0.65, boxstyle="round,pad=0.02", facecolor="#f5f5f5", edgecolor="#333"))
        ax.text(0.7, y + 0.35, topic, fontsize=8, family="monospace", va="center")
        ax.text(5.0, y + 0.45, direction, fontsize=7, va="center")
        ax.text(5.0, y + 0.12, note, fontsize=6, va="center", color="#555")
        y -= 0.85
    ax.text(5, 0.8, "Canonical list: server/AGENTS.md", ha="center", fontsize=7, style="italic")
    _save(fig, "ch3-fig03-mqtt-topic-map.png")


def fig_latency() -> None:
    fig, ax = plt.subplots(figsize=(10, 2.8))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 2)
    ax.axis("off")
    stages = [
        ("Device", 0.3),
        ("MQTT", 1.5),
        ("Ingest", 2.7),
        ("DB write", 4.0),
        ("API read", 5.4),
        ("Next proxy", 6.8),
        ("UI / MCP", 8.3),
    ]
    x0 = 0.4
    for i, (name, x) in enumerate(stages):
        ax.add_patch(FancyBboxPatch((x, 0.8), 0.85, 0.6, boxstyle="round,pad=0.02", facecolor="#e3f2fd", edgecolor="#333"))
        ax.text(x + 0.42, 1.1, name, ha="center", va="center", fontsize=7)
        if i < len(stages) - 1:
            ax.annotate("", xy=(stages[i + 1][1] + 0.1, 1.1), xytext=(x + 0.95, 1.1), arrowprops=dict(arrowstyle="->", lw=1.2))
    ax.text(5, 0.35, "End-to-end latency: measure timestamps at each hop (Profile-A polling intervals apply to UI refresh).", ha="center", fontsize=7, style="italic")
    _save(fig, "ch3-fig04-latency-timeline.png")


def fig_loc_pipeline() -> None:
    fig, ax = plt.subplots(figsize=(9, 2.5))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 2)
    ax.axis("off")
    boxes = ["Offline:\ncollect RSSI\n@ RPs", "Build\nradio map", "Train\nKNN (sklearn)", "Online:\nMQTT RSSI", "Predict\nroom/zone", "Publish\nWheelSense/room"]
    x = 0.2
    for i, t in enumerate(boxes):
        ax.add_patch(FancyBboxPatch((x, 0.5), 1.45, 1.0, boxstyle="round,pad=0.02", facecolor="#e8f5e9" if i < 3 else "#fff3e0", edgecolor="#333"))
        ax.text(x + 0.72, 1.0, t, ha="center", va="center", fontsize=7)
        if i < len(boxes) - 1:
            ax.annotate("", xy=(x + 1.55, 1.0), xytext=(x + 1.45, 1.0), arrowprops=dict(arrowstyle="->", lw=1.0))
        x += 1.55
    _save(fig, "ch3-fig02-localization-pipeline.png")


def fig_db() -> None:
    fig, ax = plt.subplots(figsize=(9, 5))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 8)
    ax.axis("off")
    ax.text(5, 7.5, "Logical data stores (simplified)", ha="center", fontsize=11, fontweight="bold")
    entities = [
        ("devices / patients / rooms", 5, 6.2),
        ("telemetry / rssi / imu rows", 5, 4.8),
        ("room predictions / alerts", 5, 3.4),
        ("chat actions / MCP audit (if enabled)", 5, 2.0),
    ]
    for txt, x, y in entities:
        ax.add_patch(FancyBboxPatch((1.5, y - 0.4), 7, 0.85, boxstyle="round,pad=0.02", facecolor="#eceff1", edgecolor="#333"))
        ax.text(x, y, txt, ha="center", va="center", fontsize=9)
    _save(fig, "ch3-fig05-db-logical-model.png")


def main() -> None:
    fig_architecture()
    fig_mqtt_map()
    fig_latency()
    fig_loc_pipeline()
    fig_db()


if __name__ == "__main__":
    main()
