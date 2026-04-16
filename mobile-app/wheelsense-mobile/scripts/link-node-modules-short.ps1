# Puts physical node_modules under a short path (%LOCALAPPDATA%\wsm-short-nm\<hash>)
# and creates a directory junction at <project>\node_modules.
# Reduces full path length for CMake/Ninja on Windows without moving the whole repo.
#
# Idempotent. Optional: env WHEELSENSE_NODE_MODULES_STORE = base directory (default: LOCALAPPDATA\wsm-short-nm)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root

$nm = Join-Path $Root "node_modules"
$resolvedRoot = [System.IO.Path]::GetFullPath($Root)
$bytes = [System.Text.Encoding]::UTF8.GetBytes($resolvedRoot)
$sha = [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
$hash = ($sha | ForEach-Object { $_.ToString("x2") }) -join ""
$hash = $hash.Substring(0, [Math]::Min(16, $hash.Length))

$base = if ($env:WHEELSENSE_NODE_MODULES_STORE -and $env:WHEELSENSE_NODE_MODULES_STORE.Trim().Length -gt 0) {
  $env:WHEELSENSE_NODE_MODULES_STORE.Trim()
} else {
  Join-Path $env:LOCALAPPDATA "wsm-short-nm"
}
$Store = Join-Path $base $hash

function Test-IsReparsePoint([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $false }
  $dir = Get-Item -LiteralPath $Path -Force
  return [bool]($dir.Attributes -band [System.IO.FileAttributes]::ReparsePoint)
}

function New-DirectoryJunction([string]$Link, [string]$Target) {
  if (-not (Test-Path -LiteralPath $Target)) {
    New-Item -ItemType Directory -Path $Target -Force | Out-Null
  }
  $cmd = "mklink /J `"$Link`" `"$Target`""
  $exit = (Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", $cmd) -Wait -PassThru -NoNewWindow).ExitCode
  if ($exit -ne 0) { throw "mklink /J failed (exit $exit): $Link -> $Target" }
  if (-not (Test-Path -LiteralPath $Link)) { throw "Junction missing after mklink: $Link" }
}

# Remove-Item -Recurse often fails on Windows when nested paths exceed MAX_PATH (Gradle/Android build dirs).
function Remove-DirectoryRobust([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $full = (Resolve-Path -LiteralPath $Path).Path

  $long = "\\?\" + $full
  try {
    [System.IO.Directory]::Delete($long, $true)
    return
  } catch {
    Write-Host "link-node-modules-short: recursive delete note: $($_.Exception.Message)"
  }

  $empty = Join-Path $env:TEMP ("wsm-nm-empty-" + [Guid]::NewGuid().ToString("n"))
  try {
    New-Item -ItemType Directory -Path $empty -Force | Out-Null
    & robocopy.exe $empty $full /MIR /NFL /NDL /NJH /NJS /R:0 /W:0 | Out-Null
    Remove-Item -LiteralPath $empty -Force -ErrorAction SilentlyContinue
    cmd.exe /c "rd /s /q `"$full`"" | Out-Null
  } finally {
    if (Test-Path -LiteralPath $empty) {
      Remove-Item -LiteralPath $empty -Force -Recurse -ErrorAction SilentlyContinue
    }
  }

  try {
    [System.IO.Directory]::Delete($long, $true)
  } catch { }

  if (Test-Path -LiteralPath $Path) {
    cmd.exe /c "rd /s /q `"$full`"" | Out-Null
  }
  if (Test-Path -LiteralPath $Path) {
    throw "Could not delete directory (path may be too long): $Path"
  }
}

# --- Already linked to our store ---
if (Test-Path -LiteralPath $nm) {
  if (Test-IsReparsePoint $nm) {
    $item = Get-Item -LiteralPath $nm -Force
    $tgt = $null
    if ($item.Target) {
      $tgt = [System.IO.Path]::GetFullPath(($item.Target | Select-Object -First 1))
    }
    $want = [System.IO.Path]::GetFullPath($Store)
    if ($tgt -and ($tgt.TrimEnd('\') -eq $want.TrimEnd('\'))) {
      Write-Host "link-node-modules-short: OK (junction -> $Store)"
      exit 0
    }
    Write-Host "link-node-modules-short: removing old junction -> $tgt"
    cmd.exe /c "rmdir `"$nm`"" | Out-Null
  }
}

# --- Plain directory: move to store, then reattach junction ---
if (Test-Path -LiteralPath $nm) {
  if (-not (Test-IsReparsePoint $nm)) {
    Write-Host "link-node-modules-short: moving node_modules to short path: $Store"
    New-Item -ItemType Directory -Path (Split-Path $Store -Parent) -Force | Out-Null

    # Leftover store from an interrupted run: remove it so the current project node_modules wins.
    if (Test-Path -LiteralPath $Store) {
      Write-Host "link-node-modules-short: removing existing store folder (will replace with current node_modules)"
      Remove-DirectoryRobust $Store
    }
    try {
      Move-Item -LiteralPath $nm -Destination $Store -ErrorAction Stop
    } catch {
      Write-Host "link-node-modules-short: Move-Item failed, trying robocopy..."
      New-Item -ItemType Directory -Path $Store -Force | Out-Null
      & robocopy.exe $nm $Store /E /COPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS
      $rc = $LASTEXITCODE
      if ($rc -ge 8) { throw "robocopy failed with exit code $rc" }
      Remove-DirectoryRobust $nm
    }
  }
}

# --- Create junction (after move, or fresh clone with no deps yet) ---
if (-not (Test-Path -LiteralPath $nm)) {
  Write-Host "link-node-modules-short: creating junction $nm -> $Store"
  New-Item -ItemType Directory -Path (Split-Path $Store -Parent) -Force | Out-Null
  if (-not (Test-Path -LiteralPath $Store)) {
    New-Item -ItemType Directory -Path $Store -Force | Out-Null
  }
  New-DirectoryJunction -Link $nm -Target $Store
  if (-not (Get-ChildItem -LiteralPath $Store -Force -ErrorAction SilentlyContinue | Select-Object -First 1)) {
    Write-Host "link-node-modules-short: store is empty - run npm install in this folder." -ForegroundColor DarkYellow
  }
  exit 0
}

Write-Error "link-node-modules-short: unexpected state at $nm"
exit 1
