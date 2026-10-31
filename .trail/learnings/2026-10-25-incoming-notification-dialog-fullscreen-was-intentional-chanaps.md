---
title: "Incoming notification dialog: fullscreen was intentional CSS, now a 32rem popup"
author: Chanaps
date: 2026-10-25
branch: wheelsense-InnoServe
id: l-e323caaf
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

IncomingNotificationDialog rendered fullscreen only because incoming-notification.module.css .screen set inset:0/100dvh — DialogContent already centers by default. Now .popup (32rem max) with severity top-band + patient profile card. resolvePatientAlertContext (hooks/useNotifications.tsx) is the single place that fetches the patient for alert popups; it now returns photoUrl/initials/age/gender/bloodType/mobilityType so the card renders without a second fetch. wheelsense-platform-web is a standalone Next build (node server.js): component changes require  + recreate — docker cp of .tsx does nothing.
