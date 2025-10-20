#!/usr/bin/env python3
"""
Quick MQTT subscriber for WheelSense gateway testing.

Default target: broker.emqx.io:1883 topic WheelSense/data
"""

import argparse
import json
import signal
import sys
import threading
import time
from typing import Optional

import paho.mqtt.client as mqtt


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Subscribe to an MQTT topic and print incoming payloads."
    )
    parser.add_argument(
        "--host",
        default="broker.emqx.io",
        help="MQTT broker hostname (default: broker.emqx.io)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=1883,
        help="MQTT broker TCP port (default: 1883)",
    )
    parser.add_argument(
        "--topic",
        default="WheelSense/data",
        help="Topic to subscribe (default: WheelSense/data)",
    )
    parser.add_argument(
        "--client-id",
        default="CodexWheelSenseCheck",
        help="MQTT client ID (default: CodexWheelSenseCheck)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=None,
        help="Optional timeout in seconds. If set, exit when no message arrives before timeout.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Pretty print payload when it is valid JSON.",
    )
    return parser.parse_args()


class Subscriber:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.client = mqtt.Client(client_id=args.client_id)
        self.got_message = threading.Event()
        self.last_message_ts: Optional[float] = None

        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message

    def _on_connect(self, client, userdata, flags, rc):  # pylint: disable=unused-argument
        print(f"[mqtt] connect rc={rc}")
        if rc == 0:
            client.subscribe(self.args.topic)
            print(f"[mqtt] subscribed to {self.args.topic}")

    def _on_disconnect(self, client, userdata, rc):  # pylint: disable=unused-argument
        print(f"[mqtt] disconnected rc={rc}")

    def _on_message(self, client, userdata, msg):  # pylint: disable=unused-argument
        self.last_message_ts = time.time()
        self.got_message.set()
        payload: object
        decoded = msg.payload.decode("utf-8", errors="replace")
        if self.args.json:
            try:
                payload = json.loads(decoded)
            except json.JSONDecodeError:
                payload = decoded
        else:
            payload = decoded
        print(f"[mqtt] {msg.topic} -> {payload}")

    def run(self) -> int:
        try:
            self.client.connect(self.args.host, self.args.port, keepalive=60)
        except OSError as exc:
            print(f"[mqtt] failed to connect: {exc}", file=sys.stderr)
            return 1

        self.client.loop_start()

        try:
            if self.args.timeout is None:
                # Wait until interrupted (Ctrl+C).
                signal.signal(signal.SIGINT, self._handle_signal)
                signal.signal(signal.SIGTERM, self._handle_signal)
                while True:
                    time.sleep(1)
            else:
                start = time.time()
                while time.time() - start < self.args.timeout:
                    if self.got_message.wait(timeout=0.25):
                        self.got_message.clear()
                    time.sleep(0.1)
        except KeyboardInterrupt:
            print("\n[mqtt] interrupted by user")
        finally:
            self.client.loop_stop()
            self.client.disconnect()

        if self.args.timeout is not None and self.last_message_ts is None:
            print(f"[mqtt] no messages received within {self.args.timeout} seconds")
            return 2
        return 0

    @staticmethod
    def _handle_signal(signum, frame):  # pylint: disable=unused-argument
        raise KeyboardInterrupt


def main() -> int:
    args = parse_args()
    subscriber = Subscriber(args)
    return subscriber.run()


if __name__ == "__main__":
    sys.exit(main())

