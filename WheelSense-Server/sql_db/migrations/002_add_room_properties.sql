-- Migration: Add Room Properties (Width, Height, Color)
-- Version: 2.0
-- Date: 2025-10-23

-- ============================================
-- Add room visualization properties to map_layout
-- ============================================
ALTER TABLE map_layout 
  ADD COLUMN IF NOT EXISTS width INTEGER DEFAULT 120,
  ADD COLUMN IF NOT EXISTS height INTEGER DEFAULT 80,
  ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#0056B3';

-- ============================================
-- Update existing records with default values
-- ============================================
UPDATE map_layout 
SET 
  width = COALESCE(width, 120),
  height = COALESCE(height, 80),
  color = COALESCE(color, '#0056B3')
WHERE width IS NULL OR height IS NULL OR color IS NULL;

