-- Test fixture: User info data
-- This fixture sets up a default user profile for testing

-- Delete existing test data if any
DELETE FROM user_info WHERE name_english = 'Test User';

-- Insert test user data
INSERT INTO user_info (
    name_thai,
    name_english,
    condition,
    current_location,
    created_at,
    updated_at
) VALUES (
    'ผู้ใช้ทดสอบ',
    'Test User',
    'diabetes',
    'bedroom',
    datetime('now'),
    datetime('now')
);

