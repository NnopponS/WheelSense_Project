---
title: cf-tunnel-publish needs Cloudflare edge reachable; LAN preset is the no-internet fallback
author: Chanaps
date: 2026-10-26
branch: wheelsense-InnoServe
id: l-696281e7
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
- server/docker/cf-tunnel-publish/run.py now passes `--protocol http2` to cloudflared so quick tunnels can work on networks that block UDP 7844 (QUIC). If http2 edge dials also fail, the network itself is blocking Cloudflare edge IPs — no code fix exists.
- For demos without working tunnel egress, configure the app with "Local dev preset": portal http://<LAN-IP>:3000 + MQTT mqtt://<LAN-IP>:1883 (mosquitto maps 1883 to host). Requires phone on same WiFi and Windows Firewall inbound allow for 1883/3000.

## Tried and ruled out
- Diagnosing a dead tunnel: `docker logs wheelsense-platform-cf-tunnel-publish-1 | grep -E "Registered|ERR"`. "Failed to dial a quic connection ... timeout" = UDP 7844 blocked (fix: --protocol http2). "TLS handshake with edge error: EOF" on every edge IP = TCP/TLS to Cloudflare edge also blocked (fix: change network / disable VPN, then docker restart the container).
- A published trycloudflare URL that never gets "Registered tunnel connection" lines will resolve in DNS but serve nothing — the app shows "Connection unavailable".

## Watch out
- The fall-detection data path (phone -> broker.emqx.io -> server secondary broker listener in mqtt_handler.py `_run_broker_listener`) works WITHOUT the tunnel; only the app's portal/webview/API features need it.
- Quick tunnel URLs rotate on every cf-tunnel-publish restart and are pushed to retained WheelSense/config/all on BOTH mosquitto and broker.emqx.io — the app picks up the new URL automatically, or paste it into Settings -> Portal base URL.
- run.py lives in the built image: `docker cp server/docker/cf-tunnel-publish/run.py wheelsense-platform-cf-tunnel-publish-1:/app/run.py && docker restart <container>` to deploy edits.
