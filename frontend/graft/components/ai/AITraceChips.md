# components/ai/AITraceChips.tsx

- AITraceChip · type · L6-L12 — type AITraceChip = { layer: number; label: string; outcome: string; phase?: string | null; latency_ms?: number | null; };
- ProviderAttemptTrace · type · L14-L22 — type ProviderAttemptTrace = { provider: string; model: string; phase: string; attempt: number; status: string; latency_ms?: number | null; fallback_reason?: string | null; };
- outcomeVariant · function · L24-L41 — function outcomeVariant( outcome: string, ): "default" | "secondary" | "outline" | "success" | "warning" | "destructive"
- AITraceChips · function · L43-L104 — function AITraceChips({ trace, providerAttempts = [], }: { trace: AITraceChip[]; providerAttempts?: ProviderAttemptTrace[]; })
