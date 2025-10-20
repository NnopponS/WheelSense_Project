import { computeStatus, statusText, motionText, directionText } from './utils.js';

const API_BASE = "/api";
const SSE_ENDPOINT = "/sensor-data/stream";
const POLL_INTERVAL_MS = 10000;

// --- DOM ELEMENTS ---
document.addEventListener("DOMContentLoaded", () => {
  const lastUpdatedSpan = document.getElementById("last-updated");

  // Table View Elements
  const dashboardBody = document.getElementById("dashboard-body");
  const totalCountSpan = document.getElementById("total-count");
  const onlineCountSpan = document.getElementById("online-count");
  const offlineCountSpan = document.getElementById("offline-count");
  const avgRssiSpan = document.getElementById("avg-rssi");
  const avgLatencySpan = document.getElementById("avg-latency");

  // Modal Elements
  const historyModal = document.getElementById("history-modal");
  const historyModalTitle = document.getElementById("history-modal-title");
  const closeModalButton = document.querySelector(".close-button");
  const historyChartCanvas = document.getElementById("history-chart");
  let historyChart = null;

  // --- UTILITY & FORMATTING ---
  const formatNumber = (value, digits = 0) => (value === null || value === undefined) ? "--" : Number(value).toFixed(digits);
  const formatTimestamp = (iso) => iso ? new Date(iso).toLocaleString() : "--";
  const escapeAttr = (val) => val?.replace(/"/g, "&quot;") ?? "";

  // --- DATA & RENDERING (TABLE) ---
  function renderTable(entries) {
    if (!dashboardBody) return;

    if (entries.length === 0) {
      dashboardBody.innerHTML = `<tr><td colspan=\"10\" class=\"placeholder\">Loading data...</td></tr>`;
      return;
    }

    let onlineCount = 0;
    dashboardBody.innerHTML = entries
      .sort((a, b) => (a.node_id ?? 0) - (b.node_id ?? 0) || (a.wheel_id ?? 0) - (b.wheel_id ?? 0))
      .map(entry => {
        const { isOffline, className, label } = computeStatus(entry);
        if (!isOffline) onlineCount++;
        return `
          <tr class="clickable-row" data-node-id="${entry.node_id}" data-wheel-id="${entry.wheel_id}" data-node-label="${escapeAttr(entry.node_label)}" data-wheel-label="${escapeAttr(entry.wheel_label)}">
            <td data-label="Node">${entry.node_label}</td>
            <td data-label="Wheel">${entry.wheel_label}</td>
            <td data-label="Online"><span class="status ${className}"><span class="status-dot"></span>${label}</span></td>
            <td data-label="Status"><span class="code-badge">${statusText(entry.status)}</span></td>
            <td data-label="Motion">${motionText(entry.motion)}</td>
            <td data-label="Direction">${directionText(entry.direction)}</td>
            <td data-label="Distance">${formatNumber(entry.distance, 2)}</td>
            <td data-label="RSSI">${entry.rssi ?? '--'}</td>
            <td data-label="Last Signal">${formatTimestamp(entry.ts)}</td>
            <td data-label="Actions">
              <button class="action-button js-edit-label" data-node="${entry.node_id}" data-wheel="${entry.wheel_id}" data-node-label="${escapeAttr(entry.node_label)}" data-wheel-label="${escapeAttr(entry.wheel_label)}">Edit</button>
            </td>
          </tr>
        `;
      }).join('');

    // Update summary
    totalCountSpan.textContent = `Total: ${entries.length}`;
    onlineCountSpan.textContent = `Online: ${onlineCount}`;
    offlineCountSpan.textContent = `Offline: ${entries.length - onlineCount}`;
    const onlineEntries = entries.filter(e => !computeStatus(e).isOffline);
    const avgRssi = onlineEntries.reduce((sum, e) => sum + (e.rssi ?? 0), 0) / (onlineEntries.filter(e => e.rssi != null).length || 1);
    const avgLatency = onlineEntries.reduce((sum, e) => sum + (e.route_latency_ms ?? 0), 0) / (onlineEntries.filter(e => e.route_latency_ms != null).length || 1);
    avgRssiSpan.textContent = `Avg RSSI: ${formatNumber(avgRssi)} dBm`;
    avgLatencySpan.textContent = `Avg Latency: ${formatNumber(avgLatency)} ms`;
  }

  async function loadTableData() {
    try {
      const response = await fetch(`${API_BASE}/sensor-data`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      renderTable(payload.data ?? []);
      lastUpdatedSpan.textContent = new Date().toLocaleTimeString();
    } catch (error) {
      console.error("Failed to load table data:", error);
    }
  }

  // --- MODAL & CHART LOGIC ---
  function renderHistoryChart(data, nodeLabel, wheelLabel) {
    if (historyChart) {
      historyChart.destroy();
    }
    historyModalTitle.textContent = `History for ${nodeLabel} - ${wheelLabel}`;
    historyChart = new Chart(historyChartCanvas, {
      type: 'line',
      data: {
        labels: data.map(d => new Date(d.ts).toLocaleTimeString()),
        datasets: [
          {
            label: 'RSSI',
            data: data.map(d => d.rssi),
            borderColor: 'rgba(75, 192, 192, 1)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            yAxisID: 'y',
          },
          {
            label: 'Distance',
            data: data.map(d => d.distance),
            borderColor: 'rgba(255, 99, 132, 1)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            yAxisID: 'y1',
          }
        ]
      },
      options: {
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'RSSI (dBm)'
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Distance (m)'
            },
            grid: {
              drawOnChartArea: false, // only draw grid for the first Y axis
            },
          }
        }
      }
    });
  }

  async function openHistoryModal(nodeId, wheelId, nodeLabel, wheelLabel) {
    try {
      const response = await fetch(`${API_BASE}/sensor-data/history/${nodeId}/${wheelId}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      renderHistoryChart(payload.data ?? [], nodeLabel, wheelLabel);
      historyModal.style.display = "block";
    } catch (error) {
      console.error("Failed to load history data:", error);
      alert("Failed to load history data.");
    }
  }

  function closeHistoryModal() {
    historyModal.style.display = "none";
  }

  closeModalButton.addEventListener("click", closeHistoryModal);
  window.addEventListener("click", (event) => {
    if (event.target == historyModal) {
      closeHistoryModal();
    }
  });

  // --- EVENT HANDLING ---
  if (dashboardBody) {
    dashboardBody.addEventListener("click", async (event) => {
      const editButton = event.target.closest(".js-edit-label");
      if (editButton) {
        event.stopPropagation(); // prevent row click event
        const { node, wheel, nodeLabel, wheelLabel } = editButton.dataset;
        const newNodeLabel = prompt(`Set display name for Node ${node}:`, nodeLabel);
        if (newNodeLabel === null) return;

        const newWheelLabel = prompt(`Set display name for Wheel ${wheel} on Node ${node}:`, wheelLabel);
        if (newWheelLabel === null) return;

        editButton.disabled = true;
        try {
          await fetch(`${API_BASE}/labels/${node}/${wheel}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ node_label: newNodeLabel.trim(), wheel_label: newWheelLabel.trim() }),
          });
          loadTableData();
        } catch (error) {
          console.error("Failed to update label:", error);
          alert("Failed to update name.");
        } finally {
          editButton.disabled = false;
        }
      } else {
        const row = event.target.closest(".clickable-row");
        if (row) {
          const { nodeId, wheelId, nodeLabel, wheelLabel } = row.dataset;
          openHistoryModal(nodeId, wheelId, nodeLabel, wheelLabel);
        }
      }
    });
  }

  // --- INITIALIZATION ---
  function startRealtimeUpdates() {
    const eventSource = new EventSource(SSE_ENDPOINT);
    eventSource.addEventListener("update", () => {
        loadTableData();
    });
    eventSource.onerror = () => console.warn("SSE connection lost, retrying.");
  }

  loadTableData();
  startRealtimeUpdates();
  setInterval(loadTableData, POLL_INTERVAL_MS);
});
