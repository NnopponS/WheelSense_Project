#include "DisplayManager.h"

DisplayManager DisplayMgr;

DisplayManager::DisplayManager() : canvas(&M5.Lcd) {}

void DisplayManager::begin() {
    M5.Lcd.setRotation(SCREEN_ROTATION);
    M5.Lcd.setTextSize(1);
    M5.Lcd.fillScreen(COLOR_BG);

    if (spriteReady) {
        canvas.deleteSprite();
        spriteReady = false;
    }

    // Full-screen 16bpp sprite (~64KB) can starve BLE stack on ESP32.
    // Use 8bpp and skip sprite if heap is too tight.
    canvas.setColorDepth(8);
    const uint32_t heapBefore = ESP.getFreeHeap();
    const uint32_t reserveForSystem = 120 * 1024;
    const uint32_t estimatedSpriteBytes = (uint32_t)M5.Lcd.width() * (uint32_t)M5.Lcd.height();
    if (heapBefore > (reserveForSystem + estimatedSpriteBytes)) {
        spriteReady = (canvas.createSprite(M5.Lcd.width(), M5.Lcd.height()) != nullptr);
    } else {
        spriteReady = false;
    }
    if (spriteReady) {
        canvas.setTextSize(1);
    }
    clear();
    present(true);
    if (!spriteReady) {
        Serial.printf("[UI] Sprite disabled (heap=%lu), using direct LCD mode\n", (unsigned long)heapBefore);
    }
}

void DisplayManager::present(bool force) {
    if (!spriteReady) return;
    if (!force && !frameDirty) return;
    const unsigned long now = millis();
    if (!force && (now - lastPresentMs) < 16) return;
    canvas.pushSprite(0, 0);
    lastPresentMs = now;
    frameDirty = false;
}

uint16_t DisplayManager::mix565(uint16_t c1, uint16_t c2, uint8_t t) {
    uint8_t r1 = (c1 >> 11) & 0x1F;
    uint8_t g1 = (c1 >> 5) & 0x3F;
    uint8_t b1 = c1 & 0x1F;
    uint8_t r2 = (c2 >> 11) & 0x1F;
    uint8_t g2 = (c2 >> 5) & 0x3F;
    uint8_t b2 = c2 & 0x1F;

    uint8_t r = (uint8_t)(((r1 * (255 - t)) + (r2 * t)) / 255);
    uint8_t g = (uint8_t)(((g1 * (255 - t)) + (g2 * t)) / 255);
    uint8_t b = (uint8_t)(((b1 * (255 - t)) + (b2 * t)) / 255);
    return (uint16_t)((r << 11) | (g << 5) | b);
}

void DisplayManager::drawVerticalGradient(uint16_t topColor, uint16_t bottomColor) {
    auto& g = getGfx();
    int h = g.height();
    int w = g.width();
    for (int y = 0; y < h; y++) {
        uint8_t t = (uint8_t)((y * 255) / (h - 1));
        g.drawFastHLine(0, y, w, mix565(topColor, bottomColor, t));
    }
}

void DisplayManager::clear() {
    // BruceDevices style keeps redraw regions small to avoid visible flicker.
    // We combine this with off-screen sprite when available.
    frameDirty = true;
    drawVerticalGradient(0x0000, 0x0843);
}

void DisplayManager::drawHeader(const char* title) {
    auto& g = getGfx();
    int w = g.width();
    g.fillRoundRect(4, 4, w - 8, 22, 6, 0x10A2);
    g.fillRoundRect(6, 6, w - 12, 18, 5, 0x18E3);
    g.fillRect(10, 10, 3, 10, COLOR_PRIMARY);
    g.setTextColor(COLOR_TEXT);
    g.setTextDatum(MC_DATUM);
    g.drawString(title, w / 2, 15);
}

void DisplayManager::drawFooter(const char* left, const char* center, const char* right) {
    auto& g = getGfx();
    int w = g.width();
    int h = g.height();
    int y = h - 12;
    g.setTextSize(1);
    g.setTextColor(0x7BEF);
    if (left && left[0]) {
        g.setTextDatum(ML_DATUM);
        g.drawString(left, 4, y);
    }
    if (center && center[0]) {
        g.setTextDatum(MC_DATUM);
        g.drawString(center, w / 2, y);
    }
    if (right && right[0]) {
        g.setTextDatum(MR_DATUM);
        g.drawString(right, w - 4, y);
    }
}

void DisplayManager::drawMenu(
    const char* title, const char* items[], int itemCount, int selectedIndex, bool showGuideFooter
) {
    auto& g = getGfx();
    clear();
    drawHeader(title);

    if (itemCount <= 0) {
        if (showGuideFooter) drawFooter("", "", "Power:BACK");
        return;
    }

    const int topY = 28;
    const int itemH = 16;
    const int bottomReserved = showGuideFooter ? 16 : 8;
    const int maxVisible = max(1, (g.height() - topY - bottomReserved) / itemH);

    int startIdx = 0;
    if (selectedIndex >= maxVisible) startIdx = selectedIndex - maxVisible + 1;
    if (startIdx > itemCount - maxVisible) startIdx = itemCount - maxVisible;
    if (startIdx < 0) startIdx = 0;

    int visible = itemCount - startIdx;
    if (visible > maxVisible) visible = maxVisible;

    for (int i = 0; i < visible; i++) {
        int idx = startIdx + i;
        int y = topY + (i * itemH);
        bool selected = (idx == selectedIndex);
        uint16_t fill = selected ? COLOR_PRIMARY : 0x18E3;
        uint16_t text = selected ? COLOR_BG : COLOR_TEXT;

        g.fillRoundRect(6, y, g.width() - 12, itemH - 2, 4, fill);
        g.setTextColor(text);
        g.setTextDatum(ML_DATUM);
        g.drawString(items[idx], 12, y + (itemH / 2) - 1);
    }

    if (showGuideFooter) {
        drawFooter("M5:ENTER", "Side:NEXT", "Power:BACK");
    }
}

void DisplayManager::drawMessage(const char* title, const char* msg, uint32_t color) {
    auto& g = getGfx();
    clear();
    drawHeader(title);

    g.fillRoundRect(8, 42, g.width() - 16, 120, 8, 0x1082);
    g.setTextColor(color);
    g.setTextDatum(TL_DATUM);

    String message = msg ? String(msg) : String("");
    int y = 50;
    int start = 0;
    while (start <= message.length()) {
        int idx = message.indexOf('\n', start);
        String line = (idx < 0) ? message.substring(start) : message.substring(start, idx);
        g.drawString(line, 14, y);
        y += 16;
        if (idx < 0) break;
        start = idx + 1;
    }

}

lgfx::LovyanGFX& DisplayManager::getGfx() {
    if (spriteReady) return canvas;
    return M5.Lcd;
}

bool DisplayManager::isSpriteEnabled() const {
    return spriteReady;
}
