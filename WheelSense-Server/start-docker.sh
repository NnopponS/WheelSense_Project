#!/bin/bash
# Start WheelSense with Docker Compose

echo "=================================================="
echo "  WheelSense Docker Launcher"
echo "=================================================="
echo ""

# Check if docker and docker-compose are installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed!"
    echo "Please install Docker from: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker compose &> /dev/null; then
    echo "❌ Docker Compose is not installed!"
    echo "Please install Docker Compose from: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo ""

# Ask user which mode
echo "Select mode:"
echo "  1) Production (Public MQTT Broker)"
echo "  2) Development (Local MQTT Broker + Hot Reload)"
echo ""
read -p "Enter choice [1-2]: " choice

case $choice in
    1)
        echo ""
        echo "🚀 Starting Production mode..."
        echo ""
        
        # Create data directory
        mkdir -p data
        
        # Start services
        docker compose up -d
        
        echo ""
        echo "=================================================="
        echo "  ✅ WheelSense started successfully!"
        echo "=================================================="
        echo ""
        echo "📊 Access points:"
        echo "  • Dashboard:    http://localhost"
        echo "  • API Docs:     http://localhost:8000/docs"
        echo "  • Health Check: http://localhost:8000/api/health"
        echo ""
        echo "📋 Useful commands:"
        echo "  • View logs:    docker compose logs -f"
        echo "  • Stop:         docker compose down"
        echo "  • Restart:      docker compose restart"
        echo ""
        ;;
    2)
        echo ""
        echo "🚀 Starting Development mode..."
        echo ""
        
        # Create data directory
        mkdir -p data
        mkdir -p mosquitto/data
        mkdir -p mosquitto/log
        
        # Start services
        docker compose -f docker-compose.dev.yml up -d
        
        echo ""
        echo "=================================================="
        echo "  ✅ WheelSense (Dev) started successfully!"
        echo "=================================================="
        echo ""
        echo "📊 Access points:"
        echo "  • Dashboard:    http://localhost:5173"
        echo "  • API Docs:     http://localhost:8000/docs"
        echo "  • Health Check: http://localhost:8000/api/health"
        echo "  • MQTT Broker:  localhost:1883"
        echo ""
        echo "📋 Useful commands:"
        echo "  • View logs:    docker compose -f docker-compose.dev.yml logs -f"
        echo "  • Stop:         docker compose -f docker-compose.dev.yml down"
        echo "  • Restart:      docker compose -f docker-compose.dev.yml restart"
        echo ""
        ;;
    *)
        echo "❌ Invalid choice!"
        exit 1
        ;;
esac

# Show running containers
echo "🐳 Running containers:"
docker compose ps

echo ""
echo "💡 Tip: Use 'docker compose logs -f' to view real-time logs"
echo ""






