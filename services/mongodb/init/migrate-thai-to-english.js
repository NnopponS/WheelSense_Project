// Migration script to convert Thai room names to English
// Run this script to update existing database records

db = db.getSiblingDB('wheelsense');

print("🔄 Starting migration: Thai to English room names...");

// Room name mapping (Thai -> English)
const roomNameMap = {
  "ห้องนอน": "Bedroom",
  "ห้องน้ำ": "Bathroom",
  "ห้องครัว": "Kitchen",
  "ห้องนั่งเล่น": "Living Room",
  "ทางเดิน": "Corridor"
};

// Update rooms collection
let roomsUpdated = 0;
const rooms = db.rooms.find({});

rooms.forEach(room => {
  let updated = false;
  const updates = {};
  
  // Update name if it's Thai
  if (room.name && roomNameMap[room.name]) {
    updates.name = roomNameMap[room.name];
    updated = true;
  }
  
  // Ensure nameEn is set to English name
  if (room.nameEn && roomNameMap[room.nameEn]) {
    updates.nameEn = roomNameMap[room.nameEn];
    updated = true;
  } else if (!room.nameEn && room.name && roomNameMap[room.name]) {
    updates.nameEn = roomNameMap[room.name];
    updated = true;
  } else if (!room.nameEn && room.name && !roomNameMap[room.name]) {
    // If name is already English but nameEn is missing, copy name to nameEn
    updates.nameEn = room.name;
    updated = true;
  }
  
  // If nameEn exists but name doesn't match, update name to match nameEn
  if (room.nameEn && !roomNameMap[room.nameEn] && room.name !== room.nameEn) {
    // Check if nameEn is already English (not in Thai map)
    if (!roomNameMap[room.nameEn]) {
      updates.name = room.nameEn;
      updated = true;
    }
  }
  
  if (updated) {
    db.rooms.updateOne(
      { _id: room._id },
      { $set: updates }
    );
    roomsUpdated++;
    print(`  ✅ Updated room: ${room.id || room._id} - name: "${updates.name || room.name}" -> "${updates.name || room.name}", nameEn: "${updates.nameEn || room.nameEn}"`);
  }
});

print(`\n✅ Migration complete! Updated ${roomsUpdated} room(s).`);
print("\n📋 Summary:");
print("   - All room names should now be in English");
print("   - nameEn field is set for all rooms");
print("   - name field matches nameEn for consistency");

