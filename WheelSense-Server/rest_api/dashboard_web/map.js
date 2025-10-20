import { computeStatus } from './utils.js';

document.addEventListener("DOMContentLoaded", () => {
  const API_BASE = "/api";
  const SSE_ENDPOINT = "/sensor-data/stream";
  const STALE_THRESHOLD_MS = 2 * 60 * 1000;

  // DOM Elements
  const mapContainer = document.getElementById("map-container");
  const editModeToggle = document.getElementById("edit-mode-toggle");
  const saveLayoutButton = document.getElementById("save-layout-button");

  let isEditMode = false;
  let sensorData = [];
  let roomLayouts = {}; // { roomId: { x, y, name, element } }

  // --- API FUNCTIONS ---
  async function fetchData() {
    try {
      const [sensorRes, layoutRes] = await Promise.all([
        fetch(`${API_BASE}/sensor-data`),
        fetch(`${API_BASE}/map-layout`),
      ]);
      const sensorPayload = await sensorRes.json();
      const layoutPayload = await layoutRes.json();

      sensorData = sensorPayload.data || [];
      
      // Initialize layouts from server data
      (layoutPayload.data || []).forEach(room => {
        roomLayouts[room.room_id] = { 
          x: room.x_pos, 
          y: room.y_pos, 
          name: room.room_name 
        };
      });

      updateMap();
    } catch (error) {
      console.error("Failed to fetch initial data:", error);
    }
  }

  async function saveLayout() {
    const layoutToSave = Object.entries(roomLayouts).map(([id, layout]) => ({
      roomId: id,
      x: layout.x,
      y: layout.y,
      roomName: layout.name,
    }));

    try {
      const response = await fetch(`${API_BASE}/map-layout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout: layoutToSave }),
      });
      if (!response.ok) throw new Error("Failed to save layout");
      alert("Layout saved!");
    } catch (error) {
      console.error("Save failed:", error);
      alert("Error saving layout.");
    }
  }

  // --- LOCATION & RENDERING LOGIC ---
  function calculateWheelLocations(data) {
    const wheelGroups = data.reduce((acc, entry) => {
      acc[entry.wheel_id] = acc[entry.wheel_id] || [];
      acc[entry.wheel_id].push(entry);
      return acc;
    }, {});

    const wheelLocations = {};
    for (const wheelId in wheelGroups) {
      const signals = wheelGroups[wheelId];
      const recentSignals = signals.filter(s => !computeStatus(s).isOffline);

      if (recentSignals.length > 0) {
        const bestSignal = recentSignals.reduce((best, current) => 
          (current.rssi > best.rssi) ? current : best
        );
        wheelLocations[wheelId] = bestSignal.node_id;
      }
    }
    return wheelLocations;
  }

  function updateMap() {
    if (!mapContainer) return;

    const wheelLocations = calculateWheelLocations(sensorData);
    const allNodeIds = new Set(sensorData.map(s => s.node_id));
    const allWheelIds = new Set(sensorData.map(s => s.wheel_id));

    // Ensure all nodes from data have a layout entry
    allNodeIds.forEach(id => {
      if (!roomLayouts[id]) {
        roomLayouts[id] = { x: 50, y: 50, name: `Room ${id}` };
      }
    });

    // Render rooms
    Object.entries(roomLayouts).forEach(([id, layout]) => {
      let roomEl = layout.element;
      if (!roomEl) {
        roomEl = document.createElement("div");
        roomEl.className = "map-room";
        roomEl.dataset.id = id;
        layout.element = roomEl;
        mapContainer.appendChild(roomEl);
      }
      roomEl.style.transform = `translate(${layout.x}px, ${layout.y}px)`;
      roomEl.innerHTML = `<div class="room-header">${layout.name || `Room ${id}`}</div><div class="room-body"></div>`;
    });

    // Clear wheels from all rooms
    document.querySelectorAll(".room-body").forEach(body => body.innerHTML = '');

    // Render wheels in their correct rooms
    allWheelIds.forEach(wheelId => {
      const locationNodeId = wheelLocations[wheelId];
      const roomEl = locationNodeId ? roomLayouts[locationNodeId]?.element : null;
      if (roomEl) {
        const wheelData = sensorData.find(s => s.wheel_id === wheelId);
        const status = computeStatus(wheelData);
        const wheelEl = document.createElement("div");
        wheelEl.className = `map-wheel ${status.className}`;
        wheelEl.innerHTML = `<span class="wheel-dot"></span> ${wheelData.wheel_label}`;
        roomEl.querySelector(".room-body").appendChild(wheelEl);
      }
    });
  }

  // --- DRAG & DROP ---
  interact('.map-room.editable').draggable({
    listeners: {
      move(event) {
        const target = event.target;
        const id = target.dataset.id;
        if (roomLayouts[id]) {
          roomLayouts[id].x += event.dx;
          roomLayouts[id].y += event.dy;
          target.style.transform = `translate(${roomLayouts[id].x}px, ${roomLayouts[id].y}px)`;
        }
      },
    },
    modifiers: [
      interact.modifiers.restrictRect({ restriction: 'parent' })
    ],
    inertia: true,
  });

  // --- EVENT HANDLERS ---
  editModeToggle.addEventListener("click", () => {
    isEditMode = !isEditMode;
    editModeToggle.textContent = isEditMode ? "Disable Edit Mode" : "Enable Edit Mode";
    saveLayoutButton.classList.toggle("hidden", !isEditMode);
    document.querySelectorAll(".map-room").forEach(el => el.classList.toggle("editable", isEditMode));
  });

  saveLayoutButton.addEventListener("click", saveLayout);

  // --- INITIALIZATION ---
  function startRealtimeUpdates() {
    const eventSource = new EventSource(SSE_ENDPOINT);
    eventSource.addEventListener("update", () => fetchData());
    eventSource.onerror = () => console.warn("SSE connection lost, retrying.");
  }

  fetchData();
  startRealtimeUpdates();
});
