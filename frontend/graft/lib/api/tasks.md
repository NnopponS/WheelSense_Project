# lib/api/tasks.ts

- fetchTasks · function · L15-L40 — async function fetchTasks(params?: { task_type?: string; status?: string; patient_id?: number; assignee_user_id?: number; date_from?: string; date_to?: string; shift_date?: string; is_active?: boolean; limit?: number; }): Promise<TaskOut[]>
- fetchTaskBoard · function · L42-L45 — async function fetchTaskBoard(shiftDate?: string): Promise<TaskBoardResponse>
- fetchTask · function · L47-L49 — async function fetchTask(taskId: number): Promise<TaskOut>
- createTask · function · L51-L53 — async function createTask(data: TaskCreate): Promise<TaskOut>
- updateTask · function · L55-L57 — async function updateTask(taskId: number, data: TaskUpdate): Promise<TaskOut>
- deleteTask · function · L59-L61 — async function deleteTask(taskId: number): Promise<void>
- submitTaskReport · function · L63-L65 — async function submitTaskReport(taskId: number, data: TaskReportCreate): Promise<TaskReportOut>
- fetchTaskReports · function · L67-L69 — async function fetchTaskReports(taskId: number): Promise<TaskReportOut[]>
- taskPendingAttachmentContentUrl · function · L72-L74 — function taskPendingAttachmentContentUrl(pendingId: string): string
- taskTemplateAttachmentContentUrl · function · L77-L82 — function taskTemplateAttachmentContentUrl( taskId: number, attachmentId: string, ): string
- resetRoutineTasks · function · L84-L87 — async function resetRoutineTasks(shiftDate?: string): Promise<{ reset_count: number }>
