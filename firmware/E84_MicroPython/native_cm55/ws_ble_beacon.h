#ifndef WS_BLE_BEACON_H
#define WS_BLE_BEACON_H

#include <stddef.h>
#include <stdint.h>

/*
 * Raw-HCI BLE beacon for the CYW55513 on the E84 kit.
 *
 * The MicroPython image on CM33 does not expose the `bluetooth` module,
 * so BLE advertising is done natively on CM55 via the BT UART (P10_0/P10_1).
 *
 * The core logic is transport-agnostic: the board port supplies a
 * ws_ble_transport_t with write/read/delay callbacks.  Host tests
 * inject a fake transport to verify the HCI sequence and advertising
 * payload without hardware.
 *
 * The advertising payload matches ble_node.py so the Flutter gateway's
 * existing `CAM_` scan filter discovers the node unchanged:
 *   flags (0x02 0x01 0x06) + Complete Local Name (0x09).
 */

#define WS_BLE_NAME_MAX 26u   /* fits a 31-byte ADV_DATA slot */
#define WS_BLE_ADV_DATA_MAX 31u
#define WS_BLE_HCI_CMD_MAX 64u

/* HCI opcodes used by the beacon (Bluetooth Core spec). */
#define WS_BLE_HCI_RESET 0x0C03u
#define WS_BLE_HCI_LE_SET_ADV_PARAMS 0x2006u
#define WS_BLE_HCI_LE_SET_ADV_DATA 0x2008u
#define WS_BLE_HCI_LE_SET_ADV_ENABLE 0x200Au

typedef struct {
    int (*write)(const uint8_t *data, size_t length);
    int (*read)(uint8_t *buffer, size_t length, uint32_t timeout_ms);
    void (*delay_ms)(uint32_t ms);
} ws_ble_transport_t;

typedef enum {
    WS_BLE_OK = 0,
    WS_BLE_ERR_ARG = -1,
    WS_BLE_ERR_TRANSPORT = -2,
    WS_BLE_ERR_NAME = -3,
} ws_ble_result_t;

/* Build the 31-byte advertising payload (flags + complete local name). */
int ws_ble_build_adv_data(uint8_t *out, size_t out_size, const char *name);

/* Build a raw HCI command packet into `out`. Returns total length, or <0. */
int ws_ble_build_cmd(uint8_t *out, size_t out_size, uint16_t opcode,
                     const uint8_t *params, size_t param_length);

/* Build the LE_Set_Advertising_Parameters command for non-connectable
 * advertising at `interval_us` on all three channels. */
int ws_ble_build_adv_params_cmd(uint8_t *out, size_t out_size, uint32_t interval_us);

/* Build the LE_Set_Advertise_Enable command. enable=1 starts, 0 stops. */
int ws_ble_build_adv_enable_cmd(uint8_t *out, size_t out_size, uint8_t enable);

/* Initialise the beacon with a transport. Must be called once before start. */
ws_ble_result_t ws_ble_beacon_init(const ws_ble_transport_t *transport);

/* Reset the BT controller via HCI_Reset. */
ws_ble_result_t ws_ble_beacon_reset(void);

/* Start advertising `name` (truncated to WS_BLE_NAME_MAX). */
ws_ble_result_t ws_ble_beacon_start(const char *name);

/* Stop advertising. */
ws_ble_result_t ws_ble_beacon_stop(void);

#endif
