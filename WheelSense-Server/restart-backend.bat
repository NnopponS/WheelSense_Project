@echo off
echo ================================================
echo   WheelSense Backend - Restart Script
echo ================================================
echo.

echo [1/3] Stopping current containers...
docker compose down

echo.
echo [2/3] Rebuilding with new schema and endpoints...
docker compose build --no-cache

echo.
echo [3/3] Starting services...
docker compose up -d

echo.
echo ================================================
echo   Backend Restarted Successfully!
echo ================================================
echo.
echo API Server:  http://localhost:8000
echo API Docs:    http://localhost:8000/docs
echo Health:      http://localhost:8000/api/health
echo.

timeout /t 3
docker compose ps

echo.
echo Testing Patient endpoint...
curl -s http://localhost:8000/api/patients

echo.
echo.
echo ✅ Done! Refresh your dashboard.
pause

