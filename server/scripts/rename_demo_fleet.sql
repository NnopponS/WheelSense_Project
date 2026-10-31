-- rename_demo_fleet.sql
-- Idempotent migration: rename demo-labelled fleet devices to the production
-- WS_* / "Sensor Node" naming scheme so the device fleet table reads like a
-- real deployment. Safe to run repeatedly: every statement only matches rows
-- that still carry the old identifiers.
--
-- Apply (Windows host):
--   type server\scripts\rename_demo_fleet.sql | docker exec -i wheelsense-platform-db-1 psql -U wheelsense wheelsense
-- or:
--   docker exec -i wheelsense-platform-db-1 psql -U wheelsense wheelsense -f - < server/scripts/rename_demo_fleet.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. device_id rename map (DEMO_* -> WS_*)
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _fleet_rename (
    old_id   text PRIMARY KEY,
    new_id   text NOT NULL,
    new_name text NOT NULL
) ON COMMIT DROP;

INSERT INTO _fleet_rename (old_id, new_id, new_name) VALUES
    ('DEMO_BELT',        'WS_BELT_01',     'Fall Detection Belt'),
    ('DEMO_NODE_DINING', 'WS_NODE_DINING', 'Sensor Node - Dining Area'),
    ('DEMO_NODE_HALL',   'WS_NODE_HALL',   'Sensor Node - Main Hall'),
    ('DEMO_NODE_PHYSIO', 'WS_NODE_PHYSIO', 'Sensor Node - Physiotherapy'),
    ('DEMO_POLAR_01',    'WS_POLAR_01',    'Polar Sense - Wichai'),
    ('DEMO_POLAR_02',    'WS_POLAR_02',    'Polar Sense - Saowanee'),
    ('DEMO_POLAR_03',    'WS_POLAR_03',    'Polar Sense - Robert'),
    ('DEMO_POLAR_04',    'WS_POLAR_04',    'Polar Sense - Mei Lin'),
    ('DEMO_POLAR_05',    'WS_POLAR_05',    'Polar Sense - Arjun'),
    ('DEMO_POLAR_06',    'WS_POLAR_06',    'Polar Sense - Maria');

-- ---------------------------------------------------------------------------
-- 2. Propagate the device_id renames to every column that stores a device id
--    string (audit: information_schema.columns LIKE '%device%' + rssi.node_id).
--    Columns holding only SIM_*/MODEL_* ids are unaffected since those ids do
--    not appear in the rename map.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    tgt record;
BEGIN
    FOR tgt IN
        SELECT * FROM (VALUES
            ('alerts',                            'device_id'),
            ('audio_records',                     'device_id'),
            ('caregiver_device_assignments',      'device_id'),
            ('device_activity_events',            'registry_device_id'),
            ('device_command_dispatches',         'device_id'),
            ('imu_telemetry',                     'device_id'),
            ('localization_calibration_samples',  'device_id'),
            ('localization_calibration_sessions', 'device_id'),
            ('mobile_device_telemetry',           'device_id'),
            ('motion_training_data',              'device_id'),
            ('node_status_telemetry',             'device_id'),
            ('patient_device_assignments',        'device_id'),
            ('photo_records',                     'device_id'),
            ('room_predictions',                  'device_id'),
            ('rooms',                             'node_device_id'),
            ('rssi_readings',                     'device_id'),
            ('rssi_readings',                     'node_id'),
            ('vital_readings',                    'device_id')
        ) AS t(tbl, col)
    LOOP
        EXECUTE format(
            'UPDATE %I AS t SET %I = r.new_id
               FROM _fleet_rename AS r
              WHERE t.%I = r.old_id',
            tgt.tbl, tgt.col, tgt.col
        );
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Rename the device rows themselves (workspace-scoped unique key is
--    (workspace_id, device_id); all rows live in workspace 1 and the WS_* ids
--    do not collide -- verified empty before this migration).
-- ---------------------------------------------------------------------------
UPDATE devices AS d
   SET device_id    = r.new_id,
       display_name = r.new_name
  FROM _fleet_rename AS r
 WHERE d.device_id = r.old_id;

-- Normalize display names even when the id was already renamed (idempotency).
UPDATE devices AS d
   SET display_name = r.new_name
  FROM _fleet_rename AS r
 WHERE d.device_id = r.new_id;

-- The belt is its own hardware class now.
UPDATE devices
   SET hardware_type = 'belt',
       device_type   = 'belt'
 WHERE device_id = 'WS_BELT_01';

-- Config JSON embedded device ids / reported names.
UPDATE devices
   SET config = jsonb_set(config, '{reported_device_id}', '"WS_BELT_01"')
 WHERE device_id = 'WS_BELT_01'
   AND config ? 'reported_device_id';

UPDATE devices
   SET config = jsonb_set(config, '{m5_companion_device_id}', '"WS_BELT_01"')
 WHERE config ->> 'm5_companion_device_id' = 'DEMO_BELT';

-- ---------------------------------------------------------------------------
-- 4. SIM_NODE_* rows keep their device_id (telemetry, room bindings, RSSI
--    training data all reference them); only the "Demo Node NN" label changes.
-- ---------------------------------------------------------------------------
UPDATE devices
   SET display_name = 'Sensor Node ' || substring(device_id from 'SIM_NODE_([0-9]+)$')
 WHERE device_id ~ '^SIM_NODE_[0-9]+$';

-- ---------------------------------------------------------------------------
-- 5. Mobile gateways: keep all rows (stale ones included), uniform clean name.
-- ---------------------------------------------------------------------------
UPDATE devices
   SET display_name = 'Mobile Gateway'
 WHERE hardware_type = 'mobile_phone'
   AND device_id LIKE 'wheelsense-mobile-%';

UPDATE devices
   SET config = jsonb_set(config, '{device_name}', '"Mobile Gateway"')
 WHERE device_id LIKE 'wheelsense-mobile-%'
   AND config ->> 'device_name' = 'WheelSense Mobile Gateway';

-- Active gateways re-push display_name='WheelSense Mobile Gateway' from the
-- phone payload on every ingest ping (observed live). Keep the normalized
-- name with a tiny BEFORE trigger instead of racing the ingest writer.
CREATE OR REPLACE FUNCTION _normalize_fleet_display_name() RETURNS trigger AS $fn$
BEGIN
    IF NEW.hardware_type = 'mobile_phone'
       AND NEW.display_name = 'WheelSense Mobile Gateway' THEN
        NEW.display_name := 'Mobile Gateway';
    END IF;
    RETURN NEW;
END
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_devices_fleet_display_name ON devices;
CREATE TRIGGER trg_devices_fleet_display_name
    BEFORE INSERT OR UPDATE OF display_name ON devices
    FOR EACH ROW EXECUTE FUNCTION _normalize_fleet_display_name();

-- ---------------------------------------------------------------------------
-- 6. Cosmetic leftovers inside config/firmware ("demo" substrings only visible
--    in the device detail payload; harmless but easy to clean).
-- ---------------------------------------------------------------------------
UPDATE devices
   SET config = jsonb_set(config, '{sim_generation}', '"ws_fleet_v2"')
 WHERE config ->> 'sim_generation' = 'real_demo_v2';

UPDATE devices SET firmware = 'node-v2'  WHERE firmware = 'node-demo-v2';
UPDATE devices SET firmware = 'polar-v2' WHERE firmware = 'polar-demo-v2';

COMMIT;
