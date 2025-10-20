const API_ENDPOINT = "/sensor-data?limit=all";
const POLL_INTERVAL_MS = 5000;
const STALE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

const dashboardBody = document.getElementById("dashboard-body");
const totalCountSpan = document.getElementById("total-count");
const onlineCountSpan = document.getElementById("online-count");
const offlineCountSpan = document.getElementById("offline-count");
const lastUpdatedSpan = document.getElementById("last-updated");
const currentYearSpan = document.getElementById("current-year");

currentYearSpan.textContent = new Date().getFullYear();

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return Number(value).toFixed(digits);
}

function formatTimestamp(isoString) {
  if (!isoString) {
    return "—";
  }

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }

  return date.toLocaleString();
}

function computeStatus(entry) {
  const stale = entry.stale === true;
  const ts = entry.ts ? new Date(entry.ts).getTime() : null;
  const now = Date.now();

  const isOutdated = ts ? now - ts > STALE_THRESHOLD_MS : false;
  const offline = stale || isOutdated;

  return {
    label: offline ? "Offline" : "Online",
    className: offline ? "offline" : "online",
  };
}

function setSummary(total, online, offline) {
  totalCountSpan.textContent = `Total: ${total}`;
  onlineCountSpan.textContent = `Online: ${online}`;
  offlineCountSpan.textContent = `Offline: ${offline}`;
}

function renderRows(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    dashboardBody.innerHTML =
      '<tr><td colspan="6" class="placeholder">No sensor data yet.</td></tr>';
    setSummary(0, 0, 0);
    return;
  }

  const rows = [];
  let onlineCount = 0;
  let offlineCount = 0;

  entries
    .slice()
    .sort((a, b) => {
      const roomA = a.room ?? 0;
      const roomB = b.room ?? 0;
      if (roomA !== roomB) {
        return roomA - roomB;
      }
      const wheelA = a.wheel ?? 0;
      const wheelB = b.wheel ?? 0;
      return wheelA - wheelB;
    })
    .forEach((entry) => {
      const { label, className } = computeStatus(entry);
      if (className === "online") {
        onlineCount += 1;
      } else {
        offlineCount += 1;
      }

      const roomLabel = entry.room_name || `Room ${entry.room ?? "-"}`;
      const wheelLabel = entry.wheel_name || `Wheel ${entry.wheel ?? "-"}`;

      rows.push(`
        <tr>
          <td data-label="Room">${roomLabel}</td>
          <td data-label="Wheel">${wheelLabel}</td>
          <td data-label="Status">
            <span class="status ${className}">
              <span class="status-dot" aria-hidden="true"></span>
              ${label}
            </span>
          </td>
          <td data-label="Distance">${formatNumber(entry.distance)}</td>
          <td data-label="RSSI">${entry.rssi ?? "—"}</td>
          <td data-label="Last Signal">${formatTimestamp(entry.ts)}</td>
        </tr>
      `);
    });

  dashboardBody.innerHTML = rows.join("");
  setSummary(entries.length, onlineCount, offlineCount);
}

async function loadData() {
  try {
    const response = await fetch(API_ENDPOINT, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    renderRows(payload.data ?? []);
    lastUpdatedSpan.textContent = new Date().toLocaleTimeString();
  } catch (error) {
    console.error("Failed to load dashboard data", error);
    dashboardBody.innerHTML =
      '<tr><td colspan="6" class="placeholder error">Cannot load data. Retrying…</td></tr>';
  }
}

loadData();
setInterval(loadData, POLL_INTERVAL_MS);
