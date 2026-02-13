# Link .agent/skills to .cursor/skills for Cursor skill discovery
# Run this after cloning if Cursor doesn't see the skills

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$skillsDir = Join-Path $root ".agent\skills"
$cursorSkills = Join-Path $root ".cursor\skills"

if (-not (Test-Path $skillsDir)) {
    Write-Error ".agent/skills not found"
    exit 1
}

New-Item -ItemType Directory -Path $cursorSkills -Force | Out-Null
$skills = Get-ChildItem $skillsDir -Directory

foreach ($s in $skills) {
    $link = Join-Path $cursorSkills $s.Name
    if (Test-Path $link) { continue }
    cmd /c mklink /J "`"$link`"" "`"$s.FullName`""
    Write-Host "Linked: $($s.Name)"
}

Write-Host "Done. Cursor can now discover project skills."
