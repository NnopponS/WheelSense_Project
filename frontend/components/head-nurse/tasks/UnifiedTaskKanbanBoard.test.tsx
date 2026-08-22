import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import type { TaskOut } from "@/types/tasks";
import { UnifiedTaskKanbanBoard } from "./UnifiedTaskKanbanBoard";

const task = {
  id: 1,
  title: "Check wheelchair battery",
  description: "",
  task_type: "specific",
  status: "pending",
  priority: "normal",
} as TaskOut;

function renderBoard(tasks: TaskOut[], onCreateTask = jest.fn()) {
  render(
    <I18nProvider>
      <UnifiedTaskKanbanBoard
        tasks={tasks}
        isLoading={false}
        canManage
        onCreateTask={onCreateTask}
      />
    </I18nProvider>,
  );
  return onCreateTask;
}

describe("UnifiedTaskKanbanBoard empty states", () => {
  it("offers task creation when no tasks exist", () => {
    const onCreateTask = renderBoard([]);

    const createButtons = screen.getAllByRole("button", { name: "Create Task" });
    fireEvent.click(createButtons[createButtons.length - 1]);

    expect(onCreateTask).toHaveBeenCalledTimes(1);
  });

  it("offers filter clearing instead of task creation when no tasks match", () => {
    const onCreateTask = renderBoard([task]);

    fireEvent.change(screen.getByRole("textbox", { name: "Search tasks" }), {
      target: { value: "no matching task" },
    });

    expect(screen.getByText("No matches found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
    expect(onCreateTask).not.toHaveBeenCalled();
  });
});
