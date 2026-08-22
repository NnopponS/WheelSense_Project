#include "ws_ft5406.h"

#include <assert.h>

int main(void)
{
    ws_touch_point_t point;
    const uint8_t pressed[WS_FT5406_DATA_LENGTH] = {0, 0, 1, 0x01, 0x23, 0x01, 0x45};
    assert(ws_ft5406_decode(pressed, &point) == 1);
    assert(point.pressed && point.x == 0x123 && point.y == 0x145);

    const uint8_t released[WS_FT5406_DATA_LENGTH] = {0};
    assert(ws_ft5406_decode(released, &point) == 0);
    assert(!point.pressed);
    return 0;
}
