#include "ws_ble_beacon.h"

#include <string.h>

static const ws_ble_transport_t *transport;

/* ── payload / packet builders (pure, host-testable) ─────────────────── */

int ws_ble_build_adv_data(uint8_t *out, size_t out_size, const char *name)
{
    if (!out || !name || out_size < WS_BLE_ADV_DATA_MAX) {
        return WS_BLE_ERR_ARG;
    }
    memset(out, 0, WS_BLE_ADV_DATA_MAX);
    /* Flags: LE General Discoverable + BR/EDR not supported. */
    out[0] = 0x02;   /* length of flags field (incl. type) */
    out[1] = 0x01;   /* type: Flags */
    out[2] = 0x06;   /* value */
    /* Complete Local Name (0x09), truncated to fit the 31-byte slot. */
    const size_t max_name = WS_BLE_ADV_DATA_MAX - 5;  /* 3 flags + 2 header */
    size_t name_len = strlen(name);
    if (name_len > max_name) {
        name_len = max_name;
    }
    out[3] = (uint8_t)(name_len + 1);  /* length of name field (incl. type) */
    out[4] = 0x09;                      /* type: Complete Local Name */
    memcpy(out + 5, name, name_len);
    return (int)(5 + name_len);
}

int ws_ble_build_cmd(uint8_t *out, size_t out_size, uint16_t opcode,
                     const uint8_t *params, size_t param_length)
{
    if (!out || param_length > 255u) {
        return WS_BLE_ERR_ARG;
    }
    if (out_size < 3u + param_length) {
        return WS_BLE_ERR_ARG;
    }
    out[0] = (uint8_t)(opcode & 0xFFu);
    out[1] = (uint8_t)(opcode >> 8);
    out[2] = (uint8_t)param_length;
    if (param_length && params) {
        memcpy(out + 3, params, param_length);
    }
    return (int)(3u + param_length);
}

int ws_ble_build_adv_params_cmd(uint8_t *out, size_t out_size, uint32_t interval_us)
{
    /* LE_Set_Advertising_Parameters (15-byte payload). */
    uint8_t params[15];
    const uint16_t interval = (uint16_t)(interval_us / 625u);  /* 625 us units */
    params[0] = (uint8_t)(interval & 0xFFu);
    params[1] = (uint8_t)(interval >> 8);
    params[2] = params[0];   /* adv_interval_max == min */
    params[3] = params[1];
    params[4] = 0x03;        /* adv_type: ADV_NONCONN_IND */
    params[5] = 0x00;        /* own_address_type: public */
    params[6] = 0x00;        /* peer_address_type */
    memset(params + 7, 0, 6);  /* peer_address */
    params[13] = 0x07;       /* channel_map: all three */
    params[14] = 0x00;       /* filter_policy: none */
    return ws_ble_build_cmd(out, out_size, WS_BLE_HCI_LE_SET_ADV_PARAMS,
                            params, sizeof(params));
}

int ws_ble_build_adv_enable_cmd(uint8_t *out, size_t out_size, uint8_t enable)
{
    return ws_ble_build_cmd(out, out_size, WS_BLE_HCI_LE_SET_ADV_ENABLE,
                            &enable, 1);
}

/* ── transport-bound state machine ───────────────────────────────────── */

ws_ble_result_t ws_ble_beacon_init(const ws_ble_transport_t *t)
{
    if (!t || !t->write || !t->read || !t->delay_ms) {
        return WS_BLE_ERR_ARG;
    }
    transport = t;
    return WS_BLE_OK;
}

static ws_ble_result_t send_cmd(uint16_t opcode, const uint8_t *params,
                                size_t param_length)
{
    if (!transport) {
        return WS_BLE_ERR_TRANSPORT;
    }
    uint8_t cmd[WS_BLE_HCI_CMD_MAX];
    const int len = ws_ble_build_cmd(cmd, sizeof(cmd), opcode, params, param_length);
    if (len < 0) {
        return WS_BLE_ERR_ARG;
    }
    if (transport->write(cmd, (size_t)len) != len) {
        return WS_BLE_ERR_TRANSPORT;
    }
    /* Wait for Command Complete event (4-byte header + 3-byte event body
     * minimum).  The board port's read() handles the actual UART timeout. */
    uint8_t event[7];
    if (transport->read(event, sizeof(event), 100u) < (int)sizeof(event)) {
        return WS_BLE_ERR_TRANSPORT;
    }
    /* event[0] == 0x04 (HCI_EVENT), event[1] == 0x0E (Command Complete),
     * event[3..4] == opcode (little-endian). */
    if (event[0] != 0x04u || event[1] != 0x0Eu ||
        event[3] != (uint8_t)(opcode & 0xFFu) ||
        event[4] != (uint8_t)(opcode >> 8)) {
        return WS_BLE_ERR_TRANSPORT;
    }
    return WS_BLE_OK;
}

ws_ble_result_t ws_ble_beacon_reset(void)
{
    if (!transport) {
        return WS_BLE_ERR_TRANSPORT;
    }
    ws_ble_result_t r = send_cmd(WS_BLE_HCI_RESET, NULL, 0);
    transport->delay_ms(100u);
    return r;
}

ws_ble_result_t ws_ble_beacon_start(const char *name)
{
    if (!transport) {
        return WS_BLE_ERR_TRANSPORT;
    }
    if (!name || !name[0]) {
        return WS_BLE_ERR_NAME;
    }
    /* 1. Reset controller. */
    ws_ble_result_t r = ws_ble_beacon_reset();
    if (r != WS_BLE_OK) {
        return r;
    }
    /* 2. Set advertising parameters (non-connectable, 500 ms). */
    uint8_t cmd[WS_BLE_HCI_CMD_MAX];
    int len = ws_ble_build_adv_params_cmd(cmd, sizeof(cmd), 500000u);
    if (len < 0 || transport->write(cmd, (size_t)len) != len) {
        return WS_BLE_ERR_TRANSPORT;
    }
    uint8_t event[7];
    if (transport->read(event, sizeof(event), 100u) < (int)sizeof(event) ||
        event[1] != 0x0Eu) {
        return WS_BLE_ERR_TRANSPORT;
    }
    /* 3. Set advertising data. */
    uint8_t adv_data[WS_BLE_ADV_DATA_MAX];
    const int adv_len = ws_ble_build_adv_data(adv_data, sizeof(adv_data), name);
    if (adv_len < 0) {
        return WS_BLE_ERR_NAME;
    }
    uint8_t params[32];
    params[0] = (uint8_t)adv_len;
    memcpy(params + 1, adv_data, (size_t)adv_len);
    r = send_cmd(WS_BLE_HCI_LE_SET_ADV_DATA, params, (size_t)adv_len + 1u);
    if (r != WS_BLE_OK) {
        return r;
    }
    /* 4. Enable advertising. */
    return send_cmd(WS_BLE_HCI_LE_SET_ADV_ENABLE, (uint8_t[]){0x01}, 1);
}

ws_ble_result_t ws_ble_beacon_stop(void)
{
    if (!transport) {
        return WS_BLE_ERR_TRANSPORT;
    }
    return send_cmd(WS_BLE_HCI_LE_SET_ADV_ENABLE, (uint8_t[]){0x00}, 1);
}
