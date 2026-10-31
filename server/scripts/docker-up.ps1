#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Start WheelSense Docker stack in production-DB or mock/sim-DB mode.
.DESCRIPTION
    Uses the unified compose layout: same core services and images; only the data
    fragment differs (docker-compose.data-prod.yml vs docker-compose.data-mock.yml).
    Stops the other entry compose first to avoid port conflicts.
.PARAMETER Mode
    prod = docker-compose.yml (pgdata-prod, ENV_MODE production)
    mock = docker-compose.sim.yml (pgdata-sim, ENV_MODE simulator + wheelsense-simulator)
.EXAMPLE
    .\docker-up.ps1 -Mode mock -Detach
    .\docker-up.ps1 -Mode prod -Build -Detach
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("prod", "mock")]
    [string]$Mode,

    [switch]$Build,
    [switch]$Reset,
    [switch]$Detach
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverDir = Split-Path -Parent $scriptDir
$prodCompose = Join-Path $serverDir "docker-compose.yml"
$simCompose = Join-Path $serverDir "docker-compose.sim.yml"
$composeFile = if ($Mode -eq "prod") { $prodCompose } else { $simCompose }
$otherCompose = if ($Mode -eq "prod") { $simCompose } else { $prodCompose }

Write-Host "Mode: $Mode  |  Compose: $(Split-Path -Leaf $composeFile)" -ForegroundColor Cyan

if (-not (Test-Path $composeFile)) {
    Write-Error "Compose file not found: $composeFile"
    exit 1
}

try {
    $null = docker info 2>&1
} catch {
    Write-Error "Docker is not running."
    exit 1
}

Write-Host "Stopping other stack (if any)..." -ForegroundColor Yellow
if (Test-Path $otherCompose) {
    cmd /c "docker compose -f ""$otherCompose"" down >nul 2>&1"
}

if ($Reset) {
    if ($Mode -eq "mock") {
        Write-Host "Reset mock DB volumes — type 'yes' to confirm" -ForegroundColor Red
        $confirm = Read-Host
        if ($confirm -eq "yes") {
            cmd /c "docker compose -f ""$composeFile"" down -v >nul 2>&1"
        }
    } else {
        Write-Host "Reset production DB — type 'DELETE ALL DATA' to confirm" -ForegroundColor Red
        $confirm = Read-Host
        if ($confirm -eq "DELETE ALL DATA") {
            cmd /c "docker compose -f ""$composeFile"" down -v >nul 2>&1"
        }
    }
}

if ($Build) {
    docker compose -f $composeFile build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$upArgs = @("-f", $composeFile, "up")
if ($Detach) { $upArgs += "-d" }
docker compose @upArgs
exit $LASTEXITCODE
