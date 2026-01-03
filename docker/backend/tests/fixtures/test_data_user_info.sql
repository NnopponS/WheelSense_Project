-- Test fixture: User info data
-- This fixture sets up a default user profile for testing

INSERT OR REPLACE INTO user_info (
    id,
    name_thai,
    name_english,
    condition,
    current_location,
    createdAt,
    updatedAt
) VALUES (
    'user_001',
    'ผู้ใช้ทดสอบ',
    'Test User',
    'diabetes',
    'bedroom',
    datetime('now'),
    datetime('now')
);

