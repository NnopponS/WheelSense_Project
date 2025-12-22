# Comprehensive migration script to convert ALL Thai text to English
# PowerShell version for Windows

Write-Host "🔄 Starting comprehensive migration: Thai to English..." -ForegroundColor Cyan
Write-Host "This will update:" -ForegroundColor Yellow
Write-Host "  - Patients (name, condition, doctor, notes)" -ForegroundColor Gray
Write-Host "  - Routines (title, description)" -ForegroundColor Gray
Write-Host "  - Activity Logs (messages)" -ForegroundColor Gray
Write-Host "  - Notifications (title, message)" -ForegroundColor Gray
Write-Host "  - Doctor Notes (doctorName, notes, medications)" -ForegroundColor Gray
Write-Host ""

# Run the comprehensive migration script in the backend container
docker exec wheelsense-backend python /app/src/migrate_all_thai_to_english.py

Write-Host ""
Write-Host "✅ Migration complete!" -ForegroundColor Green
Write-Host "📋 Please refresh your browser to see all English text." -ForegroundColor Yellow

