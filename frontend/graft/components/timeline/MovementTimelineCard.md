# components/timeline/MovementTimelineCard.tsx

- TimelineEventLike · type · L10-L20 — type TimelineEventLike = Partial<TimelineEventOut> & { id?: number | string; timestamp?: string | null; event_type?: string | null; room_id?: number | null; room_name?: string | null; description?: string | null; data?: Record<string, unknown> | null; source?: string | null; provenance?: string | null; };
- MovementTimelineCardProps · type · L22-L31 — type MovementTimelineCardProps = { events: TimelineEventLike[]; patientName?: string | null; patientMeta?: string | null; roomLabel?: string | null; limit?: number; compact?: boolean; embedded?: boolean; className?: string; };
- asNumber · function · L33-L40 — function asNumber(value: unknown): number | null
- eventTimestampMs · function · L42-L46 — function eventTimestampMs(event: TimelineEventLike): number
- eventTimeLabel · function · L48-L56 — function eventTimeLabel(event: TimelineEventLike): string
- prettyEventType · function · L58-L66 — function prettyEventType(value: string | null | undefined): string
- eventLocation · function · L68-L78 — function eventLocation(event: TimelineEventLike): string
- eventDistance · function · L80-L88 — function eventDistance(event: TimelineEventLike): number
- GeometryPoint · type · L90-L96 — type GeometryPoint = { key: string; x: number; y: number; label: string; time: string; };
- firstNumber · function · L98-L104 — function firstNumber(...values: unknown[]): number | null
- normalizeMapCoordinate · function · L106-L110 — function normalizeMapCoordinate(value: number, size: number | null): number
- eventGeometryPoint · function · L112-L141 — function eventGeometryPoint(event: TimelineEventLike, index: number): GeometryPoint | null
- eventSourceLabel · function · L143-L154 — function eventSourceLabel(event: TimelineEventLike): string
- markerTone · function · L156-L165 — function markerTone(index: number): string
- MovementTimelineCard · function · L167-L300 — function MovementTimelineCard({ events, patientName, patientMeta, roomLabel, limit = 8, compact = false, embedded = false, className, }: MovementTimelineCardProps)
