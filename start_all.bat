@echo off
echo ========================================
echo   WheelSense - Starting All Services
echo ========================================

echo.
echo [1/3] Detecting Host Wi-Fi IP address...
set HOST_IP=
for /f "usebackq tokens=*" %%a in (`powershell -NoProfile -Command "(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1).IPv4Address.IPAddress" 2^>nul`) do set HOST_IP=%%a

if "%HOST_IP%"=="" (
    for /f "usebackq tokens=*" %%a in (`py -c "import socket; s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('8.8.8.8', 80)); print(s.getsockname()[0]); s.close()" 2^>nul`) do set HOST_IP=%%a
)

if "%HOST_IP%"=="" (
    for /f "usebackq tokens=*" %%a in (`python -c "import socket; s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('8.8.8.8', 80)); print(s.getsockname()[0]); s.close()" 2^>nul`) do set HOST_IP=%%a
)

if "%HOST_IP%"=="" (
    echo [Warning] Could not auto-detect Wi-Fi IP. TSIM and CucumberRS will use automatic subnet scan.
) else (
    echo [Network] Active Host IP detected: %HOST_IP%
    echo HOST_IP=%HOST_IP%> "%~dp0docker\.env"
)

echo.
echo [2/3] Starting Docker services...
cd /d "%~dp0docker"
start cmd /k "docker-compose up"

echo.
echo [3/3] Starting Xiao BLE Sensor Service...
timeout /t 5 /nobreak > nul
cd /d "%~dp0xiao-sensor-service"
start cmd /k "py server.py || python server.py"

echo.
echo ========================================
echo   All services started!
echo ========================================
echo.
echo Host PC IP (Hotspot/LAN): %HOST_IP%
echo TSIM Setup AP IP:         192.168.4.1 (SSID: WheelSense-TSIM_001, Pass: 12345678)
echo CucumberRS Setup AP:      192.168.4.1 (SSID: WheelSense-Setup, Pass: wheelsense123)
echo Dashboard (Local):        http://localhost:3000/admin
echo Dashboard (Hotspot LAN):  http://%HOST_IP%:3000/admin
echo Patient View:             http://localhost:3000/patient
echo.
pause
