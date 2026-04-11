#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Start WheelSense Production Environment
.DESCRIPTION
    Starts the WheelSense platform in production mode with clean database.
    Uses docker-compose.yml (includes core stack + production DB).
    - PostgreSQL service `db` with pgdata-prod volume (isolated from mock/sim)
    - Same app images as sim entry; only data layer differs
    - FastAPI server (ENV_MODE=production)
    - Next.js frontend
    - Home Assistant
    
    Note: Simulator service (synthetic MQTT) is NOT included in production.
.EXAMPLE
    .\start-prod.ps1
    .\start-prod.ps1 -Build
    .\start-prod.ps1 -Reset
#>
[CmdletBinding()]
param(
    [switch]$Build,
    [switch]$Reset,
    [switch]$Detach
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverDir = Split-Path -Parent $scriptDir
$composeFile = Join-Path $serverDir "docker-compose.yml"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "WheelSense Production Environment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Check if Docker is running
try {
    $null = docker info 2>&1
} catch {
    Write-Error "Docker is not running. Please start Docker Desktop first."
    exit 1
}

# Check if compose file exists
if (-not (Test-Path $composeFile)) {
    Write-Error "Compose file not found: $composeFile"
    exit 1
}

Write-Host "Compose file: $composeFile" -ForegroundColor Gray

# Stop any running simulator containers first (to avoid port conflicts)
Write-Host "`nStopping any running simulator containers..." -ForegroundColor Yellow
$simCompose = Join-Path $serverDir "docker-compose.sim.yml"
if (Test-Path $simCompose) {
    cmd /c "docker compose -f ""$simCompose"" down >nul 2>&1"
}

# Handle reset request
if ($Reset) {
    Write-Host "`nResetting production data volumes..." -ForegroundColor Red
    Write-Host "WARNING: This will delete ALL production data!" -ForegroundColor Red
    $confirm = Read-Host "Type 'DELETE ALL DATA' to confirm"
    if ($confirm -eq "DELETE ALL DATA") {
        cmd /c "docker compose -f ""$composeFile"" down -v >nul 2>&1"
        Write-Host "Production volumes cleared." -ForegroundColor Green
    } else {
        Write-Host "Reset cancelled." -ForegroundColor Yellow
    }
}

# Build if requested
if ($Build) {
    Write-Host "`nBuilding production containers..." -ForegroundColor Cyan
    docker compose -f $composeFile build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed!"
        exit 1
    }
}

# Start the production environment
Write-Host "`nStarting Production Environment..." -ForegroundColor Cyan
Write-Host "Mode: PRODUCTION (clean database for real-world use)" -ForegroundColor Green
Write-Host "Database: pgdata-prod (isolated from simulator)" -ForegroundColor Gray
Write-Host ""

$upArgs = @("-f", $composeFile, "up")
if ($Detach) {
    $upArgs += "-d"
}

docker compose @upArgs

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "Production Environment Started!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Frontend: http://localhost:3000" -ForegroundColor White
    Write-Host "Backend API: http://localhost:8000/api" -ForegroundColor White
    Write-Host "API Docs: http://localhost:8000/docs" -ForegroundColor White
    Write-Host "Home Assistant: http://localhost:8123" -ForegroundColor White
    Write-Host "MQTT Broker: localhost:1883" -ForegroundColor White
    Write-Host ""
    Write-Host "IMPORTANT: This is a CLEAN environment." -ForegroundColor Yellow
    Write-Host "You need to:" -ForegroundColor Yellow
    Write-Host "  1. Create a workspace" -ForegroundColor White
    Write-Host "  2. Add patients, caregivers, and devices" -ForegroundColor White
    Write-Host "  3. Configure MQTT devices to publish real data" -ForegroundColor White
    Write-Host ""
    Write-Host "To seed production demo data instead, run:" -ForegroundColor Cyan
    Write-Host "  python scripts/seed_production.py" -ForegroundColor White
    if (-not $Detach) {
        Write-Host "`nPress Ctrl+C to stop..." -ForegroundColor Gray
    }
} else {
    Write-Error "Failed to start production environment!"
    exit 1
}
