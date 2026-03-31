#!/usr/bin/env python3
"""WheelSense CLI — Terminal UI for device control and data collection.

Usage:
    python cli.py                    # Interactive TUI mode
    python cli.py --server URL       # Custom server URL
    python cli.py --help             # Show help

Connects to the running WheelSense FastAPI server via REST API.
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import datetime, timezone

import requests
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Confirm, IntPrompt, Prompt
from rich.table import Table
from rich.text import Text
from rich.live import Live
from rich.layout import Layout
from rich.align import Align

console = Console()

DEFAULT_SERVER = "http://localhost:8000"

# Predefined motion labels for classification
MOTION_LABELS = [
    "forward_push",
    "backward_pull",
    "turn_left",
    "turn_right",
    "stop",
    "idle",
    "bump",
    "ramp_up",
    "ramp_down",
]


class WheelSenseClient:
    """REST API client for the WheelSense server."""

    def __init__(self, base_url: str = DEFAULT_SERVER):
        self.base_url = base_url.rstrip("/")
        self.api = f"{self.base_url}/api"

    def health(self) -> dict:
        return requests.get(f"{self.api}/health", timeout=5).json()

    def devices(self, device_type: str | None = None) -> list[dict]:
        params = {}
        if device_type:
            params["device_type"] = device_type
        return requests.get(f"{self.api}/devices", params=params, timeout=5).json()

    def rooms(self) -> list[dict]:
        return requests.get(f"{self.api}/rooms", timeout=5).json()

    def create_room(self, name: str, description: str = "") -> dict:
        return requests.post(
            f"{self.api}/rooms",
            json={"name": name, "description": description},
            timeout=5,
        ).json()

    def start_record(self, device_id: str, label: str) -> dict:
        resp = requests.post(
            f"{self.api}/motion-record/start",
            json={"device_id": device_id, "label": label},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    def stop_record(self, device_id: str) -> dict:
        resp = requests.post(
            f"{self.api}/motion-record/stop",
            json={"device_id": device_id},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    def localization_info(self) -> dict:
        return requests.get(f"{self.api}/localization", timeout=5).json()

    def train_localization(self, data: list[dict]) -> dict:
        resp = requests.post(
            f"{self.api}/localization/train",
            json={"data": data},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    def retrain(self) -> dict:
        resp = requests.post(f"{self.api}/localization/retrain", timeout=30)
        resp.raise_for_status()
        return resp.json()

    def telemetry(self, device_id: str | None = None, limit: int = 10) -> list[dict]:
        params = {"limit": limit}
        if device_id:
            params["device_id"] = device_id
        return requests.get(f"{self.api}/telemetry", params=params, timeout=5).json()

    def predictions(self, device_id: str | None = None, limit: int = 10) -> list[dict]:
        params = {"limit": limit}
        if device_id:
            params["device_id"] = device_id
        return requests.get(
            f"{self.api}/localization/predictions", params=params, timeout=5
        ).json()


# ─── Helpers ────────────────────────────────────────────────────────────


def print_banner():
    banner = Text()
    banner.append("🎯 WheelSense CLI", style="bold cyan")
    banner.append("  v3.1.0", style="dim")
    console.print(
        Panel(
            Align.center(banner),
            border_style="cyan",
            padding=(1, 2),
        )
    )


def check_server(client: WheelSenseClient) -> bool:
    try:
        info = client.health()
        model_status = "✅ Ready" if info.get("model_ready") else "❌ Not trained"
        console.print(f"  Server: [green]Connected[/]  Model: {model_status}")
        return True
    except Exception as e:
        console.print(f"  [red]✗ Cannot reach server:[/] {e}")
        console.print(f"  [dim]Ensure server is running: docker compose up -d[/]")
        return False


def select_device(client: WheelSenseClient) -> str | None:
    """Let user pick a device from the list."""
    try:
        devices = client.devices()
    except Exception as e:
        console.print(f"[red]Error fetching devices:[/] {e}")
        return None

    if not devices:
        console.print("[yellow]No devices found. Is the M5StickC connected?[/]")
        manual = Prompt.ask("Enter device_id manually (or 'q' to quit)")
        return None if manual.lower() == "q" else manual

    table = Table(title="🔌 Connected Devices", border_style="cyan")
    table.add_column("#", style="bold", width=3)
    table.add_column("Device ID", style="cyan")
    table.add_column("Type", style="green")
    table.add_column("Firmware")
    table.add_column("Battery")
    table.add_column("Last Seen")

    for i, d in enumerate(devices, 1):
        last_seen = d.get("last_seen", "")
        if last_seen:
            try:
                dt = datetime.fromisoformat(last_seen)
                age_s = (datetime.now(timezone.utc) - dt).total_seconds()
                if age_s < 60:
                    last_seen = f"{int(age_s)}s ago"
                elif age_s < 3600:
                    last_seen = f"{int(age_s/60)}m ago"
                else:
                    last_seen = f"{int(age_s/3600)}h ago"
            except Exception:
                pass

        table.add_row(
            str(i),
            d.get("device_id", "?"),
            d.get("device_type", "?"),
            d.get("firmware", "?"),
            "",  # Battery info not in device list, shown in telemetry
            last_seen,
        )

    console.print(table)

    choice = IntPrompt.ask(
        "Select device number (0 to enter manually)",
        default=1,
    )

    if choice == 0:
        return Prompt.ask("Enter device_id")
    if 1 <= choice <= len(devices):
        return devices[choice - 1]["device_id"]

    console.print("[red]Invalid choice[/]")
    return None


def show_device_status(client: WheelSenseClient, device_id: str):
    """Show latest telemetry for a device."""
    try:
        data = client.telemetry(device_id=device_id, limit=1)
        if not data:
            console.print(f"[yellow]No telemetry yet for {device_id}[/]")
            return

        latest = data[0]
        bat = latest.get("battery", {})
        motion = latest.get("motion", {})
        imu_data = latest.get("imu", {})

        table = Table(title=f"📊 {device_id} Status", border_style="green")
        table.add_column("Metric", style="cyan")
        table.add_column("Value", style="bold")

        table.add_row("Battery", f"{bat.get('percentage', '?')}% ({bat.get('voltage_v', '?')}V)")
        table.add_row("Charging", "⚡ Yes" if bat.get("charging") else "🔋 No")
        table.add_row("Speed", f"{motion.get('velocity_ms', 0):.2f} m/s")
        table.add_row("Distance", f"{motion.get('distance_m', 0):.2f} m")
        table.add_row("Accel", f"{motion.get('accel_ms2', 0):.2f} m/s²")
        table.add_row("Timestamp", latest.get("timestamp", "?"))
        console.print(table)
    except Exception as e:
        console.print(f"[red]Error:[/] {e}")


# ─── Mode: Record Motion ───────────────────────────────────────────────


def mode_record_motion(client: WheelSenseClient, device_id: str):
    """Interactive motion recording for ML classification."""
    console.print(
        Panel(
            "[bold red]🎬 Record Motion Mode[/]\n"
            "Record labeled IMU data for motion classification training.",
            border_style="red",
        )
    )

    while True:
        console.print("\n[bold]Select a motion label:[/]")
        for i, label in enumerate(MOTION_LABELS, 1):
            console.print(f"  [cyan]{i:2d}[/] — {label}")
        console.print(f"  [cyan] 0[/] — Custom label")
        console.print(f"  [cyan] q[/] — Back to main menu")

        choice = Prompt.ask("Choice", default="q")
        if choice.lower() == "q":
            return

        try:
            idx = int(choice)
        except ValueError:
            console.print("[red]Invalid choice[/]")
            continue

        if idx == 0:
            label = Prompt.ask("Enter custom label")
        elif 1 <= idx <= len(MOTION_LABELS):
            label = MOTION_LABELS[idx - 1]
        else:
            console.print("[red]Invalid choice[/]")
            continue

        console.print(f"\n[bold yellow]⚠ Device will beep for 3 seconds before recording starts.[/]")
        console.print(f"[bold]Label: [cyan]{label}[/][/]")

        if not Confirm.ask("Start recording?", default=True):
            continue

        # Send start command
        try:
            result = client.start_record(device_id, label)
            console.print(f"[green]✓[/] {result.get('message', 'Recording started')}")
        except Exception as e:
            console.print(f"[red]✗ Failed to start:[/] {e}")
            continue

        # Wait for user to stop
        console.print("\n[bold red]● RECORDING[/] — Press [bold]Enter[/] to stop...\n")
        start_time = time.time()

        try:
            input()  # Blocks until Enter
        except KeyboardInterrupt:
            pass

        elapsed = time.time() - start_time

        # Send stop command
        try:
            result = client.stop_record(device_id)
            console.print(f"[green]✓[/] {result.get('message', 'Recording stopped')}")
            console.print(f"[dim]Duration: {elapsed:.1f}s[/]")
        except Exception as e:
            console.print(f"[red]✗ Failed to stop:[/] {e}")


# ─── Mode: Learning Location ───────────────────────────────────────────


def mode_learning_location(client: WheelSenseClient, device_id: str):
    """Interactive RSSI location learning."""
    console.print(
        Panel(
            "[bold blue]📍 Learning Location Mode[/]\n"
            "Collect RSSI fingerprints for room localization training.",
            border_style="blue",
        )
    )

    while True:
        console.print("\n[bold]Location Actions:[/]")
        console.print("  [cyan]1[/] — View rooms")
        console.print("  [cyan]2[/] — Create new room")
        console.print("  [cyan]3[/] — Train/retrain model from DB")
        console.print("  [cyan]4[/] — View model info")
        console.print("  [cyan]5[/] — View recent predictions")
        console.print("  [cyan]6[/] — View device status")
        console.print("  [cyan]q[/] — Back to main menu")

        choice = Prompt.ask("Choice", default="q")

        if choice == "q":
            return
        elif choice == "1":
            _view_rooms(client)
        elif choice == "2":
            _create_room(client)
        elif choice == "3":
            _retrain_model(client)
        elif choice == "4":
            _view_model_info(client)
        elif choice == "5":
            _view_predictions(client, device_id)
        elif choice == "6":
            show_device_status(client, device_id)
        else:
            console.print("[red]Invalid choice[/]")


def _view_rooms(client: WheelSenseClient):
    try:
        rooms = client.rooms()
        if not rooms:
            console.print("[yellow]No rooms defined yet.[/]")
            return

        table = Table(title="🏠 Rooms", border_style="blue")
        table.add_column("ID", style="bold", width=4)
        table.add_column("Name", style="cyan")
        table.add_column("Description")

        for r in rooms:
            table.add_row(str(r["id"]), r["name"], r.get("description", ""))
        console.print(table)
    except Exception as e:
        console.print(f"[red]Error:[/] {e}")


def _create_room(client: WheelSenseClient):
    name = Prompt.ask("Room name")
    desc = Prompt.ask("Description (optional)", default="")
    try:
        result = client.create_room(name, desc)
        console.print(f"[green]✓ Room created:[/] ID={result['id']} Name={result['name']}")
    except Exception as e:
        console.print(f"[red]Error:[/] {e}")


def _retrain_model(client: WheelSenseClient):
    console.print("[dim]Retraining model from all stored training data...[/]")
    try:
        result = client.retrain()
        console.print(f"[green]✓ Model retrained:[/] {result}")
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 400:
            console.print("[yellow]No training data in database. Collect RSSI data first.[/]")
        else:
            console.print(f"[red]Error:[/] {e}")
    except Exception as e:
        console.print(f"[red]Error:[/] {e}")


def _view_model_info(client: WheelSenseClient):
    try:
        info = client.localization_info()
        if info.get("status") == "not_trained":
            console.print("[yellow]Model not trained yet.[/]")
        else:
            table = Table(title="🧠 Model Info", border_style="green")
            table.add_column("Property", style="cyan")
            table.add_column("Value", style="bold")
            table.add_row("Status", info.get("status", "?"))
            table.add_row("Rooms", str(info.get("rooms", "?")))
            table.add_row("K", str(info.get("k", "?")))
            table.add_row("Nodes", ", ".join(info.get("nodes", [])))
            console.print(table)
    except Exception as e:
        console.print(f"[red]Error:[/] {e}")


def _view_predictions(client: WheelSenseClient, device_id: str):
    try:
        preds = client.predictions(device_id=device_id, limit=10)
        if not preds:
            console.print("[yellow]No predictions yet.[/]")
            return

        table = Table(title="📍 Recent Predictions", border_style="blue")
        table.add_column("Time", style="dim")
        table.add_column("Room", style="bold cyan")
        table.add_column("Confidence", style="green")
        table.add_column("Model")

        for p in preds:
            ts = p.get("timestamp", "?")
            if isinstance(ts, str) and len(ts) > 19:
                ts = ts[:19]
            conf = p.get("confidence", 0)
            conf_str = f"{conf:.1%}"
            table.add_row(ts, p.get("predicted_room_name", "?"), conf_str, p.get("model_type", "?"))
        console.print(table)
    except Exception as e:
        console.print(f"[red]Error:[/] {e}")


# ─── Main ───────────────────────────────────────────────────────────────


def main_menu(client: WheelSenseClient):
    """Main interactive loop."""
    print_banner()

    if not check_server(client):
        sys.exit(1)

    # Select device
    device_id = select_device(client)
    if not device_id:
        console.print("[red]No device selected. Exiting.[/]")
        sys.exit(1)

    console.print(f"\n[bold green]✓ Active device:[/] [bold cyan]{device_id}[/]\n")

    while True:
        console.print("\n[bold]═══ Main Menu ═══[/]")
        console.print("  [cyan]1[/] — 🎬 Record Motion (IMU classification)")
        console.print("  [cyan]2[/] — 📍 Learning Location (RSSI training)")
        console.print("  [cyan]3[/] — 📊 Device Status")
        console.print("  [cyan]4[/] — 🔄 Switch Device")
        console.print("  [cyan]q[/] — Exit")

        choice = Prompt.ask("Choice", default="q")

        if choice == "q":
            console.print("[dim]Goodbye! 👋[/]")
            break
        elif choice == "1":
            mode_record_motion(client, device_id)
        elif choice == "2":
            mode_learning_location(client, device_id)
        elif choice == "3":
            show_device_status(client, device_id)
        elif choice == "4":
            new_device = select_device(client)
            if new_device:
                device_id = new_device
                console.print(f"[green]✓ Switched to:[/] [bold cyan]{device_id}[/]")
        else:
            console.print("[red]Invalid choice[/]")


def main():
    parser = argparse.ArgumentParser(
        description="WheelSense CLI — Terminal UI for device control and data collection",
    )
    parser.add_argument(
        "--server",
        default=DEFAULT_SERVER,
        help=f"Server URL (default: {DEFAULT_SERVER})",
    )
    args = parser.parse_args()

    client = WheelSenseClient(args.server)
    try:
        main_menu(client)
    except KeyboardInterrupt:
        console.print("\n[dim]Interrupted. Goodbye! 👋[/]")


if __name__ == "__main__":
    main()
