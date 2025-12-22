#!/bin/bash

# Translation System Sanity Test
# Quick checklist to verify EN/TH translation works

echo "🧪 Translation System Sanity Test"
echo "=================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if backend is running
echo "1. Checking backend service..."
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Backend is running"
else
    echo -e "${RED}✗${NC} Backend is not running. Start with: docker-compose up"
    exit 1
fi

# Test translation endpoint
echo ""
echo "2. Testing translation endpoint..."
RESPONSE=$(curl -s -X POST http://localhost:8000/translate \
    -H "Content-Type: application/json" \
    -d '{"text":"Hello World","from_lang":"en","to_lang":"th"}')

if echo "$RESPONSE" | grep -q "translated"; then
    echo -e "${GREEN}✓${NC} Translation endpoint works"
    echo "   Response: $RESPONSE"
else
    echo -e "${RED}✗${NC} Translation endpoint failed"
    echo "   Response: $RESPONSE"
    exit 1
fi

# Check for technical term protection
echo ""
echo "3. Testing technical term protection..."
RESPONSE=$(curl -s -X POST http://localhost:8000/translate \
    -H "Content-Type: application/json" \
    -d '{"text":"Send MQTT payload as JSON","from_lang":"en","to_lang":"th"}')

if echo "$RESPONSE" | grep -qi "MQTT\|JSON"; then
    echo -e "${GREEN}✓${NC} Technical terms preserved"
    echo "   Response: $RESPONSE"
else
    echo -e "${YELLOW}⚠${NC} Technical terms may not be preserved"
    echo "   Response: $RESPONSE"
fi

echo ""
echo "=================================="
echo -e "${GREEN}✅ Automated checks passed!${NC}"
echo ""
echo "Next steps (manual):"
echo "1. Open http://localhost:3000 in browser"
echo "2. Click 'TH' button in top-right"
echo "3. Navigate to 'Wheelchairs & Patients' page"
echo "4. Verify UI text translates to Thai"
echo "5. Verify technical terms (MQTT, API, JSON) remain English"
echo "6. Refresh page - TH should persist"
echo "7. Check browser console for errors"

