# app/head-caregiver/emergency/page.tsx

- RoomRow · type · L36-L44 — type RoomRow = { roomId: number; roomName: string; roomType: string; localizedDevices: number; averageConfidence: number | null; lastSignal: string | null; isCritical: boolean; };
- AlertRow · type · L46-L54 — type AlertRow = { alertId: number; title: string; description: string; patientName: string; patientRoomLine: string; patientId: number | null; timestamp: string; };
- PredictionRow · type · L56-L62 — type PredictionRow = { deviceId: string; roomName: string; confidence: number | null; modelType: string; timestamp: string | null; };
- SupervisorEmergencyPage · function · L64-L492 — function SupervisorEmergencyPage()
- severityRank · function · L177-L182 — severityRank = (s: string)
