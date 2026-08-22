# components/dashboard/RoleQuickActions.tsx

- RoleQuickActionTone · type · L8-L8 — type RoleQuickActionTone = "primary" | "danger" | "warning" | "success" | "neutral";
- RoleQuickAction · type · L10-L17 — type RoleQuickAction = { label: string; description?: string; href?: string; icon: LucideIcon; tone?: RoleQuickActionTone; aiPrompt?: string; };
- openAi · function · L27-L29 — function openAi(prompt?: string)
- ActionInner · function · L31-L48 — function ActionInner({ action }: { action: RoleQuickAction })
- RoleQuickActions · function · L50-L92 — function RoleQuickActions({ title = "Quick actions", actions, className, }: { title?: string; actions: RoleQuickAction[]; className?: string; })
