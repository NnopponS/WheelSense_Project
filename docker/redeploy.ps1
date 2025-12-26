# WheelSense - Quick Redeploy Script (PowerShell)
# For rebuilding and restarting containers after code changes

param(
    [string]$Service = "all"  # Options: "all", "dashboard", "detection-test", "mcp-server"
)

Write-Host "🚀 Starting redeployment..." -ForegroundColor Cyan

# Determine which services to rebuild
$servicesToBuild = @()
$servicesToRestart = @()

switch ($Service.ToLower()) {
    "dashboard" {
        $servicesToBuild = @("dashboard")
        $servicesToRestart = @("dashboard", "nginx")
    }
    "detection-test" {
        $servicesToBuild = @("detection-test")
        $servicesToRestart = @("detection-test", "nginx")
    }
    "mcp-server" {
        $servicesToBuild = @("mcp-server")
        $servicesToRestart = @("mcp-server", "nginx")
    }
    default {
        # Rebuild all frontend services
        $servicesToBuild = @("dashboard", "detection-test")
        $servicesToRestart = @("dashboard", "detection-test", "nginx")
    }
}

# 1. Rebuild containers
Write-Host "`n📦 Rebuilding containers: $($servicesToBuild -join ', ')" -ForegroundColor Yellow
docker compose build $servicesToBuild

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}

# 2. Restart services
Write-Host "`n🔄 Restarting services: $($servicesToRestart -join ', ')" -ForegroundColor Yellow
docker compose up -d $servicesToRestart

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Restart failed!" -ForegroundColor Red
    exit 1
}

# 3. Wait a bit for services to start
Write-Host "`n⏳ Waiting for services to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# 4. Check logs
Write-Host "`n📋 Checking service logs (last 10 lines)..." -ForegroundColor Yellow
foreach ($service in $servicesToRestart) {
    if ($service -ne "nginx") {
        Write-Host "`n--- $service ---" -ForegroundColor Cyan
        docker compose logs --tail=10 $service
    }
}

Write-Host "`n✅ Deployment complete!" -ForegroundColor Green
Write-Host "🌐 Dashboard: http://localhost" -ForegroundColor Cyan
Write-Host "🔍 Detection Test: http://localhost:3001" -ForegroundColor Cyan
Write-Host "🔧 Backend API: http://localhost:8000" -ForegroundColor Cyan
Write-Host "`n💡 Tip: Use -Service parameter to rebuild specific service:" -ForegroundColor Yellow
Write-Host "   .\redeploy.ps1 -Service dashboard" -ForegroundColor Gray
Write-Host "   .\redeploy.ps1 -Service detection-test" -ForegroundColor Gray

