@echo off
REM Stop WheelSense Docker services (Windows)

echo ==================================================
echo   WheelSense Docker Stopper
echo ==================================================
echo.

REM Check if any services are running
docker compose ps >nul 2>&1
if %errorlevel% equ 0 (
    echo Stopping services...
    docker compose down
    docker compose -f docker-compose.dev.yml down
) else (
    echo No services are running
)

echo.
echo Services stopped
echo.
echo To remove all data:
echo    docker compose down -v
echo.
pause






