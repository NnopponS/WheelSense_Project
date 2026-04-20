"""
RSSI Data Collector — Streamlit App (v3)

Tab 1  📡  MQTT Monitor    — connect, Start/Stop live RSSI view
Tab 2  🧪  Experiments     — create new or load existing, record actions, view/delete data

Run:
    streamlit run data_collector.py
"""

import json
import queue
import time
from datetime import datetime

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

import config
import experiment_store as store

# ═══════════════════════════════════════════════
# Page Config
# ═══════════════════════════════════════════════
st.set_page_config(
    page_title="RSSI Data Collector",
    page_icon="📡",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ═══════════════════════════════════════════════
# CSS
# ═══════════════════════════════════════════════
st.markdown("""
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  html, body, [class*="css"] { font-family: 'Inter', sans-serif; }

  .metric-card {
    background: linear-gradient(135deg, #f8fafc, #f1f5f9);
    border: 1px solid #e2e8f0; border-radius: 12px;
    padding: 1rem; text-align: center; margin-bottom: 0.5rem;
  }
  .metric-value { font-size: 1.8rem; font-weight: 700; color: #0f172a; }
  .metric-label { font-size: 0.82rem; color: #64748b; margin-top: 4px; }

  .rec-dot {
    display: inline-block; width: 10px; height: 10px;
    background: #dc2626; border-radius: 50%; margin-right: 6px;
    animation: blink 1s infinite;
  }
  @keyframes blink { 0%,100%{opacity:1;} 50%{opacity:0.3;} }

  .exp-pill {
    background:#eff6ff; color:#1d4ed8;
    padding: 3px 10px; border-radius: 999px;
    font-size: 0.8rem; font-weight: 600; margin-right: 6px;
  }
</style>
""", unsafe_allow_html=True)

# ═══════════════════════════════════════════════
# Session State
# ═══════════════════════════════════════════════
_DEFAULTS = {
    # MQTT
    "mqtt_host": config.MQTT_DEFAULT_HOST,
    "mqtt_port": config.MQTT_DEFAULT_PORT,
    "mqtt_connected": False,
    # Tab 1 live monitor
    "t1_running": False,
    "t1_live_hist": {s: [] for s in config.EXPECTED_STATIONS},
    "t1_live_times": [],
    "t1_sample_count": 0,
    # Experiments tab (unified)
    "exp_id": None,
    "exp_meta": None,
    "is_recording": False,
    "is_paused": False,
    "action_id": None,
    "action_label": "",
    "live_buffer": [],
    "live_history": {s: [] for s in config.EXPECTED_STATIONS},
    "live_times": [],
    "live_sample_count": 0,
    "auto_pause_seconds": 0,
    "recording_start_time": 0.0,
    "total_active_time": 0.0,
    "ema_alpha": 0.15,
}

for k, v in _DEFAULTS.items():
    if k not in st.session_state:
        st.session_state[k] = v

# ═══════════════════════════════════════════════
# MQTT helpers
# ═══════════════════════════════════════════════
@st.cache_resource
def get_mqtt_store(host, port):
    import paho.mqtt.client as mqtt

    ds = {
        "q": queue.Queue(),
        "client": None,
        "connected": False,
        "station_last": {s: {"rssi": None, "ts": 0} for s in config.EXPECTED_STATIONS},
        "msg_count": 0,
        "last_raw": "",
    }

    def on_connect(c, _u, _f, rc, _p=None):
        if rc == 0:
            c.subscribe("wheelsense/rssi/#")
            ds["connected"] = True

    def on_disconnect(c, _u, _df, _rc=None, _p=None):
        ds["connected"] = False
        try:
            c.reconnect()
        except Exception:
            pass

    def on_message(_c, _u, msg):
        try:
            ds["msg_count"] += 1
            raw = msg.payload.decode()
            ds["last_raw"] = raw[:200]
            payload = json.loads(raw)
            payload["_topic"] = msg.topic
            payload.setdefault("_rx_ts", time.time())
            ds["q"].put(payload)
        except Exception as e:
            ds["last_raw"] = f"ERROR: {e} | raw={msg.payload[:60]}"

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message
    client.reconnect_delay_set(min_delay=1, max_delay=10)
    try:
        client.connect(host, port, keepalive=30)
        client.loop_start()
    except Exception:
        pass
    ds["client"] = client
    return ds


def drain_mqtt_queue(mqtt_ds):
    """
    Drain the queue; group identical timestamps into one row.
    Supports two payload formats:
      A) Combined: {S1_RSSI: -70, S2_RSSI: -75, timestamp: ...}
      B) Per-topic: topic=wheelsense/rssi/S1, payload={rssi: -70, timestamp: ...}
    """
    rows_by_dt: dict = {}
    while not mqtt_ds["q"].empty():
        try:
            pkt = mqtt_ds["q"].get_nowait()
        except queue.Empty:
            break

        try:
            dt = pkt.get("timestamp") or datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
            if dt not in rows_by_dt:
                rows_by_dt[dt] = {"timestamp": dt}

            # Format A: combined payload
            found_any = False
            for sid in config.EXPECTED_STATIONS:
                rssi = pkt.get(f"{sid}_RSSI")
                if rssi is not None and rssi != "":
                    try:
                        rssi = int(float(rssi))
                        mqtt_ds["station_last"][sid] = {"rssi": rssi, "ts": time.time()}
                        rows_by_dt[dt][f"{sid}_RSSI"] = rssi
                        found_any = True
                    except (ValueError, TypeError):
                        pass

            # Format B: per-topic payload
            if not found_any:
                topic = pkt.get("_topic", "")
                rssi_val = pkt.get("rssi") or pkt.get("RSSI")
                if rssi_val is not None:
                    parts = topic.rstrip("/").split("/")
                    sid = parts[-1].upper() if parts else ""
                    if sid in config.EXPECTED_STATIONS:
                        try:
                            rssi_int = int(float(rssi_val))
                            mqtt_ds["station_last"][sid] = {"rssi": rssi_int, "ts": time.time()}
                            rows_by_dt[dt][f"{sid}_RSSI"] = rssi_int
                        except (ValueError, TypeError):
                            pass
        except Exception:
            # Skip malformed packet, continue draining
            continue

    return list(rows_by_dt.values())


# ═══════════════════════════════════════════════
# Plot helpers
# ═══════════════════════════════════════════════
COLORS = {"S1": "#3b82f6", "S2": "#f59e0b", "S3": "#10b981", "S4": "#a855f7"}


def plot_rssi(df: pd.DataFrame, title: str, filtered: bool = False,
              ema_alpha: float = 0.15, key_suffix: str = ""):
    """Plot RSSI dataframe with 200ms resampling and timestamp x-axis."""
    df_plot = df.copy()
    has_ts = "timestamp" in df_plot.columns
    if has_ts:
        try:
            df_plot["timestamp"] = pd.to_datetime(df_plot["timestamp"], errors="coerce")
            df_plot = df_plot.dropna(subset=["timestamp"]).set_index("timestamp")
            num_cols = [c for c in df_plot.columns if c.endswith("_RSSI")]
            if len(df_plot) > 50:
                df_plot = df_plot[num_cols].resample("200ms").mean().ffill().reset_index()
            elif len(df_plot) > 0:
                df_plot = df_plot[num_cols].reset_index()
            else:
                has_ts = False
        except Exception:
            has_ts = False
            df_plot = df.copy()

    fig = go.Figure()
    x_data = df_plot["timestamp"] if has_ts else list(range(len(df_plot)))

    for sid in config.EXPECTED_STATIONS:
        col = f"{sid}_RSSI"
        if col not in df_plot.columns:
            continue
        vals = pd.to_numeric(df_plot[col], errors="coerce")
        if filtered:
            ema_vals, ema = [], None
            for v in vals:
                if pd.notna(v):
                    ema = v if ema is None else ema_alpha * v + (1 - ema_alpha) * ema
                ema_vals.append(ema)  # carry forward through nulls
            y_data, mode, width = ema_vals, "lines", 2.5
        else:
            y_data, mode, width = vals, "lines+markers", 1.5

        fig.add_trace(go.Scatter(
            x=x_data, y=y_data, mode=mode, name=sid,
            line=dict(color=COLORS.get(sid, "#888"), width=width),
            marker=dict(size=3),
            connectgaps=True,
        ))

    fig.update_layout(
        title=title,
        yaxis_title="RSSI (dBm)",
        xaxis_title="Timestamp" if has_ts else "Sample #",
        yaxis_range=[-100, -20], height=300,
        template="plotly_white",
        legend=dict(orientation="h", y=1.12),
        margin=dict(t=50, b=40, l=50, r=20),
    )
    st.plotly_chart(fig, use_container_width=True, key=f"chart_{key_suffix}")


def render_rssi_cards(mqtt_ds, staleness=10):
    """Show 4 RSSI metric cards."""
    val_cols = st.columns(len(config.EXPECTED_STATIONS))
    for i, sid in enumerate(config.EXPECTED_STATIONS):
        with val_cols[i]:
            info = mqtt_ds["station_last"][sid]
            rssi = info["rssi"]
            ago  = time.time() - info["ts"] if info["ts"] > 0 else 999
            if rssi is not None and ago < staleness:
                color = "#059669" if rssi > -70 else "#f59e0b" if rssi > -85 else "#dc2626"
                ago_str = f"{ago:.1f}s"
                st.markdown(f"""<div class="metric-card">
                    <div class="metric-value" style="color:{color}">{rssi}</div>
                    <div class="metric-label">{sid} (dBm) · {ago_str}</div>
                </div>""", unsafe_allow_html=True)
            else:
                st.markdown(f"""<div class="metric-card">
                    <div class="metric-value" style="color:#94a3b8">--</div>
                    <div class="metric-label">{sid} · no data</div>
                </div>""", unsafe_allow_html=True)


# ═══════════════════════════════════════════════
# Recording helpers
# ═══════════════════════════════════════════════
def render_recording_controls(mqtt_ds):
    """Recording start/pause/resume/stop and live graph. Uses global exp_id state."""
    exp_id   = st.session_state.exp_id
    is_rec   = st.session_state.is_recording
    is_pause = st.session_state.is_paused
    connected = mqtt_ds["connected"]

    col_lbl, col_pause, col_btn = st.columns([3, 1, 1])
    with col_lbl:
        label_val = st.text_input(
            "Action Label",
            value=st.session_state.action_label,
            placeholder="e.g. standing, walking, sitting",
            key="exp_label_input",
            disabled=is_rec,
        )
    with col_pause:
        auto_ps = st.number_input(
            "Auto-pause (sec, 0=off)",
            min_value=0,
            value=st.session_state.auto_pause_seconds,
            key="exp_auto_ps",
        )
        st.session_state.auto_pause_seconds = auto_ps

    with col_btn:
        st.markdown("<div style='margin-top:1.6rem'>", unsafe_allow_html=True)
        if not is_rec:
            if st.button("▶ Start", type="primary", use_container_width=True,
                         disabled=not connected, key="exp_start_btn"):
                if not label_val.strip():
                    st.error("Enter action label first.")
                else:
                    action_info = store.start_action(exp_id, label_val.strip())
                    st.session_state.action_id   = action_info["id"]
                    st.session_state.action_label = label_val.strip()
                    st.session_state.live_buffer  = []
                    st.session_state.live_history = {s: [] for s in config.EXPECTED_STATIONS}
                    st.session_state.live_times   = []
                    st.session_state.live_sample_count = 0
                    st.session_state.is_recording = True
                    st.session_state.is_paused    = False
                    st.session_state.total_active_time    = 0.0
                    st.session_state.recording_start_time = time.time()
                    st.rerun()
        else:
            b1, b2, b3 = st.columns(3)
            with b1:
                if is_pause:
                    if st.button("▶", help="Resume", use_container_width=True, key="exp_resume"):
                        st.session_state.is_paused = False
                        st.session_state.total_active_time = 0.0  # reset so auto-pause restarts
                        st.session_state.recording_start_time = time.time()
                        st.rerun()
                else:
                    if st.button("⏸", help="Pause", use_container_width=True, key="exp_pause"):
                        st.session_state.is_paused = True
                        st.session_state.total_active_time += (
                            time.time() - st.session_state.recording_start_time
                        )
                        st.rerun()
            with b2:
                if st.button("⏹", help="Stop", use_container_width=True, key="exp_stop"):
                    buf = st.session_state.live_buffer
                    if buf:
                        store.append_samples(exp_id, st.session_state.action_id, buf)
                        st.session_state.live_buffer = []
                    store.stop_action(exp_id, st.session_state.action_id)
                    finished = st.session_state.action_label
                    st.session_state.is_recording = False
                    st.session_state.is_paused    = False
                    st.session_state.action_id    = None
                    st.session_state.action_label = ""
                    st.session_state.exp_meta = store.load_experiment(exp_id)
                    st.success(f"✅ Saved: **{finished}**")
                    st.rerun()
        st.markdown("</div>", unsafe_allow_html=True)

    # ── Recording active ──
    if is_rec:
        total = (st.session_state.exp_meta or {}).get("total_samples", 0) + \
                len(st.session_state.live_buffer)
        dot = '<span class="rec-dot"></span>' if not is_pause else \
              '<span class="rec-dot" style="background:#f59e0b;animation:none"></span>'
        status = "Paused" if is_pause else "Recording"
        # Elapsed time
        if is_pause:
            elapsed = st.session_state.total_active_time
        else:
            elapsed = st.session_state.total_active_time + (
                time.time() - st.session_state.recording_start_time
            )
        m, s = divmod(int(elapsed), 60)
        elapsed_str = f"{m}:{s:02d}"
        st.markdown(
            f"{dot} **{status}** `{st.session_state.action_label}` "
            f"| Samples: **{total}** | Elapsed: **{elapsed_str}**",
            unsafe_allow_html=True,
        )

        # Auto-pause check
        if not is_pause and auto_ps > 0:
            active = st.session_state.total_active_time + (
                time.time() - st.session_state.recording_start_time
            )
            if active >= auto_ps:
                st.session_state.is_paused = True
                st.session_state.total_active_time = active
                st.info(f"⏸ Auto-paused at {int(active)}s — press ▶ Resume to continue.")
                st.rerun()

        # Drain MQTT → buffer
        new_rows = drain_mqtt_queue(mqtt_ds)
        if new_rows and not is_pause:
            st.session_state.live_buffer.extend(new_rows)
            for row in new_rows:
                ts_str = row.get("timestamp") or datetime.now().strftime("%H:%M:%S.%f")[:-3]
                st.session_state.live_times.append(ts_str)
                for sid in config.EXPECTED_STATIONS:
                    st.session_state.live_history[sid].append(row.get(f"{sid}_RSSI"))
            MAX = 60
            if len(st.session_state.live_times) > MAX:
                st.session_state.live_times = st.session_state.live_times[-MAX:]
                for sid in config.EXPECTED_STATIONS:
                    st.session_state.live_history[sid] = \
                        st.session_state.live_history[sid][-MAX:]
            if len(st.session_state.live_buffer) >= 10:
                store.append_samples(exp_id, st.session_state.action_id,
                                     st.session_state.live_buffer)
                st.session_state.live_buffer = []
                st.session_state.exp_meta = store.load_experiment(exp_id)

        # Live RSSI cards
        render_rssi_cards(mqtt_ds)

        # Live graph
        if not is_pause and st.session_state.live_times:
            fig = go.Figure()
            for sid in config.EXPECTED_STATIONS:
                fig.add_trace(go.Scatter(
                    x=st.session_state.live_times,
                    y=st.session_state.live_history[sid],
                    mode="lines+markers", name=sid,
                    line=dict(color=COLORS.get(sid, "#888"), width=2),
                    marker=dict(size=4), connectgaps=True,
                ))
            fig.update_layout(
                title="Realtime RSSI (last 60 readings)",
                yaxis_title="RSSI (dBm)", xaxis_title="Timestamp",
                yaxis_range=[-100, -20], height=260,
                template="plotly_white",
                legend=dict(orientation="h", y=1.12),
                margin=dict(t=50, b=40, l=50, r=20),
            )
            st.plotly_chart(fig, use_container_width=True, key="exp_live_chart")
        elif is_pause:
            st.info("⏸ Paused — live graph hidden.")

        time.sleep(0.1)
        st.rerun()


def render_experiment_results():
    """Show recorded actions with graphs and delete buttons."""
    meta = st.session_state.exp_meta
    if not meta:
        return
    actions = meta.get("actions", [])
    if not actions:
        st.info("No recorded actions yet.")
        return

    st.markdown("### 📊 Recorded Actions")
    ema_alpha = st.slider("EMA Smoothing", 0.01, 0.5,
                          st.session_state.ema_alpha, 0.01, key="exp_ema")
    st.session_state.ema_alpha = ema_alpha

    for action in actions:
        with st.expander(
            f"Action {action['id']}: **{action['label']}** — {action.get('sample_count', 0)} samples",
            expanded=False,
        ):
            df = store.load_action_data(meta["experiment_id"], action["id"])
            if df is not None and not df.empty:
                c1, c2 = st.columns(2)
                with c1:
                    plot_rssi(df, "Raw RSSI", filtered=False,
                              key_suffix=f"raw_{action['id']}")
                with c2:
                    plot_rssi(df, f"EMA-filtered (α={ema_alpha})",
                              filtered=True, ema_alpha=ema_alpha,
                              key_suffix=f"filt_{action['id']}")
            else:
                st.warning("No data.")

            if st.button(f"🗑️ Delete Action {action['id']}", type="secondary",
                         key=f"del_act_{action['id']}"):
                store.delete_action(meta["experiment_id"], action["id"])
                st.session_state.exp_meta = store.load_experiment(meta["experiment_id"])
                st.rerun()


# ═══════════════════════════════════════════════
# TABS
# ═══════════════════════════════════════════════
tab1, tab2 = st.tabs(["📡 MQTT Monitor", "🧪 Experiments"])


# ───────────────────────────────────────────────
# TAB 1 — MQTT Monitor
# ───────────────────────────────────────────────
with tab1:
    st.header("📡 MQTT Monitor")
    st.caption("Monitor live RSSI signal — no data is recorded here.")

    # Connection row
    c_host, c_port, c_btn = st.columns([3, 1, 1])
    with c_host:
        host = st.text_input("MQTT Host", value=st.session_state.mqtt_host, key="t1_host",
                             label_visibility="collapsed")
    with c_port:
        port = st.number_input("Port", value=st.session_state.mqtt_port,
                               min_value=1, max_value=65535, key="t1_port",
                               label_visibility="collapsed")
    with c_btn:
        if st.button("🔌 Connect", type="secondary", use_container_width=True, key="t1_connect"):
            st.session_state.mqtt_host = host
            st.session_state.mqtt_port = port
            st.rerun()

    mqtt_ds = get_mqtt_store(st.session_state.mqtt_host, st.session_state.mqtt_port)
    connected = mqtt_ds["connected"]
    st.session_state.mqtt_connected = connected

    badge = ('<span style="color:#059669;font-weight:600">● Connected</span>'
             if connected else
             '<span style="color:#dc2626;font-weight:600">● Disconnected</span>')
    st.markdown(
        f"`{st.session_state.mqtt_host}:{st.session_state.mqtt_port}` {badge}  "
        f"| Messages received: **{mqtt_ds['msg_count']}**",
        unsafe_allow_html=True,
    )

    # Start / Stop toggle
    btn_col, _ = st.columns([1, 3])
    with btn_col:
        if not st.session_state.t1_running:
            if st.button("▶ Start Live View", type="primary",
                         use_container_width=True, key="t1_start"):
                st.session_state.t1_running = True
                st.rerun()
        else:
            if st.button("⏹ Stop Live View", type="secondary",
                         use_container_width=True, key="t1_stop"):
                st.session_state.t1_running = False
                st.rerun()

    if not connected:
        st.warning("Not connected. Check host/port and click Connect.")
    elif not st.session_state.t1_running:
        st.info("Click **▶ Start Live View** to begin monitoring.")
    else:
        drain_mqtt_queue(mqtt_ds)

        # Diagnostics
        with st.expander("🔍 Diagnostics", expanded=mqtt_ds["msg_count"] == 0):
            if mqtt_ds["last_raw"]:
                st.code(mqtt_ds["last_raw"], language="json")
            else:
                st.info("No messages yet. Check devices are publishing to `wheelsense/rssi/#`.")
            d_cols = st.columns(len(config.EXPECTED_STATIONS))
            for i, sid in enumerate(config.EXPECTED_STATIONS):
                with d_cols[i]:
                    info = mqtt_ds["station_last"][sid]
                    ago = time.time() - info["ts"] if info["ts"] > 0 else None
                    st.write(f"**{sid}:** {info['rssi']} | "
                             f"{'never' if ago is None else f'{ago:.1f}s ago'}")

        st.markdown("#### Current RSSI")
        render_rssi_cards(mqtt_ds)

        # Rolling graph
        has_any = any(
            mqtt_ds["station_last"][s]["rssi"] is not None and
            time.time() - mqtt_ds["station_last"][s]["ts"] < 10
            for s in config.EXPECTED_STATIONS
        )
        if has_any:
            now_str = datetime.now().strftime("%H:%M:%S")
            st.session_state.t1_live_times.append(now_str)
            for sid in config.EXPECTED_STATIONS:
                info = mqtt_ds["station_last"][sid]
                rssi = (info["rssi"]
                        if info["rssi"] is not None and time.time() - info["ts"] < 10
                        else None)
                st.session_state.t1_live_hist[sid].append(rssi)
            MAX = 100
            if len(st.session_state.t1_live_times) > MAX:
                st.session_state.t1_live_times = st.session_state.t1_live_times[-MAX:]
                for sid in config.EXPECTED_STATIONS:
                    st.session_state.t1_live_hist[sid] = \
                        st.session_state.t1_live_hist[sid][-MAX:]

        if st.session_state.t1_live_times:
            fig = go.Figure()
            for sid in config.EXPECTED_STATIONS:
                fig.add_trace(go.Scatter(
                    x=st.session_state.t1_live_times,
                    y=st.session_state.t1_live_hist[sid],
                    mode="lines+markers", name=sid,
                    line=dict(color=COLORS.get(sid, "#888"), width=2),
                    marker=dict(size=3), connectgaps=True,
                ))
            fig.update_layout(
                title="Live RSSI (last 100 readings)",
                yaxis_title="RSSI (dBm)", xaxis_title="Timestamp",
                yaxis_range=[-100, -20], height=340,
                template="plotly_white",
                legend=dict(orientation="h", y=1.12),
                margin=dict(t=50, b=40, l=50, r=20),
            )
            st.plotly_chart(fig, use_container_width=True, key="t1_live_chart")

        # Adaptive refresh: faster when data is arriving, slower when idle
        sleep_time = 0.5 if has_any else 1.0
        time.sleep(sleep_time)
        st.rerun()


# ───────────────────────────────────────────────
# TAB 2 — Experiments (unified create + load)
# ───────────────────────────────────────────────
with tab2:
    st.header("🧪 Experiments")

    mqtt_ds = get_mqtt_store(st.session_state.mqtt_host, st.session_state.mqtt_port)

    # ── Left: Experiment selector + create ──
    left, right = st.columns([1, 2])

    with left:
        st.subheader("Select Experiment")

        experiments = store.list_experiments()

        if experiments:
            options = {
                f"{e['experiment_id']} — {e['name']}": e["experiment_id"]
                for e in experiments
            }
            chosen_label = st.selectbox("Existing experiments", list(options.keys()),
                                        key="exp_select", label_visibility="collapsed")
            if st.button("📂 Load", use_container_width=True, key="exp_load_btn"):
                chosen_id = options[chosen_label]
                if st.session_state.exp_id != chosen_id:
                    # Reset recording state on load
                    st.session_state.is_recording = False
                    st.session_state.is_paused    = False
                    st.session_state.action_id    = None
                    st.session_state.action_label = ""
                    st.session_state.live_buffer  = []
                    st.session_state.live_history = {s: [] for s in config.EXPECTED_STATIONS}
                    st.session_state.live_times   = []
                    st.session_state.live_sample_count = 0
                st.session_state.exp_id   = chosen_id
                st.session_state.exp_meta = store.load_experiment(chosen_id)
                st.rerun()

        st.divider()

        with st.expander("➕ New Experiment", expanded=len(experiments) == 0):
            with st.form("new_exp_form", clear_on_submit=True):
                exp_name = st.text_input("Name", placeholder="e.g. Trial_2")
                exp_desc = st.text_area("Description", height=60)
                if st.form_submit_button("Create", type="primary"):
                    if not exp_name.strip():
                        st.error("Enter a name.")
                    else:
                        meta = store.create_experiment(exp_name.strip(), exp_desc.strip())
                        st.session_state.exp_id        = meta["experiment_id"]
                        st.session_state.exp_meta      = meta
                        st.session_state.is_recording  = False
                        st.session_state.is_paused     = False
                        st.session_state.action_id     = None
                        st.session_state.action_label  = ""
                        st.session_state.live_buffer   = []
                        st.session_state.live_history  = {s: [] for s in config.EXPECTED_STATIONS}
                        st.session_state.live_times    = []
                        st.rerun()

        # Delete experiment button with confirmation
        if st.session_state.exp_id:
            st.divider()
            confirm_del = st.checkbox("I want to delete this experiment", key="del_exp_chk")
            if confirm_del:
                if st.button("🗑️ Confirm Delete Experiment", type="secondary",
                             use_container_width=True, key="del_exp_btn"):
                    store.delete_experiment(st.session_state.exp_id)
                    st.session_state.exp_id       = None
                    st.session_state.exp_meta     = None
                    st.session_state.is_recording = False
                    st.success("Deleted.")
                    st.rerun()

    # ── Right: Active experiment ──
    with right:
        if st.session_state.exp_id is None:
            st.info("← Select or create an experiment to get started.")
        else:
            meta = st.session_state.exp_meta or store.load_experiment(st.session_state.exp_id)
            st.session_state.exp_meta = meta

            if not mqtt_ds["connected"]:
                st.warning("⚠️ Not connected to MQTT. Go to **MQTT Monitor** tab first.")

            st.markdown(
                f'<span class="exp-pill">{meta["experiment_id"]}</span> '
                f'**{meta["name"]}** — {meta.get("total_samples", 0)} samples',
                unsafe_allow_html=True,
            )

            st.subheader("📷 Record Action")
            render_recording_controls(mqtt_ds)

            st.divider()
            render_experiment_results()
