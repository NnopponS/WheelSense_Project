# components/shared/PersonSensorStatusPanel.tsx

- PersonType · type · L25-L25 — type PersonType = "patient" | "staff";
- DeviceAssignmentLike · type · L27-L33 — type DeviceAssignmentLike = { id: number; device_id: string; device_role: string; assigned_at: string; is_active: boolean; };
- MetricSnapshot · type · L35-L50 — type MetricSnapshot = { timestamp?: string | null; battery_pct?: number | null; battery_v?: number | null; charging?: boolean | null; velocity_ms?: number | null; distance_m?: number | null; accel_ms2?: number | null; steps?: number | null; polar_connected?: boolean | null; heart_rate_bpm?: number | null; rr_interval_ms?: number | null; spo2?: number | null; sensor_battery?: number | null; ppg?: number | string | null; };
- DeviceDetail · type · L52-L63 — type DeviceDetail = { device_id?: string; display_name?: string | null; hardware_type?: string | null; last_seen?: string | null; realtime?: MetricSnapshot | null; wheelchair_metrics?: MetricSnapshot | null; node_metrics?: MetricSnapshot | null; mobile_metrics?: MetricSnapshot | null; polar_metrics?: MetricSnapshot | null; polar_vitals?: MetricSnapshot | null; };
- PersonSensorStatusPanelProps · type · L65-L72 — type PersonSensorStatusPanelProps = { personType: PersonType; personId: number; title?: string; description?: string; compact?: boolean; className?: string; };
- asAssignments · function · L74-L81 — function asAssignments(value: unknown): DeviceAssignmentLike[]
- assignmentEndpoint · function · L83-L86 — function assignmentEndpoint(personType: PersonType, personId: number): string
- resolveHardwareType · function · L88-L96 — function resolveHardwareType(detail: DeviceDetail | null, role: string): string
- hardwareIcon · function · L98-L103 — function hardwareIcon(hardwareType: string)
- roleLabel · function · L105-L117 — function roleLabel(role: string, t: (key: string) => string): string
- latestMetricTimestamp · function · L119-L134 — function latestMetricTimestamp(detail: DeviceDetail | null): string | null
- fmtNumber · function · L136-L139 — function fmtNumber(value: number | null | undefined, digits = 1, suffix = ""): string
- fmtInt · function · L141-L144 — function fmtInt(value: number | null | undefined, suffix = ""): string
- batteryFrom · function · L146-L156 — function batteryFrom(detail: DeviceDetail | null): number | null
- MetricRow · function · L158-L165 — function MetricRow({ label, value }: { label: string; value: ReactNode })
- DeviceMetrics · function · L167-L257 — function DeviceMetrics({ detail, hardwareType, t, }: { detail: DeviceDetail | null; hardwareType: string; t: (key: string) => string; })
- PersonSensorStatusPanel · function · L259-L427 — function PersonSensorStatusPanel({ personType, personId, title, description, compact = false, className, }: PersonSensorStatusPanelProps)
