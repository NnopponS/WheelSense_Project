"""
RSSI Data Collector - Streamlit App

Tabs:
  Tab 1 - Data Collection : MQTT connection, recording, per-action results
  Tab 2 - Experiment Manager: Browse, load, export, delete experiments

Run:
    streamlit run data_collector.py
"""

import os
import io
import json
import time
import queue
from datetime import datetime
from pathlib import Path
from collections import defaultdict

import streamlit as st
import plotly.graph_objects as go
import pandas as pd

import config
import experiment_store as store


# ===============================================
# Page Config
# ===============================================
st.set_page_config(
    page_title="RSSI Data Collector",
    page_icon="📡",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ===============================================
# Custom CSS
# ===============================================
st.markdown("""
<style>
    .metric-card {
        background: linear-gradient(135deg, #f8fafc, #f1f5f9);
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 1rem;
        text-align: center;
        margin-bottom: 0.5rem;
    }
    .metric-value { font-size: 1.5rem; font-weight: 700; color: #0f172a; }
    .metric-label { font-size: 0.85rem; color: #64748b; margin-top: 4px; }
    .exp-card {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 1rem 1.2rem;
        margin-bottom: 0.75rem;
    }
    .badge-online {
        color: #059669; background: #d1fae5;
        padding: 3px 10px; border-radius: 999px; font-size: 0.82rem; font-weight: 600;
    }
    .badge-offline {
        color: #dc2626; background: #fee2e2;
        padding: 3px 10px; border-radius: 999px; font-size: 0.82rem; font-weight: 600;
    }
    .badge-recording {
        color: #dc2626; font-weight: 700; font-size: 0.9rem;
    }
    .rec-dot {
        display: inline-block; width: 10px; height: 10px;
        background: #dc2626; border-radius: 50%; margin-right: 6px;
        animation: blink 1s infinite;
    }
    @keyframes blink { 0%,100% {opacity:1;} 50% {opacity:0.3;} }
</style>
""", unsafe_allow_html=True)


# ===============================================
# Session State
# ===============================================
def init_state():
    defaults = {
        "mqtt_connected": False,
        "mqtt_host": "192.168.137.1",
        "mqtt_port": 1883,
        "active_exp_id": None,
        "active_exp_meta": None,
        "is_recording": False,
        "current_action_id": None,
        "current_action_label": "",
        "live_buffer": [],
        "live_history": {sid: [] for sid in config.EXPECTED_STATIONS},
        "live_times": [],
        "live_sample_count": 0,
        "ema_alpha": 0.15,
        "is_paused": False,
        "auto_pause_seconds": 0,
        "total_active_time": 0.0,
        "recording_start_time": 0.0,
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v


init_state()


# ===============================================
# MQTT
# ===============================================
@st.cache_resource
def get_mqtt_store(host, port):
    import paho.mqtt.client as mqtt

    data_store = {
        "q": queue.Queue(),
        "client": None,
        "connected": False,
        # Running state: latest valid RSSI per station (persists across drain cycles)
        "station_last": {sid: {"rssi": None, "ts": 0} for sid in config.EXPECTED_STATIONS},
    }

    def on_connect(client, userdata, flags, rc, properties=None):
        if rc == 0:
            client.subscribe("wheelsense/rssi/#")
            data_store["connected"] = True

    def on_disconnect(client, userdata, disconnect_flags, reason_code=None, properties=None):
        data_store["connected"] = False
        try:
            client.reconnect()
        except Exception:
            pass

    def on_message(client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
            payload.setdefault("_rx_ts", time.time())
            data_store["q"].put(payload)
        except Exception:
            pass

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message
    client.reconnect_delay_set(min_delay=1, max_delay=10)

    try:
        client.connect(host, port, keepalive=60)
        client.loop_start()
        data_store["client"] = client
        data_store["connected"] = True
    except Exception:
        data_store["connected"] = False

    return data_store


def drain_mqtt_queue(mqtt_store):
    """Drain the MQTT queue and update the running station_last state.

    Returns ONE row per drain cycle using the latest known RSSI per station.
    Heartbeat packets (rssi == null / None) are ignored.
    """
    while not mqtt_store["q"].empty():
        try:
            pkt = mqtt_store["q"].get_nowait()
        except queue.Empty:
            break

        sid = pkt.get("station_id")
        if not sid or sid not in config.EXPECTED_STATIONS:
            continue

        rx_ts = pkt.get("_rx_ts", time.time())

        rssi = pkt.get("rssi")
        if rssi is None:
            samples = pkt.get("samples")
            if isinstance(samples, list) and samples:
                rssi = samples[-1].get("rssi")

        if rssi is None:
            continue

        mqtt_store["station_last"][sid] = {"rssi": int(rssi), "ts": rx_ts}

    row = {"timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
    has_value = False
    for sid in config.EXPECTED_STATIONS:
        info = mqtt_store["station_last"][sid]
        age = time.time() - info["ts"]
        if info["rssi"] is not None and age < 5.0:
            row[f"{sid}_RSSI"] = info["rssi"]
            has_value = True
        else:
            row[f"{sid}_RSSI"] = ""

    return [row] if has_value else []


# ===============================================
# Helper: plot RSSI graph for a dataframe
# ===============================================
COLORS = {"S1": "#3b82f6", "S2": "#f59e0b", "S3": "#10b981", "S4": "#a855f7"}


def plot_rssi(df, title, filtered=False, ema_alpha=0.15, key_suffix=""):
    # Ensure dataframe is resampled to 200ms correctly
    df_plot = df.copy()
    has_ts = "timestamp" in df_plot.columns
    if has_ts:
        try:
            df_plot["timestamp"] = pd.to_datetime(df_plot["timestamp"], errors="coerce")
            df_plot = df_plot.dropna(subset=["timestamp"]).set_index("timestamp")
            # Keep only numeric columns for resample, without ffill
            numeric_cols = [c for c in df_plot.columns if c.endswith("_RSSI")]
            if len(df_plot) > 0:
                df_plot = df_plot[numeric_cols].resample("200ms").mean().reset_index()
            else:
                has_ts = False
        except Exception:
            has_ts = False
            df_plot = df.copy()

    fig = go.Figure()
    x_data = df_plot["timestamp"] if has_ts else list(range(len(df_plot)))

    for sid in config.EXPECTED_STATIONS:
        col_name = f"{sid}_RSSI"
        if col_name not in df_plot.columns:
            continue
        vals = pd.to_numeric(df_plot[col_name], errors="coerce")

        if filtered:
            ema_vals = []
            ema = None
            for v in vals:
                if pd.notna(v):
                    ema = v if ema is None else ema_alpha * v + (1 - ema_alpha) * ema
                    ema_vals.append(ema)
                else:
                    ema_vals.append(None)
            y_data = ema_vals
            mode = "lines"
            width = 2.5
        else:
            y_data = vals
            mode = "lines+markers"
            width = 1

        fig.add_trace(go.Scatter(
            x=x_data,
            y=y_data,
            mode=mode,
            name=sid,
            line=dict(color=COLORS.get(sid, "#888"), width=width),
            marker=dict(size=3) if not filtered else None,
            opacity=0.8 if not filtered else 1.0,
            connectgaps=False,
        ))
    fig.update_layout(
        title=title,
        yaxis_title="RSSI (dBm)", xaxis_title="Timestamp" if has_ts else "Sample #",
        yaxis_range=[-100, -20], height=350,
        template="plotly_white",
        legend=dict(orientation="h", y=1.12),
        margin=dict(t=50, b=40, l=50, r=20),
    )
    st.plotly_chart(fig, width="stretch", key=f"chart_{key_suffix}")


# ===============================================
# Sidebar
# ===============================================
with st.sidebar:
    st.markdown("## RSSI Data Collector")
    st.caption("Experiment-based data collection")
    st.divider()

    if st.session_state.active_exp_id:
        meta = st.session_state.active_exp_meta
        st.success(f"**{meta['name']}**")
        st.caption(f"ID: {meta['experiment_id']}")
        st.caption(f"Actions: {len(meta['actions'])}")
        st.caption(f"Samples: {meta['total_samples']}")
    else:
        st.info("No experiment loaded")

    st.divider()

    if st.session_state.mqtt_connected:
        st.markdown('<span class="badge-online">MQTT Connected</span>', unsafe_allow_html=True)
    else:
        st.markdown('<span class="badge-offline">MQTT Disconnected</span>', unsafe_allow_html=True)

    if st.session_state.is_recording:
        if st.session_state.is_paused:
            st.markdown('<span class="rec-dot" style="background:#f59e0b"></span><span class="badge-recording" style="color:#f59e0b">Paused</span>', unsafe_allow_html=True)
        else:
            st.markdown('<span class="rec-dot"></span><span class="badge-recording">Recording...</span>', unsafe_allow_html=True)

    st.divider()
    st.caption(f"Stations: {', '.join(config.EXPECTED_STATIONS)}")
    exp_list = store.list_experiments()
    st.caption(f"Total experiments: {len(exp_list)}")


# ===============================================
# Tab Layout
# ===============================================
tab1, tab2 = st.tabs([
    "Data Collection",
    "Experiment Manager",
])


# ===============================================
# TAB 1: Data Collection
# ===============================================
with tab1:
    st.header("Data Collection")

    # -- MQTT Connection --
    col_conn, col_exp = st.columns([1, 1])

    with col_conn:
        st.subheader("MQTT Connection")
        c1, c2 = st.columns([2, 1])
        with c1:
            mqtt_host = st.text_input("Broker Host", value=st.session_state.mqtt_host, key="input_host")
        with c2:
            mqtt_port = st.number_input("Port", value=st.session_state.mqtt_port, min_value=1, max_value=65535, key="input_port")

        btn_col1, btn_col2 = st.columns(2)
        with btn_col1:
            if st.button("Test Connection", type="primary", width="stretch"):
                try:
                    import paho.mqtt.client as mqtt
                    test = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
                    test.connect(mqtt_host, int(mqtt_port), 5)
                    test.disconnect()
                    st.session_state.mqtt_connected = True
                    st.session_state.mqtt_host = mqtt_host
                    st.session_state.mqtt_port = int(mqtt_port)
                    # Start persistent MQTT connection
                    get_mqtt_store(mqtt_host, int(mqtt_port))
                    st.success("Connected!")
                except Exception as e:
                    st.session_state.mqtt_connected = False
                    st.error(f"Failed: {e}")

        with btn_col2:
            if st.button("Start Mosquitto", width="stretch"):
                import subprocess, shutil
                project_dir = Path(__file__).resolve().parent.parent
                mq_exe = "mosquitto"
                if os.name == "nt" and not shutil.which("mosquitto"):
                    mq_path = Path(r"C:\Program Files\mosquitto\mosquitto.exe")
                    if mq_path.exists():
                        mq_exe = str(mq_path)
                try:
                    subprocess.Popen(
                        [mq_exe, "-v", "-c", "mosquitto.conf"],
                        cwd=str(project_dir),
                        creationflags=subprocess.CREATE_NEW_CONSOLE if os.name == "nt" else 0,
                    )
                    st.success("Mosquitto starting...")
                except Exception as e:
                    st.error(f"Failed: {e}")

    with col_exp:
        st.subheader("Experiment")
        exp_mode = st.radio("Mode", ["Create New", "Load Existing"], horizontal=True, key="exp_mode")

        if exp_mode == "Create New":
            next_trial = len(store.list_experiments()) + 1
            default_name = f"Trial {next_trial}"
            trial_name = st.text_input("Experiment Name", value=default_name, key="new_exp_name_input_cli")
            
            if st.button("Create Experiment", type="primary", width="stretch"):
                if not trial_name.strip():
                    trial_name = default_name
                meta = store.create_experiment(trial_name.strip(), "")
                st.session_state.active_exp_id = meta["experiment_id"]
                st.session_state.active_exp_meta = meta
                st.success(f"Created: {trial_name.strip()}")
                st.rerun()
        else:
            experiments = store.list_experiments()
            if experiments:
                exp_options = {f"{e['experiment_id']} - {e['name']}": e["experiment_id"] for e in experiments}
                selected = st.selectbox("Select Experiment", list(exp_options.keys()))
                if st.button("Load", type="primary", use_container_width=True):
                    eid = exp_options[selected]
                    meta = store.load_experiment(eid)
                    st.session_state.active_exp_id = eid
                    st.session_state.active_exp_meta = meta
                    st.success(f"Loaded: {eid}")
                    st.rerun()

                if st.button("Archive Experiment", type="secondary", use_container_width=True):
                    eid = exp_options[selected]
                    store.archive_experiment(eid)
                    if st.session_state.active_exp_id == eid:
                        st.session_state.active_exp_id = None
                        st.session_state.active_exp_meta = None
                    st.success(f"Archived: {eid}")
                    st.rerun()
            else:
                st.info("No experiments yet. Create one first.")

    st.divider()

    # -- Need experiment to continue --
    if not st.session_state.active_exp_id:
        st.warning("Create or load an experiment to start collecting data.")
        st.stop()

    # ==============================
    # ACTION RECORDING SECTION
    # ==============================
    st.subheader("Action Recording")

    col_action, col_controls = st.columns([2, 1])

    with col_action:
        action_label = st.text_input(
            "Action Label",
            value=st.session_state.current_action_label,
            placeholder="e.g. standing, walking, sitting",
            key="action_label_input",
        )
        auto_pause_val = st.number_input(
            "Auto-pause Timer (seconds)",
            min_value=0,
            value=st.session_state.auto_pause_seconds,
            help="Set to 0 to disable auto-pause",
            key="auto_pause_selector_cli"
        )
        st.session_state.auto_pause_seconds = auto_pause_val

    with col_controls:
        st.markdown("<br>", unsafe_allow_html=True)
        if not st.session_state.is_recording:
            if st.button("Start Recording", type="primary", width="stretch",
                         disabled=not st.session_state.mqtt_connected):
                if not action_label.strip():
                    st.error("Enter action label first")
                else:
                    action_info = store.start_action(st.session_state.active_exp_id, action_label.strip())
                    st.session_state.is_recording = True
                    st.session_state.current_action_id = action_info["id"]
                    st.session_state.current_action_label = action_label.strip()
                    st.session_state.live_buffer = []
                    st.session_state.live_history = {sid: [] for sid in config.EXPECTED_STATIONS}
                    st.session_state.live_times = []
                    st.session_state.live_sample_count = 0
                    st.session_state.is_paused = False
                    # auto_pause_seconds already updated via number_input
                    st.session_state.total_active_time = 0.0
                    st.session_state.recording_start_time = time.time()
                    st.rerun()
        else:
            btn_col1, btn_col2 = st.columns(2)
            with btn_col1:
                # Pause / Resume Button
                if st.session_state.is_paused:
                    if st.button("▶ Resume", type="primary", use_container_width=True):
                        st.session_state.is_paused = False
                        st.session_state.recording_start_time = time.time()
                        st.rerun()
                else:
                    if st.button("⏸ Pause", type="secondary", use_container_width=True):
                        st.session_state.is_paused = True
                        st.session_state.total_active_time += time.time() - st.session_state.recording_start_time
                        st.rerun()
            with btn_col2:
                if st.button("⏹ Stop", type="secondary", use_container_width=True):
                    # Save remaining buffer
                    if st.session_state.live_buffer:
                        store.append_samples(
                            st.session_state.active_exp_id,
                            st.session_state.current_action_id,
                            st.session_state.live_buffer,
                        )
                    store.stop_action(st.session_state.active_exp_id, st.session_state.current_action_id)
                    
                    # Auto-select the newly recorded action in the dropdown
                    new_action_str = f"Action {st.session_state.current_action_id}: {st.session_state.current_action_label}"
                    st.session_state["action_view_select"] = new_action_str
                    
                    st.session_state.is_recording = False
                    st.session_state.current_action_id = None
                    st.session_state.active_exp_meta = store.load_experiment(st.session_state.active_exp_id)
                    st.success(f"Action '{st.session_state.current_action_label}' saved!")
                    st.session_state.current_action_label = ""
                    st.rerun()

    # -- Recording in progress --
        if not st.session_state.is_paused and st.session_state.auto_pause_seconds > 0:
            current_active = st.session_state.total_active_time + (time.time() - st.session_state.recording_start_time)
            if current_active >= st.session_state.auto_pause_seconds:
                st.session_state.is_paused = True
                st.session_state.total_active_time = st.session_state.auto_pause_seconds
                st.rerun()

        mqtt_store = get_mqtt_store(st.session_state.mqtt_host, st.session_state.mqtt_port)

        # Drain and buffer
        new_rows = drain_mqtt_queue(mqtt_store)
        if new_rows:
            if not st.session_state.is_paused:
                st.session_state.live_buffer.extend(new_rows)

                # Update live history for graph
                for row in new_rows:
                    st.session_state.live_sample_count += 1
                    st.session_state.live_times.append(st.session_state.live_sample_count)
                    for sid in config.EXPECTED_STATIONS:
                        val = row.get(f"{sid}_RSSI", "")
                        st.session_state.live_history[sid].append(val if val != "" else None)

                # Trim history to last 60 points
                MAX_LIVE = 60
                if len(st.session_state.live_times) > MAX_LIVE:
                    st.session_state.live_times = st.session_state.live_times[-MAX_LIVE:]
                    for sid in config.EXPECTED_STATIONS:
                        st.session_state.live_history[sid] = st.session_state.live_history[sid][-MAX_LIVE:]

                # Auto-save every 10 rows
                if len(st.session_state.live_buffer) >= 10:
                    store.append_samples(
                        st.session_state.active_exp_id,
                        st.session_state.current_action_id,
                        st.session_state.live_buffer,
                    )
                    st.session_state.live_buffer = []
                    st.session_state.active_exp_meta = store.load_experiment(st.session_state.active_exp_id)

        # Recording status + sample count
        total_saved = st.session_state.active_exp_meta.get("total_samples", 0) if st.session_state.active_exp_meta else 0
        total_count = total_saved + len(st.session_state.live_buffer)
        
        status_text = "Paused" if st.session_state.is_paused else "Recording"
        dot_color = 'style="background:#f59e0b"' if st.session_state.is_paused else ""
        
        st.markdown(
            f'<span class="rec-dot" {dot_color}></span> **{status_text}** `{st.session_state.current_action_label}` '
            f'| Samples: **{total_count}**',
            unsafe_allow_html=True,
        )

        # Realtime RSSI values (big numbers)
        st.markdown("**Current RSSI**")
        val_cols = st.columns(len(config.EXPECTED_STATIONS))
        for i, sid in enumerate(config.EXPECTED_STATIONS):
            with val_cols[i]:
                info = mqtt_store["station_last"][sid]
                rssi = info["rssi"]
                ago = time.time() - info["ts"] if info["ts"] > 0 else 999
                if rssi is not None and ago < 3:
                    color = "#059669" if rssi > -70 else "#f59e0b" if rssi > -85 else "#dc2626"
                    st.markdown(f"""<div class="metric-card">
                        <div class="metric-value" style="color:{color};font-size:2rem">{rssi}</div>
                        <div class="metric-label">{sid} (dBm)</div>
                    </div>""", unsafe_allow_html=True)
                else:
                    st.markdown(f"""<div class="metric-card">
                        <div class="metric-value" style="color:#94a3b8;font-size:2rem">--</div>
                        <div class="metric-label">{sid}</div>
                    </div>""", unsafe_allow_html=True)

        # Realtime rolling graph
        if not st.session_state.is_paused:
            if st.session_state.live_times:
                fig_live = go.Figure()
                for sid in config.EXPECTED_STATIONS:
                    vals = st.session_state.live_history[sid]
                    fig_live.add_trace(go.Scatter(
                        x=st.session_state.live_times,
                        y=vals,
                        mode="lines+markers",
                        name=sid,
                        line=dict(color=COLORS.get(sid, "#888"), width=2),
                        marker=dict(size=4),
                        connectgaps=True,
                    ))
                fig_live.update_layout(
                    title="Realtime RSSI (last 60s)",
                    yaxis_title="RSSI (dBm)", xaxis_title="Sample #",
                    yaxis_range=[-100, -20], height=300,
                    template="plotly_white",
                    legend=dict(orientation="h", y=1.12),
                    margin=dict(t=50, b=40, l=50, r=20),
                )
                st.plotly_chart(fig_live, width="stretch", key="chart_live")
        else:
            st.info("⏸ Recording is paused. Realtime graph hidden to conserve resources and stabilize collection.")

        # Auto-rerun during recording (every 1s to match station rate)
        time.sleep(1.0)
        st.rerun()

    # ==============================
    # RECORDED DATA VIEW (per action)
    # ==============================
    st.divider()

    exp_meta = st.session_state.active_exp_meta
    actions = exp_meta.get("actions", []) if exp_meta else []

    if not actions:
        st.info("No recorded actions yet. Start recording above.")
    else:
        st.subheader("Recorded Actions")

        # EMA slider
        ema_alpha = st.slider("EMA Filter Alpha (lower = smoother)", 0.01, 0.5,
                              st.session_state.ema_alpha, 0.01, key="ema_slider")
        st.session_state.ema_alpha = ema_alpha

        # Actions summary with delete buttons
        action_summary = []
        for a in actions:
            action_summary.append({
                "#": a["id"],
                "Label": a["label"],
                "Samples": a.get("sample_count", 0),
                "Start": a.get("start_time", "?")[:19],
                "End": a.get("end_time", "?") if a.get("end_time") else "(recording)",
            })
        st.dataframe(pd.DataFrame(action_summary), width="stretch", hide_index=True)

        # Action selector (individual actions only)
        view_options = [f"Action {a['id']}: {a['label']}" for a in actions]
        selected_view = st.selectbox("View Data", view_options, key="action_view_select")

        action_idx = view_options.index(selected_view)
        action_id = actions[action_idx]["id"]
        df = store.load_action_data(st.session_state.active_exp_id, action_id)
        view_title = f"Action {action_id}: {actions[action_idx]['label']}"

        if df is not None and not df.empty:
            # Graphs
            col_raw, col_filt = st.columns(2)
            with col_raw:
                plot_rssi(df, f"Raw RSSI - {view_title}", filtered=False, key_suffix="raw_view")
            with col_filt:
                plot_rssi(df, f"Filtered RSSI (EMA a={ema_alpha}) - {view_title}",
                          filtered=True, ema_alpha=ema_alpha, key_suffix="filt_view")

            # Data table
            st.subheader(f"Data Table - {view_title}")
            st.dataframe(df, width="stretch", hide_index=True)
            st.caption(f"Total rows: {len(df)}")

            # Delete selected action
            if st.button(f"Delete {view_title}", type="secondary", key="del_selected_action"):
                store.delete_action(st.session_state.active_exp_id, action_id)
                st.session_state.active_exp_meta = store.load_experiment(st.session_state.active_exp_id)
                st.rerun()

            # Export
            st.divider()
            st.subheader("Export CSV")
            col_ex1, col_ex2 = st.columns(2)

            with col_ex1:
                if st.button("Raw CSV", width="stretch", key="export_raw"):
                    csv_path = store.export_csv(st.session_state.active_exp_id, filtered=False)
                    if csv_path and csv_path.exists():
                        with open(csv_path, "r", encoding="utf-8") as f:
                            st.download_button(
                                "Download Raw CSV", f.read(),
                                file_name=f"{st.session_state.active_exp_id}_raw.csv",
                                mime="text/csv", key="dl_raw_csv",
                            )

            with col_ex2:
                if st.button(f"Filtered CSV (EMA a={ema_alpha})", width="stretch", key="export_filt"):
                    csv_path = store.export_csv(st.session_state.active_exp_id,
                                                filtered=True, ema_alpha=ema_alpha)
                    if csv_path and csv_path.exists():
                        with open(csv_path, "r", encoding="utf-8") as f:
                            st.download_button(
                                "Download Filtered CSV", f.read(),
                                file_name=f"{st.session_state.active_exp_id}_filtered.csv",
                                mime="text/csv", key="dl_filt_csv",
                            )
        else:
            st.info(f"No data for {view_title}")

    # Not recording, not viewing live -> show connection reminder if not connected
    if not st.session_state.mqtt_connected and not actions:
        st.info("Connect to MQTT broker first, then start recording.")


# ===============================================
# TAB 2: Experiment Manager
# ===============================================
with tab2:
    st.header("Experiment Manager")

    experiments = store.list_experiments()

    if not experiments:
        st.info("No experiments yet. Go to Data Collection tab to create one.")
    else:
        total_samples = sum(e.get("total_samples", 0) for e in experiments)
        total_actions = sum(len(e.get("actions", [])) for e in experiments)

        mc1, mc2, mc3 = st.columns(3)
        with mc1:
            st.markdown(f"""<div class="metric-card">
                <div class="metric-value">{len(experiments)}</div>
                <div class="metric-label">Experiments</div>
            </div>""", unsafe_allow_html=True)
        with mc2:
            st.markdown(f"""<div class="metric-card">
                <div class="metric-value">{total_actions}</div>
                <div class="metric-label">Total Actions</div>
            </div>""", unsafe_allow_html=True)
        with mc3:
            st.markdown(f"""<div class="metric-card">
                <div class="metric-value">{total_samples:,}</div>
                <div class="metric-label">Total Samples</div>
            </div>""", unsafe_allow_html=True)

        st.divider()

        for exp in experiments:
            eid = exp["experiment_id"]
            is_active = eid == st.session_state.active_exp_id
            border = "border-left: 4px solid #0d9488;" if is_active else ""
            active_badge = " **(Active)**" if is_active else ""

            st.markdown(f"""<div class="exp-card" style="{border}">
                <div style="font-size:1.15rem;font-weight:700;color:#0f172a">
                    {exp['name']}{active_badge}
                </div>
                <div style="font-size:0.85rem;color:#64748b;margin-top:4px">
                    {eid} | Created: {exp.get('created_at', '?')[:16]} |
                    Actions: {len(exp.get('actions', []))} |
                    Samples: {exp.get('total_samples', 0):,}
                </div>
                <div style="font-size:0.85rem;color:#94a3b8;margin-top:4px;font-style:italic">
                    {exp.get('description', '')[:120]}
                </div>
            </div>""", unsafe_allow_html=True)

            if exp.get("actions"):
                with st.expander(f"Actions for {eid}", expanded=is_active):
                    action_data = []
                    for a in exp["actions"]:
                        action_data.append({
                            "#": a["id"],
                            "Label": a["label"],
                            "Samples": a.get("sample_count", 0),
                            "Start": a.get("start_time", "?")[:19],
                            "End": a.get("end_time", "?") if a.get("end_time") else "?",
                        })
                    st.dataframe(pd.DataFrame(action_data), width="stretch", hide_index=True)

                    df_all = store.load_all_data(eid)
                    if df_all is not None and not df_all.empty:
                        st.markdown("**Data Preview (first 20 rows):**")
                        st.dataframe(df_all.head(20), width="stretch", hide_index=True)

            col_b1, col_b2, col_b3, col_b4 = st.columns(4)
            with col_b1:
                if st.button("Load", key=f"load_{eid}", width="stretch"):
                    meta = store.load_experiment(eid)
                    st.session_state.active_exp_id = eid
                    st.session_state.active_exp_meta = meta
                    st.rerun()
            with col_b2:
                if st.button("Raw CSV", key=f"raw_{eid}", width="stretch"):
                    csv_path = store.export_csv(eid, filtered=False)
                    if csv_path and csv_path.exists():
                        with open(csv_path, "r", encoding="utf-8") as f:
                            st.download_button(
                                "Download", f.read(),
                                file_name=f"{eid}_raw.csv",
                                mime="text/csv", key=f"dl_raw_{eid}",
                            )
                    else:
                        st.warning("No data")
            with col_b3:
                if st.button("Filtered CSV", key=f"filt_{eid}", width="stretch"):
                    csv_path = store.export_csv(eid, filtered=True, ema_alpha=0.15)
                    if csv_path and csv_path.exists():
                        with open(csv_path, "r", encoding="utf-8") as f:
                            st.download_button(
                                "Download", f.read(),
                                file_name=f"{eid}_filtered.csv",
                                mime="text/csv", key=f"dl_filt_{eid}",
                            )
                    else:
                        st.warning("No data")
            with col_b4:
                if st.button("Delete", key=f"del_{eid}", width="stretch"):
                    store.delete_experiment(eid)
                    if st.session_state.active_exp_id == eid:
                        st.session_state.active_exp_id = None
                        st.session_state.active_exp_meta = None
                    st.rerun()
