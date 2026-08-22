# components/ai/ExecutionStepList.tsx

- ExecutionPlanStep · type · L22-L22 — type ExecutionPlanStep = components["schemas"]["ExecutionPlanStep"];
- StepResult · interface · L24-L31 — interface StepResult
- ExecutionStepListProps · interface · L33-L40 — interface ExecutionStepListProps
- stepStatus · function · L42-L54 — stepStatus = ( index: number, executing: boolean, currentStepIndex: number, completedSteps: number[], failedSteps: number[] ): "pending" | "executing" | "completed" | "failed"
- statusIcon · function · L56-L67 — statusIcon = (status: "pending" | "executing" | "completed" | "failed")
- riskBadgeVariant · function · L69-L80 — riskBadgeVariant = (risk: string): "default" | "secondary" | "outline" | "success" | "warning" | "destructive"
- StepCard · function · L82-L221 — function StepCard({ step, index, status, result, isLast, t, }: { step: ExecutionPlanStep; index: number; status: "pending" | "executing" | "completed" | "failed"; result?: StepResult; isLast: boolean; t: (key: string) => string; })
- ExecutionStepList · function · L223-L303 — function ExecutionStepList({ steps, executing = false, currentStepIndex = 0, completedSteps = [], stepResults = [], failedSteps = [], }: ExecutionStepListProps)
