# components/admin/settings/ServerSettingsPanel.tsx

- RetentionConfig · type · L22-L28 — type RetentionConfig = { retention_enabled: boolean; retention_imu_days: number; retention_rssi_days: number; retention_predictions_days: number; retention_interval_hours: number; };
- TableStat · type · L30-L35 — type TableStat = { table_name: string; row_count: number; oldest_record: string | null; newest_record: string | null; };
- RetentionStats · type · L37-L40 — type RetentionStats = { tables: TableStat[]; total_rows: number; };
- SimulatorStatus · type · L42-L56 — type SimulatorStatus = { env_mode: string; is_simulator: boolean; workspace_exists: boolean; workspace_id?: number; workspace_name?: string; statistics?: { patients: number; caregivers: number; devices: number; alerts: number; tasks: number; vitals: number; }; };
- SimulatorResetResult · type · L58-L64 — type SimulatorResetResult = { action: string; workspace_id: number; workspace_name: string; cleared_counts?: Record<string, number>; message: string; };
- ServerSettingsPanel · function · L66-L406 — function ServerSettingsPanel()
- handleClearDatabase · function · L120-L138 — handleClearDatabase = async ()
- handleRunRetention · function · L140-L155 — handleRunRetention = async ()
- handleSimulatorReset · function · L157-L176 — handleSimulatorReset = async ()
