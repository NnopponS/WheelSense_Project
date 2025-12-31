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

    // Appliance Control
    'Control appliances in all rooms': 'ควบคุมเครื่องใช้ไฟฟ้าในทุกห้อง',
    'Scene Presets': 'ตั้งค่าฉาก',
    'Wake Up': 'ตื่นนอน',
    'Sleep': 'นอน',
    'Watch Movie': 'ดูหนัง',
    'Away': 'ไม่อยู่',
    'Turn on light, turn off AC, open curtain': 'เปิดไฟ ปิดแอร์ เปิดม่าน',
    'Turn off light, turn on AC, close curtain': 'ปิดไฟ เปิดแอร์ ปิดม่าน',
    'Dim light, turn on TV': 'ลดความสว่างไฟ เปิดทีวี',
    'Turn off everything': 'ปิดทุกอย่าง',
    'Temperature': 'อุณหภูมิ',
    'Humidity': 'ความชื้น',
    'On': 'เปิด',
    'Off': 'ปิด',
    'Turn All Off': 'ปิดทั้งหมด',
    'No Devices Found': 'ไม่พบอุปกรณ์',
    'No Appliances in This Room': 'ไม่มีเครื่องใช้ไฟฟ้าในห้องนี้',
    'Brightness': 'ความสว่าง',
    'Volume': 'เสียง',

    // Health page
    'Health': 'สุขภาพ',
    'Health Status': 'สถานะสุขภาพ',
    'Blood Pressure': 'ความดันโลหิต',
    'Heart Rate': 'อัตราการเต้นของหัวใจ',
    'Blood Sugar': 'น้ำตาลในเลือด',

    // Common status
    'Normal': 'ปกติ',
    'Warning': 'เตือน',
    'Emergency': 'ฉุกเฉิน',
    'Unknown Location': 'ตำแหน่งไม่ทราบ',
    'All': 'ทั้งหมด',
    'No User': 'ไม่มีผู้ใช้',
    'Unknown User': 'ผู้ใช้ไม่ทราบ',

    // User Home Page
    'Hello': 'สวัสดี',
    'How is your health today?': 'วันนี้สุขภาพเป็นอย่างไรบ้าง?',
    'Health Score': 'คะแนนสุขภาพ',
    'Steps Today': 'จำนวนก้าววันนี้',
    'Activities Today': 'กิจกรรมวันนี้',
    'Battery': 'แบตเตอรี่',
    'Next Activity': 'กิจกรรมถัดไป',
    'All Completed!': 'เสร็จสมบูรณ์ทั้งหมด!',

    // User Health Page
    'Weight': 'น้ำหนัก',
    'Height': 'ส่วนสูง',
    'BMI': 'ดัชนีมวลกาย',

    // General
    'Actions': 'การดำเนินการ',
    'Name': 'ชื่อ',
    'Status': 'สถานะ',
    'ID': 'รหัส',
    'IP': 'IP',
    'Edit Device': 'แก้ไขอุปกรณ์',
    'Delete Device': 'ลบอุปกรณ์',
    'Are you sure you want to delete this device? This action cannot be undone.': 'คุณแน่ใจหรือไม่ว่าต้องการลบอุปกรณ์นี้? การดำเนินการนี้ไม่สามารถย้อนกลับได้',
    'Device Name': 'ชื่ออุปกรณ์',
    'Select Room': 'เลือกห้อง',
    'Save Changes': 'บันทึกการเปลี่ยนแปลง',
    'Failed to update device: ': 'ล้มเหลวในการอัปเดตอุปกรณ์: ',
    'Failed to open edit form: ': 'ล้มเหลวในการเปิดแบบฟอร์มแก้ไข: ',
    'Loading user data...': 'กำลังโหลดข้อมูลผู้ใช้...',
    'Occupied': 'มีคนอยู่',
    'Vacant': 'ว่าง',
    'Speed': 'ความเร็ว',
    'Today Schedule': 'ตารางวันนี้',
    'Completed': 'เสร็จสมบูรณ์',
    'Quick Menu': 'เมนูด่วน',
    'View Health Status': 'ดูสถานะสุขภาพ',
    'Activities': 'กิจกรรม',
    'Devices': 'อุปกรณ์',
    'Report Emergency': 'แจ้งเหตุฉุกเฉิน',
    'My Health': 'สุขภาพของฉัน',
    'Track health status and activities': 'ติดตามสถานะสุขภาพและกิจกรรม',
    'Today Health Score': 'คะแนนสุขภาพวันนี้',
    'Very Good Health!': 'สุขภาพดีมาก!',
    'Fair Health': 'สุขภาพพอใช้',
    'Caution Required': 'ต้องระวัง',
    'Steps': 'ก้าว',
    'Goal': 'เป้าหมาย',
    'AI Recommendations': 'คำแนะนำจาก AI',
    'Patients in System': 'ผู้ป่วยในระบบ',
    'Wheelchairs Online': 'รถเข็นออนไลน์',
    'Alerts Today': 'การแจ้งเตือนวันนี้',

    // TopBar Timestamp
    'Apply': 'ใช้',
    'Real': 'เวลาจริง',
    'Custom': 'กำหนดเอง',
    'Custom Time (click to edit)': 'เวลาที่กำหนด (คลิกเพื่อแก้ไข)',
    'Click to customize time': 'คลิกเพื่อกำหนดเวลา',
    'Use Real Time': 'ใช้เวลาจริง',

    // Schedule / Routines page
    'Activity Schedule': 'ตารางกิจกรรม',
    'No activities scheduled yet': 'ยังไม่มีกิจกรรมที่กำหนด',
    'Add a new activity to get started': 'เพิ่มกิจกรรมใหม่เพื่อเริ่มต้น',
    'Add Activity': 'เพิ่มกิจกรรม',
    'Add New Activity': 'เพิ่มกิจกรรมใหม่',
    'Your daily activities': 'กิจกรรมประจำวันของคุณ',
    'Manage patient daily activity schedules': 'จัดการตารางกิจกรรมประจำวันของผู้ป่วย',
    'Do you want to delete this routine?': 'คุณต้องการลบกิจกรรมนี้หรือไม่?',
    'Please enter time and activity name': 'กรุณาใส่เวลาและชื่อกิจกรรม',
    'Time': 'เวลา',
    'Activity': 'กิจกรรม',
    'Activity Name': 'ชื่อกิจกรรม',
    'Select Room (Optional)': 'เลือกห้อง (ไม่บังคับ)',
    'Select Patient': 'เลือกผู้ป่วย',
    'e.g. Wake up, Breakfast, Work': 'เช่น ตื่นนอน, อาหารเช้า, ทำงาน',

    // Device actions
    'Add Device': 'เพิ่มอุปกรณ์',
    'Select Device': 'เลือกอุปกรณ์',
    'No actions. Click + Add Device to add.': 'ไม่มีการดำเนินการ คลิก + เพิ่มอุปกรณ์ เพื่อเพิ่ม',
    'Select a room first': 'เลือกห้องก่อน',
    'Turn on': 'เปิด',
    'Turn off': 'ปิด',

    // Device types
    'Light': 'ไฟ',
    'AC': 'แอร์',
    'TV': 'ทีวี',
    'Fan': 'พัดลม',
    'Alarm': 'นาฬิกาปลุก',

    // Room names  
    'Living room': 'ห้องนั่งเล่น',

    // Health page - User conditions
    'User Condition': 'อาการของผู้ใช้',
    'Mild diabetes (Type 2) - requires blood sugar monitoring': 'เบาหวานระดับเล็กน้อย (Type 2) - ต้องเฝ้าระวังระดับน้ำตาลในเลือด',
    'Allergic to dust mites': 'แพ้ไรฝุ่น',
    'Uses a wheelchair for mobility': 'ใช้รถเข็นในการเดินทาง',
    'Mild Diabetes (Type 2)': 'เบาหวานระดับเล็กน้อย (Type 2)',
    'Requires blood sugar monitoring': 'ต้องเฝ้าระวังระดับน้ำตาลในเลือด',
    'Allergic to Dust Mites': 'แพ้ไรฝุ่น',
    'Avoid dusty environments': 'หลีกเลี่ยงสภาพแวดล้อมที่มีฝุ่น',
    'Uses Wheelchair for Mobility': 'ใช้รถเข็นในการเดินทาง',
    'Primary mode of transportation': 'เป็นพาหนะหลักในการเดินทาง',

    // Schedule activities
    'Wake up': 'ตื่นนอน',
    'Morning exercise': 'ออกกำลังกายตอนเช้า',
    'Breakfast': 'อาหารเช้า',
    'Work': 'ทำงาน',
    'Lunch': 'อาหารกลางวัน',
    'Continue Working': 'ทำงานต่อ',
    'Dinner': 'อาหารเย็น',
    'Relaxation time': 'เวลาพักผ่อน',
    'Prepare for bed': 'เตรียมตัวนอน',
    'Sleep': 'นอน',

    // Action text (Turn on/off devices)
    'Turn on Alarm': 'เปิดนาฬิกาปลุก',
    'Turn on Light': 'เปิดไฟ',
    'Turn off Light': 'ปิดไฟ',
    'Turn on AC': 'เปิด AC',
    'Turn off AC': 'ปิด AC',
    'Turn on TV': 'เปิด TV',
    'Turn off TV': 'ปิด TV',
    'Turn on Fan': 'เปิดพัดลม',
    'Turn off Fan': 'ปิดพัดลม',
    'Turn on Alarm, Turn on Light': 'เปิดนาฬิกาปลุก, เปิดไฟ',
    'Turn on Light, Turn on AC': 'เปิดไฟ, เปิด AC',
    'Turn on AC, Turn on Light': 'เปิด AC, เปิดไฟ',

    // General UI
    'HH:MM': 'ชม:นาที',

    // Gyro Sensor Visualization
    'Gyro Sensor': 'เซ็นเซอร์ไจโร',
    'Gyro Sensor Visualization': 'แสดงผลเซ็นเซอร์ไจโร',
    'Real-time gyroscope and accelerometer data from wheelchair sensor': 'ข้อมูลไจโรสโคปและ Accelerometer แบบเรียลไทม์จากเซ็นเซอร์รถเข็น',
    'Movement Status': 'สถานะการเคลื่อนไหว',
    'Current movement state': 'สถานะการเคลื่อนไหวปัจจุบัน',
    'Navigation': 'การนำทาง',
    'Distance': 'ระยะทาง',
    'Heading': 'ทิศทาง',
    'Gyroscope Data': 'ข้อมูลไจโรสโคป',
    'Accelerometer Data': 'ข้อมูล Accelerometer',
    'Waiting for BLE Bridge...': 'รอการเชื่อมต่อ BLE Bridge...',
    'Stationary': 'หยุดนิ่ง',
    'Forward': 'ไปข้างหน้า',
    'Backward': 'ถอยหลัง',
    'Straight': 'หน้าตรง',
    'Turn Left': 'หันซ้าย',
    'Turn Right': 'หันขวา',
    'Fall Detected': 'ล้ม',
    'Unknown': 'ไม่ทราบ',
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
        // First try exact match
        if (thaiTranslations[text]) {
            return thaiTranslations[text];
        }

        // Smart pattern-based translation for dynamic text
        let translated = text;

        // Pattern replacements for action strings
        const patterns = [
            // Turn on/off patterns
            [/Turn on bedroom /gi, 'เปิด'],
            [/Turn off bedroom /gi, 'ปิด'],
            [/Turn on living room /gi, 'เปิด'],
            [/Turn off living room /gi, 'ปิด'],
            [/Turn on kitchen /gi, 'เปิด'],
            [/Turn off kitchen /gi, 'ปิด'],
            [/Turn on bathroom /gi, 'เปิด'],
            [/Turn off bathroom /gi, 'ปิด'],
            [/Turn on /gi, 'เปิด'],
            [/Turn off /gi, 'ปิด'],
            [/ and /gi, ' และ '],

            // Device names
            [/Alarm/gi, 'นาฬิกาปลุก'],
            [/Light/gi, 'ไฟ'],
            [/Fan/gi, 'พัดลม'],
            // Keep AC and TV as-is (loanwords)

            // Rooms
            [/Bedroom/gi, 'ห้องนอน'],
            [/Living room/gi, 'ห้องนั่งเล่น'],
            [/Kitchen/gi, 'ห้องครัว'],
            [/Bathroom/gi, 'ห้องน้ำ'],
        ];

        // Apply all pattern replacements
        for (const [pattern, replacement] of patterns) {
            translated = translated.replace(pattern, replacement);
        }

        // If translation changed, return it
        if (translated !== text) {
            return translated;
        }

        return text;
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
