/**
 * Static Translation Dictionary
 * Fixed translations for UI strings - no dynamic API calls needed
 * Only use for strings that should be shown in Thai when Thai language is selected
 */

// Thai translations dictionary
export const thaiTranslations = {
    // Navigation - Sidebar sections
    'Main': 'หลัก',
    'Management': 'การจัดการ',
    'Tracking': 'การติดตาม',
    'Tools': 'เครื่องมือ',
    'Health': 'สุขภาพ',
    'Control': 'ควบคุม',
    'More': 'เพิ่มเติม',

    // Navigation - Menu items (keep technical terms in English)
    'Live Monitoring': 'การตรวจสอบสด',
    'Map & Zones': 'แผนที่และโซน',
    'Wheelchairs & Patients': 'รถเข็นและผู้ป่วย',
    'Devices & Nodes': 'อุปกรณ์และโหนด',
    'Timeline & Alerts': 'ไทม์ไลน์และการแจ้งเตือน',
    'Routines': 'กิจวัตรประจำวัน',
    'Analytics': 'การวิเคราะห์',
    'Appliance Control': 'ควบคุมเครื่องใช้',
    'AI Assistant': 'ผู้ช่วย AI',
    'Settings': 'การตั้งค่า',
    'Home': 'หน้าหลัก',
    'My Location': 'ตำแหน่งของฉัน',
    'My Schedule': 'ตารางของฉัน',
    'Appliances': 'เครื่องใช้ไฟฟ้า',
    'Camera': 'กล้อง',
    'Alerts': 'การแจ้งเตือน',

    // User roles
    'Admin Panel': 'แผงควบคุมผู้ดูแล',
    'User Portal': 'พอร์ทัลผู้ใช้',
    'Admin': 'ผู้ดูแล',
    'User': 'ผู้ใช้',

    // Common actions
    'Save': 'บันทึก',
    'Cancel': 'ยกเลิก',
    'Delete': 'ลบ',
    'Edit': 'แก้ไข',
    'Add': 'เพิ่ม',
    'Close': 'ปิด',
    'Search': 'ค้นหา',
    'Filter': 'กรอง',
    'Refresh': 'รีเฟรช',
    'View Details': 'ดูรายละเอียด',
    'Loading...': 'กำลังโหลด...',

    // Status
    'Online': 'ออนไลน์',
    'Offline': 'ออฟไลน์',
    'Active': 'ใช้งาน',
    'Inactive': 'ไม่ใช้งาน',
    'Connected': 'เชื่อมต่อแล้ว',
    'Disconnected': 'ตัดการเชื่อมต่อ',

    // Rooms
    'Bedroom': 'ห้องนอน',
    'Bathroom': 'ห้องน้ำ',
    'Kitchen': 'ห้องครัว',
    'Living Room': 'ห้องนั่งเล่น',

    // Notifications
    'Notifications': 'การแจ้งเตือน',
    'Mark All Read': 'อ่านทั้งหมด',
    'No Notifications': 'ไม่มีการแจ้งเตือน',
    'Device Registered': 'ลงทะเบียนอุปกรณ์',
    'Device Updated': 'แก้ไขอุปกรณ์',
    'Device Deleted': 'ลบอุปกรณ์',
    'Config Mode Activated': 'เปิดโหมดตั้งค่า',
    'has been registered': 'ได้ถูกลงทะเบียนแล้ว',
    'has been updated': 'ได้ถูกแก้ไขแล้ว',
    'has been deleted from the system': 'ได้ถูกลบออกจากระบบแล้ว',
    'Config mode command sent to': 'ส่งคำสั่งโหมดตั้งค่าไปยัง',
    'Device will enter configuration mode': 'อุปกรณ์จะเข้าสู่โหมดตั้งค่า',

    // Time
    'Just now': 'เมื่อสักครู่',
    'ago': 'ที่แล้ว',
    'minutes ago': 'นาทีที่แล้ว',
    'hours ago': 'ชั่วโมงที่แล้ว',

    // Page titles and descriptions
    'Monitor wheelchair and patient status in real-time': 'ตรวจสอบสถานะรถเข็นและผู้ป่วยแบบเรียลไทม์',
    'Manage and configure system devices': 'จัดการและกำหนดค่าอุปกรณ์ระบบ',
    'View and edit floor plans': 'ดูและแก้ไขแผนผังชั้น',

    // Search
    'Search Patient, Wheelchair, Room...': 'ค้นหาผู้ป่วย, รถเข็น, ห้อง...',
    'Patient': 'ผู้ป่วย',
    'Wheelchair': 'รถเข็น',
    'Room': 'ห้อง',

    // Devices page
    'Nodes': 'โหนด',
    'Gateways': 'เกตเวย์',
    'Video Streams': 'สตรีมวิดีโอ',
    'Devices Online': 'อุปกรณ์ออนไลน์',
    'Devices Offline': 'อุปกรณ์ออฟไลน์',
    'Add Node': 'เพิ่มโหนด',
    'No devices connected. Connect a TsimCam-Controller to see devices here.': 'ไม่มีอุปกรณ์เชื่อมต่อ กรุณาเชื่อมต่อ TsimCam-Controller',

    // AI Chat
    'AI Assistant': 'ผู้ช่วย AI',
    'Type your message...': 'พิมพ์ข้อความของคุณ...',
    'Send': 'ส่ง',
    'Clear Chat': 'ล้างแชท',
    'Thinking...': 'กำลังคิด...',

    // Emergency
    'Emergency': 'ฉุกเฉิน',
    'Emergency Alert': 'แจ้งเตือนฉุกเฉิน',

    // Map page
    'Add Building': 'เพิ่มอาคาร',
    'Add Floor': 'เพิ่มชั้น',
    'Add Room': 'เพิ่มห้อง',
    'Edit Mode': 'โหมดแก้ไข',
    'View Mode': 'โหมดดู',

    // Timeline
    'Today': 'วันนี้',
    'Yesterday': 'เมื่อวาน',
    'This Week': 'สัปดาห์นี้',
    'Location History': 'ประวัติตำแหน่ง',
    'Event': 'เหตุการณ์',
    'Enter': 'เข้า',
    'Exit': 'ออก',

    // Patients
    'Add Patient': 'เพิ่มผู้ป่วย',
    'Patient List': 'รายชื่อผู้ป่วย',
    'Assign Wheelchair': 'กำหนดรถเข็น',

    // Analytics
    'Daily Report': 'รายงานประจำวัน',
    'Weekly Report': 'รายงานประจำสัปดาห์',
    'Monthly Report': 'รายงานประจำเดือน',
};

/**
 * Get translation for a string
 * @param {string} text - English text to translate
 * @param {string} language - Target language ('en' | 'th')
 * @returns {string} Translated text or original if no translation found
 */
export function getTranslation(text, language = 'en') {
    // If English or empty, return as-is
    if (language === 'en' || !text) {
        return text;
    }

    // Look up in Thai dictionary
    if (language === 'th') {
        return thaiTranslations[text] || text;
    }

    return text;
}

/**
 * Create a translation function for a specific language
 * @param {string} language - Target language
 * @returns {function} Translation function
 */
export function createTranslator(language) {
    return (text) => getTranslation(text, language);
}
