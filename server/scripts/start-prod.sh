#!/usr/bin/env bash
# Start WheelSense Production Environment
#
# Usage:
#   ./start-prod.sh
#   ./start-prod.sh --build
#   ./start-prod.sh --reset
#   ./start-prod.sh --detach

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$SERVER_DIR/docker-compose.yml"

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
WHITE='\033[1;37m'
GRAY='\033[0;37m'
NC='\033[0m' # No Color

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}WheelSense Production Environment${NC}"
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

# Stop any running simulator containers first (to avoid port conflicts)
echo -e "${YELLOW}Stopping any running simulator containers...${NC}"
SIM_COMPOSE="$SERVER_DIR/docker-compose.sim.yml"
if [ -f "$SIM_COMPOSE" ]; then
    docker compose -f "$SIM_COMPOSE" down 2>/dev/null || true
fi

# Handle reset request
if [ "$RESET" = true ]; then
    echo -e "${RED}Resetting production data volumes...${NC}"
    echo -e "${RED}WARNING: This will delete ALL production data!${NC}"
    read -p "Type 'DELETE ALL DATA' to confirm: " confirm
    if [ "$confirm" = "DELETE ALL DATA" ]; then
        docker compose -f "$COMPOSE_FILE" down -v 2>/dev/null || true
        echo -e "${GREEN}Production volumes cleared.${NC}"
    else
        echo -e "${YELLOW}Reset cancelled.${NC}"
    fi
fi

# Build if requested
if [ "$BUILD" = true ]; then
    echo -e "${CYAN}Building production containers...${NC}"
    docker compose -f "$COMPOSE_FILE" build
fi

# Start the production environment
echo -e "${CYAN}Starting Production Environment...${NC}"
echo -e "${GREEN}Mode: PRODUCTION (clean database for real-world use)${NC}"
echo -e "${GRAY}Database: pgdata-prod (isolated from simulator)${NC}"
echo ""

UP_ARGS="-f $COMPOSE_FILE up"
if [ "$DETACH" = true ]; then
    UP_ARGS="$UP_ARGS -d"
fi

docker compose $UP_ARGS

if [ $? -eq 0 ]; then
    echo -e ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}Production Environment Started!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo -e "${WHITE}Frontend: http://localhost:3000${NC}"
    echo -e "${WHITE}Backend API: http://localhost:8000/api${NC}"
    echo -e "${WHITE}API Docs: http://localhost:8000/docs${NC}"
    echo -e "${WHITE}Home Assistant: http://localhost:8123${NC}"
    echo -e "${WHITE}MQTT Broker: localhost:1883${NC}"
    echo ""
    echo -e "${YELLOW}IMPORTANT: This is a CLEAN environment.${NC}"
    echo -e "${YELLOW}You need to:${NC}"
    echo -e "${WHITE}  1. Create a workspace${NC}"
    echo -e "${WHITE}  2. Add patients, caregivers, and devices${NC}"
    echo -e "${WHITE}  3. Configure MQTT devices to publish real data${NC}"
    echo ""
    echo -e "${CYAN}To seed production demo data instead, run:${NC}"
    echo -e "${WHITE}  python scripts/seed_production.py${NC}"
    if [ "$DETACH" = false ]; then
        echo -e "${GRAY}Press Ctrl+C to stop...${NC}"
    fi
else
    echo -e "${RED}Failed to start production environment!${NC}"
    exit 1
fi
