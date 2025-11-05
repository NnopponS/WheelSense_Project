@echo off
REM Start WheelSense with Docker Compose (Windows)

echo ==================================================
echo   WheelSense Docker Launcher
echo ==================================================
echo.

REM Check if docker is installed
docker --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker is not installed!
    echo Please install Docker Desktop from: https://docs.docker.com/desktop/install/windows-install/
    pause
    exit /b 1
)

echo OK: Docker is installed
echo.

REM Ask user which mode
echo Select mode:
echo   1^) Production (Public MQTT Broker)
echo   2^) Development (Local MQTT Broker + Hot Reload)
echo.
set /p choice="Enter choice [1-2]: "

if "%choice%"=="1" (
    echo.
    echo Starting Production mode...
    echo.
    
    REM Create data directory
    if not exist data mkdir data
    
    REM Start services
    docker compose up -d
    
    echo.
    echo ==================================================
    echo   WheelSense started successfully!
    echo ==================================================
    echo.
    echo Access points:
    echo   - Dashboard:    http://localhost
    echo   - API Docs:     http://localhost:8000/docs
    echo   - Health Check: http://localhost:8000/api/health
    echo.
    echo Useful commands:
    echo   - View logs:    docker compose logs -f
    echo   - Stop:         docker compose down
    echo   - Restart:      docker compose restart
    echo.
) else if "%choice%"=="2" (
    echo.
    echo Starting Development mode...
    echo.
    
    REM Create directories
    if not exist data mkdir data
    if not exist mosquitto\data mkdir mosquitto\data
    if not exist mosquitto\log mkdir mosquitto\log
    
    REM Start services
    docker compose -f docker-compose.dev.yml up -d
    
    echo.
    echo ==================================================
    echo   WheelSense (Dev) started successfully!
    echo ==================================================
    echo.
    echo Access points:
    echo   - Dashboard:    http://localhost:5173
    echo   - API Docs:     http://localhost:8000/docs
    echo   - Health Check: http://localhost:8000/api/health
    echo   - MQTT Broker:  localhost:1883
    echo.
    echo Useful commands:
    echo   - View logs:    docker compose -f docker-compose.dev.yml logs -f
    echo   - Stop:         docker compose -f docker-compose.dev.yml down
    echo   - Restart:      docker compose -f docker-compose.dev.yml restart
    echo.
) else (
    echo ERROR: Invalid choice!
    pause
    exit /b 1
)

REM Show running containers
echo Running containers:
docker compose ps

echo.
echo Tip: Use 'docker compose logs -f' to view real-time logs
echo.
pause






