@echo off
echo ================================
echo WheelSense - Starting All Services
echo ================================

echo.
echo [1/2] Starting Docker services...
cd /d "%~dp0docker"
start cmd /k "docker-compose up"

echo.
echo [2/2] Starting Xiao BLE Sensor Service...
timeout /t 5 /nobreak > nul
cd /d "%~dp0xiao-sensor-service"
start cmd /k "python server.py"

echo.
echo ================================
echo All services started!
echo ================================
echo.
echo Dashboard: http://localhost:3000
echo Sensors:   http://localhost:3000/Admin/Sensors
echo.
pause
