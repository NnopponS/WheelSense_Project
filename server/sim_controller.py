#!/usr/bin/env python3
"""
WheelSense Enhanced Simulation Controller
Realistic patient-based simulation with care-level aware vitals, room movement, and workflow automation.

Usage:
  python sim_controller.py [options]

Options:
  --routine           Run routine simulation infinitely
  --event             Trigger a specific crisis event (fall, abnormal_hr, etc.)
  --workspace-id      Select workspace ID explicitly (else SIM_WORKSPACE_ID env, else demo workspace
                      name from settings, else workspace with most active device assignments, else latest id)
  --config            Path to custom simulation config JSON file
  --pause             Pause an already running simulation
  --stop              Stop all simulation processes
  --status            Show simulation status

Examples:
  # Start routine simulation
  python sim_controller.py --routine --workspace-id 1

  # Trigger fall event for specific patient
  python sim_controller.py --event fall --patient-id 5

  # Use custom config
  python sim_controller.py --routine --config my_sim_config.json
"""

from __future__ import annotations

import sys
import os
import asyncio
import argparse
import random
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

import paho.mqtt.client as mqtt

sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from sqlalchemy import func
from sqlalchemy.future import select
from sqlalchemy.orm import joinedload

from app.config import settings
from app.db.session import AsyncSessionLocal
from app.models import (
    Workspace, Room, Patient, Device, PatientDeviceAssignment,
    CareGiver, CareSchedule, CareTask, HandoverNote, RoleMessage,
    CareDirective, ActivityTimeline, Alert
)

# =============================================================================
# Configuration
# =============================================================================

BROKER = os.environ.get("MQTT_BROKER", "127.0.0.1")
PORT = int(os.environ.get("MQTT_PORT", "1883"))
MQTT_USER = (os.environ.get("MQTT_USER") or "").strip() or None
MQTT_PASSWORD = (os.environ.get("MQTT_PASSWORD") or "").strip() or None

SIMULATION_CONFIG = {
    "vital_update_interval": 30,      # seconds between vital updates
    "alert_probability": 0.05,        # 5% chance per patient per cycle
    "movement_probability": 0.15,   # 15% chance to move rooms per cycle
    "caregiver_task_completion": 0.8, # 80% tasks completed on time
    "routine_check_interval": 300,  # 5 minutes between routine checks
    "handover_generation_interval": 3600,  # 1 hour between handovers
    "enable_vitals": True,
    "enable_movement": True,
    "enable_alerts": True,
    "enable_routine_simulation": True,
    "enable_handover_generation": True,
    "log_level": "INFO",
    "emergency_stop_file": ".sim_stop",
    "pause_file": ".sim_pause",
}

# Room type movement preferences by care level
ROOM_PREFERENCES = {
    "critical": {
        "preferred": ["bedroom", "clinic"],
        "avoid": ["garden", "activity"],
        "stay_probability": 0.85,  # High chance to stay in current room
    },
    "special": {
        "preferred": ["bedroom", "dining", "clinic"],
        "avoid": [],
        "stay_probability": 0.70,
    },
    "normal": {
        "preferred": ["bedroom", "dining", "activity", "garden"],
        "avoid": ["clinic"],
        "stay_probability": 0.50,
    },
}

# Vital sign ranges by care level
VITAL_RANGES = {
    "critical": {
        "heart_rate": (85, 120),
        "heart_rate_variability": 15,  # Higher variability
        "spo2": (88, 95),
        "skin_temp": (36.5, 38.0),
        "movement_volatility": 0.4,  # More erratic movement
    },
    "special": {
        "heart_rate": (70, 110),
        "heart_rate_variability": 10,
        "spo2": (90, 97),
        "skin_temp": (36.3, 37.5),
        "movement_volatility": 0.25,
    },
    "normal": {
        "heart_rate": (60, 90),
        "heart_rate_variability": 5,
        "spo2": (95, 100),
        "skin_temp": (36.1, 37.2),
        "movement_volatility": 0.15,
    },
}

# Alert thresholds
ALERT_THRESHOLDS = {
    "heart_rate_high": 110,
    "heart_rate_low": 50,
    "spo2_low": 90,
    "skin_temp_high": 38.0,
    "skin_temp_low": 35.5,
}


# =============================================================================
# Data Classes
# =============================================================================

@dataclass
class PatientState:
    """Tracks simulation state for each patient."""
    patient_id: int
    device_id: str
    care_level: str
    current_room_idx: int
    home_room_idx: int
    mobility_type: str
    
    # Vital tracking
    last_heart_rate: int = 75
    last_spo2: int = 98
    consecutive_abnormal_hr: int = 0
    
    # Movement tracking
    time_in_current_room: int = 0
    total_moves_today: int = 0
    last_movement_time: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Alert state
    active_alerts: list[str] = field(default_factory=list)
    
    def __post_init__(self):
        # Set initial vitals based on care level
        ranges = VITAL_RANGES.get(self.care_level, VITAL_RANGES["normal"])
        self.last_heart_rate = random.randint(*ranges["heart_rate"])
        self.last_spo2 = random.randint(*ranges["spo2"])


class SimulationStatus:
    STOPPED = "stopped"
    RUNNING = "running"
    PAUSED = "paused"
    EMERGENCY_STOP = "emergency_stop"


# =============================================================================
# Simulator Classes
# =============================================================================

