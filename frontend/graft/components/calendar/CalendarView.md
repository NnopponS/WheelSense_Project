# components/calendar/CalendarView.tsx

- CalendarViewMode · type · L35-L35 — type CalendarViewMode = "month" | "week" | "day";
- CalendarEvent · interface · L37-L57 — interface CalendarEvent
- CalendarViewProps · interface · L59-L71 — interface CalendarViewProps
- CalendarView · function · L80-L499 — function CalendarView({ events, viewMode = "month", onViewModeChange, onEventClick, onDateClick, onCreateClick, currentDate: controlledDate, onDateChange, className, showCreateButton = true, readOnly = false, }: CalendarViewProps)
- handleDateChange · function · L99-L105 — handleDateChange = (date: Date)
- handleViewModeChange · function · L107-L113 — handleViewModeChange = (mode: CalendarViewMode)
- navigatePrevious · function · L115-L127 — navigatePrevious = ()
- navigateNext · function · L129-L141 — navigateNext = ()
- navigateToday · function · L143-L145 — navigateToday = ()
- getEventsForDate · function · L149-L151 — getEventsForDate = (date: Date)
- getEventsForHour · function · L153-L160 — getEventsForHour = (date: Date, hour: number)
- renderMonthView · function · L162-L256 — renderMonthView = ()
- renderWeekView · function · L258-L350 — renderWeekView = ()
- renderDayView · function · L352-L434 — renderDayView = ()
