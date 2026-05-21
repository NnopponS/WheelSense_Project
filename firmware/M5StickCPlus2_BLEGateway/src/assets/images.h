#ifndef IMAGES_H
#define IMAGES_H

#include <Arduino.h>

// WheelSense Logo (Simple W icon or similar, placeholder for now)
// 32x32px Icon
const uint16_t logo_width = 32;
const uint16_t logo_height = 32;
const uint16_t logo_data[] = {
    0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, // Placeholder black
    // ... Real bitmap data would be huge here. 
    // For now, let's rely on drawing primitives for the logo or a very simple one.
};

// Actually, drawing a nice text logo is better than a massive hex array for now.
// We can use M5GFX's advanced font features.

#endif
