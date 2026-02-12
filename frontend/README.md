# WheelSense v2.0 - Frontend

Smart Indoor Positioning Dashboard for Wheelchair Users using **RSSI Fingerprint Localization**.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## 🏗 Architecture

This frontend is built with:

- **Next.js 16** - App Router with TypeScript
- **Tailwind CSS** - Utility-first styling
- **Zustand** - State management
- **Lucide React** - Icons
- **Recharts** - Charts and visualizations

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── admin/              # Admin dashboard pages
│   │   ├── monitoring/     # Live monitoring with RSSI visualization
│   │   ├── map/            # Floor map and zone management
│   │   ├── patients/       # Wheelchair and patient management
│   │   ├── devices/        # ESP32-S3 nodes and gateway management
│   │   ├── sensors/        # RSSI signal monitoring
│   │   ├── appliances/     # Smart home control
│   │   ├── timeline/       # Activity history
│   │   ├── routines/       # Schedule management
│   │   ├── analytics/      # Reports and statistics
│   │   ├── ai/             # AI assistant (Gemini)
│   │   └── settings/       # System settings
│   └── user/               # User portal pages
│       ├── home/           # User dashboard
│       ├── health/         # Health tracking
│       ├── routines/       # Personal schedule
│       ├── appliances/     # Appliance control
│       ├── ai/             # AI assistant
│       ├── alerts/         # Notifications
│       └── settings/       # User settings
├── components/             # Reusable components
│   ├── ClientLayout.tsx    # Client-side layout wrapper
│   └── Navigation.tsx      # Sidebar and navigation
├── store/                  # Zustand store
│   └── index.ts            # Global state management
└── types/                  # TypeScript types
    └── index.ts            # RSSI, MQTT, and entity types
```

## 🎯 Key Features

### RSSI Fingerprint Localization

Unlike the previous YOLO camera-based system, WheelSense v2.0 uses **RSSI (Received Signal Strength Indicator) fingerprinting** for indoor localization:

1. **ESP32-S3 BLE Nodes** - Placed in each room, broadcasting BLE signals
2. **M5StickCPlus2 Gateway** - Mounted on wheelchair, collecting RSSI from nearby nodes
3. **Fingerprint Database** - Pre-recorded RSSI patterns for each room
4. **Location Estimation** - Matching live RSSI readings to fingerprints

### MQTT Message Format

```json
{
  "device_id": "WC-001",
  "timestamp": "2024-01-15T10:30:00Z",
  "wheelchair": {
    "distance": 0.5,
    "speed": 0.2,
    "motion_state": "moving",
    "direction": "forward"
  },
  "selected_node": "NODE-01",
  "nearby_nodes": [
    { "node_id": "NODE-01", "rssi": -45, "distance_estimate": 1.2 },
    { "node_id": "NODE-02", "rssi": -65, "distance_estimate": 3.5 }
  ]
}
```

### Signal Strength Interpretation

| RSSI Range | Quality | Description |
|------------|---------|-------------|
| > -50 dBm | Excellent | Very close, same room |
| -50 to -60 dBm | Good | Same room |
| -60 to -70 dBm | Fair | Adjacent room |
| < -70 dBm | Weak | Far away |

## 🎨 Design System

The dashboard uses a custom design system with:

- **Dark/Light themes** - Persistent theme preference
- **Indigo primary color** - Gradient accents
- **Responsive layout** - Mobile-first with bottom navigation
- **Animated components** - Smooth transitions and micro-interactions

## 🔌 API Integration

The frontend connects to the FastAPI backend:

```typescript
// Environment variables
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_MQTT_BROKER=ws://localhost:9001
```

## 📱 Mobile Support

- Responsive design for tablets and mobile devices
- Bottom navigation bar on mobile
- Touch-friendly controls
- PWA-ready structure

## 🛠 Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Environment Variables

Create `.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
```

## 📖 Migration from v1.0

Key changes from WheelSenseMockUp (v1.0):

| v1.0 (YOLO Camera) | v2.0 (RSSI Fingerprint) |
|--------------------|-------------------------|
| Camera nodes per room | BLE nodes per room |
| YOLO object detection | RSSI fingerprint matching |
| Video stream processing | Signal strength processing |
| High bandwidth | Low bandwidth |
| Complex setup | Simpler hardware |

## 👨‍💻 Author

Built by Worapon Sangsasri
