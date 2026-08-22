#ifndef WS_FT5406_H
#define WS_FT5406_H

#include <stdbool.h>
#include <stdint.h>

#define WS_FT5406_I2C_ADDRESS 0x38u
#define WS_FT5406_DATA_REGISTER 0x00u
#define WS_FT5406_DATA_LENGTH 7u

typedef struct {
    bool pressed;
    uint16_t x;
    uint16_t y;
} ws_touch_point_t;

int ws_ft5406_decode(const uint8_t data[WS_FT5406_DATA_LENGTH],
                     ws_touch_point_t *point);

#endif
