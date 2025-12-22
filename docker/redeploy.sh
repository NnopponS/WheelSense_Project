#!/bin/bash
# WheelSense - Quick Redeploy Script (Bash)
# For rebuilding and restarting containers after code changes

echo "🚀 Starting redeployment..."

# 1. Rebuild containers
echo ""
echo "📦 Rebuilding containers..."
docker-compose build backend dashboard

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

# 2. Restart services
echo ""
echo "🔄 Restarting services..."
docker-compose up -d backend dashboard nginx

if [ $? -ne 0 ]; then
    echo "❌ Restart failed!"
    exit 1
fi

# 3. Wait a bit for services to start
echo ""
echo "⏳ Waiting for services to start..."
sleep 5

# 4. Check logs
echo ""
echo "📋 Checking backend logs (last 20 lines)..."
docker-compose logs --tail=20 backend

echo ""
echo "✅ Deployment complete!"
echo "🌐 Frontend: http://localhost"
echo "🔧 Backend API: http://localhost:8000"
echo ""
echo "💡 Don't forget to flash ESP32 Controller!"


