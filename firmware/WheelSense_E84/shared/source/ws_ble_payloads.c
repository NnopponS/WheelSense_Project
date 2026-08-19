/*
 * WheelSense BLE payload constraints.
 *
 * BLE has a smaller MTU than IPC. This file implements the size check
 * that rejects payloads too large for BLE transport. The actual payload
 * encoding reuses the IPC message codecs from ws_ipc_messages.h.
 */

#include "ws_ble_payloads.h"

ws_status_t ws_ble_check_payload_size(uint16_t message_type,
                                      uint16_t payload_length)
{
    (void)message_type; /* type is validated by the envelope codec */

    if (payload_length > WS_BLE_MAX_PAYLOAD_SIZE)
    {
        return WS_STATUS_OVERFLOW;
    }
    return WS_STATUS_READY;
}
