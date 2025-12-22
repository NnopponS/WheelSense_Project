# WheelSense - Quick Redeploy Script (PowerShell)
# For rebuilding and restarting containers after code changes

Write-Host "Starting redeployment..." -ForegroundColor Cyan

# 1. Rebuild containers
Write-Host "`nRebuilding containers..." -ForegroundColor Yellow
docker-compose build backend dashboard

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

# 2. Restart services
Write-Host "`nRestarting services..." -ForegroundColor Yellow
docker-compose up -d backend dashboard nginx

if ($LASTEXITCODE -ne 0) {
    Write-Host "Restart failed!" -ForegroundColor Red
    exit 1
}

# 3. Wait a bit for services to start
Write-Host "`nWaiting for services to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# 4. Check logs
Write-Host "`nChecking backend logs (last 20 lines)..." -ForegroundColor Yellow
docker-compose logs --tail=20 backend

Write-Host "`nDeployment complete!" -ForegroundColor Green
Write-Host "Frontend: http://localhost" -ForegroundColor Cyan
Write-Host "Backend API: http://localhost:8000" -ForegroundColor Cyan
Write-Host "`nDon't forget to flash ESP32 Controller!" -ForegroundColor Yellow