class VitalSimulator:
    """Generates realistic vital signs based on patient care level."""
    
    def __init__(self, config: dict):
        self.config = config
    
    def generate_for_patient(self, patient_state: PatientState) -> dict[str, Any]:
        """Generate vitals appropriate for patient's care level."""
        care_level = patient_state.care_level
        ranges = VITAL_RANGES.get(care_level, VITAL_RANGES["normal"])
        
        # Heart rate with trend continuity and variability
        hr_variability = ranges["heart_rate_variability"]
        hr_change = random.randint(-hr_variability, hr_variability)
        heart_rate = max(40, min(160, patient_state.last_heart_rate + hr_change))
        
        # Occasionally introduce spikes for critical patients
        if care_level == "critical" and random.random() < 0.15:
            heart_rate = random.randint(100, 135)
        
        # SpO2 with care-level appropriate ranges
        spo2_change = random.randint(-2, 2)
        spo2 = max(85, min(100, patient_state.last_spo2 + spo2_change))
        
        # Critical patients have lower baseline SpO2
        if care_level == "critical":
            spo2 = min(spo2, random.randint(88, 95))
        elif care_level == "special":
            spo2 = min(spo2, random.randint(92, 97))
        
        # Skin temperature
        skin_temp = round(random.uniform(*ranges["skin_temp"]), 1)
        
        # RR interval inversely related to heart rate
        rr_interval = int(60000 / heart_rate) if heart_rate > 0 else 800
        rr_interval += random.randint(-50, 50)
        rr_interval = max(400, min(1500, rr_interval))
        
        # Sensor battery (gradual drain)
        battery = max(20, 100 - (patient_state.total_moves_today * 2))
        
        # Update patient state
        patient_state.last_heart_rate = heart_rate
        patient_state.last_spo2 = spo2
        
        return {
            "heart_rate_bpm": heart_rate,
            "rr_interval_ms": rr_interval,
            "spo2": spo2,
            "skin_temperature": skin_temp,
            "sensor_battery": battery,
        }
    
    def generate_fall_vitals(self, patient_state: PatientState) -> dict[str, Any]:
        """Generate vitals indicating a fall event."""
        return {
            "heart_rate_bpm": random.randint(100, 140),  # Elevated from stress
            "rr_interval_ms": random.randint(500, 700),
            "spo2": max(85, patient_state.last_spo2 - random.randint(3, 8)),
            "sensor_battery": random.randint(50, 100),
        }


class RoomSimulator:
    """Simulates realistic room movement patterns."""
    
    def __init__(self, rooms: list[Room], config: dict):
        self.rooms = rooms
        self.config = config
        self.room_type_map = self._build_room_type_map()
    
    def _build_room_type_map(self) -> dict[int, str]:
        """Build mapping of room index to room type."""
        return {idx: room.room_type for idx, room in enumerate(self.rooms)}
    
    def should_move(self, patient_state: PatientState) -> bool:
        """Determine if patient should move based on care level and probability."""
        care_level = patient_state.care_level
        preferences = ROOM_PREFERENCES.get(care_level, ROOM_PREFERENCES["normal"])
        
        # Higher stay probability means less movement
        stay_prob = preferences["stay_probability"]
        time_factor = min(patient_state.time_in_current_room / 10, 0.3)
        
        effective_stay_prob = stay_prob - time_factor
        return random.random() > effective_stay_prob
    
    def select_destination(self, patient_state: PatientState) -> int:
        """Select realistic destination room based on preferences."""
        care_level = patient_state.care_level
        preferences = ROOM_PREFERENCES.get(care_level, ROOM_PREFERENCES["normal"])
        current_idx = patient_state.current_room_idx
        
        # Get preferred room indices
        preferred_indices = [
            idx for idx, room in enumerate(self.rooms)
            if room.room_type in preferences["preferred"]
        ]
        
        # Get avoid room indices
        avoid_indices = [
            idx for idx, room in enumerate(self.rooms)
            if room.room_type in preferences["avoid"]
        ]
        
        # Weight rooms by preference
        weights = []
        for idx in range(len(self.rooms)):
            if idx == current_idx:
                weights.append(0.1)  # Low weight for staying
            elif idx in preferred_indices:
                weights.append(3.0)  # High weight for preferred rooms
            elif idx in avoid_indices:
                weights.append(0.2)  # Low weight for avoided rooms
            else:
                weights.append(1.0)  # Neutral weight
        
        # Normalize weights
        total = sum(weights)
        weights = [w / total for w in weights]
        
        # Select based on weights
        return random.choices(range(len(self.rooms)), weights=weights, k=1)[0]
    
    def simulate_movement(self, patient_state: PatientState) -> tuple[int, bool]:
        """Simulate room movement for a patient. Returns (new_room_idx, did_move)."""
        if not self.should_move(patient_state):
            patient_state.time_in_current_room += 1
            return patient_state.current_room_idx, False
        
        new_room = self.select_destination(patient_state)
        
        if new_room != patient_state.current_room_idx:
            patient_state.current_room_idx = new_room
            patient_state.time_in_current_room = 0
            patient_state.total_moves_today += 1
            patient_state.last_movement_time = datetime.now(timezone.utc)
            return new_room, True
        
        patient_state.time_in_current_room += 1
        return new_room, False


