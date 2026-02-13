---
name: Next.js Frontend Conventions
description: Conventions and patterns for the WheelSense Next.js 16 frontend with TypeScript, Tailwind v4, Zustand, and React Query
---

# Next.js Frontend Conventions

## Tech Stack
- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS v4 via `@tailwindcss/postcss`
- **State Management**: Zustand v5 with `persist` middleware
- **Data Fetching**: `@tanstack/react-query` v5
- **Icons**: Lucide React
- **Charts**: Recharts v3
- **Real-time**: MQTT.js v5

## Project Structure

```
frontend/src/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Root page (redirect)
│   ├── globals.css         # Global styles + Tailwind + design tokens
│   ├── admin/              # Admin dashboard pages
│   │   ├── monitoring/     # Live monitoring with floor map
│   │   ├── dashboard/      # System overview
│   │   ├── map/            # Interactive floor map
│   │   ├── patients/       # Patient management
│   │   ├── devices/        # Node & device management
│   │   ├── appliances/     # Smart home control
│   │   ├── timeline/       # Activity history
│   │   ├── analytics/      # Usage statistics
│   │   └── settings/       # System configuration
│   └── user/               # User-facing pages
│       ├── home/           # User dashboard
│       ├── appliances/     # Appliance control
│       ├── health/         # Health info
│       ├── alerts/         # Notifications
│       └── settings/       # User settings
├── components/             # Shared components
│   ├── AIChatPopup.tsx     # AI chat overlay
│   ├── BottomNav.tsx       # Mobile bottom navigation
│   ├── ClientLayout.tsx    # Client-side layout wrapper
│   ├── Drawer.tsx          # Slide-out drawer
│   ├── Navigation.tsx      # Main navigation
│   ├── Sidebar.tsx         # Admin sidebar
│   └── TopBar.tsx          # Top toolbar
├── lib/
│   └── api.ts              # API client (fetchApi wrapper + typed endpoints)
├── store/
│   └── index.ts            # Zustand store (single store pattern)
└── types/
    └── index.ts            # All TypeScript interfaces
```

## Key Conventions

### 1. Client Components
- All interactive components MUST start with `'use client';`
- Page components that use hooks, state, or browser APIs must be client-side
- Static metadata can only be exported from Server Components

### 2. Zustand Store Pattern
The project uses a **single global store** (`useWheelSenseStore`) with:

```typescript
// DO: Use the store via the hook
const { wheelchairs, setWheelchairs } = useWheelSenseStore();

// DO: Use selectors for derived state
const onlineWheelchairs = useWheelSenseStore(
  (s) => s.wheelchairs.filter(w => w.status === 'online')
);

// DON'T: Create separate stores
// DON'T: Use React.useState for data that should be shared
```

**State categories in the store:**
- UI state: `theme`, `role`, `language`, `sidebarOpen`, `currentPage`, `drawerOpen`
- Data state: `wheelchairs`, `patients`, `devices`, `rooms`, `buildings`, `floors`, `appliances`
- RSSI state: `currentLocation`, `nearbyNodes`, `detectionState`
- User state: `currentUser`, `notifications`, `timeline`

### 3. API Layer (`lib/api.ts`)
All API calls go through the `fetchApi<T>()` wrapper:

```typescript
// Standard pattern - all functions return ApiResponse<T>
export async function getWheelchairs(): Promise<ApiResponse<Wheelchair[]>> {
  return fetchApi<Wheelchair[]>('/api/wheelchairs');
}

// POST with body
export async function controlAppliance(id: string, state: boolean, value?: number) {
  return fetchApi(`/api/appliances/${id}/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, value }),
  });
}
```

**API base URL**: `process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'`

### 4. Type Definitions (`types/index.ts`)
All interfaces are centralized in a single file. Key entities:
- `Wheelchair`, `Patient`, `Device`, `Room`, `Building`, `Floor`
- `Appliance`, `Routine`, `TimelineEvent`, `Notification`
- `MQTTWheelchairMessage`, `NearbyNode`, `LocationEstimate`
- `Role` ('admin' | 'user'), `Theme` ('dark' | 'light')

**Convention**: Frontend types use camelCase, backend API returns snake_case. Transform at the API boundary.

### 5. Styling
- Tailwind v4 with PostCSS plugin (NOT className-based v3 config)
- Global styles and CSS custom properties in `app/globals.css`
- Design system uses CSS variables for theming (dark/light mode)
- Use Tailwind utility classes in JSX

### 6. Bilingual Support
- Thai (`th`) and English (`en`) supported
- Many entities have both `name` (Thai) and `nameEn` (English) fields
- Use the Zustand `language` state to determine display language

### 7. Admin vs User Routes
- Admin pages: `/admin/*` — Dashboard, monitoring, device management
- User pages: `/user/*` — Patient-facing, simplified controls
- Role stored in Zustand store, determines which navigation to show

## Running Locally
```bash
cd frontend
npm install
npm run dev    # Development at http://localhost:3000
npm run build  # Production build
npm run lint   # ESLint check
```
