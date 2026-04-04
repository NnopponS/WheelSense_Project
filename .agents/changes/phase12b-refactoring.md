# Phase 12B Change Log - Refactoring & Analytics (2026-04-04)

## Overview
Phase 12B focused on enhancing backend analytics capability, improving user profile management, and refactoring the frontend for better data fetching and robustness.

## Backend Changes

### 1. Analytics Service & Engine
- **New Service**: `AnalyticsService` in `app/services/analytics.py`.
- **New Endpoints**: `/api/analytics/alerts/summary`, `/api/analytics/vitals/averages`, and `/api/analytics/summary/ward`.
- **Role-based Access**: Analytics summary is restricted to `admin`, `supervisor`, or `observer` roles.
- **Aggregations**: Optimized SQL queries for window-based vital averages and alert status counts.

### 2. User Management
- **Role Updates**: `PUT /api/users/profile/role` — allows admins to update user roles.
- **Status Updates**: `PUT /api/users/profile/status` — allows admins to activate/deactivate accounts.
- **Security**: Added role validation in `RequireRole` dependency to prevent elevation of privilege.

### 3. Testing
- Added `tests/test_analytics.py` for comprehensive coverage of the new analytics engine.
- Verified all 155 test cases pass successfully.

## Frontend Changes

### 1. Unified Data Fetching (`useQuery`)
- Migrated from ad-hoc `fetch` calls to a centralized `useQuery` hook in `hooks/useQuery.ts`.
- Standardized error handling, loading states, and response types.

### 2. Robustness & Error Handling
- Implemented `ErrorBoundary.tsx` to prevent dashboard crashes from isolated component errors.
- Enhanced API client in `lib/api.ts` to support Bearer token persistence and error normalization.

### 3. Type Safety
- Refactored `DashboardProps` and `Table` components to use consistent TypeScript interfaces matching backend models.
- Resolved multiple `any` type warnings in `app/dashboard/page.tsx` and child components.

## Impact
- **Performance**: Reduced redundant data fetching via hook-based structure.
- **Security**: Hardened user management with RBAC support.
- **Reliability**: Isolated frontend failures with error boundaries.

## Next Steps
- Implement WebSocket real-time updates for high-urgency alerts.
- Expand analytics to include long-term trend analysis (Phase 13).
