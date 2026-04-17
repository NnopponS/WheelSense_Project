#!/usr/bin/env python3
"""Run cloudflared quick tunnel and publish the trycloudflare URL to MQTT (WheelSense/config/all)."""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys

import aiomqtt

TUNNEL_TARGET_URL = os.environ.get("TUNNEL_TARGET_URL", "http://localhost:3000").strip()
MQTT_BROKER = os.environ.get("MQTT_BROKER", "localhost").strip()
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
MQTT_USER = os.environ.get("MQTT_USER", "").strip() or None
MQTT_PASSWORD = os.environ.get("MQTT_PASSWORD", "").strip() or None

# cloudflared logs lines like: https://something-random.trycloudflare.com
URL_RE = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com/?")


def _mqtt_connect_kwargs() -> dict:
    kwargs: dict = {
        "hostname": MQTT_BROKER,
        "port": MQTT_PORT,
        "username": MQTT_USER,
        "password": MQTT_PASSWORD,
    }
    return kwargs


async def publish_portal_url(url: str) -> None:
    payload = {"portal_base_url": url.rstrip("/")}
    async with aiomqtt.Client(**_mqtt_connect_kwargs()) as client:
        await client.publish(
            "WheelSense/config/all",
            json.dumps(payload).encode("utf-8"),
            qos=1,
            retain=True,
        )
    print(f"[cf-tunnel-publish] Published portal_base_url to MQTT: {payload['portal_base_url']}", flush=True)


async def _drain_stream(stream: asyncio.StreamReader, label: str, on_line) -> None:
    while True:
        line = await stream.readline()
        if not line:
            break
        text = line.decode(errors="replace").rstrip()
        if text:
            print(f"[cloudflared {label}] {text}", flush=True)
        await on_line(text)


async def main() -> int:
    print(
        f"[cf-tunnel-publish] Starting cloudflared -> {TUNNEL_TARGET_URL}, MQTT {MQTT_BROKER}:{MQTT_PORT}",
        flush=True,
    )

    proc = await asyncio.create_subprocess_exec(
        "/usr/local/bin/cloudflared",
        "tunnel",
        "--no-autoupdate",
        "--url",
        TUNNEL_TARGET_URL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    published_url: str | None = None

    async def try_publish_from_line(line: str) -> None:
        nonlocal published_url
        if published_url:
            return
        m = URL_RE.search(line)
        if not m:
            return
        url = m.group(0).rstrip("/")
        try:
            await publish_portal_url(url)
            published_url = url
        except Exception:
            print("[cf-tunnel-publish] MQTT publish failed (retry on next URL line)", flush=True)

    async def runner() -> None:
        assert proc.stdout and proc.stderr
        await asyncio.gather(
            _drain_stream(proc.stdout, "stdout", try_publish_from_line),
            _drain_stream(proc.stderr, "stderr", try_publish_from_line),
        )

    run_task = asyncio.create_task(runner())
    code = await proc.wait()
    run_task.cancel()
    try:
        await run_task
    except asyncio.CancelledError:
        pass

    if code != 0:
        print(f"[cf-tunnel-publish] cloudflared exited with code {code}", file=sys.stderr, flush=True)
        return int(code)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
