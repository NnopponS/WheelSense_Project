# app/admin/support/page.tsx

- SupportTab · type · L38-L38 — type SupportTab = "tickets" | "service-requests";
- ServiceRequestFilter · type · L39-L39 — type ServiceRequestFilter = "all" | "open" | "in_progress" | "fulfilled" | "cancelled";
- BadgeVariant · type · L40-L40 — type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>;
- parseError · function · L42-L46 — function parseError(error: unknown, fallback: string)
- statusVariant · function · L48-L61 — function statusVariant(status: string): BadgeVariant
- requestTypeLabelKey · function · L63-L74 — function requestTypeLabelKey(type: string)
- buildPatientLabel · function · L76-L79 — function buildPatientLabel(patient: ListPatientsResponse[number] | undefined)
- Translate · type · L81-L81 — type Translate = (key: TranslationKey) => string;
- ticketStatusLabel · function · L83-L96 — function ticketStatusLabel(status: string, t: Translate): string
- ticketPriorityLabel · function · L98-L111 — function ticketPriorityLabel(priority: string, t: Translate): string
- serviceRequestStatusLabel · function · L113-L126 — function serviceRequestStatusLabel(status: string, t: Translate): string
- AdminSupportPage · function · L128-L649 — function AdminSupportPage()
