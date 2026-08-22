#ifndef WS_CONFIG_UI_H
#define WS_CONFIG_UI_H

#include <stdint.h>

void ws_config_ui_init(void);
char ws_config_ui_key(uint8_t row, uint8_t column);
int ws_config_ui_touch(uint16_t x, uint16_t y, uint16_t width, uint16_t height);

#endif
