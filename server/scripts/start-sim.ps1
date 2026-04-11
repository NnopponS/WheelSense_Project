#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Start WheelSense Simulator Environment
.DESCRIPTION
    Starts the WheelSense platform in simulator mode with pre-populated demo data.
    Uses docker-compose.sim.yml (includes core stack + mock DB + simulator).
    - PostgreSQL service `db` with pgdata-sim volume (isolated from production)
    - Same app images as production entry; only data layer differs
    - FastAPI server (ENV_MODE=simulator)
    - wheelsense-simulator service (synthetic MQTT data)
    - Next.js frontend
    - Home Assistant
.EXAMPLE
    .\start-sim.ps1
    .\start-sim.ps1 -Build
    .\start-sim.ps1 -Reset
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
$composeFile = Join-Path $serverDir "docker-compose.sim.yml"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "WheelSense Simulator Environment" -ForegroundColor Cyan
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

# Stop any running production containers first (to avoid port conflicts)
Write-Host "`nStopping any running production containers..." -ForegroundColor Yellow
$prodCompose = Join-Path $serverDir "docker-compose.yml"
if (Test-Path $prodCompose) {
    # Avoid PowerShell NativeCommandError on docker stderr (e.g. "Container ... Stopping")
    cmd /c "docker compose -f ""$prodCompose"" down >nul 2>&1"
}

# Handle reset request
if ($Reset) {
    Write-Host "`nResetting simulator data volumes..." -ForegroundColor Red
    Write-Host "This will delete all simulator data and start fresh!" -ForegroundColor Red
    $confirm = Read-Host "Type 'yes' to confirm"
    if ($confirm -eq "yes") {
        cmd /c "docker compose -f ""$composeFile"" down -v >nul 2>&1"
        Write-Host "Simulator volumes cleared." -ForegroundColor Green
    } else {
        Write-Host "Reset cancelled." -ForegroundColor Yellow
    }
}

# Build if requested
if ($Build) {
    Write-Host "`nBuilding simulator containers..." -ForegroundColor Cyan
    docker compose -f $composeFile build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed!"
        exit 1
    }
}

# Start the simulator environment
Write-Host "`nStarting Simulator Environment..." -ForegroundColor Cyan
Write-Host "Mode: SIMULATOR (pre-populated demo data)" -ForegroundColor Magenta
Write-Host "Database: pgdata-sim (isolated from production)" -ForegroundColor Gray
Write-Host ""

$upArgs = @("-f", $composeFile, "up")
if ($Detach) {
    $upArgs += "-d"
}

docker compose @upArgs

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "Simulator Environment Started!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Frontend: http://localhost:3000" -ForegroundColor White
    Write-Host "Backend API: http://localhost:8000/api" -ForegroundColor White
    Write-Host "API Docs: http://localhost:8000/docs" -ForegroundColor White
    Write-Host "Home Assistant: http://localhost:8123" -ForegroundColor White
    Write-Host "MQTT Broker: localhost:1883" -ForegroundColor White
    Write-Host ""
    Write-Host "Login (default):" -ForegroundColor Cyan
    Write-Host "  Admin: admin / wheelsense2026" -ForegroundColor White
    Write-Host "  Head Nurse: sim_headnurse / demo1234" -ForegroundColor White
    Write-Host "  Supervisor: sim_supervisor / demo1234" -ForegroundColor White
    Write-Host "  Observer: sim_observer1 / demo1234" -ForegroundColor White
    Write-Host ""
    Write-Host "To reset simulator data, visit: /admin/settings > Server > Reset Simulator" -ForegroundColor Yellow
    if (-not $Detach) {
        Write-Host "`nPress Ctrl+C to stop..." -ForegroundColor Gray
    }
} else {
    Write-Error "Failed to start simulator environment!"
    exit 1
}
