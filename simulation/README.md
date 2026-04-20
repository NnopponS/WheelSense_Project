# WheelSense Simulator

This directory contains the simulator components for WheelSense, including the Godot-based EaseAI_NursingHome game for realistic nursing home simulation.

## Structure

- `game/` - Godot 4.6 project (EaseAI_NursingHome) for 2D top-down nursing home simulation
  - Characters: Emika, Krit, Rattana, Wichai (patients), and 2 nurses
  - Rooms: Room401-404
  - WebSocket client for real-time sync with WheelSense backend

## Game Integration

The game connects to WheelSense backend via WebSocket at `/api/sim/game/ws` to:
- Sync character locations with patient/caregiver positions
- Trigger events (falls, room entry/exit)
- Receive sensor mode changes from dashboard

## HTML5 Export

To export the game for web embedding:
1. Open the project in Godot 4.6
2. Project → Export → Add Preset → Web (Runnable)
3. Export to `frontend/public/game/` for integrated serving

## Docker Compose

The simulation stack is started via:
```bash
docker compose -f docker-compose.sim.yml up -d
```

This includes:
- Backend with simulator mode enabled
- Godot game (when exported as HTML5)
- Mock data services

## API Endpoints

- `GET /api/sim/game/config` - Game configuration (character/room mappings)
- `GET /api/sim/game/state` - Current simulation state
- `POST /api/sim/game/sensor-mode` - Change character sensor mode
- `WS /api/sim/game/ws` - WebSocket hub for game↔dashboard communication
