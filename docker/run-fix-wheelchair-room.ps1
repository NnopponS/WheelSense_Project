# Migration script to fix wheelchair.room values
# PowerShell version for Windows

Write-Host "🔄 Starting migration: Fix wheelchair.room values..." -ForegroundColor Cyan

# Run the migration script in the mcp-server container
docker exec wheelsense-mcp python /app/migrations/fix_wheelchair_room.py

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Migration complete!" -ForegroundColor Green
    Write-Host "📋 Wheelchair room values have been updated to use proper room IDs." -ForegroundColor Yellow
    Write-Host "🔄 Please refresh your browser to see the updated locations." -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "❌ Migration failed!" -ForegroundColor Red
    exit 1
}








