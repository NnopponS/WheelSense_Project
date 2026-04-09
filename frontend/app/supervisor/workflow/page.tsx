import { OperationsConsole } from "@/components/workflow/OperationsConsole";

export default function SupervisorWorkflowPage() {
  return (
    <OperationsConsole
      role="supervisor"
      title="Operations Console"
      subtitle="Manage queue load, transfer work, and monitor coordination from one supervisor console."
    />
  );
}
