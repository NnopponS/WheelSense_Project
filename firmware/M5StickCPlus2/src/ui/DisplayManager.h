#ifndef DISPLAY_MANAGER_H
#define DISPLAY_MANAGER_H

#include <M5StickCPlus2.h>
#include "Config.h"

class DisplayManager {
public:
    DisplayManager();
    void begin();
    void present(bool force = false);
    
    // Primitives
    void clear();
    void drawHeader(const char* title);
    void drawFooter(const char* left, const char* center, const char* right);
    
    // UI Elements
    void drawMenu(const char* title, const char* items[], int itemCount, int selectedIndex, bool showGuideFooter = true);
    void drawMessage(const char* title, const char* msg, uint32_t color = COLOR_TEXT);
    void drawKeyboard(const char* title, char* buffer, int maxLength); // Logic handled in scene, this draws
    
    // Helper
    lgfx::LovyanGFX& getGfx(); // Access current drawing target
    bool isSpriteEnabled() const;
    
private:
    M5Canvas canvas;
    bool spriteReady = false;
    bool frameDirty = false;
    unsigned long lastPresentMs = 0;
    uint16_t mix565(uint16_t c1, uint16_t c2, uint8_t t);
    void drawVerticalGradient(uint16_t topColor, uint16_t bottomColor);
};

extern DisplayManager DisplayMgr;

#endif
