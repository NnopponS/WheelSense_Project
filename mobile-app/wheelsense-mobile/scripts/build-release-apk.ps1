# Build a release APK for sideloading (WheelSense Mobile).
# Prerequisites:
#   - JDK 17+ (Eclipse Temurin or Android Studio JBR)
#   - Android SDK (install via Android Studio → More Actions → SDK Manager)
#
# Output: android\app\build\outputs\apk\release\app-release.apk

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

# Put physical node_modules under a shorter path (junction); helps CMake/Ninja on Windows.
if ($env:OS -match 'Windows_NT' -and -not $env:WHEELSENSE_SKIP_SHORT_NODE_MODULES) {
  & (Join-Path $PSScriptRoot 'link-node-modules-short.ps1')
}

function Test-AndroidSdkRoot([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
  if (-not (Test-Path -LiteralPath $Path)) { return $false }
  foreach ($sub in @('platform-tools', 'build-tools', 'platforms', 'cmdline-tools')) {
    if (Test-Path (Join-Path $Path $sub)) { return $true }
  }
  return $false
}

function Get-AndroidSdkFromRegistry {
  $keys = @(
    'HKLM:\SOFTWARE\Android\Android Studio',
    'HKCU:\SOFTWARE\Android\Android Studio',
    'HKLM:\SOFTWARE\WOW6432Node\Android\Android Studio'
  )
  foreach ($k in $keys) {
    if (-not (Test-Path $k)) { continue }
    $p = (Get-ItemProperty $k -ErrorAction SilentlyContinue)
    if ($p.sdkPath -and (Test-AndroidSdkRoot $p.sdkPath)) { return $p.sdkPath }
  }
  return $null
}

function Resolve-AndroidSdk {
  foreach ($name in @('ANDROID_SDK_ROOT', 'ANDROID_HOME')) {
    foreach ($scope in @('Process', 'User', 'Machine')) {
      $v = [Environment]::GetEnvironmentVariable($name, $scope)
      if ($v -and (Test-AndroidSdkRoot $v)) { return $v.TrimEnd('\') }
    }
  }

  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Android\Sdk'),
    (Join-Path $env:USERPROFILE 'AppData\Local\Android\Sdk'),
    'C:\Android\Sdk'
  )
  foreach ($c in $candidates) {
    if (Test-AndroidSdkRoot $c) { return $c }
  }

  $fromReg = Get-AndroidSdkFromRegistry
  if ($fromReg) { return $fromReg }

  # adb.exe lives in platform-tools — infer SDK root if adb is on PATH
  $adb = Get-Command adb -ErrorAction SilentlyContinue
  if ($adb -and $adb.Source) {
    $parent = Split-Path -Parent $adb.Source
    if ((Split-Path -Leaf $parent) -eq 'platform-tools') {
      $root = Split-Path -Parent $parent
      if (Test-AndroidSdkRoot $root) { return $root }
    }
  }

  return $null
}

# Prefer Temurin 17 (any patch), then Android Studio JBR
$JavaCandidates = @()
$adoptium = 'C:\Program Files\Eclipse Adoptium'
if (Test-Path $adoptium) {
  $JavaCandidates += Get-ChildItem $adoptium -Directory -Filter 'jdk-17*' -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
}
$JavaCandidates += 'C:\Program Files\Android\Android Studio\jbr'
foreach ($j in $JavaCandidates) {
  if (-not $j) { continue }
  if (Test-Path "$j\bin\java.exe") {
    $env:JAVA_HOME = $j
    $env:PATH = "$j\bin;$env:PATH"
    break
  }
}

if (-not $env:JAVA_HOME) {
  Write-Error 'JDK 17+ not found. Install Eclipse Temurin 17 or Android Studio (bundled JBR).'
}

$sdk = Resolve-AndroidSdk
if (-not $sdk) {
  $typical = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
  Write-Error @"
Android SDK not found.

Do this once:
  1. Install Android Studio: https://developer.android.com/studio
  2. Open Android Studio -> More Actions -> SDK Manager (or Settings -> Languages & Frameworks -> Android SDK)
  3. On SDK Platforms tab, install a recent Android SDK Platform (API 34+).
  4. On SDK Tools tab, ensure "Android SDK Build-Tools" and "Android SDK Platform-Tools" are installed.

Then either:
  - Set a user environment variable ANDROID_HOME to your SDK folder (often: $typical)
    PowerShell (current session):  `$env:ANDROID_HOME = '$typical'`
    Or System Properties -> Environment Variables -> New User variable ANDROID_HOME
  - Or add platform-tools to PATH (so this script can find adb.exe and infer the SDK path)

After that, run: npm run build:apk
"@
}

$RootPhysical = (Resolve-Path -LiteralPath $Root).Path
if ($env:OS -match 'Windows_NT' -and $RootPhysical.Length -ge 72) {
  Write-Host @"

Long path warning: this folder path is very long. CMake/NDK on Windows may fail with ninja errors.
Fix one of:
  - npm run deps:link-short   (physical node_modules under $($env:LOCALAPPDATA)\wsm-short-nm\... + junction; run npm install after if needed)
  - Clone or copy the project to a short path, e.g. C:\dev\ws  then run npm run build:apk there
  - Enable Windows long paths (admin): New-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force
    (then sign out / reboot)

"@ -ForegroundColor DarkYellow
}

# Gradle/Java read local.properties as ISO-8859-1; UTF-8 with BOM breaks the "sdk.dir" key.
$propsPath = Join-Path $Root 'android\local.properties'
$sdkUnix = $sdk -replace '\\', '/'
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($propsPath, "sdk.dir=$sdkUnix`n", $utf8NoBom)

Write-Host "Using JAVA_HOME=$env:JAVA_HOME"
Write-Host "Using ANDROID_HOME=$sdk"
Write-Host "Project root: $RootPhysical"

if (-not (Test-Path (Join-Path $Root 'android\gradlew.bat'))) {
  Write-Host 'Running expo prebuild (android)...'
  npx expo prebuild --platform android --no-install
}

# Stale CMake output can cause ninja "build.ninja still dirty"
Get-ChildItem (Join-Path $Root 'node_modules') -Recurse -Directory -Filter '.cxx' -ErrorAction SilentlyContinue |
  Where-Object { $_.Parent.Name -eq 'android' } |
  ForEach-Object {
    Write-Host "Removing $($_.FullName)"
    Remove-Item -Recurse -Force $_.FullName -ErrorAction SilentlyContinue
  }

Push-Location (Join-Path $Root 'android')
try {
  .\gradlew.bat assembleRelease --no-daemon
} finally {
  Pop-Location
}

$apk = Join-Path $Root 'android\app\build\outputs\apk\release\app-release.apk'
if (Test-Path $apk) {
  Write-Host ''
  Write-Host "OK: $apk" -ForegroundColor Green
  Get-Item $apk | Format-List FullName, Length, LastWriteTime
} else {
  Write-Error "APK not found at expected path: $apk"
}
