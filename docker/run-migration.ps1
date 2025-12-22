# Migration script to convert Thai room names to English
# PowerShell version for Windows

Write-Host "🔄 Starting migration: Thai to English room names..." -ForegroundColor Cyan

# Run the migration script in the backend container
docker exec wheelsense-backend python /app/src/migrate_rooms.py

Write-Host ""
Write-Host "✅ Migration complete!" -ForegroundColor Green
Write-Host "📋 Please refresh your browser to see English room names." -ForegroundColor Yellow

