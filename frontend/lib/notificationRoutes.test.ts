import { alertsInboxUrl, workflowTasksPath, staffMessagesPath } from "./notificationRoutes";

it.each([
  ["admin", "/admin/alerts", "/admin"],
  ["head_caregiver", "/head-caregiver/emergency", "/head-caregiver"],
  ["caregiver", "/caregiver/alerts", "/caregiver"],
] as const)("keeps %s notification destinations in its role workspace", (role, inbox, base) => {
  expect(alertsInboxUrl(role, 12)).toBe(`${inbox}?alert=12`);
  expect(workflowTasksPath(role)).toBe(`${base}/tasks`);
  expect(staffMessagesPath(role)).toBe(`${base}/messages`);
});
