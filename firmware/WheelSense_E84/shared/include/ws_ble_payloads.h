#ifndef WS_BLE_PAYLOADS_H
#define WS_BLE_PAYLOADS_H

#include <stddef.h>
#include <stdint.h>
#include "ws_status.h"

/*
 * WheelSense BLE payload constraints.
 *
 * BLE has a smaller MTU than IPC. This header defines the BLE-specific
 * payload size limit and a check function that rejects payloads too
 * large for BLE transport. The actual encoding reuses the IPC message
 * codecs from ws_ipc_messages.h; only the size cap differs.
 */

/* BLE MTU minus envelope header overhead (typical 20-byte ATT MTU payload). */
#define WS_BLE_MAX_PAYLOAD_SIZE 20u

/*
 * Check whether a payload of the given message_type and payload_length
 * fits within the BLE transport limit.
 *
 * Returns WS_STATUS_READY if it fits, WS_STATUS_OVERFLOW otherwise.
 */
ws_status_t ws_ble_check_payload_size(uint16_t message_type,
                                      uint16_t payload_length);

#endif /* WS_BLE_PAYLOADS_H */
