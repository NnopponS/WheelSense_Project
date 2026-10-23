# lib/monitoringWorkspace.ts

- MonitoringViewMode · type · L6-L6 — type MonitoringViewMode = "list" | "map";
- MonitoringWorkspaceQuery · interface · L8-L13 — interface MonitoringWorkspaceQuery
- firstString · function · L15-L18 — function firstString(v: string | string[] | undefined): string | undefined
- parsePositiveInt · function · L20-L25 — function parsePositiveInt(v: string | undefined): number | null
- parseView · function · L27-L30 — function parseView(v: string | undefined): MonitoringViewMode
- parseMonitoringQuery · function · L33-L42 — function parseMonitoringQuery( sp: Record<string, string | string[] | undefined>, ): MonitoringWorkspaceQuery
- LegacyTabRedirect · interface · L44-L46 — interface LegacyTabRedirect
- legacyMonitoringTabRedirect · function · L52-L84 — function legacyMonitoringTabRedirect( pathname: string, sp: Record<string, string | string[] | undefined>, ): string | null
- buildMonitoringSearchParams · function · L86-L129 — function buildMonitoringSearchParams( q: Partial<MonitoringWorkspaceQuery>, existing?: URLSearchParams, ): URLSearchParams
- monitoringHref · function · L131-L135 — function monitoringHref(pathname: string, q: Partial<MonitoringWorkspaceQuery>): string
- floorplanRoomIdToNumeric · function · L141-L145 — function floorplanRoomIdToNumeric(id: string): number | null
