# Android SDK Setup Script for Windows
# Run as Administrator

param(
    [string]$InstallPath = "$env:USERPROFILE\Android\Sdk"
)

Write-Host "=== Android SDK Setup Script ===" -ForegroundColor Green
Write-Host "Install path: $InstallPath" -ForegroundColor Yellow

# Create directory
New-Item -ItemType Directory -Force -Path $InstallPath | Out-Null

# Download command line tools
$toolsUrl = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
$zipFile = "$env:TEMP\android-cmdline-tools.zip"

Write-Host "Downloading Android command line tools..." -ForegroundColor Yellow
Invoke-WebRequest -Uri $toolsUrl -OutFile $zipFile

# Extract
Write-Host "Extracting..." -ForegroundColor Yellow
Expand-Archive -Path $zipFile -DestinationPath "$InstallPath\cmdline-tools" -Force

# Rename to latest
Rename-Item -Path "$InstallPath\cmdline-tools\cmdline-tools" -NewName "latest" -ErrorAction SilentlyContinue

# Set environment variables
Write-Host "Setting environment variables..." -ForegroundColor Yellow
[Environment]::SetEnvironmentVariable("ANDROID_HOME", $InstallPath, "User")
[Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $InstallPath, "User")

$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
$newPaths = @(
    "$InstallPath\cmdline-tools\latest\bin"
    "$InstallPath\platform-tools"
    "$InstallPath\emulator"
)

foreach ($path in $newPaths) {
    if ($currentPath -notlike "*$path*") {
        $currentPath = "$path;$currentPath"
    }
}

[Environment]::SetEnvironmentVariable("Path", $currentPath, "User")

# Install SDK components
Write-Host "Installing SDK components..." -ForegroundColor Yellow
& "$InstallPath\cmdline-tools\latest\bin\sdkmanager.bat" --sdk_root=$InstallPath "platform-tools" "platforms;android-34" "build-tools;34.0.0" "emulator"

Write-Host "=== Setup Complete ===" -ForegroundColor Green
Write-Host "Please restart your terminal or IDE for environment variables to take effect" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Create emulator: avdmanager create avd -n Pixel_7 -k 'system-images;android-34;google_apis;x86_64' -d pixel_7" -ForegroundColor White
Write-Host "2. Start emulator: emulator -avd Pixel_7" -ForegroundColor White
Write-Host "3. Build APK: cd android && .\gradlew assembleDebug" -ForegroundColor White
