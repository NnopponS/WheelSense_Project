#include "ws_ft5406.h"

int ws_ft5406_decode(const uint8_t data[WS_FT5406_DATA_LENGTH],
                     ws_touch_point_t *point)
{
    if (!data || !point) {
        return -1;
    }
    point->pressed = (data[2] & 0x0Fu) != 0;
    if (!point->pressed) {
        point->x = 0;
        point->y = 0;
        return 0;
    }
    point->x = (uint16_t)(((uint16_t)(data[3] & 0x0Fu) << 8) | data[4]);
    point->y = (uint16_t)(((uint16_t)(data[5] & 0x0Fu) << 8) | data[6]);
    if (point->x >= 800u || point->y >= 480u) {
        return -1;
    }
    return 1;
}
