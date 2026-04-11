#!/usr/bin/env bash
# Start WheelSense Simulator Environment
#
# Usage:
#   ./start-sim.sh
#   ./start-sim.sh --build
#   ./start-sim.sh --reset
#   ./start-sim.sh --detach

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$SERVER_DIR/docker-compose.sim.yml"

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
GRAY='\033[0;37m'
NC='\033[0m' # No Color

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}WheelSense Simulator Environment${NC}"
echo -e "${CYAN}========================================${NC}"

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

# Check if compose file exists
if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}Compose file not found: $COMPOSE_FILE${NC}"
    exit 1
fi

echo -e "${GRAY}Compose file: $COMPOSE_FILE${NC}"

# Parse arguments
BUILD=false
RESET=false
DETACH=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --build|-b)
            BUILD=true
            shift
            ;;
        --reset|-r)
            RESET=true
            shift
            ;;
        --detach|-d)
            DETACH=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Stop any running production containers first (to avoid port conflicts)
echo -e "${YELLOW}Stopping any running production containers...${NC}"
PROD_COMPOSE="$SERVER_DIR/docker-compose.yml"
if [ -f "$PROD_COMPOSE" ]; then
    docker compose -f "$PROD_COMPOSE" down 2>/dev/null || true
fi

# Handle reset request
if [ "$RESET" = true ]; then
    echo -e "${RED}Resetting simulator data volumes...${NC}"
    echo -e "${RED}This will delete all simulator data and start fresh!${NC}"
    read -p "Type 'yes' to confirm: " confirm
    if [ "$confirm" = "yes" ]; then
        docker compose -f "$COMPOSE_FILE" down -v 2>/dev/null || true
        echo -e "${GREEN}Simulator volumes cleared.${NC}"
    else
        echo -e "${YELLOW}Reset cancelled.${NC}"
    fi
fi

# Build if requested
if [ "$BUILD" = true ]; then
    echo -e "${CYAN}Building simulator containers...${NC}"
    docker compose -f "$COMPOSE_FILE" build
fi

# Start the simulator environment
echo -e "${CYAN}Starting Simulator Environment...${NC}"
echo -e "${MAGENTA}Mode: SIMULATOR (pre-populated demo data)${NC}"
echo -e "${GRAY}Database: pgdata-sim (isolated from production)${NC}"
echo ""

UP_ARGS="-f $COMPOSE_FILE up"
if [ "$DETACH" = true ]; then
    UP_ARGS="$UP_ARGS -d"
fi

docker compose $UP_ARGS

if [ $? -eq 0 ]; then
    echo -e ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}Simulator Environment Started!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo -e "${WHITE}Frontend: http://localhost:3000${NC}"
    echo -e "${WHITE}Backend API: http://localhost:8000/api${NC}"
    echo -e "${WHITE}API Docs: http://localhost:8000/docs${NC}"
    echo -e "${WHITE}Home Assistant: http://localhost:8123${NC}"
    echo -e "${WHITE}MQTT Broker: localhost:1883${NC}"
    echo ""
    echo -e "${CYAN}Login (default):${NC}"
    echo -e "${WHITE}  Admin: admin / wheelsense2026${NC}"
    echo -e "${WHITE}  Head Nurse: sim_headnurse / demo1234${NC}"
    echo -e "${WHITE}  Supervisor: sim_supervisor / demo1234${NC}"
    echo -e "${WHITE}  Observer: sim_observer1 / demo1234${NC}"
    echo ""
    echo -e "${YELLOW}To reset simulator data, visit: /admin/settings > Server > Reset Simulator${NC}"
    if [ "$DETACH" = false ]; then
        echo -e "${GRAY}Press Ctrl+C to stop...${NC}"
    fi
else
    echo -e "${RED}Failed to start simulator environment!${NC}"
    exit 1
fi
