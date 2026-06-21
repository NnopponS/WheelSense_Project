#!/usr/bin/env python3
"""Run cloudflared quick tunnel and publish the trycloudflare URL to MQTT (WheelSense/config/all)."""

from __future__ import annotations

import asyncio
import json
import os
import re
import signal
import sys

import aiomqtt

TUNNEL_TARGET_URL = os.environ.get("TUNNEL_TARGET_URL", "http://localhost:3000").strip()
TUNNEL_PROTOCOL = os.environ.get("TUNNEL_PROTOCOL", "http2").strip() or "http2"
TUNNEL_EDGE_IP_VERSION = os.environ.get("TUNNEL_EDGE_IP_VERSION", "4").strip() or "4"
TUNNEL_RESTART_AFTER_EDGE_LOSS_SECONDS = int(os.environ.get("TUNNEL_RESTART_AFTER_EDGE_LOSS_SECONDS", "14"))
TUNNEL_RESTART_BACKOFF_SECONDS = int(os.environ.get("TUNNEL_RESTART_BACKOFF_SECONDS", "6"))
MQTT_BROKER = os.environ.get("MQTT_BROKER", "localhost").strip()
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
MQTT_USER = os.environ.get("MQTT_USER", "").strip() or None
MQTT_PASSWORD = os.environ.get("MQTT_PASSWORD", "").strip() or None

# cloudflared logs lines like: https://something-random.trycloudflare.com
URL_RE = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com/?")
REGISTERED_RE = re.compile(r"Registered tunnel connection", re.IGNORECASE)
EDGE_LOST_RE = re.compile(
    r"(Lost connection with the edge|connection with edge closed|Unable to establish connection with Cloudflare edge|"
    r"DialContext error|edge discovery|failed to request quick Tunnel|Could not lookup srv records)",
    re.IGNORECASE,
)


def _mqtt_connect_kwargs() -> dict:
    kwargs: dict = {
        "hostname": MQTT_BROKER,
        "port": MQTT_PORT,
        "username": MQTT_USER,
        "password": MQTT_PASSWORD,
    }
    return kwargs


async def publish_portal_url(url: str) -> None:
    payload = {
        "portal_base_url": url.rstrip("/"),
        "source": "cloudflare_tunnel",
        "tunnel_protocol": TUNNEL_PROTOCOL,
    }
    async with aiomqtt.Client(**_mqtt_connect_kwargs()) as client:
        body = json.dumps(payload).encode("utf-8")
        for topic in ("WheelSense/config/all", "wheelsense/config/all"):
            await client.publish(topic, body, qos=1, retain=True)
    print(f"[cf-tunnel-publish] Published portal_base_url to MQTT: {payload['portal_base_url']}", flush=True)


async def publish_portal_url_with_retry(url: str) -> None:
    for attempt in range(1, 9):
        try:
            await publish_portal_url(url)
            return
        except Exception as exc:
            print(
                f"[cf-tunnel-publish] MQTT publish failed attempt {attempt}/8: {exc}",
                flush=True,
            )
            await asyncio.sleep(min(20, 2 * attempt))
    raise RuntimeError(f"Unable to publish portal_base_url after retries: {url}")


async def _drain_stream(stream: asyncio.StreamReader, label: str, on_line) -> None:
    while True:
        line = await stream.readline()
        if not line:
            break
        text = line.decode(errors="replace").rstrip()
        if text:
            print(f"[cloudflared {label}] {text}", flush=True)
        await on_line(text)


async def _terminate_process(proc: asyncio.subprocess.Process) -> None:
    if proc.returncode is not None:
        return
    proc.terminate()
    try:
        await asyncio.wait_for(proc.wait(), timeout=8)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()


async def run_cloudflared_once() -> int:
    print(
        f"[cf-tunnel-publish] Starting cloudflared -> {TUNNEL_TARGET_URL}, MQTT {MQTT_BROKER}:{MQTT_PORT}",
        flush=True,
    )

    proc = await asyncio.create_subprocess_exec(
        "/usr/local/bin/cloudflared",
        "tunnel",
        "--no-autoupdate",
        "--protocol",
        TUNNEL_PROTOCOL,
        "--edge-ip-version",
        TUNNEL_EDGE_IP_VERSION,
        "--url",
        TUNNEL_TARGET_URL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    published_url: str | None = None
    edge_restart_task: asyncio.Task[None] | None = None

    async def try_publish_from_line(line: str) -> None:
        nonlocal edge_restart_task, published_url
        if REGISTERED_RE.search(line):
            if edge_restart_task and not edge_restart_task.done():
                edge_restart_task.cancel()
                edge_restart_task = None
            return

        if EDGE_LOST_RE.search(line) and proc.returncode is None:
            if edge_restart_task is None or edge_restart_task.done():
                print(
                    "[cf-tunnel-publish] Edge connection degraded; scheduling quick-tunnel refresh",
                    flush=True,
                )

                async def restart_after_edge_loss() -> None:
                    await asyncio.sleep(TUNNEL_RESTART_AFTER_EDGE_LOSS_SECONDS)
                    if proc.returncode is None:
                        print(
                            "[cf-tunnel-publish] Refreshing quick tunnel after edge loss",
                            flush=True,
                        )
                        await _terminate_process(proc)

                edge_restart_task = asyncio.create_task(restart_after_edge_loss())

        m = URL_RE.search(line)
        if not m:
            return
        url = m.group(0).rstrip("/")
        if published_url == url:
            return
        try:
            await publish_portal_url_with_retry(url)
            published_url = url
        except Exception as exc:
            print(f"[cf-tunnel-publish] MQTT publish failed for {url}: {exc}", flush=True)

    async def runner() -> None:
        assert proc.stdout and proc.stderr
        await asyncio.gather(
            _drain_stream(proc.stdout, "stdout", try_publish_from_line),
            _drain_stream(proc.stderr, "stderr", try_publish_from_line),
        )

    run_task = asyncio.create_task(runner())
    code = await proc.wait()
    run_task.cancel()
    if edge_restart_task and not edge_restart_task.done():
        edge_restart_task.cancel()
    try:
        await run_task
    except asyncio.CancelledError:
        pass

    if code != 0:
        print(f"[cf-tunnel-publish] cloudflared exited with code {code}", file=sys.stderr, flush=True)
        return int(code)
    return 0


async def main() -> int:
    stop = asyncio.Event()

    def request_stop() -> None:
        stop.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, request_stop)
        except NotImplementedError:
            pass

    while not stop.is_set():
        await run_cloudflared_once()
        if not stop.is_set():
            await asyncio.sleep(TUNNEL_RESTART_BACKOFF_SECONDS)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
