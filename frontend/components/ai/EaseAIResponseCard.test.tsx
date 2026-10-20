import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { EaseAIResponseCard } from "./EaseAIResponseCard";

function show(props: React.ComponentProps<typeof EaseAIResponseCard>) {
  return render(<I18nProvider><EaseAIResponseCard {...props} /></I18nProvider>);
}

it("shows the patient card without repeating its narrative or lookup roster", () => {
  show({ content: "Long duplicate patient explanation", grounding: { response_cards: [
    { kind: "patient_summary", patient: { patient_name: "Samuel Ortiz", room_name: "Room 406", medical_conditions: [{ condition: "COPD" }], allergies: ["Aspirin"] } },
  ] } });
  expect(screen.getByText("Samuel Ortiz")).toBeInTheDocument();
  expect(screen.getByText("COPD")).toBeInTheDocument();
  expect(screen.queryByText("Long duplicate patient explanation")).not.toBeInTheDocument();
});

it("keeps plain answers when no useful visual exists", () => {
  show({ content: "I could not find that person.", grounding: { response_cards: [{ kind: "tool_result", tool_name: "list_visible_patients", result: [] }] } });
  expect(screen.getByText("I could not find that person.")).toBeInTheDocument();
  expect(screen.queryByText("list_visible_patients")).not.toBeInTheDocument();
});

it("shows an unresolved answer even when a lookup table was attached", () => {
  show({ content: "I could not find that person.", grounding: { reason_code: "person_not_found", response_cards: [{ kind: "data_table", columns: ["first_name"], rows: [{ first_name: "Unrelated patient" }] }] } });
  expect(screen.getByText("I could not find that person.")).toBeInTheDocument();
  expect(screen.queryByText("Unrelated patient")).not.toBeInTheDocument();
});

it("shows readable task deadlines and explicitly unset deadlines", () => {
  show({ content: "Duplicate answer", grounding: { response_cards: [{ kind: "data_table", title: "Tasks", columns: ["title", "due_at"], rows: [{ title: "Hydration", due_at: "2026-10-20T09:30:00Z" }, { title: "Mobility", due_at: null }] }] } });
  expect(screen.getByText(/20 Oct 2026/)).toBeInTheDocument();
  expect(screen.getByText(/No deadline/i)).toBeInTheDocument();
  expect(screen.queryByText("2026-10-20T09:30:00Z")).not.toBeInTheDocument();
});

it("shows a task objective once in its review card", () => {
  show({ content: "Please review this task.", grounding: { response_cards: [{ kind: "task_draft", title: "Hydration check", task: { title: "Hydration check", description: "Hydration check", patient_name: "Samuel Ortiz", assignee: "Jason Kim" } }] } });
  expect(screen.getAllByText("Hydration check")).toHaveLength(1);
  expect(screen.getByText("Samuel Ortiz")).toBeInTheDocument();
  expect(screen.getByText("Jason Kim")).toBeInTheDocument();
});

it("keeps timezone-less task deadlines consistent with the task page", () => {
  show({ content: "Tasks", grounding: { response_cards: [{ kind: "data_table", columns: ["due_at"], rows: [{ due_at: "2026-10-18T23:51:37.375925" }] }] } });
  expect(screen.getByText("18 Oct 2026, 23:51")).toBeInTheDocument();
});

it("makes omitted table rows visible on request", () => {
  show({ content: "Tasks", grounding: { response_cards: [{ kind: "data_table", columns: ["title"], total_count: 10, rows: Array.from({ length: 10 }, (_, i) => ({ title: `Task ${i + 1}` })) }] } });
  expect(screen.queryByText("Task 10")).not.toBeInTheDocument();
  expect(screen.getByText("8 / 10")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /show more/i }));
  expect(screen.getByText("Task 10")).toBeInTheDocument();
});

it("renders a free-text clarification even without suggested choices", () => {
  const onQuestionChoice = jest.fn();
  show({ content: "Repeated question", onQuestionChoice, grounding: { response_cards: [
    { kind: "question_choices", question: "What should this task be about?", choices: [] },
  ] } });
  expect(screen.getByText("What should this task be about?")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: /your answer/i }), { target: { value: "Hydration check for Samuel" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(onQuestionChoice).toHaveBeenCalledWith("Hydration check for Samuel");
  expect(screen.queryByText("Repeated question")).not.toBeInTheDocument();
});

it("shows technical tool output only when requested", () => {
  show({ content: "debug", showTechnicalDetails: true, grounding: { response_cards: [{ kind: "tool_result", tool_name: "get_staff_details", result: { status: "ok" } }] } });
  expect(screen.getAllByText("get_staff_details").length).toBeGreaterThan(0);
});

it("keeps timeline events and hides internal provenance in the chat", () => {
  show({ content: "Duplicate timeline", grounding: { response_cards: [{ kind: "timeline", events: [{ timestamp: "2026-10-19T08:00:00Z", event_type: "room_enter", room_name: "Room 406", source: "backend-mcp" }] }] } });
  expect(screen.getByText("Room 406")).toBeInTheDocument();
  expect(screen.queryByText(/backend-mcp/)).not.toBeInTheDocument();
  expect(screen.queryByText("Duplicate timeline")).not.toBeInTheDocument();
});