class AlertSimulator:
    """Generates alerts based on vital thresholds and care level."""
    
    def __init__(self, config: dict):
        self.config = config
        self.thresholds = ALERT_THRESHOLDS
    
    def check_vitals_for_alerts(self, patient_state: PatientState, vitals: dict) -> list[dict]:
        """Check vitals against thresholds and return alert configs."""
        alerts = []
        care_level = patient_state.care_level
        
        # Heart rate checks
        hr = vitals.get("heart_rate_bpm", 75)
        if hr > self.thresholds["heart_rate_high"]:
            patient_state.consecutive_abnormal_hr += 1
            if patient_state.consecutive_abnormal_hr >= 2:  # Require 2 consecutive
                alerts.append({
                    "alert_type": "abnormal_hr",
                    "severity": "critical" if hr > 120 else "warning",
                    "title": f"High Heart Rate: {hr} BPM",
                    "description": f"Patient showing elevated heart rate ({hr} BPM). Care level: {care_level}.",
                })
        elif hr < self.thresholds["heart_rate_low"]:
            patient_state.consecutive_abnormal_hr += 1
            if patient_state.consecutive_abnormal_hr >= 2:
                alerts.append({
                    "alert_type": "abnormal_hr",
                    "severity": "critical" if hr < 45 else "warning",
                    "title": f"Low Heart Rate: {hr} BPM",
                    "description": f"Patient showing low heart rate ({hr} BPM). Care level: {care_level}.",
                })
        else:
            patient_state.consecutive_abnormal_hr = 0
        
        # SpO2 checks
        spo2 = vitals.get("spo2", 98)
        if spo2 < self.thresholds["spo2_low"]:
            alerts.append({
                "alert_type": "low_spo2",
                "severity": "critical" if spo2 < 85 else "warning",
                "title": f"Low SpO2: {spo2}%",
                "description": f"Blood oxygen level below threshold ({spo2}%).",
            })
        
        # Care-level specific alert probability for random alerts
        alert_prob = self.config.get("alert_probability", 0.05)
        if care_level == "critical":
            alert_prob *= 2.5
        elif care_level == "special":
            alert_prob *= 1.5
        
        if random.random() < alert_prob and not alerts:
            # Generate contextual random alert
            alert_types = [
                ("no_movement", "info", "Extended Inactivity"),
                ("zone_violation", "warning", "Unusual Location"),
            ]
            if care_level == "critical":
                alert_types.append(("abnormal_hr", "warning", "Heart Rate Variability"))
            
            alert_type, severity, title = random.choice(alert_types)
            alerts.append({
                "alert_type": alert_type,
                "severity": severity,
                "title": title,
                "description": f"Simulated {alert_type} alert for {care_level} patient.",
            })
        
        return alerts


class RoutineSimulator:
    """Simulates caregiver routine completion and workflow updates."""
    
    def __init__(self, config: dict):
        self.config = config
        self.last_routine_check: datetime | None = None
        self.last_handover_time: datetime | None = None
    
    async def simulate_caregiver_tasks(self, session, workspace_id: int) -> dict:
        """Simulate caregivers completing scheduled tasks."""
        results = {"tasks_completed": 0, "schedules_completed": 0, "handovers_created": 0}
        
        if not self.config.get("enable_routine_simulation", True):
            return results
        
        now = datetime.now(timezone.utc)
        completion_rate = self.config.get("caregiver_task_completion", 0.8)
        
        # Find pending tasks that are due
        result = await session.execute(
            select(CareTask)
            .where(
                CareTask.workspace_id == workspace_id,
                CareTask.status.in_(["pending", "in_progress"]),
                CareTask.due_at <= now + timedelta(minutes=30)
            )
        )
        tasks = result.scalars().all()
        
        for task in tasks:
            if random.random() < completion_rate:
                task.status = "completed"
                task.completed_at = now
                results["tasks_completed"] += 1
                
                # Create completion activity
                activity = ActivityTimeline(
                    workspace_id=workspace_id,
                    patient_id=task.patient_id,
                    timestamp=now,
                    event_type="task_completed",
                    description=f"Task '{task.title}' completed by simulation",
                    data={"task_id": task.id, "source": "simulation"},
                    source="system"
                )
                session.add(activity)
        
        # Check for schedules that should be marked completed
        result = await session.execute(
            select(CareSchedule)
            .where(
                CareSchedule.workspace_id == workspace_id,
                CareSchedule.status == "scheduled",
                CareSchedule.ends_at <= now
            )
        )
        schedules = result.scalars().all()
        
        for schedule in schedules:
            if random.random() < completion_rate:
                schedule.status = "completed"
                results["schedules_completed"] += 1
        
        await session.commit()
        return results
    
    async def generate_handover_notes(self, session, workspace_id: int, 
                                       patients: list[Patient],
                                       caregivers: list[CareGiver]) -> int:
        """Generate periodic handover notes."""
        if not self.config.get("enable_handover_generation", True):
            return 0
        
        now = datetime.now(timezone.utc)
        interval = self.config.get("handover_generation_interval", 3600)
        
        if self.last_handover_time and (now - self.last_handover_time).seconds < interval:
            return 0
        
        if not caregivers or not patients:
            return 0
        
        count = 0
        shift_labels = ["morning", "evening", "night"]
        priorities = ["routine", "routine", "urgent"]
        
        for idx, patient in enumerate(patients[:3]):  # Max 3 handovers per cycle
            handover = HandoverNote(
                workspace_id=workspace_id,
                patient_id=patient.id,
                author_user_id=None,  # System generated
                target_role="head_nurse",
                shift_date=now.date(),
                shift_label=random.choice(shift_labels),
                priority=priorities[idx % len(priorities)],
                note=f"[SIM] Automated handover: {patient.care_level} care level patient. "
                     f"Recent activity normal. Next check scheduled.",
                created_at=now
            )
            session.add(handover)
            count += 1
        
        await session.commit()
        self.last_handover_time = now
        return count


# =============================================================================
# Main Simulation Engine
# =============================================================================

