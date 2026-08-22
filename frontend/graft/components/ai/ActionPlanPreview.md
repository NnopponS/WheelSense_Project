# components/ai/ActionPlanPreview.tsx

- ExecutionPlan · type · L24-L24 — type ExecutionPlan = components["schemas"]["ExecutionPlan"];
- EntityReference · type · L25-L25 — type EntityReference = { type: string; id: string | number; name?: string };
- ActionPlanPreviewProps · interface · L27-L35 — interface ActionPlanPreviewProps
- ResolvedEntity · interface · L37-L43 — interface ResolvedEntity
- riskBadgeVariant · function · L45-L56 — riskBadgeVariant = (risk: string): "default" | "secondary" | "outline" | "success" | "warning" | "destructive"
- riskIcon · function · L58-L69 — riskIcon = (risk: string)
- extractEntities · function · L71-L118 — function extractEntities(plan: ExecutionPlan): EntityReference[]
- addEntity · function · L75-L81 — addEntity = (type: string, id: unknown)
- ActionPlanPreview · function · L120-L369 — function ActionPlanPreview({ plan, onConfirm, onCancel, isConfirming = false, trace = [], providerAttempts = [], }: ActionPlanPreviewProps)
- entityIcon · function · L212-L221 — entityIcon = (type: string)
