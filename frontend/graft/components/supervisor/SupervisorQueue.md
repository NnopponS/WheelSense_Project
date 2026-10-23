# components/head-caregiver/head-caregiverQueue.tsx

- QueueItemType · type · L25-L25 — type QueueItemType = "alert" | "task" | "directive";
- QueueItemStatus · type · L27-L27 — type QueueItemStatus = "urgent" | "waiting" | "assigned" | "resolved";
- QueueItem · interface · L29-L40 — interface QueueItem
- QueueAction · interface · L42-L50 — interface QueueAction
- SupervisorQueueProps · interface · L52-L58 — interface SupervisorQueueProps
- SupervisorQueue · function · L60-L461 — function SupervisorQueue({ alerts, tasks, directives, patients, currentUserId, }: SupervisorQueueProps)
- getTypeIcon · function · L285-L294 — getTypeIcon = (type: QueueItemType)
- getPriorityBadge · function · L296-L309 — getPriorityBadge = (priority: string)
- renderQueueSection · function · L311-L398 — renderQueueSection = (title: string, items: QueueItem[], emptyMessage: string, icon: React.ElementType)
