# WheelSense Platform - Frontend

Modern React dashboard for the WheelSense IoT platform, built with Next.js 16, Tailwind CSS v4, and Lucide icons.

## Architecture & Patterns

### 1. Data Fetching (`useQuery`)
The project uses a custom `useQuery` hook for unified data fetching. This provides:
- **Loading State**: Track `isLoading` automatically.
- **Error Handling**: Graceful error catching and reporting.
- **Unified Interface**: Same pattern used across all dashboard pages.

Example usage:
```tsx
const { data: metrics, isLoading, error } = useQuery<WardSummary>('/api/analytics/summary/ward');
```

### 2. Error Robustness (`ErrorBoundary`)
Dashboard pages are wrapped in a custom `ErrorBoundary` component. This prevents a single component failure from crashing the entire application and provides a fallback UI for the user.

### 3. API Client
The API client in `lib/api.ts` handles:
- **Base URL management**: Configurable via environment variables.
- **Authentication**: Bearer token injection (JWT).
- **Error Normalization**: Converts raw responses into structured error objects.

## Getting Started

### Prerequisites
- Node.js 20+
- npm / pnpm / bun

### Installation
```bash
cd frontend
npm install
```

### Development
```bash
npm run dev
```
The dashboard will be available at `http://localhost:3000`.

<!-- AUTO-GENERATED: script-reference -->
### npm scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js dev server with hot reload |
| `npm run build` | Production build (typecheck + static generation) |
| `npm run start` | Serve production build |
| `npm run lint` | ESLint |
<!-- /AUTO-GENERATED -->

## Key Directories
- `app/`: Next.js App Router pages and layouts.
- `components/`: Reusable UI components.
- `hooks/`: Custom React hooks (`useQuery`, etc.).
- `lib/`: Utilities and API clients.
- `types/`: TypeScript interfaces/types matching backend schemas.
