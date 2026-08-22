#include "ws_config_ui.h"

#include "ws_native_service.h"

#include <ctype.h>

static uint8_t page;

void ws_config_ui_init(void)
{
    page = 0;
}

char ws_config_ui_key(uint8_t row, uint8_t column)
{
    static const char normal[4][13] = {
        "1234567890-_", "qwertyuiop[]", "asdfghjkl;:@", "zxcvbnm,./? "
    };
    static const char symbols[4][13] = {
        "!@#$%^&*()_+", "~|\\<>{}[]=:;", "1234567890-'", ".,/?&+*-()  "
    };
    if (row >= 4 || column >= 12) {
        return 0;
    }
    char key = page == 2 ? symbols[row][column] : normal[row][column];
    return page == 1 ? (char)toupper((unsigned char)key) : key;
}

int ws_config_ui_touch(uint16_t x, uint16_t y, uint16_t width, uint16_t height)
{
    if (!width || !height || x >= width || y >= height) {
        return 0;
    }
    if (y >= 160u && y < 400u) {
        const uint8_t row = (uint8_t)((y - 160u) / 60u);
        const uint8_t column = (uint8_t)((uint32_t)x * 12u / width);
        const char key = ws_config_ui_key(row, column);
        return key && ws_native_service_config_append(key) == 0;
    }
    if (y < 410u) {
        return 0;
    }
    switch ((uint32_t)x * 5u / width) {
        case 0: ws_native_service_config_backspace(); break;
        case 1: ws_native_service_config_next(); break;
        case 2: page = page == 1 ? 0 : 1; break;
        case 3: page = page == 2 ? 0 : 2; break;
        default: return ws_native_service_config_submit() == 0 ? 2 : -1;
    }
    return 1;
}
