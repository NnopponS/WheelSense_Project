"""E84 room-node simulator — exercises the server-side room-node protocol
without the physical board.

Usage (from server/ inside the container, or with python -m):

    python scripts/e84_simulator.py register --node CAM_E84_0001
    python scripts/e84_simulator.py status   --node CAM_E84_0001
    python scripts/e84_simulator.py fall     --node CAM_E84_0001
    python scripts/e84_simulator.py ack      --node CAM_E84_0001 --alert-id 123
    python scripts/e84_simulator.py home     --node CAM_E84_0001 --device-id 1 --action turn_off
    python scripts/e84_simulator.py listen   --node CAM_E84_0001   # print inbound messages

The script publishes on the same topics the real firmware uses
(``WheelSense/camera/<node_id>/...``) and prints everything the server sends
back on ``assignment`` / ``control`` / ``ack`` so you can watch the whole
exchange in one terminal.

Broker defaults to env MQTT_BROKER / MQTT_PORT (mosquitto:1883 in compose);
override with --broker/--port. Requires `aiomqtt` (already a server dep).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import time
import uuid

import aiomqtt

TOPIC_ROOT = "WheelSense/camera"


def _topics(node: str) -> dict[str, str]:
    base = f"{TOPIC_ROOT}/{node}"
    return {
        "registration": f"{base}/registration",
        "status": f"{base}/status",
        "event": f"{base}/event",
        "assignment": f"{base}/assignment",
        "control": f"{base}/control",
        "ack": f"{base}/ack",
        "all": f"{base}/#",
    }


async def _subscribe_printer(client: aiomqtt.Client, node: str, stop: asyncio.Event) -> None:
    t = _topics(node)
    await client.subscribe(t["assignment"], qos=1)
    await client.subscribe(t["control"], qos=1)
    await client.subscribe(t["ack"], qos=1)
    try:
        async for message in client.messages:
            try:
                body = json.loads(message.payload)
                pretty = json.dumps(body)
            except Exception:
                pretty = message.payload.decode(errors="replace")
            print(f"  <- {message.topic} {pretty}", flush=True)
            if stop.is_set():
                break
    except asyncio.CancelledError:
        pass


async def run(args: argparse.Namespace) -> None:
    node = args.node
    t = _topics(node)
    broker = args.broker or os.getenv("MQTT_BROKER", "localhost")
    port = int(args.port or os.getenv("MQTT_PORT", "1883"))

    async with aiomqtt.Client(broker, port) as client:
        stop = asyncio.Event()
        printer = asyncio.create_task(_subscribe_printer(client, node, stop))
        await asyncio.sleep(0.4)  # let subscriptions land

        async def pub(topic: str, payload: dict, retain: bool = False) -> None:
            print(f"  -> {topic} {json.dumps(payload)}", flush=True)
            await client.publish(topic, json.dumps(payload), qos=1, retain=retain)

        seq = int(time.time()) % 10000
        if args.cmd == "listen":
            print(f"listening on {t['all']} — Ctrl+C to quit")
            try:
                await printer
            except (KeyboardInterrupt, asyncio.CancelledError):
                pass
            return

        if args.cmd in {"register", "all"}:
            await pub(
                t["registration"],
                {
                    "device_id": node,
                    "node_id": node,
                    "device_kind": "e84_room_node",
                    "role": "room_screen",
                    "firmware": "e84-sim",
                    "ip_address": args.ip or "192.168.1.84",
                },
                retain=True,
            )
            await asyncio.sleep(1.5)

        if args.cmd in {"status", "all"}:
            await pub(
                t["status"],
                {
                    "device_id": node,
                    "protocolVersion": 1,
                    "status": "online",
                    "device_kind": "e84_room_node",
                    "battery": {"percent": 100, "charging": True},
                    "edge_ai": {"model": "e84-sim", "ready": True},
                    "room": {"alert_active": False},
                },
            )
            await asyncio.sleep(0.8)

        if args.cmd in {"fall", "all"}:
            await pub(
                t["event"],
                {
                    "event_id": f"{node}-sim-{seq}",
                    "type": "fall_detected",
                    "source": "test",
                    "sitting_confidence_pct": args.confidence,
                },
            )
            await asyncio.sleep(1.5)

        if args.cmd == "ack":
            await pub(
                t["event"],
                {
                    "event_id": f"{node}-sim-{seq}-ack",
                    "type": "alert_ack",
                    "alert_id": args.alert_id,
                    "fall_event_id": args.fall_event_id or "",
                },
            )
            await asyncio.sleep(1.5)

        if args.cmd == "home":
            await pub(
                t["event"],
                {
                    "event_id": f"{node}-sim-{seq}-home",
                    "type": "home_command",
                    "smart_device_id": args.device_id,
                    "action": args.action,
                    "parameters": (
                        {"temperature": args.temperature}
                        if args.action == "set_temperature"
                        else {}
                    ),
                },
            )
            await asyncio.sleep(1.5)

        # drain inbound replies for a moment
        await asyncio.sleep(args.drain)
        stop.set()
        printer.cancel()
        try:
            await printer
        except asyncio.CancelledError:
            pass


def main() -> None:
    p = argparse.ArgumentParser(description="E84 room-node MQTT simulator")
    p.add_argument(
        "cmd",
        choices=["register", "status", "fall", "ack", "home", "listen", "all"],
        help="what to publish ('all' = register+status+fall sequence)",
    )
    p.add_argument("--node", default="CAM_E84_0001", help="E84 node/device id")
    p.add_argument("--broker", default=None)
    p.add_argument("--port", default=None)
    p.add_argument("--ip", default=None)
    p.add_argument("--alert-id", type=int, default=0)
    p.add_argument("--fall-event-id", default=None)
    p.add_argument("--device-id", type=int, default=1, help="SmartDevice.id for home")
    p.add_argument(
        "--action",
        default="toggle",
        choices=["turn_on", "turn_off", "toggle", "set_temperature"],
    )
    p.add_argument("--temperature", type=float, default=24.0)
    p.add_argument("--confidence", type=int, default=31)
    p.add_argument("--drain", type=float, default=2.0, help="seconds to read replies")
    args = p.parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
