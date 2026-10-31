---
title: App pulls portal URL from retained MQTT config — stale tunnel URL silently overwrites manual entry
author: Chanaps
date: 2026-10-28
branch: wheelsense-InnoServe
id: l-4db668ee
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
Phone gateway portal URL comes from retained MQTT config, not manual entry. When the app's Settings > Portal base URL shows a wrong/dead URL even after typing the right one, the retained WheelSense/config/all + WheelSense/config/{deviceId} messages on both brokers (local mosquitto AND broker.emqx.io) are overwriting it on every connect — fix by republishing corrected retained payloads with mosquitto_pub inside the mosquitto container, not by editing the app.

## Tried and ruled out
Typing http://<LAN-IP>:3000 + mqtt://<LAN-IP>:1883 in the app: broker connects but portal gets overwritten by retained config; and LAN inbound to the PC is blocked by Windows Firewall Public profile anyway (confirmed: mosquitto/web logs never show a 192.168.x.x client).

## Watch out
- cf-tunnel-publish only publishes the quick-tunnel URL ONCE at startup; the retained message goes stale when the tunnel dies or the URL rotates. Check current value: docker exec wheelsense-platform-mosquitto-1 mosquitto_sub -t WheelSense/config/all -C 1 -W 3
- Cloudflare edge TLS failures (TLS handshake with edge error: EOF) were caused by the previous office network, NOT the phone hotspot — tunnel revives by itself when the network changes; verify with curl https://<url>.trycloudflare.com/api/health
- Working combo on hotspot: MQTT=broker.emqx.io:1883 (internet path, backend subscribes emqx as SECONDARY_MQTT_BROKER), portal=tunnel URL auto-pulled. Zero firewall changes needed.
- Windows Firewall Public profile blocks inbound 1883/3000; rule needs admin elevation.
