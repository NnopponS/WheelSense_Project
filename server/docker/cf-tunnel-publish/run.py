#!/usr/bin/env python3
"""Run cloudflared quick tunnel and publish the trycloudflare URL to MQTT (WheelSense/config/all)."""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import uuid

import aiomqtt

TUNNEL_TARGET_URL = os.environ.get("TUNNEL_TARGET_URL", "http://localhost:3000").strip()
MQTT_BROKER = os.environ.get("MQTT_BROKER", "mosquitto").strip()
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
MQTT_USER = os.environ.get("MQTT_USER", "").strip() or None
MQTT_PASSWORD = os.environ.get("MQTT_PASSWORD", "").strip() or None
MQTT_TLS = os.environ.get("MQTT_TLS", "").strip().lower() in {"1", "true", "yes", "on"}
SECONDARY_MQTT_BROKER = os.environ.get("SECONDARY_MQTT_BROKER", "broker.emqx.io").strip()
SECONDARY_MQTT_PORT = int(os.environ.get("SECONDARY_MQTT_PORT", "1883"))

# cloudflared logs lines like: https://something-random.trycloudflare.com
URL_RE = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com/?")


def _mqtt_connect_kwargs(hostname: str | None = None, port: int | None = None) -> dict:
    kwargs: dict = {
        "hostname": hostname or MQTT_BROKER,
        "port": port or MQTT_PORT,
        "identifier": f"wheelsense-cf-{uuid.uuid4().hex[:12]}",
        "username": MQTT_USER if (hostname is None or hostname == MQTT_BROKER) else None,
        "password": MQTT_PASSWORD if (hostname is None or hostname == MQTT_BROKER) else None,
    }
    if MQTT_TLS and (hostname is None or hostname == MQTT_BROKER):
        import ssl

        kwargs["tls_params"] = aiomqtt.TLSParameters(
            ca_certs=None,
            cert_reqs=ssl.CERT_REQUIRED,
        )
    return kwargs


async def publish_portal_url(url: str) -> None:
    payload = {"portal_base_url": url.rstrip("/")}
    raw_bytes = json.dumps(payload).encode("utf-8")

    brokers: list[tuple[str, int]] = [(MQTT_BROKER, MQTT_PORT)]
    if SECONDARY_MQTT_BROKER and (SECONDARY_MQTT_BROKER, SECONDARY_MQTT_PORT) not in brokers:
        brokers.append((SECONDARY_MQTT_BROKER, SECONDARY_MQTT_PORT))

    published_any = False
    for host, port in brokers:
        try:
            async with aiomqtt.Client(**_mqtt_connect_kwargs(host, port)) as client:
                await client.publish(
                    "WheelSense/config/all",
                    raw_bytes,
                    qos=1,
                    retain=True,
                )
            published_any = True
            print(
                f"[cf-tunnel-publish] Published portal_base_url to MQTT ({host}:{port}): {payload['portal_base_url']}",
                flush=True,
            )
        except Exception as exc:
            print(
                f"[cf-tunnel-publish] Warning: MQTT publish to {host}:{port} failed: {exc}",
                flush=True,
            )
    if not published_any:
        raise RuntimeError("Failed to publish portal_base_url to any MQTT broker")


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
        "--protocol",
        "http2",
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
