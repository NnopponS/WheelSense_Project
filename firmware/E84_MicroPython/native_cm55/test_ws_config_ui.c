#include "ws_config_ui.h"
#include "ws_mailbox.h"
#include "ws_native_service.h"

#include <assert.h>
#include <string.h>

int main(void)
{
    uint8_t slot[WS_MAILBOX_SIZE] = {0};
    ws_native_service_init();
    ws_config_ui_init();
    assert(ws_mailbox_write(slot, 1, 6, NULL, 0) == 0);
    assert(ws_native_service_process(slot) == 1);

    assert(ws_config_ui_key(1, 0) == 'q');
    assert(ws_config_ui_touch(1, 161, 832, 480) == 1);
    assert(strcmp(ws_native_service_state()->wifi_ssid, "1") == 0);
    assert(ws_config_ui_touch(200, 450, 832, 480) == 1);
    assert(ws_native_service_state()->config_field == 1);
    assert(ws_config_ui_touch(400, 450, 832, 480) == 1);
    assert(ws_config_ui_key(1, 0) == 'Q');
    return 0;
}
