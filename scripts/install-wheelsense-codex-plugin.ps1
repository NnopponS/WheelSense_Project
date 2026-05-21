param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

$config = Join-Path $env:USERPROFILE '.codex\config.toml'
$marketplacePath = Join-Path $RepoRoot '.codex-marketplace'

if (!(Test-Path -LiteralPath $marketplacePath)) {
  throw "Marketplace path not found: $marketplacePath"
}

if (!(Test-Path -LiteralPath $config)) {
  $configDir = Split-Path -Parent $config
  New-Item -ItemType Directory -Force -Path $configDir | Out-Null
  New-Item -ItemType File -Force -Path $config | Out-Null
}

$text = Get-Content -LiteralPath $config -Raw
if ($null -eq $text) {
  $text = ''
}

$changed = $false

if ($text -notmatch '\[marketplaces\.wheelsense-local\]') {
  $text += @"

[marketplaces.wheelsense-local]
last_updated = "2026-05-11T00:00:00Z"
source_type = "local"
source = '$marketplacePath'
"@
  $changed = $true
}

if ($text -notmatch '\[plugins\."wheelsense-workflows@wheelsense-local"\]') {
  $text += @"

[plugins."wheelsense-workflows@wheelsense-local"]
enabled = true
"@
  $changed = $true
}

if ($changed) {
  $backup = "$config.bak-wheelsense-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Copy-Item -LiteralPath $config -Destination $backup -Force
  Set-Content -LiteralPath $config -Value $text -Encoding utf8
}

Write-Host "WheelSense Codex plugin config installed."
Write-Host "Marketplace: $marketplacePath"
Write-Host "Config: $config"
Write-Host "Restart Codex, then try /whichagent or /which-agent."
