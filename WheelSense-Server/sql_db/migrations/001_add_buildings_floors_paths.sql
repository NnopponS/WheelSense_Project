-- Migration: Add Buildings, Floors, and Pathways support
-- Version: 1.0
-- Date: 2025-10-23

-- ============================================
-- Buildings table
-- ============================================
CREATE TABLE IF NOT EXISTS buildings (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Floors table
-- ============================================
CREATE TABLE IF NOT EXISTS floors (
  id SERIAL PRIMARY KEY,
  building_id INTEGER REFERENCES buildings(id) ON DELETE CASCADE,
  floor_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(building_id, floor_number)
);

-- ============================================
-- Pathways/Corridors table
-- ============================================
CREATE TABLE IF NOT EXISTS pathways (
  id SERIAL PRIMARY KEY,
  floor_id INTEGER REFERENCES floors(id) ON DELETE CASCADE,
  name TEXT,
  points JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of {x, y} points
  width INTEGER DEFAULT 50,
  type TEXT DEFAULT 'corridor', -- 'corridor', 'hallway', 'entrance', 'exit'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Update map_layout to support floors
-- ============================================
ALTER TABLE map_layout 
  ADD COLUMN IF NOT EXISTS floor_id INTEGER REFERENCES floors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS building_id INTEGER REFERENCES buildings(id) ON DELETE SET NULL;

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_floors_building ON floors (building_id);
CREATE INDEX IF NOT EXISTS idx_pathways_floor ON pathways (floor_id);
CREATE INDEX IF NOT EXISTS idx_map_layout_floor ON map_layout (floor_id);
CREATE INDEX IF NOT EXISTS idx_map_layout_building ON map_layout (building_id);

-- ============================================
-- Insert default building and floor
-- ============================================
INSERT INTO buildings (id, name, description) 
VALUES (1, 'Main Building', 'Default building')
ON CONFLICT DO NOTHING;

INSERT INTO floors (id, building_id, floor_number, name) 
VALUES (1, 1, 1, 'Floor 1')
ON CONFLICT DO NOTHING;

-- ============================================
-- Update existing map_layout records
-- ============================================
UPDATE map_layout 
SET building_id = 1, floor_id = 1 
WHERE building_id IS NULL;

