#!/bin/bash
# Stop WheelSense Docker services

echo "=================================================="
echo "  WheelSense Docker Stopper"
echo "=================================================="
echo ""

# Check which compose file is running
if docker compose ps | grep -q "wheelsense"; then
    echo "🛑 Stopping Production services..."
    docker compose down
elif docker compose -f docker-compose.dev.yml ps | grep -q "wheelsense"; then
    echo "🛑 Stopping Development services..."
    docker compose -f docker-compose.dev.yml down
else
    echo "⚠️  No WheelSense services are running"
fi

echo ""
echo "✅ Services stopped"
echo ""
echo "💡 To remove all data:"
echo "   docker compose down -v"
echo ""






