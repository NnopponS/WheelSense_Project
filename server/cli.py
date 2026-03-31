#!/usr/bin/env python3
"""WheelSense CLI — Terminal interface for workspace management and data collection.

Usage:
    python cli.py                    # Interactive TUI mode
    python cli.py --server URL       # Custom server URL
    python cli.py --help             # Show help
"""

from __future__ import annotations

import argparse
import os
import sys
import time
import json
from datetime import datetime, timezone
from typing import Any

import requests  # type: ignore[import-untyped]
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Confirm, IntPrompt, Prompt
from rich.table import Table

console = Console()

DEFAULT_SERVER = "http://localhost:8000"
LABELS_FILE = "motion_labels.json"

def load_motion_labels() -> list[str]:
    default_labels = [
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
    if os.path.exists(LABELS_FILE):
        try:
            with open(LABELS_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass  # nosec B110
    # Create the default file if it doesn't exist so user can edit it
    try:
        with open(LABELS_FILE, "w") as f:
            json.dump(default_labels, f, indent=4)
    except Exception:
        pass  # nosec B110
    return default_labels


class WheelSenseClient:
    """REST API client for the WheelSense server."""

    def __init__(self, base_url: str = DEFAULT_SERVER):
        self.base_url = base_url.rstrip("/")
        self.api = f"{self.base_url}/api"

    def health(self) -> dict:
        return requests.get(f"{self.api}/health", timeout=5).json()

    # --- Workspaces ---
    def workspaces(self) -> list[dict]:
        return requests.get(f"{self.api}/workspaces", timeout=5).json()

    def create_workspace(self, name: str, mode: str) -> dict:
        return requests.post(f"{self.api}/workspaces", json={"name": name, "mode": mode}, timeout=5).json()

    def activate_workspace(self, ws_id: int) -> dict:
        return requests.post(f"{self.api}/workspaces/{ws_id}/activate", timeout=5).json()

    # --- Devices ---
    def devices(self, device_type: str | None = None) -> list[dict]:
        params = {}
        if device_type:
            params["device_type"] = device_type
        return requests.get(f"{self.api}/devices", params=params, timeout=5).json()

    def register_device(self, device_id: str, device_type: str = "wheelchair") -> dict:
        return requests.post(f"{self.api}/devices", json={"device_id": device_id, "device_type": device_type}, timeout=5).json()

    # --- Rooms ---
    def rooms(self) -> list[dict]:
        return requests.get(f"{self.api}/rooms", timeout=5).json()

    def create_room(self, name: str, description: str = "") -> dict:
        return requests.post(
            f"{self.api}/rooms",
            json={"name": name, "description": description},
            timeout=5,
        ).json()

    # --- Recording ---
    def start_record(self, device_id: str, label: str) -> dict:
        session_id = f"session_{int(time.time())}"
        resp = requests.post(
            f"{self.api}/motion-record/start",
            json={"device_id": device_id, "label": label, "session_id": session_id},
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

    # --- Localization ---
    def localization_info(self) -> dict:
        return requests.get(f"{self.api}/localization", timeout=5).json()

    def retrain(self) -> dict:
        resp = requests.post(f"{self.api}/localization/retrain", timeout=30)
        resp.raise_for_status()
        return resp.json()

    def telemetry(self, device_id: str | None = None, limit: int = 10) -> list[dict]:
        params: dict[str, Any] = {"limit": limit}
        if device_id:
            params["device_id"] = device_id
        return requests.get(f"{self.api}/telemetry", params=params, timeout=5).json()

    def predictions(self, device_id: str | None = None, limit: int = 10) -> list[dict]:
        params: dict[str, Any] = {"limit": limit}
        if device_id:
            params["device_id"] = device_id
        return requests.get(f"{self.api}/localization/predictions", params=params, timeout=5).json()


# ─── Display Helpers ────────────────────────────────────────────────────

def clear_screen():
    console.clear()

def print_banner(client: WheelSenseClient):
    clear_screen()
    console.print(Panel("WHEELSENSE PLATFORM CLI", style="bold white on black", expand=False))
    
    try:
        ws_list = client.workspaces()
        active = next((w for w in ws_list if w.get("is_active")), None)
        if active:
            console.print(f"Active Workspace: [bold cyan]{active['name']}[/] (Mode: {active['mode']})")
        else:
            console.print("Active Workspace: [bold red]NONE[/] (Please configure a workspace)")
    except Exception:
        console.print("[red]Cannot connect to server API.[/]")
    console.print("-" * 50)


# ─── Workspace Management ────────────────────────────────────────────────

def manage_workspaces(client: WheelSenseClient):
    while True:
        print_banner(client)
        console.print("[bold]Workspace Management[/]")
        try:
            ws_list = client.workspaces()
        except Exception:
            console.print("[red]API Error.[/]")
            input("Press Enter...")
            return

        for i, w in enumerate(ws_list, 1):
            mark = "*" if w.get("is_active") else " "
            console.print(f" [{mark}] {i}. {w['name']} ({w['mode']})")

        console.print("\nOptions:")
        console.print("  [N] Create new workspace")
        console.print("  [B] Back to main menu")
        console.print("  [1-9] Select workspace to activate")
        
        choice = Prompt.ask("Select").strip().lower()
        if choice == 'b':
            return
        elif choice == 'n':
            name = Prompt.ask("Workspace Name")
            mode = Prompt.ask("Mode (real/simulation)", choices=["real", "simulation"], default="real")
            created_ws = client.create_workspace(name, mode)
            console.print("[green]Workspace created.[/]")
            
            if mode == "simulation" and "id" in created_ws:
                rooms_count = IntPrompt.ask("How many virtual rooms to create?", default=3)
                device_count = IntPrompt.ask("How many virtual devices to register?", default=1)
                
                # Activate before injecting
                client.activate_workspace(created_ws["id"])
                
                for i in range(1, rooms_count + 1):
                    client.create_room(f"SimRoom_{i}", "Auto-generated simulation room")
                for i in range(1, device_count + 1):
                    client.register_device(f"SIM_DEVICE_0{i}")
                
                console.print(f"[bold green]Seeded {rooms_count} rooms and {device_count} devices.[/]")

            time.sleep(1)
        else:
            try:
                idx = int(choice) - 1
                if 0 <= idx < len(ws_list):
                    client.activate_workspace(ws_list[idx]["id"])
                    console.print("[green]Workspace activated.[/]")
                    time.sleep(1)
            except ValueError:
                pass


def select_device(client: WheelSenseClient) -> str | None:
    try:
        devices = client.devices()
    except Exception as e:
        console.print(f"[red]Error fetching devices:[/] {e}")
        return None

    if not devices:
        console.print("[yellow]No devices found in this workspace.[/]")
        manual = Prompt.ask("Enter device_id manually (or 'q' to quit)")
        if manual.lower() != 'q':
            client.register_device(manual)
            return manual
        return None

    table = Table(title="Connected Devices", show_header=True, header_style="bold")
    table.add_column("#")
    table.add_column("Device ID")
    table.add_column("Type")
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
                pass  # nosec B110
        table.add_row(str(i), d.get("device_id", "?"), d.get("device_type", "?"), last_seen)

    console.print(table)
    choice = IntPrompt.ask("Select device number (0 to register a new device manually)", default=1)

    if choice == 0:
        manual = Prompt.ask("Enter new device_id")
        client.register_device(manual)
        return manual
    if 1 <= choice <= len(devices):
        return devices[choice - 1]["device_id"]
    return None

def show_device_status(client: WheelSenseClient, device_id: str):
    try:
        data = client.telemetry(device_id=device_id, limit=1)
        if not data:
            console.print(f"[yellow]No telemetry yet for {device_id}[/]")
            return

        latest = data[0]
        bat = latest.get("battery", {})
        motion = latest.get("motion", {})

        table = Table(title=f"Status: {device_id}", show_header=False)
        table.add_column("Metric", style="bold")
        table.add_column("Value")
        table.add_row("Battery", f"{bat.get('percentage', '?')}% ({bat.get('voltage_v', '?')}V)")
        table.add_row("Charging", "Yes" if bat.get("charging") else "No")
        table.add_row("Speed", f"{motion.get('velocity_ms', 0):.2f} m/s")
        table.add_row("Distance", f"{motion.get('distance_m', 0):.2f} m")
        table.add_row("Accel", f"{motion.get('accel_ms2', 0):.2f} m/s2")
        console.print(table)
    except Exception as e:
        console.print(f"[red]Error:[/] {e}")


# ─── Mode: Record Motion ───────────────────────────────────────────────

def mode_record_motion(client: WheelSenseClient, device_id: str):
    labels = load_motion_labels()
    
    print_banner(client)
    console.print("[bold]DATA COLLECTION: Motion Classes[/]")
    
    while True:
        console.print("\nSelect a motion label:")
        for i, label in enumerate(labels, 1):
            console.print(f"  {i:2d}. {label}")
        console.print("   C. Custom free-text label")
        console.print("   Q. Back")

        choice = Prompt.ask("Choice").strip().lower()
        if choice == "q":
            return
            
        label = ""
        if choice == "c":
            label = Prompt.ask("Enter custom label").strip()
            # Optionally save to json
            if label and label not in labels:
                labels.append(label)
                try:
                    with open(LABELS_FILE, "w") as f:
                        json.dump(labels, f, indent=4)
                except Exception:
                    pass  # nosec B110  # nosec B110
        else:
            try:
                idx = int(choice)
                if 1 <= idx <= len(labels):
                    label = labels[idx - 1]
            except ValueError:
                pass
                
        if not label:
            console.print("[red]Invalid choice.[/]")
            continue

        console.print("\n[bold yellow]Device will beep before recording starts.[/]")
        console.print(f"Target Label: [bold cyan]{label}[/]")

        if not Confirm.ask("Proceed to record?", default=True):
            print_banner(client)
            continue

        try:
            client.start_record(device_id, label)
            console.print("[green]Recording Started.[/]")
        except Exception as e:
            console.print(f"[red]Failed to start:[/] {e}")
            continue

        console.print("\n[bold red][ RECORDING IN PROGRESS ][/] — Press Enter to stop.")
        start_time = time.time()
        try:
            input()
        except KeyboardInterrupt:
            pass

        elapsed = time.time() - start_time
        try:
            client.stop_record(device_id)
            console.print(f"[green]Recording Saved.[/] Duration: {elapsed:.1f}s")
        except Exception as e:
            console.print(f"[red]Failed to stop:[/] {e}")
            
        time.sleep(1)
        print_banner(client)


# ─── Mode: RSSI Localization ───────────────────────────────────────────

def mode_learning_location(client: WheelSenseClient, device_id: str):
    while True:
        print_banner(client)
        console.print("[bold]DATA COLLECTION: RSSI Localization[/]")
        console.print("  1. View configured rooms")
        console.print("  2. Create new room")
        console.print("  3. Retrain model from database")
        console.print("  4. View active predictions")
        console.print("  Q. Back")

        choice = Prompt.ask("\nChoice").strip().lower()
        if choice == "q":
            return
        elif choice == "1":
            try:
                rooms = client.rooms()
                table = Table(title="Configured Rooms")
                table.add_column("ID")
                table.add_column("Name")
                for r in rooms:
                    table.add_row(str(r["id"]), r["name"])
                console.print(table)
            except Exception as e:
                console.print(f"[red]Error:[/] {e}")
            input("\nPress Enter...")
        elif choice == "2":
            name = Prompt.ask("Room name")
            desc = Prompt.ask("Description", default="")
            client.create_room(name, desc)
            console.print("[green]Room created.[/]")
            time.sleep(1)
        elif choice == "3":
            console.print("Retraining model...")
            try:
                res = client.retrain()
                console.print(f"[green]Model retrained.[/] {res}")
            except Exception as e:
                console.print(f"[red]Retrain failed:[/] {e}")
            input("\nPress Enter...")
        elif choice == "4":
            try:
                preds = client.predictions(device_id=device_id, limit=5)
                table = Table(title="Recent Predictions")
                table.add_column("Time")
                table.add_column("Room")
                table.add_column("Confidence")
                for p in preds:
                    table.add_row(str(p.get("timestamp"))[:19], p.get("predicted_room_name", ""), f"{p.get('confidence', 0):.2f}")
                console.print(table)
            except Exception as e:
                console.print(f"[red]Error:[/] {e}")
            input("\nPress Enter...")


# ─── Main ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="WheelSense CLI")
    parser.add_argument("--server", default=DEFAULT_SERVER, help="Server URL")
    args = parser.parse_args()

    client = WheelSenseClient(args.server)
    
    while True:
        print_banner(client)
        
        try:
            ws_list = client.workspaces()
            if not any(w.get("is_active") for w in ws_list):
                console.print("[yellow]Initial setup required.[/]")
                manage_workspaces(client)
                continue
        except Exception:
            console.print("[red]Ensure server handles are running and accessible.[/]")
            time.sleep(5)
            sys.exit(1)

        device_id = select_device(client)
        if not device_id:
            continue

        while True:
            print_banner(client)
            console.print(f"Target Device: [bold]{device_id}[/]\n")
            console.print("[bold]Operations Menu[/]")
            console.print("  1. Motion Classification Collection")
            console.print("  2. RSSI Localization Control")
            console.print("  3. View Telemetry Status")
            console.print("  4. Switch Workspace")
            console.print("  5. Switch Device")
            console.print("  Q. Exit")

            choice = Prompt.ask("\nChoice").strip().lower()

            if choice == "q":
                sys.exit(0)
            elif choice == "1":
                mode_record_motion(client, device_id)
            elif choice == "2":
                mode_learning_location(client, device_id)
            elif choice == "3":
                show_device_status(client, device_id)
                input("\nPress Enter...")
            elif choice == "4":
                manage_workspaces(client)
                break # Refresh device selection for new workspace
            elif choice == "5":
                break

if __name__ == "__main__":
    main()
