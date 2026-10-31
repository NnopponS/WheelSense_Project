---
title: "Hybrid WheelSense Stack: Full V2 Backend + Simulator + Cloudflare Tunnel MQTT + TsimCam (Robert Chen) & CucumberRS"
author: Chanaps
date: 2026-10-25
branch: wheelsense-InnoServe
id: l-1fde67dc
scope: repo
status: active
src: agent
touches:
  - server/app/main.py
  - server/sim_controller.py
  - server/docker/cf-tunnel-publish/run.py
  - docker/docker-compose.yml
---

Integrated server/ and mobile-app/ from origin/prototype/tesaIoT-hackathon with physical TsimCam (UDP 5555, WS 8765, camera-service YOLOv8 mapped to Robert Chen across Room 401/Room 402/Dining Room/Bathroom) and CucumberRS ESP32-S2 (WheelSense/{room}/control and state_sync). Configured dual-broker MQTT (mosquitto + broker.emqx.io) for cf-tunnel-publish and mobile gateway.
