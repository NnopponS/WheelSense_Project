type Segment = { value: number; tone: "success" | "warning" | "critical" | "info" | "muted" };
const tones = { success: "bg-success", warning: "bg-warning", critical: "bg-critical", info: "bg-info", muted: "bg-muted-foreground/35" };

export function StatusSegments({ segments, total, label }: { segments: Segment[]; total: number; label: string }) {
  return <span role="img" aria-label={label} title={label} className="flex h-1.5 min-w-12 gap-px overflow-hidden rounded-sm bg-muted">
    {total > 0 ? segments.filter(segment => segment.value > 0).map((segment, index) =>
      <span key={index} className={tones[segment.tone]} style={{ width: `${segment.value / total * 100}%` }} />,
    ) : null}
  </span>;
}
