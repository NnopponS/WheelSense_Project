-- Test fixture: Appliances data
-- Sets up appliances in different rooms with known states

INSERT OR REPLACE INTO appliances (
    id,
    _id,
    roomId,
    room,
    type,
    name,
    state,
    isOn,
    value,
    brightness,
    temperature,
    volume,
    speed,
    lastStateChange,
    lastUpdated,
    createdAt,
    updatedAt
) VALUES
    -- Bedroom appliances
    ('app_bedroom_light', 'app_bedroom_light', 'room_bedroom', 'bedroom', 'light', 'Bedroom Light', 0, 0, NULL, 50, NULL, NULL, NULL, datetime('now'), datetime('now'), datetime('now'), datetime('now')),
    ('app_bedroom_fan', 'app_bedroom_fan', 'room_bedroom', 'bedroom', 'fan', 'Bedroom Fan', 0, 0, NULL, NULL, NULL, NULL, 3, datetime('now'), datetime('now'), datetime('now'), datetime('now')),
    
    -- Kitchen appliances (some ON for house check tests)
    ('app_kitchen_light', 'app_kitchen_light', 'room_kitchen', 'kitchen', 'light', 'Kitchen Light', 1, 1, NULL, 80, NULL, NULL, NULL, datetime('now'), datetime('now'), datetime('now'), datetime('now')),
    ('app_kitchen_fan', 'app_kitchen_fan', 'room_kitchen', 'kitchen', 'fan', 'Kitchen Fan', 1, 1, NULL, NULL, NULL, NULL, 5, datetime('now'), datetime('now'), datetime('now'), datetime('now')),
    ('app_kitchen_ac', 'app_kitchen_ac', 'room_kitchen', 'kitchen', 'AC', 'Kitchen AC', 0, 0, NULL, NULL, 25, NULL, NULL, datetime('now'), datetime('now'), datetime('now'), datetime('now')),
    
    -- Bathroom appliances
    ('app_bathroom_light', 'app_bathroom_light', 'room_bathroom', 'bathroom', 'light', 'Bathroom Light', 0, 0, NULL, 60, NULL, NULL, NULL, datetime('now'), datetime('now'), datetime('now'), datetime('now')),
    
    -- Living room appliances
    ('app_livingroom_light', 'app_livingroom_light', 'room_livingroom', 'livingroom', 'light', 'Living Room Light', 0, 0, NULL, 70, NULL, NULL, NULL, datetime('now'), datetime('now'), datetime('now'), datetime('now')),
    ('app_livingroom_tv', 'app_livingroom_tv', 'room_livingroom', 'livingroom', 'tv', 'Living Room TV', 0, 0, NULL, NULL, NULL, 30, NULL, datetime('now'), datetime('now'), datetime('now'), datetime('now'));

