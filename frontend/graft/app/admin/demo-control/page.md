# app/admin/demo-control/page.tsx

- Tone · type · L27-L27 — type Tone = "success" | "error" | "info";
- ActorType · type · L28-L28 — type ActorType = "patient" | "staff";
- DemoAlertType · type · L29-L29 — type DemoAlertType = "manual_test" | "abnormal_hr" | "fall" | "low_battery" | "device_offline";
- SimulatorStatusResp · type · L31-L36 — type SimulatorStatusResp = { env_mode: string; is_simulator: boolean; workspace_exists: boolean; workspace_id?: number | null; };
- errText · function · L38-L42 — function errText(error: unknown): string
- ts · function · L44-L50 — function ts()
- formatTemplate · function · L52-L57 — function formatTemplate(template: string, values: Record<string, string | number>): string
- logId · function · L59-L61 — function logId(prefix: string)
- displayName · function · L63-L65 — function displayName(user: User)
- roomLabel · function · L67-L69 — function roomLabel(room: Room)
- AdminDemoControlPage · function · L71-L460 — function AdminDemoControlPage()
- metricLabel · function · L119-L122 — metricLabel = ( key: "demoControl.countPatients" | "demoControl.countStaff" | "demoControl.countRooms", count: number, )
- pushLog · function · L124-L126 — function pushLog(title: string, detail: string, tone: Tone)
- run · function · L128-L136 — async function run(title: string, detail: string, command: () => Promise<unknown>)
- resetWorkspaceQuietly · function · L138-L149 — async function resetWorkspaceQuietly()
- handleCreateAlert · function · L151-L184 — function handleCreateAlert()
