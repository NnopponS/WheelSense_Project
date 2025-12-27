#!/bin/bash
# Migration script to fix wheelchair.room values
# This script can be run directly in the mcp-server container

echo "🔄 Starting migration: Fix wheelchair.room values..."

# Run the migration script in the mcp-server container
docker exec wheelsense-mcp python /app/migrations/fix_wheelchair_room.py

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration complete!"
    echo "📋 Wheelchair room values have been updated to use proper room IDs."
    echo "🔄 Please refresh your browser to see the updated locations."
else
    echo ""
    echo "❌ Migration failed!"
    exit 1
fi








