# ADR-0005: Photo-Only Camera Mode with Internet-Independent Upload

**Date**: 2026-04-01
**Status**: accepted
**Deciders**: User, AI Assistant

## Context

T-SIMCam nodes have cameras for room monitoring. The user wants:
1. High-quality photo capture (not video streaming)
2. Photos must work over **any internet connection** — not restricted to the same LAN as the server
3. Node should be architecturally mapped to rooms/buildings

Currently, MQTT brokers like Mosquitto have a default 256MB message size limit, but large photos over public internet via MQTT can be unreliable. The user wants to use a public MQTT broker.

## Decision

We implement a **hybrid upload strategy**:

1. **Primary: MQTT with chunking** — For photos under ~500KB, use MQTT chunked transfer over the public broker. Split the JPEG into 32KB chunks with sequence numbers, reassemble on the server. Works reliably even on public MQTT brokers (HiveMQ, EMQX Cloud).

2. **Fallback: HTTP multipart upload** — For higher quality photos or when MQTT chunking fails, the node uploads directly to the server's `/api/cameras/{id}/upload` endpoint via HTTPS. This requires the server to be reachable from the internet (port forwarding, ngrok, or cloud deployment).

3. **Camera configuration** — Quality, resolution, flash, and capture interval are all configurable via MQTT control messages. Default: SXGA (1280×1024), JPEG quality 10.

4. **Node ↔ Room mapping** — Each T-SIMCam node registers with its `facility_id`, `floor_id`, and `room_id` during MQTT registration. When a new node comes online, it can be assigned to a room via the API.

## Alternatives Considered

### Alternative 1: HTTP-only upload (no MQTT for photos)
- **Pros**: Simple, standard, handles any file size
- **Cons**: Requires server to be publicly reachable. T-SIMCam needs to know server URL. More complex firewall setup.
- **Why not**: MQTT broker is already the communication backbone. Using HTTP adds a second protocol path that needs separate configuration.

### Alternative 2: Store photos on Node SPIFFS, fetch on demand
- **Pros**: No upload needed, server pulls when ready
- **Cons**: SPIFFS is tiny (~1MB usable on ESP32). Node must be on same network. Photos lost on power cycle.
- **Why not**: Storage too small, and requires same-network access which contradicts the "any internet" requirement.

### Alternative 3: Cloud storage (S3/GCS) upload from Node
- **Pros**: Infinite storage, CDN-backed, server side doesn't handle upload
- **Cons**: ESP32 HTTPS to cloud is slow and memory-intensive. Requires cloud credentials on embedded device.  
- **Why not**: Too complex for ESP32. May be a future enhancement for higher-end nodes.

## Consequences

### Positive
- Works over any internet connection via public MQTT broker
- MQTT chunking keeps the architecture unified (single protocol)
- HTTP fallback handles edge cases
- High-quality photos preserved (no MQTT size constraint via chunking)

### Negative
- MQTT chunking adds complexity (sequence numbers, reassembly, timeout handling)
- Two upload paths to maintain
- Public MQTT broker requires TLS configuration for security

### Risks
- **Chunk loss over unreliable connections**: Mitigation — timeout + retry mechanism. Server requests re-send of missing chunks.
- **Public MQTT security**: Mitigation — TLS encryption + MQTT username/password authentication.
