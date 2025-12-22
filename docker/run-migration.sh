#!/bin/bash
# Migration script to convert Thai room names to English
# This script can be run directly in the backend container

echo "🔄 Starting migration: Thai to English room names..."

# Run the migration script in the backend container
docker exec wheelsense-backend python /app/src/migrate_rooms.py

echo ""
echo "✅ Migration complete!"
echo "📋 Please refresh your browser to see English room names."

