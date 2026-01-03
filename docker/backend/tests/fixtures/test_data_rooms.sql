-- Test fixture: Rooms data
-- Sets up standard rooms for testing

INSERT OR REPLACE INTO rooms (
    id,
    _id,
    name,
    nameEn,
    roomType,
    x,
    y,
    width,
    height,
    temperature,
    humidity,
    isOccupied,
    createdAt,
    updatedAt
) VALUES
    ('room_bedroom', 'room_bedroom', 'ห้องนอน', 'Bedroom', 'bedroom', 10, 10, 20, 20, 25, 60, 0, datetime('now'), datetime('now')),
    ('room_kitchen', 'room_kitchen', 'ห้องครัว', 'Kitchen', 'kitchen', 50, 10, 20, 20, 28, 55, 0, datetime('now'), datetime('now')),
    ('room_bathroom', 'room_bathroom', 'ห้องน้ำ', 'Bathroom', 'bathroom', 10, 50, 20, 20, 26, 70, 0, datetime('now'), datetime('now')),
    ('room_livingroom', 'room_livingroom', 'ห้องนั่งเล่น', 'Living Room', 'livingroom', 50, 50, 30, 30, 24, 50, 0, datetime('now'), datetime('now'));

