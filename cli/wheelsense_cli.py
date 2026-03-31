import os
import sys
import json
import time
import requests

API_URL = "http://localhost:8000/api"

def print_header():
    print("=" * 60)
    print("       WheelSense Master CLI       ")
    print("=" * 60)

def get_workspaces():
    try:
        r = requests.get(f"{API_URL}/workspaces")
        return r.json()
    except Exception as e:
        print(f"[!] Error connecting to backend: {e}")
        return []

def print_status():
    workspaces = get_workspaces()
    active = next((w for w in workspaces if w.get("is_active")), None)
    if not active:
        print(" [Status] NO ACTIVE WORKSPACE")
    else:
        print(f" [Status] Active Workspace: '{active['name']}' (Mode: {active['mode'].upper()})")
    print("-" * 60)
    return workspaces

def switch_workspace(workspaces):
    print("\nAvailable Workspaces:")
    for i, w in enumerate(workspaces):
        active_mark = "*" if w.get("is_active") else " "
        print(f" [{i}] {active_mark} {w['name']} ({w['mode']})")
    print(f" [N] Create New Workspace")
    choice = input("\nSelect workspace number or 'N': ").strip()
    
    if choice.upper() == 'N':
        name = input("Enter Workspace Name (e.g., 'Simulation-A', 'NursingHome-1'): ")
        mode = input("Enter Mode (simulation/real): ").strip().lower()
        if mode not in ["simulation", "real"]:
            mode = "simulation"
        requests.post(f"{API_URL}/workspaces", json={"name": name, "mode": mode})
        print("Workspace created and activated!")
    else:
        try:
            idx = int(choice)
            ws_id = workspaces[idx]["id"]
            requests.post(f"{API_URL}/workspaces/{ws_id}/activate")
            print("Workspace switched!")
        except Exception:
            print("Invalid selection.")

def sim_wizard(workspaces):
    active = next((w for w in workspaces if w.get("is_active")), None)
    if not active:
        print("\n[!] Please create and activate a workspace first.")
        return
    if active['mode'] != 'simulation':
        print("\n[!] Active workspace is not in 'simulation' mode! Change workspace first.")
        return
        
    print("\n--- Simulation Wizard ---")
    print(" 1. Auto-Seed Demo Rooms (Bedroom, Kitchen, Living Room)")
    print(" 2. Provision Virtual Device")
    print(" 3. Retrain Location Model from current DB")
    print(" 4. Back")
    
    choice = input("Choice: ").strip()
    if choice == '1':
        print("Seeding rooms: Bedroom, Kitchen, Living Room...")
        for room in ["Bedroom", "Kitchen", "Living Room"]:
            requests.post(f"{API_URL}/rooms", json={"name": room, "description": "Simulation Room"})
        print("Rooms created successfully!")
    elif choice == '2':
        device_id = input("Enter virtual device ID (default: sim-wheelchair-1): ")
        if not device_id:
            device_id = "sim-wheelchair-1"
        requests.post(f"{API_URL}/devices", json={"device_id": device_id, "device_type": "wheelchair"})
        print(f"Registered {device_id} in current workspace.")
        
        print("\nTo start driving this virtual device, open a NEW terminal and run:")
        print(f"  python cli/sim_controller.py {device_id}")
        input("\nPress ENTER to continue...")
    elif choice == '3':
        r = requests.post(f"{API_URL}/localization/retrain")
        if r.status_code == 200:
            print(f"Successfully retrained model: {r.json().get('message')}")
        else:
            print(f"Failed: {r.text}")


def main():
    while True:
        os.system('cls' if os.name == 'nt' else 'clear')
        print_header()
        ws = print_status()
        
        print("Main Menu:")
        print(" 1. Workspace Profile Switch / Create")
        print(" 2. Simulation Wizard (PoC Setup)")
        print(" 3. View Associated Devices")
        print(" 4. View Built Rooms")
        print(" 0. Exit")
        
        choice = input("\nSelect an option: ").strip()
        
        if choice == '1':
            switch_workspace(ws)
            time.sleep(1)
        elif choice == '2':
            sim_wizard(ws)
            time.sleep(1.5)
        elif choice == '3':
            r = requests.get(f"{API_URL}/devices")
            if r.status_code == 200:
                print("\nDevices in this Workspace:")
                for d in r.json():
                    print(f" - [{d['device_type']}] {d['device_id']} | Last seen: {d['last_seen']}")
            else:
                print("Failed to fetch.")
            input("\nPress enter to continue...")
        elif choice == '4':
            r = requests.get(f"{API_URL}/rooms")
            if r.status_code == 200:
                print("\nRooms in this Workspace:")
                for room in r.json():
                    print(f" - [{room['id']}] {room['name']}: {room['description']}")
            else:
                print("Failed to fetch.")
            input("\nPress enter to continue...")
        elif choice == '0':
            print("Exiting WheelSense Master CLI.")
            break

if __name__ == "__main__":
    main()
