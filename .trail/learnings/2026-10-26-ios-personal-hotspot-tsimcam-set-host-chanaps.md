---
title: "iOS Personal Hotspot + TsimCam: set HOST_IP=<laptop hotspot IP> in server/.env"
author: Chanaps
date: 2026-10-26
branch: wheelsense-InnoServe
id: l-4b5631d9
scope: repo
status: active
src: agent
touches:
  - CucumberRS-Controller/src/main.cpp
  - TsimCam-Controller/src/main.cpp
  - docker/backend/src/api/frontend_v2_compat.py
  - docker/backend/src/core/database_compat_property.py
  - docker/backend/src/core/database_property_append.py
  - docker/backend/src/core/mqtt_handler.py
  - docker/backend/src/core/websocket_handler.py
  - docker/backend/src/init_data.py
  - docker/backend/src/main.py
  - docker/backend/src/services/command_parser.py
---

## Decided
- On Docker Desktop (Windows), `get_host_ip()` in `server/app/hardware_bridge.py` can NEVER see the host LAN IP: `host.docker.internal` resolves to 192.168.65.x (filtered), `ip route`/socket probes return the container's own 172.x bridge IP (also filtered) -> falls back to 127.0.0.1. UDP discovery replies then announce `ip:127.0.0.1`, which the TsimCam firmware rejects (`!sIp.startsWith("127.")`) before falling back to `udp.remoteIP()`.
- Fix: create `server/.env` (gitignored) with `HOST_IP=<laptop's IP on the current network>` — compose wires `HOST_IP: ${HOST_IP:-}` -> `docker compose -f docker-compose.sim.yml up -d wheelsense-platform-server` recreates with it. iPhone hotspot gives the laptop `172.20.10.x` (phone = .1, /28). Verified replies then announce the real IP (`Host IP: 172.20.10.2`).
- When switching networks again, update `HOST_IP` — a stale value is still harmless because firmware verifies the announced IP by TCP-probing :8765, then falls back to `udp.remoteIP()`, gateway probe, and subnet scan.

## Watch out
- iPhone 12+ Personal Hotspot defaults to 5GHz; ESP32-CAM is 2.4GHz-only and cannot even see the SSID -> iPhone Settings > Personal Hotspot > "Maximize Compatibility" must be ON. SSID = phone name; apostrophes/emoji/Thai names are flaky on ESP32 — rename via General > About > Name to plain ASCII.
- Hotspot clients are NOT isolated on iOS, and the firmware's subnet scan covers /28 (camera typically lands .3-.14, laptop .2 — inside the ±8-neighbor and .2-.25 scans). Docker port proxies answer TCP on 172.20.10.2:{8765,1883,8000} on any network profile once inbound is allowed.
- Container sees the camera broadcast's source as the Docker gateway (e.g. 172.23.0.1) — replies still NAT back to the camera correctly; don't "fix" `addr[0]` handling.