class SimulationEngine:
    """Enhanced WheelSense simulation engine with realistic patient behavior."""
    
    def __init__(self, config: dict | None = None):
        self.config = config or SIMULATION_CONFIG.copy()
        self.workspace: Workspace | None = None
        self.rooms: list[Room] = []
        self.patients: list[Patient] = []
        self.caregivers: list[CareGiver] = []
        self.patient_states: dict[int, PatientState] = {}  # patient_id -> state
        self.assignments: list[PatientDeviceAssignment] = []
        self.mqtt_client: mqtt.Client | None = None
        
        # Simulators
        self.vital_sim: VitalSimulator | None = None
        self.room_sim: RoomSimulator | None = None
        self.alert_sim: AlertSimulator | None = None
        self.routine_sim: RoutineSimulator | None = None
        
        # Control
        self.status = SimulationStatus.STOPPED
        self.loop_task: asyncio.Task | None = None
        
        # Logging
        self._setup_logging()
        self.logger.info("SimulationEngine initialized")
    
    def _setup_logging(self):
        """Configure logging for simulation."""
        log_level = getattr(logging, self.config.get("log_level", "INFO").upper())
        logging.basicConfig(
            level=log_level,
            format="[%(asctime)s] [%(levelname)s] %(message)s",
            datefmt="%H:%M:%S"
        )
        self.logger = logging.getLogger("Simulation")
    
    def _check_control_files(self) -> str:
        """Check for pause/stop control files."""
        stop_file = Path(self.config.get("emergency_stop_file", ".sim_stop"))
        pause_file = Path(self.config.get("pause_file", ".sim_pause"))
        
        if stop_file.exists():
            return SimulationStatus.EMERGENCY_STOP
        if pause_file.exists():
            return SimulationStatus.PAUSED
        return SimulationStatus.RUNNING
    
    def _remove_control_files(self):
        """Clean up control files."""
        for filename in [".sim_stop", ".sim_pause"]:
            path = Path(filename)
            if path.exists():
                path.unlink()
    
    async def initialize_data(self, workspace_id: int | None = None):
        """Load workspace data from database."""
        self.logger.info("Loading workspace data from database...")
        
        async with AsyncSessionLocal() as session:
            # Get workspace
            if workspace_id is not None:
                result = await session.execute(
                    select(Workspace).where(Workspace.id == workspace_id)
                )
                ws = result.scalar_one_or_none()
            else:
                # Avoid picking an empty "latest id" workspace: prefer configured demo name,
                # then any workspace that already has active patient↔device assignments.
                ws = None
                demo_name = (settings.bootstrap_demo_workspace_name or "").strip()
                if demo_name:
                    result = await session.execute(
                        select(Workspace).where(Workspace.name == demo_name)
                    )
                    ws = result.scalar_one_or_none()
                if ws is None:
                    wid_row = await session.execute(
                        select(
                            PatientDeviceAssignment.workspace_id,
                            func.count().label("cnt"),
                        )
                        .where(PatientDeviceAssignment.is_active.is_(True))
                        .group_by(PatientDeviceAssignment.workspace_id)
                        .order_by(func.count().desc())
                        .limit(1)
                    )
                    first = wid_row.first()
                    if first is not None:
                        wid = int(first[0])
                        result = await session.execute(
                            select(Workspace).where(Workspace.id == wid)
                        )
                        ws = result.scalar_one_or_none()
                if ws is None:
                    result = await session.execute(
                        select(Workspace).order_by(Workspace.id.desc()).limit(1)
                    )
                    ws = result.scalar_one_or_none()
            
            if not ws:
                self.logger.error("Workspace not found. Run seed script first.")
                sys.exit(1)
            
            self.workspace = ws
            self.logger.info(f"Workspace: {ws.name} (id={ws.id})")
            
            # Get rooms with relationships
            result = await session.execute(
                select(Room).where(Room.workspace_id == ws.id)
            )
            self.rooms = result.scalars().all()
            self.logger.info(f"Loaded {len(self.rooms)} rooms")
            
            # Get patients
            result = await session.execute(
                select(Patient)
                .where(Patient.workspace_id == ws.id, Patient.is_active == True)
            )
            self.patients = result.scalars().all()
            self.logger.info(f"Loaded {len(self.patients)} patients")
            
            # Get caregivers
            result = await session.execute(
                select(CareGiver)
                .where(CareGiver.workspace_id == ws.id, CareGiver.is_active == True)
            )
            self.caregivers = result.scalars().all()
            self.logger.info(f"Loaded {len(self.caregivers)} caregivers")
            
            # Get active device assignments with patient data
            result = await session.execute(
                select(PatientDeviceAssignment)
                .options(joinedload(PatientDeviceAssignment.patient))
                .where(
                    PatientDeviceAssignment.workspace_id == ws.id,
                    PatientDeviceAssignment.is_active == True
                )
            )
            self.assignments = result.scalars().all()
            self.logger.info(f"Loaded {len(self.assignments)} device assignments")
            
            # Initialize patient states
            bedroom_indices = [i for i, r in enumerate(self.rooms) if r.room_type == "bedroom"]
            
            for assignment in self.assignments:
                patient = assignment.patient
                if not patient:
                    continue
                
                # Find home room (patient's assigned room or first bedroom)
                home_idx = 0
                if patient.room_id:
                    for idx, room in enumerate(self.rooms):
                        if room.id == patient.room_id:
                            home_idx = idx
                            break
                elif bedroom_indices:
                    home_idx = bedroom_indices[assignment.patient_id % len(bedroom_indices)]
                
                # Create patient state
                self.patient_states[patient.id] = PatientState(
                    patient_id=patient.id,
                    device_id=assignment.device_id,
                    care_level=patient.care_level or "normal",
                    current_room_idx=home_idx,
                    home_room_idx=home_idx,
                    mobility_type=patient.mobility_type or "wheelchair"
                )
            
            if not self.rooms or not self.patient_states:
                self.logger.error("Not enough data to simulate. Check database.")
                sys.exit(1)
        
        # Initialize simulators
        self.vital_sim = VitalSimulator(self.config)
        self.room_sim = RoomSimulator(self.rooms, self.config)
        self.alert_sim = AlertSimulator(self.config)
        self.routine_sim = RoutineSimulator(self.config)
        
        self.logger.info("Data initialization complete")
    
    def connect_mqtt(self):
        """Connect to MQTT broker."""
        self.logger.info(f"Connecting to MQTT broker at {BROKER}:{PORT}...")
        
        try:
            self.mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
            if MQTT_USER:
                self.mqtt_client.username_pw_set(MQTT_USER, MQTT_PASSWORD or "")
            self.mqtt_client.connect(BROKER, PORT, 60)
            self.mqtt_client.loop_start()
            self.logger.info("MQTT connected successfully")
        except Exception as e:
            self.logger.error(f"Failed to connect to MQTT: {e}")
            sys.exit(1)
    
    def generate_payload(self, device_id: str, patient_state: PatientState, 
                         vitals: dict, room_idx: int, 
                         motion_state: str = "idle", is_fall: bool = False) -> dict:
        """Generate telemetry payload."""
        room = self.rooms[room_idx]
        node_id = f"NODE_ROOM_{room_idx}"
        
        # IMU data based on motion state
        if is_fall:
            ax, ay, az = random.uniform(-2.0, 2.0), random.uniform(-2.0, 2.0), 3.5
            velocity = 0.01
        elif motion_state == "moving":
            volatility = VITAL_RANGES[patient_state.care_level]["movement_volatility"]
            ax = random.uniform(-0.5 - volatility, 0.5 + volatility)
            ay = random.uniform(-0.5 - volatility, 0.5 + volatility)
            az = random.uniform(0.8, 1.2)
            velocity = random.uniform(0.3, 1.5)
        else:
            ax, ay, az = 0.0, 0.0, 1.0
            velocity = 0.0
        
        return {
            "device_id": device_id,
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "battery": {
                "percentage": random.randint(75, 100),
                "voltage_v": round(random.uniform(4.0, 4.2), 2),
                "charging": False
            },
            "imu": {
                "ax": round(ax, 3),
                "ay": round(ay, 3),
                "az": round(az, 3),
                "gx": 0.0,
                "gy": 0.0,
                "gz": 0.0
            },
            "motion": {
                "distance_m": 0.0,
                "velocity_ms": round(velocity, 2),
                "accel_ms2": round(abs(az - 1.0) * 9.81, 2),
                "state": "fall" if is_fall else motion_state
            },
            "rssi": [
                {
                    "node": node_id,
                    "rssi": -45 + random.randint(-10, 5),
                    "mac": f"00:11:22:33:44:{room_idx:02d}"
                }
            ],
            "polar_hr": vitals if vitals.get("heart_rate_bpm") else None
        }
    
    async def _publish_vitals(self, patient_state: PatientState, room_idx: int, 
                              is_fall: bool = False):
        """Publish vital signs for a patient."""
        if not self.config.get("enable_vitals", True):
            return
        
        if is_fall:
            vitals = self.vital_sim.generate_fall_vitals(patient_state)
        else:
            vitals = self.vital_sim.generate_for_patient(patient_state)
        
        # Determine motion state
        motion_state = "idle"
        if patient_state.current_room_idx != room_idx:
            motion_state = "moving"
        
        payload = self.generate_payload(
            patient_state.device_id,
            patient_state,
            vitals,
            room_idx,
            motion_state,
            is_fall
        )
        
        self.mqtt_client.publish("WheelSense/data", json.dumps(payload))
        
        # Get patient name
        patient = next((p for p in self.patients if p.id == patient_state.patient_id), None)
        patient_name = f"{patient.first_name} {patient.last_name}" if patient else "Unknown"
        
        room = self.rooms[room_idx]
        hr = vitals.get("heart_rate_bpm", "N/A")
        spo2 = vitals.get("spo2", "N/A")
        
        self.logger.info(
            f"[VITALS] {patient_name} ({patient_state.care_level}) | "
            f"Room: {room.name} | HR: {hr} | SpO2: {spo2}"
        )
        
        return vitals
    
    async def _check_and_generate_alerts(self, session, patient_state: PatientState, 
                                          vitals: dict, room_idx: int):
        """Check vitals and generate alerts if needed."""
        if not self.config.get("enable_alerts", True):
            return []
        
        alerts = self.alert_sim.check_vitals_for_alerts(patient_state, vitals)
        
        for alert_config in alerts:
            # Create alert in database
            alert = Alert(
                workspace_id=self.workspace.id,
                patient_id=patient_state.patient_id,
                device_id=patient_state.device_id,
                timestamp=datetime.now(timezone.utc),
                alert_type=alert_config["alert_type"],
                severity=alert_config["severity"],
                title=alert_config["title"],
                description=alert_config["description"],
                data={"simulated": True, "vitals": vitals, "source": "simulation"},
                status="active"
            )
            session.add(alert)
            
            self.logger.warning(
                f"[ALERT] {alert_config['severity'].upper()}: {alert_config['title']}"
            )
            
            # Publish alert to MQTT
            alert_payload = {
                "patient_id": patient_state.patient_id,
                "device_id": patient_state.device_id,
                "alert_type": alert_config["alert_type"],
                "severity": alert_config["severity"],
                "title": alert_config["title"],
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            self.mqtt_client.publish(
                f"WheelSense/alerts/{patient_state.patient_id}",
                json.dumps(alert_payload)
            )
        
        if alerts:
            await session.commit()
        
        return alerts
    
    async def _log_room_transition(self, session, patient_state: PatientState, 
                                    old_room_idx: int, new_room_idx: int):
        """Log room transition to activity timeline."""
        old_room = self.rooms[old_room_idx]
        new_room = self.rooms[new_room_idx]
        
        patient = next((p for p in self.patients if p.id == patient_state.patient_id), None)
        patient_name = f"{patient.first_name} {patient.last_name}" if patient else "Unknown"
        
        # Room exit event
        exit_event = ActivityTimeline(
            workspace_id=self.workspace.id,
            patient_id=patient_state.patient_id,
            timestamp=datetime.now(timezone.utc),
            event_type="room_exit",
            room_id=old_room.id if old_room else None,
            room_name=old_room.name if old_room else "",
            description=f"Left {old_room.name if old_room else 'unknown'}",
            data={"simulated": True, "destination": new_room.name if new_room else ""},
            source="auto"
        )
        session.add(exit_event)
        
        # Room enter event
        enter_event = ActivityTimeline(
            workspace_id=self.workspace.id,
            patient_id=patient_state.patient_id,
            timestamp=datetime.now(timezone.utc) + timedelta(seconds=1),
            event_type="room_enter",
            room_id=new_room.id if new_room else None,
            room_name=new_room.name if new_room else "",
            description=f"Entered {new_room.name if new_room else 'unknown'}",
            data={"simulated": True, "source_room": old_room.name if old_room else ""},
            source="auto"
        )
        session.add(enter_event)
        
        await session.commit()
        
        self.logger.info(
            f"[MOVEMENT] {patient_name} moved from "
            f"'{old_room.name if old_room else 'unknown'}' to '{new_room.name if new_room else 'unknown'}'"
        )
    
    async def _simulation_cycle(self):
        """Run one simulation cycle for all patients."""
        async with AsyncSessionLocal() as session:
            for patient_state in self.patient_states.values():
                # Check for control signals
                control_status = self._check_control_files()
                if control_status == SimulationStatus.EMERGENCY_STOP:
                    self.logger.critical("EMERGENCY STOP detected - halting simulation")
                    self.status = SimulationStatus.EMERGENCY_STOP
                    return False
                if control_status == SimulationStatus.PAUSED:
                    self.logger.info("Simulation paused via control file")
                    await asyncio.sleep(5)
                    continue
                
                # Simulate movement
                old_room_idx = patient_state.current_room_idx
                new_room_idx, did_move = self.room_sim.simulate_movement(patient_state)
                
                if did_move and self.config.get("enable_movement", True):
                    await self._log_room_transition(session, patient_state, 
                                                    old_room_idx, new_room_idx)
                
                # Generate and publish vitals
                vitals = await self._publish_vitals(patient_state, new_room_idx)
                
                # Check for alerts
                await self._check_and_generate_alerts(session, patient_state, 
                                                     vitals, new_room_idx)
                
                await asyncio.sleep(0.1)  # Small delay between patients
            
            return True
    
    async def _routine_cycle(self):
        """Run routine simulation cycle (caregiver tasks, handovers)."""
        async with AsyncSessionLocal() as session:
            # Simulate caregiver task completion
            task_results = await self.routine_sim.simulate_caregiver_tasks(
                session, self.workspace.id
            )
            
            if task_results["tasks_completed"] > 0:
                self.logger.info(
                    f"[ROUTINE] Completed {task_results['tasks_completed']} tasks, "
                    f"{task_results['schedules_completed']} schedules"
                )
            
            # Generate handover notes
            handover_count = await self.routine_sim.generate_handover_notes(
                session, self.workspace.id, self.patients, self.caregivers
            )
            
            if handover_count > 0:
                self.logger.info(f"[ROUTINE] Generated {handover_count} handover notes")
    
    async def run_routine(self):
        """Run the main simulation loop."""
        self.logger.info("=" * 60)
        self.logger.info("Starting WheelSense Routine Simulation")
        self.logger.info("=" * 60)
        self.logger.info(f"Patients: {len(self.patient_states)}")
        self.logger.info(f"Rooms: {len(self.rooms)}")
        self.logger.info(f"Update interval: {self.config.get('vital_update_interval', 30)}s")
        self.logger.info("Press Ctrl+C to stop, create .sim_pause to pause, .sim_stop to emergency stop")
        self.logger.info("=" * 60)
        
        self.status = SimulationStatus.RUNNING
        self._remove_control_files()
        
        vital_interval = self.config.get("vital_update_interval", 30)
        routine_interval = self.config.get("routine_check_interval", 300)
        
        last_vital_time = datetime.now(timezone.utc)
        last_routine_time = datetime.now(timezone.utc)
        
        try:
            while self.status == SimulationStatus.RUNNING:
                now = datetime.now(timezone.utc)
                
                # Check for control files
                control_status = self._check_control_files()
                if control_status == SimulationStatus.EMERGENCY_STOP:
                    self.logger.critical("EMERGENCY STOP triggered via control file")
                    break
                if control_status == SimulationStatus.PAUSED:
                    self.logger.info("Simulation paused (checking again in 5s)...")
                    await asyncio.sleep(5)
                    continue
                
                # Vital simulation cycle
                if (now - last_vital_time).seconds >= vital_interval:
                    success = await self._simulation_cycle()
                    if not success:
                        break
                    last_vital_time = now
                
                # Routine simulation cycle
                if (now - last_routine_time).seconds >= routine_interval:
                    await self._routine_cycle()
                    last_routine_time = now
                
                await asyncio.sleep(1)
                
        except asyncio.CancelledError:
            self.logger.info("Simulation cancelled")
        except KeyboardInterrupt:
            self.logger.info("Keyboard interrupt received")
        finally:
            self.status = SimulationStatus.STOPPED
            self.logger.info("Simulation stopped")
    
    async def trigger_event(self, event_type: str = "fall", patient_id: int | None = None):
        """Trigger a specific crisis event."""
        self.logger.warning(f"\n{'=' * 40}")
        self.logger.warning(f"INJECTING CRISIS EVENT: {event_type.upper()}")
        self.logger.warning(f"{'=' * 40}\n")
        
        # Select patient
        if patient_id and patient_id in self.patient_states:
            target_state = self.patient_states[patient_id]
        else:
            # Pick random patient, prefer critical
            critical_patients = [
                s for s in self.patient_states.values() 
                if s.care_level == "critical"
            ]
            if critical_patients and random.random() < 0.7:
                target_state = random.choice(critical_patients)
            else:
                target_state = random.choice(list(self.patient_states.values()))
        
        patient = next((p for p in self.patients if p.id == target_state.patient_id), None)
        patient_name = f"{patient.first_name} {patient.last_name}" if patient else "Unknown"
        room = self.rooms[target_state.current_room_idx]
        
        self.logger.warning(f"Target: {patient_name} ({target_state.care_level})")
        self.logger.warning(f"Location: {room.name}")
        self.logger.warning(f"Device: {target_state.device_id}")
        
        if event_type == "fall":
            # Generate fall vitals
            vitals = self.vital_sim.generate_fall_vitals(target_state)
            payload = self.generate_payload(
                target_state.device_id,
                target_state,
                vitals,
                target_state.current_room_idx,
                is_fall=True
            )
            self.mqtt_client.publish("WheelSense/data", json.dumps(payload))
            
            self.logger.critical(f"[FALL EVENT] Fall detected for {patient_name}!")
            
            # Create alert
            async with AsyncSessionLocal() as session:
                alert = Alert(
                    workspace_id=self.workspace.id,
                    patient_id=target_state.patient_id,
                    device_id=target_state.device_id,
                    timestamp=datetime.now(timezone.utc),
                    alert_type="fall",
                    severity="critical",
                    title=f"FALL DETECTED: {patient_name}",
                    description=f"Simulated fall event for {patient_name} in {room.name}",
                    data={"simulated": True, "event_type": "fall", "vitals": vitals},
                    status="active"
                )
                session.add(alert)
                await session.commit()
            
            # Recovery payload after 2 seconds
            await asyncio.sleep(2)
            normal_vitals = self.vital_sim.generate_for_patient(target_state)
            recovery_payload = self.generate_payload(
                target_state.device_id,
                target_state,
                normal_vitals,
                target_state.current_room_idx,
                motion_state="idle"
            )
            self.mqtt_client.publish("WheelSense/data", json.dumps(recovery_payload))
            self.logger.info("[FALL EVENT] Recovery telemetry sent")
            
        elif event_type == "abnormal_hr":
            # Generate high HR vitals
            vitals = {
                "heart_rate_bpm": random.randint(120, 150),
                "rr_interval_ms": random.randint(400, 500),
                "spo2": random.randint(90, 95),
                "skin_temperature": round(random.uniform(37.5, 38.5), 1),
                "sensor_battery": random.randint(50, 100),
            }
            payload = self.generate_payload(
                target_state.device_id,
                target_state,
                vitals,
                target_state.current_room_idx
            )
            self.mqtt_client.publish("WheelSense/data", json.dumps(payload))
            
            self.logger.critical(f"[HR EVENT] Abnormal HR: {vitals['heart_rate_bpm']} BPM for {patient_name}!")
            
            # Create alert
            async with AsyncSessionLocal() as session:
                alert = Alert(
                    workspace_id=self.workspace.id,
                    patient_id=target_state.patient_id,
                    device_id=target_state.device_id,
                    timestamp=datetime.now(timezone.utc),
                    alert_type="abnormal_hr",
                    severity="critical",
                    title=f"High Heart Rate: {vitals['heart_rate_bpm']} BPM",
                    description=f"Simulated abnormal HR event for {patient_name}",
                    data={"simulated": True, "event_type": "abnormal_hr", "vitals": vitals},
                    status="active"
                )
                session.add(alert)
                await session.commit()
        
        self.logger.info(f"\n{'=' * 40}")
        self.logger.info("Event injection complete")
        self.logger.info(f"{'=' * 40}\n")
    
    def cleanup(self):
        """Clean up resources."""
        if self.mqtt_client:
            self.mqtt_client.loop_stop()
            self.mqtt_client.disconnect()
            self.logger.info("MQTT disconnected")
        self.status = SimulationStatus.STOPPED


# =============================================================================
# Interactive Menu
# =============================================================================

def _configure_console_utf8() -> None:
    """Avoid UnicodeEncodeError on Windows when printing Thai room/patient names."""
    out = getattr(sys.stdout, "reconfigure", None)
    if callable(out):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass


async def interactive_menu(engine: SimulationEngine):
    """Run interactive simulation menu."""
    print("\n" + "=" * 50)
    print(" WheelSense Enhanced Nursing Home Simulator")
    print("=" * 50)
    print(f"Workspace: {engine.workspace.name}")
    print(f"Patients: {len(engine.patient_states)}")
    print(f"Rooms: {len(engine.rooms)}")
    print(f"Caregivers: {len(engine.caregivers)}")
    print("=" * 50)
    
    while True:
        print("\nOptions:")
        print("  1. Start Routine Simulation (Vitals + Movement + Alerts)")
        print("  2. Inject Fall Event")
        print("  3. Inject Abnormal HR Event")
        print("  4. Pause/Resume Simulation")
        print("  5. Stop Routine Simulation")
        print("  6. Show Patient Status")
        print("  Q. Quit")
        
        choice = input("\nSim Menu > ").strip().lower()
        
        if choice == 'q':
            if engine.loop_task and not engine.loop_task.done():
                engine.loop_task.cancel()
                try:
                    await engine.loop_task
                except asyncio.CancelledError:
                    pass
            break
            
        elif choice == '1':
            if engine.loop_task and not engine.loop_task.done():
                print("[!] Simulation already running")
            else:
                engine.loop_task = asyncio.create_task(engine.run_routine())
                print("[OK] Routine simulation started")
                
        elif choice == '2':
            await engine.trigger_event("fall")
            
        elif choice == '3':
            await engine.trigger_event("abnormal_hr")
            
        elif choice == '4':
            pause_file = Path(".sim_pause")
            if pause_file.exists():
                pause_file.unlink()
                print("[OK] Simulation resumed")
            else:
                pause_file.touch()
                print("[OK] Simulation paused (create .sim_pause file)")
                
        elif choice == '5':
            if engine.loop_task and not engine.loop_task.done():
                engine.loop_task.cancel()
                try:
                    await engine.loop_task
                except asyncio.CancelledError:
                    pass
                print("[OK] Simulation stopped")
            else:
                print("[!] Simulation not running")
                
        elif choice == '6':
            print("\nPatient Status:")
            print("-" * 60)
            for patient in engine.patients[:5]:  # Show first 5
                state = engine.patient_states.get(patient.id)
                if state:
                    room = engine.rooms[state.current_room_idx]
                    print(f"  {patient.first_name} {patient.last_name} ({patient.care_level})")
                    print(f"    Room: {room.name} | HR: {state.last_heart_rate} | SpO2: {state.last_spo2}")
            print("-" * 60)
            
        else:
            print("[!] Invalid choice")


# =============================================================================
# Main Entry Point
# =============================================================================

def load_config(config_path: str | None) -> dict:
    """Load simulation configuration from file or use defaults."""
    config = SIMULATION_CONFIG.copy()
    
    if config_path and Path(config_path).exists():
        with open(config_path) as f:
            user_config = json.load(f)
            config.update(user_config)
        print(f"[OK] Loaded config from {config_path}")
    
    return config


async def main():
    _configure_console_utf8()
    
    parser = argparse.ArgumentParser(
        description="WheelSense Enhanced Nursing Home Simulator"
    )
    parser.add_argument(
        "--routine", 
        action="store_true", 
        help="Start routine immediately in headless mode"
    )
    parser.add_argument(
        "--event", 
        type=str, 
        choices=["fall", "abnormal_hr"],
        help="Inject crisis event type"
    )
    parser.add_argument(
        "--patient-id", 
        type=int, 
        default=None,
        help="Target specific patient ID for event"
    )
    parser.add_argument(
        "--workspace-id",
        type=int,
        default=None,
        help="Workspace ID to simulate (overrides SIM_WORKSPACE_ID and default resolution when set)",
    )
    parser.add_argument(
        "--config", 
        type=str, 
        default=None,
        help="Path to custom simulation config JSON file"
    )
    parser.add_argument(
        "--stop",
        action="store_true",
        help="Emergency stop any running simulation"
    )
    parser.add_argument(
        "--pause",
        action="store_true",
        help="Toggle pause state"
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Show simulation status"
    )
    
    args = parser.parse_args()
    
    # Handle control commands
    if args.stop:
        Path(".sim_stop").touch()
        print("[OK] Emergency stop triggered")
        return
    
    if args.pause:
        pause_file = Path(".sim_pause")
        if pause_file.exists():
            pause_file.unlink()
            print("[OK] Simulation resumed")
        else:
            pause_file.touch()
            print("[OK] Simulation paused")
        return
    
    if args.status:
        stop_exists = Path(".sim_stop").exists()
        pause_exists = Path(".sim_pause").exists()
        print(f"Emergency stop file: {'present' if stop_exists else 'not present'}")
        print(f"Pause file: {'present' if pause_exists else 'not present'}")
        return
    
    # Load configuration
    config = load_config(args.config)

    workspace_id: int | None = args.workspace_id
    if workspace_id is None:
        raw_ws = (os.environ.get("SIM_WORKSPACE_ID") or "").strip()
        if raw_ws.isdigit():
            workspace_id = int(raw_ws)

    # Initialize engine
    engine = SimulationEngine(config)
    await engine.initialize_data(workspace_id)
    engine.connect_mqtt()
    
    try:
        if args.routine:
            await engine.run_routine()
        elif args.event:
            await engine.trigger_event(args.event, args.patient_id)
        else:
            await interactive_menu(engine)
    except KeyboardInterrupt:
        print("\nExiting gracefully...")
    finally:
        engine.cleanup()


if __name__ == "__main__":
    asyncio.run(main())
