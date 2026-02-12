'use client';

import { useWheelSenseStore } from '@/store';

// ─── Translation Dictionary ──────────────────────────
const translations: Record<string, Record<string, string>> = {
    // ─── Navigation ─────────────
    'nav.monitor': { en: 'Monitor', th: 'ตรวจสอบ' },
    'nav.mapZone': { en: 'Map & Zone', th: 'แผนที่และโซน' },
    'nav.patients': { en: 'Patients', th: 'ผู้ป่วย' },
    'nav.devices': { en: 'Devices', th: 'อุปกรณ์' },
    'nav.analytics': { en: 'Analytics', th: 'วิเคราะห์' },
    'nav.aiAssistant': { en: 'AI Assistant', th: 'AI ผู้ช่วย' },
    'nav.home': { en: 'Home', th: 'หน้าหลัก' },
    'nav.health': { en: 'Health', th: 'สุขภาพ' },
    'nav.schedule': { en: 'Schedule', th: 'ตารางเวลา' },
    'nav.timeline': { en: 'Timeline', th: 'ไทม์ไลน์' },
    'nav.aiChat': { en: 'AI Chat', th: 'AI แชท' },
    'nav.notifications': { en: 'Notifications', th: 'การแจ้งเตือน' },
    'nav.alerts': { en: 'Alerts', th: 'แจ้งเตือน' },

    // ─── Sections ─────────────
    'section.main': { en: 'MAIN', th: 'หลัก' },
    'section.ai': { en: 'AI', th: 'AI' },

    // ─── Roles ─────────────
    'role.admin': { en: 'Admin', th: 'ผู้ดูแล' },
    'role.user': { en: 'User', th: 'ผู้ใช้' },
    'role.adminDashboard': { en: 'Admin Dashboard', th: 'แดชบอร์ดผู้ดูแล' },
    'role.userPortal': { en: 'User Portal', th: 'พอร์ทัลผู้ใช้' },

    // ─── Common ─────────────
    'common.loading': { en: 'Loading...', th: 'กำลังโหลด...' },
    'common.noData': { en: 'No data available', th: 'ไม่มีข้อมูล' },
    'common.search': { en: 'Search', th: 'ค้นหา' },
    'common.save': { en: 'Save', th: 'บันทึก' },
    'common.cancel': { en: 'Cancel', th: 'ยกเลิก' },
    'common.delete': { en: 'Delete', th: 'ลบ' },
    'common.edit': { en: 'Edit', th: 'แก้ไข' },
    'common.add': { en: 'Add', th: 'เพิ่ม' },
    'common.close': { en: 'Close', th: 'ปิด' },
    'common.confirm': { en: 'Confirm', th: 'ยืนยัน' },
    'common.status': { en: 'Status', th: 'สถานะ' },
    'common.active': { en: 'Active', th: 'ใช้งาน' },
    'common.inactive': { en: 'Inactive', th: 'ไม่ใช้งาน' },
    'common.online': { en: 'Online', th: 'ออนไลน์' },
    'common.offline': { en: 'Offline', th: 'ออฟไลน์' },
    'common.all': { en: 'All', th: 'ทั้งหมด' },
    'common.name': { en: 'Name', th: 'ชื่อ' },
    'common.type': { en: 'Type', th: 'ประเภท' },
    'common.room': { en: 'Room', th: 'ห้อง' },
    'common.floor': { en: 'Floor', th: 'ชั้น' },
    'common.building': { en: 'Building', th: 'อาคาร' },
    'common.actions': { en: 'Actions', th: 'ดำเนินการ' },
    'common.details': { en: 'Details', th: 'รายละเอียด' },
    'common.back': { en: 'Back', th: 'กลับ' },
    'common.send': { en: 'Send', th: 'ส่ง' },
    'common.refresh': { en: 'Refresh', th: 'รีเฟรช' },
    'common.total': { en: 'Total', th: 'ทั้งหมด' },
    'common.today': { en: 'Today', th: 'วันนี้' },
    'common.yesterday': { en: 'Yesterday', th: 'เมื่อวาน' },
    'common.noResults': { en: 'No results found', th: 'ไม่พบผลลัพธ์' },

    // ─── Time ─────────────
    'time.justNow': { en: 'Just now', th: 'เมื่อสักครู่' },
    'time.minutesAgo': { en: '{n} minutes ago', th: '{n} นาทีที่แล้ว' },
    'time.hoursAgo': { en: '{n} hours ago', th: '{n} ชั่วโมงที่แล้ว' },
    'time.daysAgo': { en: '{n} days ago', th: '{n} วันที่แล้ว' },

    // ─── TopBar ─────────────
    'topbar.searchPlaceholder': { en: 'Search Patient, Wheelchair, Room...', th: 'ค้นหาผู้ป่วย, รถเข็น, ห้อง...' },
    'topbar.notifications': { en: 'Notifications', th: 'การแจ้งเตือน' },
    'topbar.markAllRead': { en: 'Mark All Read', th: 'อ่านทั้งหมด' },
    'topbar.noNotifications': { en: 'No notifications', th: 'ไม่มีการแจ้งเตือน' },

    // ─── Admin: Monitoring ─────────────
    'admin.monitoring.title': { en: 'Live Monitoring', th: 'ตรวจสอบสด' },
    'admin.monitoring.subtitle': { en: 'Real-time wheelchair tracking and building overview', th: 'ติดตามรถเข็นแบบเรียลไทม์และภาพรวมอาคาร' },
    'admin.monitoring.activeWheelchairs': { en: 'Active Wheelchairs', th: 'รถเข็นที่ใช้งาน' },
    'admin.monitoring.totalPatients': { en: 'Total Patients', th: 'ผู้ป่วยทั้งหมด' },
    'admin.monitoring.onlineNodes': { en: 'Online Nodes', th: 'โหนดออนไลน์' },
    'admin.monitoring.activeAlerts': { en: 'Active Alerts', th: 'การแจ้งเตือนที่ใช้งาน' },
    'admin.monitoring.floorMap': { en: 'Floor Map', th: 'แผนผังชั้น' },
    'admin.monitoring.wheelchairList': { en: 'Wheelchair List', th: 'รายการรถเข็น' },
    'admin.monitoring.nodeStatus': { en: 'Node Status', th: 'สถานะโหนด' },
    'admin.monitoring.sendAlert': { en: 'Send Alert', th: 'ส่งการแจ้งเตือน' },
    'admin.monitoring.emergency': { en: 'Emergency', th: 'ฉุกเฉิน' },
    'admin.monitoring.noRoom': { en: 'Unknown Room', th: 'ไม่ทราบห้อง' },
    'admin.monitoring.roomAppliances': { en: 'Room Appliances', th: 'เครื่องใช้ในห้อง' },
    'admin.monitoring.alertMessage': { en: 'Alert Message', th: 'ข้อความแจ้งเตือน' },
    'admin.monitoring.selectPatient': { en: 'Select Patient', th: 'เลือกผู้ป่วย' },
    'admin.monitoring.filterAll': { en: 'All', th: 'ทั้งหมด' },
    'admin.monitoring.filterOnline': { en: 'Online', th: 'ออนไลน์' },
    'admin.monitoring.filterOffline': { en: 'Offline', th: 'ออฟไลน์' },

    // ─── Admin: Map & Zone ─────────────
    'admin.mapZone.title': { en: 'Map & Zone Management', th: 'จัดการแผนที่และโซน' },
    'admin.mapZone.subtitle': { en: 'Configure buildings, floors, and rooms', th: 'ตั้งค่าอาคาร ชั้น และห้อง' },
    'admin.mapZone.addBuilding': { en: 'Add Building', th: 'เพิ่มอาคาร' },
    'admin.mapZone.addFloor': { en: 'Add Floor', th: 'เพิ่มชั้น' },
    'admin.mapZone.addRoom': { en: 'Add Room', th: 'เพิ่มห้อง' },
    'admin.mapZone.editRoom': { en: 'Edit Room', th: 'แก้ไขห้อง' },
    'admin.mapZone.roomName': { en: 'Room Name', th: 'ชื่อห้อง' },
    'admin.mapZone.roomType': { en: 'Room Type', th: 'ประเภทห้อง' },
    'admin.mapZone.coordinates': { en: 'Coordinates', th: 'พิกัด' },
    'admin.mapZone.dimensions': { en: 'Dimensions', th: 'ขนาด' },

    // ─── Admin: Patients ─────────────
    'admin.patients.title': { en: 'Patient Management', th: 'จัดการผู้ป่วย' },
    'admin.patients.subtitle': { en: 'Monitor and manage patient profiles', th: 'ตรวจสอบและจัดการข้อมูลผู้ป่วย' },
    'admin.patients.addPatient': { en: 'Add Patient', th: 'เพิ่มผู้ป่วย' },
    'admin.patients.totalPatients': { en: 'Total Patients', th: 'ผู้ป่วยทั้งหมด' },
    'admin.patients.withWheelchair': { en: 'With Wheelchair', th: 'มีรถเข็น' },
    'admin.patients.noPatients': { en: 'No patients found', th: 'ไม่พบผู้ป่วย' },
    'admin.patients.assignWheelchair': { en: 'Assign Wheelchair', th: 'กำหนดรถเข็น' },
    'admin.patients.viewDetails': { en: 'View Details', th: 'ดูรายละเอียด' },
    'admin.patients.healthScore': { en: 'Health Score', th: 'คะแนนสุขภาพ' },
    'admin.patients.age': { en: 'Age', th: 'อายุ' },
    'admin.patients.condition': { en: 'Condition', th: 'อาการ' },
    'admin.patients.notes': { en: 'Notes', th: 'บันทึก' },

    // ─── Admin: Devices ─────────────
    'admin.devices.title': { en: 'Device Management', th: 'จัดการอุปกรณ์' },
    'admin.devices.subtitle': { en: 'Manage nodes and wheelchairs', th: 'จัดการโหนดและรถเข็น' },
    'admin.devices.nodes': { en: 'Nodes', th: 'โหนด' },
    'admin.devices.wheelchairs': { en: 'Wheelchairs', th: 'รถเข็น' },
    'admin.devices.addNode': { en: 'Add Node', th: 'เพิ่มโหนด' },
    'admin.devices.addWheelchair': { en: 'Add Wheelchair', th: 'เพิ่มรถเข็น' },
    'admin.devices.totalNodes': { en: 'Total Nodes', th: 'โหนดทั้งหมด' },
    'admin.devices.onlineNodes': { en: 'Online', th: 'ออนไลน์' },
    'admin.devices.totalWheelchairs': { en: 'Total Wheelchairs', th: 'รถเข็นทั้งหมด' },
    'admin.devices.battery': { en: 'Battery', th: 'แบตเตอรี่' },
    'admin.devices.rssi': { en: 'Signal (RSSI)', th: 'สัญญาณ (RSSI)' },
    'admin.devices.lastSeen': { en: 'Last Seen', th: 'เห็นล่าสุด' },

    // ─── Admin: Analytics ─────────────
    'admin.analytics.title': { en: 'Analytics Dashboard', th: 'แดชบอร์ดวิเคราะห์' },
    'admin.analytics.subtitle': { en: 'System performance and usage statistics', th: 'ประสิทธิภาพระบบและสถิติการใช้งาน' },
    'admin.analytics.overview': { en: 'Overview', th: 'ภาพรวม' },
    'admin.analytics.roomUsage': { en: 'Room Usage', th: 'การใช้งานห้อง' },
    'admin.analytics.patientActivity': { en: 'Patient Activity', th: 'กิจกรรมผู้ป่วย' },
    'admin.analytics.systemHealth': { en: 'System Health', th: 'สุขภาพระบบ' },
    'admin.analytics.dailyEvents': { en: 'Daily Events', th: 'เหตุการณ์รายวัน' },
    'admin.analytics.avgHealthScore': { en: 'Avg Health Score', th: 'คะแนนสุขภาพเฉลี่ย' },
    'admin.analytics.activePatients': { en: 'Active Patients', th: 'ผู้ป่วยที่ใช้งาน' },

    // ─── Admin: AI ─────────────
    'admin.ai.title': { en: 'AI Assistant', th: 'ผู้ช่วย AI' },
    'admin.ai.subtitle': { en: 'Intelligent system management and insights', th: 'การจัดการระบบอัจฉริยะและข้อมูลเชิงลึก' },
    'admin.ai.newChat': { en: 'New Chat', th: 'แชทใหม่' },
    'admin.ai.sessions': { en: 'Sessions', th: 'เซสชัน' },
    'admin.ai.askAnything': { en: 'Ask anything about the system...', th: 'ถามอะไรก็ได้เกี่ยวกับระบบ...' },
    'admin.ai.tools': { en: 'Tools', th: 'เครื่องมือ' },
    'admin.ai.thinking': { en: 'AI is thinking...', th: 'AI กำลังคิด...' },
    'admin.ai.connectionStatus': { en: 'Connection Status', th: 'สถานะการเชื่อมต่อ' },

    // ─── User: Home ─────────────
    'user.home.title': { en: 'Welcome Home', th: 'ยินดีต้อนรับ' },
    'user.home.welcomeBack': { en: 'Welcome back', th: 'ยินดีต้อนรับกลับ' },
    'user.home.currentLocation': { en: 'Current Location', th: 'ตำแหน่งปัจจุบัน' },
    'user.home.noLocation': { en: 'Location not detected', th: 'ตรวจไม่พบตำแหน่ง' },
    'user.home.todaySchedule': { en: "Today's Schedule", th: 'ตารางวันนี้' },
    'user.home.noSchedule': { en: 'No schedule for today', th: 'ไม่มีตารางวันนี้' },
    'user.home.quickActions': { en: 'Quick Actions', th: 'ดำเนินการด่วน' },
    'user.home.roomControls': { en: 'Room Controls', th: 'ควบคุมห้อง' },
    'user.home.noAppliances': { en: 'No appliances available', th: 'ไม่มีเครื่องใช้ไฟฟ้า' },
    'user.home.speed': { en: 'Speed', th: 'ความเร็ว' },
    'user.home.distance': { en: 'Distance', th: 'ระยะทาง' },

    // ─── User: Health ─────────────
    'user.health.title': { en: 'Health Dashboard', th: 'แดชบอร์ดสุขภาพ' },
    'user.health.subtitle': { en: 'Your health overview and recommendations', th: 'ภาพรวมสุขภาพและคำแนะนำ' },
    'user.health.currentScore': { en: 'Current Health Score', th: 'คะแนนสุขภาพปัจจุบัน' },
    'user.health.scoreHistory': { en: 'Score History', th: 'ประวัติคะแนน' },
    'user.health.components': { en: 'Score Components', th: 'องค์ประกอบคะแนน' },
    'user.health.recommendations': { en: 'AI Recommendations', th: 'คำแนะนำ AI' },
    'user.health.noScore': { en: 'No health score yet', th: 'ยังไม่มีคะแนนสุขภาพ' },
    'user.health.connectivity': { en: 'Connectivity', th: 'การเชื่อมต่อ' },
    'user.health.activity': { en: 'Activity', th: 'กิจกรรม' },
    'user.health.routines': { en: 'Routines', th: 'กิจวัตร' },
    'user.health.alerts': { en: 'Alerts', th: 'การแจ้งเตือน' },
    'user.health.diversity': { en: 'Diversity', th: 'ความหลากหลาย' },
    'user.health.calculateScore': { en: 'Calculate Score', th: 'คำนวณคะแนน' },
    'user.health.excellent': { en: 'Excellent', th: 'ยอดเยี่ยม' },
    'user.health.good': { en: 'Good', th: 'ดี' },
    'user.health.fair': { en: 'Fair', th: 'พอใช้' },
    'user.health.poor': { en: 'Poor', th: 'แย่' },

    // ─── User: Schedule ─────────────
    'user.schedule.title': { en: 'My Schedule', th: 'ตารางเวลาของฉัน' },
    'user.schedule.subtitle': { en: 'Manage your daily routines', th: 'จัดการกิจวัตรประจำวัน' },
    'user.schedule.addRoutine': { en: 'Add Routine', th: 'เพิ่มกิจวัตร' },
    'user.schedule.noRoutines': { en: 'No routines set', th: 'ยังไม่มีกิจวัตร' },
    'user.schedule.routineName': { en: 'Routine Name', th: 'ชื่อกิจวัตร' },
    'user.schedule.time': { en: 'Time', th: 'เวลา' },
    'user.schedule.days': { en: 'Days', th: 'วัน' },
    'user.schedule.enabled': { en: 'Enabled', th: 'เปิดใช้งาน' },
    'user.schedule.disabled': { en: 'Disabled', th: 'ปิดใช้งาน' },
    'user.schedule.daily': { en: 'Daily', th: 'ทุกวัน' },
    'user.schedule.weekdays': { en: 'Weekdays', th: 'วันธรรมดา' },
    'user.schedule.weekends': { en: 'Weekends', th: 'วันหยุดสุดสัปดาห์' },

    // ─── User: Timeline ─────────────
    'user.timeline.title': { en: 'Activity Timeline', th: 'ไทม์ไลน์กิจกรรม' },
    'user.timeline.subtitle': { en: 'Your daily room history', th: 'ประวัติห้องรายวัน' },
    'user.timeline.noEvents': { en: 'No events for this date', th: 'ไม่มีเหตุการณ์ในวันนี้' },
    'user.timeline.roomChange': { en: 'Room Change', th: 'เปลี่ยนห้อง' },
    'user.timeline.entered': { en: 'Entered', th: 'เข้า' },
    'user.timeline.exited': { en: 'Exited', th: 'ออก' },
    'user.timeline.selectDate': { en: 'Select Date', th: 'เลือกวันที่' },
    'user.timeline.events': { en: 'events', th: 'เหตุการณ์' },

    // ─── User: AI Chat ─────────────
    'user.aiChat.title': { en: 'AI Health Assistant', th: 'ผู้ช่วยสุขภาพ AI' },
    'user.aiChat.subtitle': { en: 'Ask about your health and environment', th: 'ถามเกี่ยวกับสุขภาพและสภาพแวดล้อม' },
    'user.aiChat.placeholder': { en: 'Type your message...', th: 'พิมพ์ข้อความ...' },
    'user.aiChat.thinking': { en: 'Thinking...', th: 'กำลังคิด...' },
    'user.aiChat.greeting': { en: 'How can I help you today?', th: 'วันนี้ช่วยอะไรได้บ้างคะ?' },

    // ─── User: Notifications ─────────────
    'user.notifications.title': { en: 'Notifications', th: 'การแจ้งเตือน' },
    'user.notifications.subtitle': { en: 'Your alerts and messages', th: 'การแจ้งเตือนและข้อความ' },
    'user.notifications.noNotifications': { en: 'No notifications yet', th: 'ยังไม่มีการแจ้งเตือน' },
    'user.notifications.markAllRead': { en: 'Mark All Read', th: 'อ่านทั้งหมด' },
    'user.notifications.unread': { en: 'Unread', th: 'ยังไม่อ่าน' },
    'user.notifications.read': { en: 'Read', th: 'อ่านแล้ว' },
    'user.notifications.clearAll': { en: 'Clear All', th: 'ลบทั้งหมด' },

    // ─── Wheelchair ─────────────
    'wheelchair.status.online': { en: 'Online', th: 'เชื่อมต่อ' },
    'wheelchair.status.offline': { en: 'Offline', th: 'ไม่เชื่อมต่อ' },
    'wheelchair.status.stale': { en: 'Stale', th: 'ค้าง' },
    'wheelchair.speed': { en: 'Speed', th: 'ความเร็ว' },
    'wheelchair.battery': { en: 'Battery', th: 'แบตเตอรี่' },
    'wheelchair.patient': { en: 'Patient', th: 'ผู้ป่วย' },
    'wheelchair.currentRoom': { en: 'Current Room', th: 'ห้องปัจจุบัน' },

    // ─── Alert Types ─────────────
    'alert.info': { en: 'Info', th: 'ข้อมูล' },
    'alert.warning': { en: 'Warning', th: 'คำเตือน' },
    'alert.emergency': { en: 'Emergency', th: 'ฉุกเฉิน' },
    'alert.resolved': { en: 'Resolved', th: 'แก้ไขแล้ว' },
    'alert.resolve': { en: 'Resolve', th: 'แก้ไข' },

    // ─── Days of Week ─────────────
    'day.mon': { en: 'Mon', th: 'จ.' },
    'day.tue': { en: 'Tue', th: 'อ.' },
    'day.wed': { en: 'Wed', th: 'พ.' },
    'day.thu': { en: 'Thu', th: 'พฤ.' },
    'day.fri': { en: 'Fri', th: 'ศ.' },
    'day.sat': { en: 'Sat', th: 'ส.' },
    'day.sun': { en: 'Sun', th: 'อา.' },

    // ─── Admin: Dashboard ─────────────
    'admin.dashboard.title': { en: 'System Dashboard', th: 'แดชบอร์ดระบบ' },
    'admin.dashboard.systemOverview': { en: 'System Overview', th: 'ภาพรวมระบบ' },
    'admin.dashboard.totalPatients': { en: 'Total Patients', th: 'ผู้ป่วยทั้งหมด' },
    'admin.dashboard.activeWheelchairs': { en: 'Active Wheelchairs', th: 'รถเข็นที่ใช้งาน' },
    'admin.dashboard.onlineNodes': { en: 'Online Nodes', th: 'โหนดออนไลน์' },
    'admin.dashboard.pendingAlerts': { en: 'Pending Alerts', th: 'การแจ้งเตือนรอดำเนินการ' },
    'admin.dashboard.systemStatus': { en: 'System Status', th: 'สถานะระบบ' },
    'admin.dashboard.mqtt': { en: 'MQTT Broker', th: 'MQTT Broker' },
    'admin.dashboard.homeAssistant': { en: 'Home Assistant', th: 'Home Assistant' },
    'admin.dashboard.database': { en: 'Database', th: 'ฐานข้อมูล' },
    'admin.dashboard.connected': { en: 'Connected', th: 'เชื่อมต่อ' },
    'admin.dashboard.disconnected': { en: 'Disconnected', th: 'ไม่เชื่อมต่อ' },
    'admin.dashboard.recentActivity': { en: 'Recent Activity', th: 'กิจกรรมล่าสุด' },
    'admin.dashboard.noActivity': { en: 'No recent activity', th: 'ไม่มีกิจกรรมล่าสุด' },
    'admin.dashboard.wheelchairOverview': { en: 'Wheelchair Overview', th: 'ภาพรวมรถเข็น' },
    'admin.dashboard.patient': { en: 'Patient', th: 'ผู้ป่วย' },
    'admin.dashboard.wheelchair': { en: 'Wheelchair', th: 'รถเข็น' },
    'admin.dashboard.location': { en: 'Location', th: 'ตำแหน่ง' },
    'admin.dashboard.battery': { en: 'Battery', th: 'แบตเตอรี่' },
    'admin.dashboard.signal': { en: 'Signal', th: 'สัญญาณ' },
    'admin.dashboard.noWheelchairs': { en: 'No wheelchairs found', th: 'ไม่พบรถเข็น' },

    // ─── Admin: Appliances ─────────────
    'admin.appliances.title': { en: 'Smart Home Control', th: 'ควบคุมบ้านอัจฉริยะ' },
    'admin.appliances.subtitle': { en: 'Control smart home devices via Home Assistant', th: 'ควบคุมอุปกรณ์บ้านอัจฉริยะผ่าน Home Assistant' },
    'admin.appliances.selectRoom': { en: 'Select Room', th: 'เลือกห้อง' },
    'admin.appliances.allRooms': { en: 'All Rooms', th: 'ทุกห้อง' },
    'admin.appliances.noAppliances': { en: 'No appliances available', th: 'ไม่มีเครื่องใช้ไฟฟ้า' },
    'admin.appliances.connectHA': { en: 'Connect Home Assistant to control your smart devices', th: 'เชื่อมต่อ Home Assistant เพื่อควบคุมอุปกรณ์อัจฉริยะ' },
    'admin.appliances.on': { en: 'ON', th: 'เปิด' },
    'admin.appliances.off': { en: 'OFF', th: 'ปิด' },
    'admin.appliances.brightness': { en: 'Brightness', th: 'ความสว่าง' },
    'admin.appliances.lastChanged': { en: 'Last changed', th: 'เปลี่ยนล่าสุด' },
    'admin.appliances.turnOn': { en: 'Turn On', th: 'เปิด' },
    'admin.appliances.turnOff': { en: 'Turn Off', th: 'ปิด' },

    // ─── User: Settings ─────────────
    'user.settings.title': { en: 'Settings', th: 'ตั้งค่า' },
    'user.settings.subtitle': { en: 'Customize your experience', th: 'ปรับแต่งตามที่ต้องการ' },
    'user.settings.notifications': { en: 'Notifications', th: 'การแจ้งเตือน' },
    'user.settings.enableNotifications': { en: 'Enable push notifications', th: 'เปิดการแจ้งเตือน' },
    'user.settings.darkMode': { en: 'Dark Mode', th: 'โหมดมืด' },
    'user.settings.useDarkTheme': { en: 'Use dark theme', th: 'ใช้ธีมมืด' },
    'user.settings.language': { en: 'Language', th: 'ภาษา' },
    'user.settings.appLanguage': { en: 'App language', th: 'ภาษาแอป' },
    'user.settings.about': { en: 'About', th: 'เกี่ยวกับ' },
    'user.settings.privacyPolicy': { en: 'Privacy Policy', th: 'นโยบายความเป็นส่วนตัว' },
    'user.settings.helpCenter': { en: 'Help Center', th: 'ศูนย์ช่วยเหลือ' },
    'user.settings.version': { en: 'Version', th: 'เวอร์ชัน' },

    // ─── User: Appliances ─────────────
    'user.appliances.title': { en: 'Smart Controls', th: 'ควบคุมอัจฉริยะ' },
    'user.appliances.subtitle': { en: 'Control your smart home devices', th: 'ควบคุมอุปกรณ์บ้านอัจฉริยะ' },
    'user.appliances.noAppliances': { en: 'No appliances found', th: 'ไม่พบเครื่องใช้ไฟฟ้า' },
    'user.appliances.on': { en: 'ON', th: 'เปิด' },
    'user.appliances.off': { en: 'OFF', th: 'ปิด' },

    // ─── Patient Detail Tabs ─────────────
    'patient.tab.info': { en: 'Info', th: 'ข้อมูล' },
    'patient.tab.realtime': { en: 'Real-time', th: 'เรียลไทม์' },
    'patient.tab.routines': { en: 'Routines', th: 'กิจวัตร' },
    'patient.tab.analytics': { en: 'Analytics', th: 'วิเคราะห์' },
    'patient.tab.timeline': { en: 'Timeline', th: 'ไทม์ไลน์' },
    'patient.details': { en: 'Patient Details', th: 'รายละเอียดผู้ป่วย' },
    'patient.nameEN': { en: 'Name (EN)', th: 'ชื่อ (อังกฤษ)' },
    'patient.nameTH': { en: 'Name (TH)', th: 'ชื่อ (ไทย)' },
    'patient.wheelchair': { en: 'Wheelchair', th: 'รถเข็น' },
    'patient.notAssigned': { en: 'Not assigned', th: 'ยังไม่กำหนด' },
    'patient.realtimeData': { en: 'Real-time Wheelchair Data', th: 'ข้อมูลรถเข็นเรียลไทม์' },
    'patient.noWheelchair': { en: 'No wheelchair assigned', th: 'ยังไม่มีรถเข็น' },
    'patient.createPatient': { en: 'Create Patient', th: 'สร้างผู้ป่วย' },
    'patient.calculateNow': { en: 'Calculate Now', th: 'คำนวณเดี๋ยวนี้' },
    'patient.noScoresYet': { en: 'No health scores yet', th: 'ยังไม่มีคะแนนสุขภาพ' },
    'patient.generateScores': { en: 'Click "Calculate Now" to generate', th: 'กด "คำนวณเดี๋ยวนี้" เพื่อสร้าง' },
    'patient.noEvents': { en: 'No events', th: 'ไม่มีเหตุการณ์' },
    'patient.noRoutines': { en: 'No routines', th: 'ไม่มีกิจวัตร' },
    'patient.searchPatients': { en: 'Search patients...', th: 'ค้นหาผู้ป่วย...' },
    'patient.deleteConfirm': { en: 'Delete this patient?', th: 'ลบผู้ป่วยนี้?' },
    'patient.noCondition': { en: 'No condition', th: 'ไม่มีอาการ' },
    'patient.noWheelchairAssigned': { en: 'No wheelchair', th: 'ไม่มีรถเข็น' },
    'patient.gender': { en: 'Gender', th: 'เพศ' },
    'patient.gender.male': { en: 'Male', th: 'ชาย' },
    'patient.gender.female': { en: 'Female', th: 'หญิง' },
    'patient.gender.other': { en: 'Other', th: 'อื่นๆ' },

    // ─── Device Management Detail ─────────────
    'device.searchDevices': { en: 'Search devices...', th: 'ค้นหาอุปกรณ์...' },
    'device.deviceName': { en: 'Device Name', th: 'ชื่ออุปกรณ์' },
    'device.roomId': { en: 'Room ID', th: 'รหัสห้อง' },
    'device.cameraAngle': { en: 'Camera Angle', th: 'มุมกล้อง' },
    'device.unassigned': { en: 'Unassigned', th: 'ยังไม่กำหนด' },
    'device.never': { en: 'Never', th: 'ไม่เคย' },
    'device.noDevicesFound': { en: 'No devices found', th: 'ไม่พบอุปกรณ์' },

    // ─── AI Chat ─────────────
    'ai.newChat': { en: 'New Chat', th: 'แชทใหม่' },
    'ai.untitled': { en: 'Untitled', th: 'ไม่มีชื่อ' },
    'ai.adminAssistant': { en: 'Admin AI Assistant', th: 'ผู้ช่วย AI ผู้ดูแล' },
    'ai.assistantDesc': { en: 'Create a new chat or select an existing session. Query any patient data, system status, or analytics.', th: 'สร้างแชทใหม่หรือเลือกเซสชันที่มี สอบถามข้อมูลผู้ป่วย สถานะระบบ หรือวิเคราะห์' },
    'ai.askPlaceholder': { en: 'Ask about patients, system status, analytics...', th: 'ถามเกี่ยวกับผู้ป่วย สถานะระบบ วิเคราะห์...' },
    'ai.actions': { en: 'Actions', th: 'การดำเนินการ' },
    'ai.smartHomeAssistant': { en: 'Smart Home Assistant', th: 'ผู้ช่วยบ้านอัจฉริยะ' },

    // ─── Analytics Detail ─────────────
    'analytics.systemSummary': { en: 'System Summary', th: 'สรุประบบ' },
    'analytics.byBuilding': { en: 'By Building', th: 'ตามอาคาร' },
    'analytics.byFloor': { en: 'By Floor', th: 'ตามชั้น' },
    'analytics.selectBuilding': { en: 'Select Building', th: 'เลือกอาคาร' },
    'analytics.selectFloor': { en: 'Select Floor', th: 'เลือกชั้น' },
    'analytics.totalPatients': { en: 'Total Patients', th: 'ผู้ป่วยทั้งหมด' },
    'analytics.activeWheelchairs': { en: 'Active Wheelchairs', th: 'รถเข็นที่ใช้งาน' },
    'analytics.onlineNodes': { en: 'Online Nodes', th: 'โหนดออนไลน์' },
    'analytics.unresolvedAlerts': { en: 'Unresolved Alerts', th: 'การแจ้งเตือนยังไม่แก้ไข' },
    'analytics.avgHealthScore': { en: 'Avg Health Score', th: 'คะแนนสุขภาพเฉลี่ย' },
    'analytics.alertSummary': { en: 'Alert Summary', th: 'สรุปการแจ้งเตือน' },
    'analytics.totalAlerts': { en: 'Total Alerts', th: 'การแจ้งเตือนทั้งหมด' },
    'analytics.unresolved': { en: 'Unresolved', th: 'ยังไม่แก้ไข' },
    'analytics.buildingAnalytics': { en: 'Building Analytics', th: 'วิเคราะห์อาคาร' },
    'analytics.floorAnalytics': { en: 'Floor Analytics', th: 'วิเคราะห์ชั้น' },
    'analytics.roomUsageLast7': { en: 'Room Usage (Last 7 days)', th: 'การใช้ห้อง (7 วันที่ผ่านมา)' },
    'analytics.visits': { en: 'visits', th: 'ครั้ง' },

    // ─── Short-form Keys (user pages) ─────────────
    // Common extras
    'common.unknown': { en: 'Unknown', th: 'ไม่ทราบ' },
    'common.update': { en: 'Update', th: 'อัปเดต' },
    'common.create': { en: 'Create', th: 'สร้าง' },
    'common.user': { en: 'User', th: 'ผู้ใช้' },

    // Home
    'home.welcome': { en: 'Welcome', th: 'ยินดีต้อนรับ' },
    'home.youAreIn': { en: 'You are in', th: 'คุณอยู่ใน' },
    'home.locationUnknown': { en: 'Location not detected', th: 'ตรวจไม่พบตำแหน่ง' },
    'home.yourLocation': { en: 'Your Location', th: 'ตำแหน่งของคุณ' },
    'home.currentActivity': { en: 'Current Activity', th: 'กิจกรรมปัจจุบัน' },
    'home.noActivity': { en: 'No current activity', th: 'ไม่มีกิจกรรมขณะนี้' },
    'home.nextUp': { en: 'Next Up', th: 'ถัดไป' },
    'home.noMoreActivities': { en: 'No more activities today', th: 'ไม่มีกิจกรรมเพิ่มเติมวันนี้' },
    'home.todaySchedule': { en: "Today's Schedule", th: 'ตารางวันนี้' },
    'home.noRoutines': { en: 'No routines for today', th: 'ไม่มีกิจวัตรวันนี้' },
    'home.roomControls': { en: 'Room Controls', th: 'ควบคุมห้อง' },
    'home.noAppliances': { en: 'No appliances in this room', th: 'ไม่มีอุปกรณ์ในห้องนี้' },

    // Health
    'health.title': { en: 'Health Overview', th: 'ภาพรวมสุขภาพ' },
    'health.healthScore': { en: 'Health Score', th: 'คะแนนสุขภาพ' },
    'health.recalculate': { en: 'Recalculate', th: 'คำนวณใหม่' },
    'health.distanceToday': { en: 'Distance Today', th: 'ระยะทางวันนี้' },
    'health.currentSpeed': { en: 'Current Speed', th: 'ความเร็วปัจจุบัน' },
    'health.heartRate': { en: 'Heart Rate', th: 'อัตราการเต้นหัวใจ' },
    'health.signalStrength': { en: 'Signal Strength', th: 'ความแรงสัญญาณ' },
    'health.scoreComponents': { en: 'Score Components', th: 'องค์ประกอบคะแนน' },
    'health.history': { en: 'Health History', th: 'ประวัติสุขภาพ' },
    'health.noHistory': { en: 'No history yet', th: 'ยังไม่มีประวัติ' },

    // Settings
    'settings.title': { en: 'Settings', th: 'ตั้งค่า' },
    'settings.subtitle': { en: 'Customise your experience', th: 'ปรับแต่งประสบการณ์ของคุณ' },
    'settings.preferences': { en: 'Preferences', th: 'การตั้งค่า' },
    'settings.notifications': { en: 'Notifications', th: 'การแจ้งเตือน' },
    'settings.notificationsDesc': { en: 'Receive push notifications for alerts', th: 'รับการแจ้งเตือนแบบพุชสำหรับการเตือนภัย' },
    'settings.darkMode': { en: 'Dark Mode', th: 'โหมดมืด' },
    'settings.darkModeDesc': { en: 'Switch between light and dark themes', th: 'สลับระหว่างธีมสว่างและมืด' },
    'settings.language': { en: 'Language', th: 'ภาษา' },
    'settings.languageDesc': { en: 'Choose your preferred language', th: 'เลือกภาษาที่ต้องการ' },
    'settings.security': { en: 'Security', th: 'ความปลอดภัย' },
    'settings.changePassword': { en: 'Change Password', th: 'เปลี่ยนรหัสผ่าน' },
    'settings.privacy': { en: 'Privacy Settings', th: 'ตั้งค่าความเป็นส่วนตัว' },
    'settings.about': { en: 'About', th: 'เกี่ยวกับ' },
    'settings.smartIndoor': { en: 'Smart Indoor Monitoring for Wheelchair Users', th: 'ระบบตรวจสอบภายในอาคารอัจฉริยะสำหรับผู้ใช้รถเข็น' },

    // Schedule
    'schedule.title': { en: 'My Schedule', th: 'ตารางเวลาของฉัน' },
    'schedule.addRoutine': { en: 'Add Routine', th: 'เพิ่มกิจวัตร' },
    'schedule.editRoutine': { en: 'Edit Routine', th: 'แก้ไขกิจวัตร' },
    'schedule.newRoutine': { en: 'New Routine', th: 'กิจวัตรใหม่' },
    'schedule.titlePlaceholder': { en: 'Title', th: 'ชื่อ' },
    'schedule.descPlaceholder': { en: 'Description (optional)', th: 'คำอธิบาย (ไม่จำเป็น)' },
    'schedule.noRoutines': { en: 'No routines', th: 'ไม่มีกิจวัตร' },
    'schedule.addFirstRoutine': { en: 'Add your first routine to get started.', th: 'เพิ่มกิจวัตรแรกของคุณเพื่อเริ่มต้น' },

    // Timeline
    'timeline.title': { en: 'Timeline', th: 'ไทม์ไลน์' },
    'timeline.noEvents': { en: 'No events on this day', th: 'ไม่มีเหตุการณ์ในวันนี้' },
    'timeline.tryDifferentDate': { en: 'Try selecting a different date.', th: 'ลองเลือกวันอื่น' },
    'timeline.entered': { en: 'Entered', th: 'เข้า' },
    'timeline.exited': { en: 'Exited', th: 'ออก' },

    // AI Chat
    'aiChat.newChat': { en: 'New Chat', th: 'แชทใหม่' },
    'aiChat.placeholder': { en: 'Ask about your health, schedule, location...', th: 'ถามเกี่ยวกับสุขภาพ, ตารางเวลา, ตำแหน่ง...' },
    'aiChat.title': { en: 'AI Chat', th: 'แชท AI' },
    'aiChat.startNewChat': { en: 'Start a new chat to ask about your health, schedule, or location.', th: 'เริ่มแชทใหม่เพื่อถามเกี่ยวกับสุขภาพ ตารางเวลา หรือตำแหน่ง' },

    // Notifications
    'notifications.title': { en: 'Notifications', th: 'การแจ้งเตือน' },
    'notifications.tabNotifications': { en: 'Notifications', th: 'การแจ้งเตือน' },
    'notifications.tabAlerts': { en: 'Alerts', th: 'แจ้งเตือนภัย' },
    'notifications.noNotifications': { en: 'No notifications', th: 'ไม่มีการแจ้งเตือน' },
    'notifications.noAlerts': { en: 'No active alerts', th: 'ไม่มีการแจ้งเตือนภัย' },
    'notifications.resolve': { en: 'Resolve', th: 'แก้ไข' },
};

// ─── Hook ──────────────────────────
export function useTranslation() {
    const language = useWheelSenseStore((s) => s.language);

    const t = (key: string, vars?: Record<string, string | number>): string => {
        const entry = translations[key];
        if (!entry) return key;
        let text = entry[language] || entry['en'] || key;
        if (vars) {
            Object.entries(vars).forEach(([k, v]) => {
                text = text.replace(`{${k}}`, String(v));
            });
        }
        return text;
    };

    return { t, language };
}

// Non-hook version for use in nav constants etc.
export function getTranslation(language: 'en' | 'th', key: string, vars?: Record<string, string | number>): string {
    const entry = translations[key];
    if (!entry) return key;
    let text = entry[language] || entry['en'] || key;
    if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
            text = text.replace(`{${k}}`, String(v));
        });
    }
    return text;
}
