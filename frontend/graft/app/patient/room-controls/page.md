# app/patient/room-controls/page.tsx

- SmartDevice · type · L27-L27 — type SmartDevice = ListSmartDevicesResponse[number];
- DeviceKind · type · L29-L29 — type DeviceKind = "light" | "fan" | "switch" | "climate" | "unsupported";
- DeviceSnapshot · type · L31-L37 — type DeviceSnapshot = { state: string; message: string; data: Record<string, unknown> | null; fetchedAt: string; error: string | null; };
- ActionDefinition · type · L39-L45 — type ActionDefinition = { key: string; label: TranslationKey; action: string; Icon: ComponentType<{ className?: string }>; variant: "default" | "secondary" | "outline"; };
- isRecord · function · L77-L79 — function isRecord(value: unknown): value is Record<string, unknown>
- toFiniteNumber · function · L81-L88 — function toFiniteNumber(value: unknown): number | null
- humanizeDeviceType · function · L90-L97 — function humanizeDeviceType(value: string): string
- resolveDeviceKind · function · L99-L108 — function resolveDeviceKind(device: SmartDevice): DeviceKind
- getSnapshotState · function · L110-L112 — function getSnapshotState(snapshot: DeviceSnapshot | undefined, fallback: string): string
- extractTargetTemperature · function · L114-L141 — function extractTargetTemperature(device: SmartDevice, snapshot: DeviceSnapshot | undefined): number | null
- formatTimestamp · function · L143-L148 — function formatTimestamp(value: string): string
- getErrorMessage · function · L150-L154 — function getErrorMessage(error: unknown, fallback: string): string
- PatientRoomControlsPage · function · L156-L445 — function PatientRoomControlsPage()
- DeviceCard · function · L447-L607 — function DeviceCard({ device, snapshot, temperatureDraft, onTemperatureDraftChange, onRefresh, onControl, busyActionKey, isRefreshing, error, t, }: { device: SmartDevice; snapshot?: DeviceSnapshot; temperatureDraft?: string; onTemperatureDraftChange: (value: string) => void; onRefresh: () => void; onControl: (action: string, parameters?: Record<string, unknown>) => void; busyActionKey: string | null; isRefreshing: boolean; error: string | null; t: ReturnType<typeof useTranslation>["t"]; })
- InfoTile · function · L609-L624 — function InfoTile({ label, value, mono = false, }: { label: string; value: string; mono?: boolean; })
- StatCard · function · L626-L638 — function StatCard({ label, value }: { label: string; value: number })
