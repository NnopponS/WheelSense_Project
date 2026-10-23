# components/ai/EaseAIResponseCard.tsx

- JsonRecord · type · L14-L14 — type JsonRecord = Record<string, unknown>;
- EaseAIResponseCardProps · type · L16-L23 — type EaseAIResponseCardProps = { content: string; grounding?: JsonRecord | null; executionResult?: JsonRecord | null; loading?: boolean; onQuestionChoice?: (reply: string) => void; onNavigate?: (href: string) => void; };
- renderMarkdown · function · L25-L37 — function renderMarkdown(text: string): string
- asRecord · function · L39-L41 — function asRecord(value: unknown): JsonRecord | null
- asArray · function · L43-L45 — function asArray(value: unknown): unknown[]
- asString · function · L47-L49 — function asString(value: unknown): string
- getTimelinePayload · function · L51-L63 — function getTimelinePayload(grounding?: JsonRecord | null): JsonRecord | null
- getTaskResult · function · L65-L74 — function getTaskResult(executionResult?: JsonRecord | null): JsonRecord | null
- responseCardsFromGrounding · function · L76-L111 — function responseCardsFromGrounding( grounding?: JsonRecord | null, executionResult?: JsonRecord | null, ): EaseAIBackendCard[]
- EaseAIResponseCard · function · L113-L158 — function EaseAIResponseCard({ content, grounding, executionResult, loading = false, onQuestionChoice, onNavigate, }: EaseAIResponseCardProps)
