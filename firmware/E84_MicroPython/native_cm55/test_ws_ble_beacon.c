#include "ws_ble_beacon.h"

#include <assert.h>
#include <string.h>

/* ── fake transport: records every byte sent, returns canned events ──── */

#define FAKE_BUF 256

static uint8_t fake_tx[FAKE_BUF];
static size_t fake_tx_len;
static uint8_t fake_rx[FAKE_BUF];
static size_t fake_rx_len;
static size_t fake_rx_pos;
static uint32_t fake_delay_ms;

static void fake_rx_push_event_complete(uint16_t opcode)
{
    /* HCI Event: Command Complete
     * 0x04 0x0E <param_length> <num_hci_cmd_packets> <opcode LE> <status> */
    fake_rx[fake_rx_len++] = 0x04;
    fake_rx[fake_rx_len++] = 0x0E;
    fake_rx[fake_rx_len++] = 0x04;
    fake_rx[fake_rx_len++] = 0x01;
    fake_rx[fake_rx_len++] = (uint8_t)(opcode & 0xFFu);
    fake_rx[fake_rx_len++] = (uint8_t)(opcode >> 8);
    fake_rx[fake_rx_len++] = 0x00;  /* status: success */
}

static int fake_write(const uint8_t *data, size_t length)
{
    if (fake_tx_len + length > FAKE_BUF) {
        return -1;
    }
    memcpy(fake_tx + fake_tx_len, data, length);
    fake_tx_len += length;
    return (int)length;
}

static int fake_read(uint8_t *buffer, size_t length, uint32_t timeout_ms)
{
    (void)timeout_ms;
    if (fake_rx_pos + length > fake_rx_len) {
        return -1;
    }
    memcpy(buffer, fake_rx + fake_rx_pos, length);
    fake_rx_pos += length;
    return (int)length;
}

static void fake_delay(uint32_t ms)
{
    fake_delay_ms += ms;
}

static const ws_ble_transport_t fake_transport = {
    fake_write, fake_read, fake_delay,
};

static void fake_reset(void)
{
    fake_tx_len = 0;
    fake_rx_len = 0;
    fake_rx_pos = 0;
    fake_delay_ms = 0;
}

/* ── helpers to extract HCI commands from the TX buffer ──────────────── */

static uint16_t cmd_opcode_at(size_t offset)
{
    return (uint16_t)fake_tx[offset] | ((uint16_t)fake_tx[offset + 1] << 8);
}

static uint8_t cmd_param_len_at(size_t offset)
{
    return fake_tx[offset + 2];
}

/* ── tests ───────────────────────────────────────────────────────────── */

static void test_adv_payload_format(void)
{
    uint8_t adv[WS_BLE_ADV_DATA_MAX];
    const int len = ws_ble_build_adv_data(adv, sizeof(adv), "CAM_E84_12345678");
    assert(len > 0);
    /* Flags: 02 01 06 — matches ble_node.py. */
    assert(adv[0] == 0x02 && adv[1] == 0x01 && adv[2] == 0x06);
    /* Complete Local Name type. */
    assert(adv[3] == 17u);  /* 16-byte name + 1 type byte */
    assert(adv[4] == 0x09);
    assert(memcmp(adv + 5, "CAM_E84_12345678", 16) == 0);
    /* Total: 3 (flags) + 2 (name header) + 16 (name) = 21. */
    assert(len == 21);
}

static void test_adv_payload_truncation(void)
{
    uint8_t adv[WS_BLE_ADV_DATA_MAX];
    /* Name longer than the 26-byte slot: must be truncated. */
    const char *long_name = "CAM_E84_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const int len = ws_ble_build_adv_data(adv, sizeof(adv), long_name);
    assert(len > 0);
    /* Max name = 31 - 5 = 26 bytes. */
    assert(adv[3] == 27u);  /* 26 + 1 type byte */
    assert(adv[4] == 0x09);
    assert(memcmp(adv + 5, "CAM_E84_AAAAAAAAAAAAAAAAAAAAAA", 26) == 0);
    assert(len == 31);
}

static void test_hci_reset_cmd(void)
{
    uint8_t cmd[8];
    const int len = ws_ble_build_cmd(cmd, sizeof(cmd), WS_BLE_HCI_RESET, NULL, 0);
    assert(len == 3);
    assert(cmd[0] == 0x03 && cmd[1] == 0x0C && cmd[2] == 0x00);
}

static void test_adv_params_cmd(void)
{
    uint8_t cmd[32];
    const int len = ws_ble_build_adv_params_cmd(cmd, sizeof(cmd), 500000u);
    assert(len == 18);  /* 3 header + 15 params */
    assert(cmd_opcode_at(0) == WS_BLE_HCI_LE_SET_ADV_PARAMS);
    assert(cmd_param_len_at(0) == 15);
    /* interval = 500000 / 625 = 800 = 0x0320. */
    assert(cmd[3] == 0x20 && cmd[4] == 0x03);
    /* adv_type = ADV_NONCONN_IND (0x03). */
    assert(cmd[7] == 0x03);
    /* channel_map = 0x07 (all three). */
    assert(cmd[16] == 0x07);
}

static void test_adv_enable_cmd(void)
{
    uint8_t cmd[8];
    const int len = ws_ble_build_adv_enable_cmd(cmd, sizeof(cmd), 1);
    assert(len == 4);
    assert(cmd_opcode_at(0) == WS_BLE_HCI_LE_SET_ADV_ENABLE);
    assert(cmd[3] == 0x01);
}

static void test_beacon_start_sequence(void)
{
    fake_reset();
    /* Pre-load 4 Command Complete events: Reset, AdvParams, AdvData, AdvEnable. */
    fake_rx_push_event_complete(WS_BLE_HCI_RESET);
    fake_rx_push_event_complete(WS_BLE_HCI_LE_SET_ADV_PARAMS);
    fake_rx_push_event_complete(WS_BLE_HCI_LE_SET_ADV_DATA);
    fake_rx_push_event_complete(WS_BLE_HCI_LE_SET_ADV_ENABLE);

    assert(ws_ble_beacon_init(&fake_transport) == WS_BLE_OK);
    assert(ws_ble_beacon_start("CAM_E84_ABCDEF12") == WS_BLE_OK);

    /* The TX buffer should contain 4 HCI commands. */
    size_t off = 0;
    /* 1. HCI_Reset (3 bytes). */
    assert(cmd_opcode_at(off) == WS_BLE_HCI_RESET);
    off += 3;
    /* 2. LE_Set_Advertising_Parameters (18 bytes). */
    assert(cmd_opcode_at(off) == WS_BLE_HCI_LE_SET_ADV_PARAMS);
    const uint8_t adv_params_len = cmd_param_len_at(off);
    off += 3 + adv_params_len;
    /* 3. LE_Set_Advertising_Data (3 + 1 + adv_data_len). */
    assert(cmd_opcode_at(off) == WS_BLE_HCI_LE_SET_ADV_DATA);
    const uint8_t adv_data_param_len = cmd_param_len_at(off);
    /* adv_data_param_len = 1 (length byte) + actual adv data length. */
    /* "CAM_E84_ABCDEF12" = 16 chars → adv data = 3 + 2 + 16 = 21. */
    assert(adv_data_param_len == 22u);
    /* Verify the advertising data inside the command. */
    const size_t adv_data_offset = off + 3 + 1;  /* skip header + length byte */
    assert(fake_tx[adv_data_offset] == 0x02);     /* flags */
    assert(fake_tx[adv_data_offset + 1] == 0x01);
    assert(fake_tx[adv_data_offset + 2] == 0x06);
    assert(fake_tx[adv_data_offset + 4] == 0x09); /* Complete Local Name */
    off += 3 + adv_data_param_len;
    /* 4. LE_Set_Advertise_Enable (4 bytes). */
    assert(cmd_opcode_at(off) == WS_BLE_HCI_LE_SET_ADV_ENABLE);
    assert(fake_tx[off + 3] == 0x01);
    off += 4;
    assert(off == fake_tx_len);
    /* Reset should have caused a 100 ms delay. */
    assert(fake_delay_ms == 100u);
}

static void test_beacon_stop(void)
{
    fake_reset();
    fake_rx_push_event_complete(WS_BLE_HCI_LE_SET_ADV_ENABLE);
    assert(ws_ble_beacon_init(&fake_transport) == WS_BLE_OK);
    assert(ws_ble_beacon_stop() == WS_BLE_OK);
    assert(cmd_opcode_at(0) == WS_BLE_HCI_LE_SET_ADV_ENABLE);
    assert(fake_tx[3] == 0x00);  /* disable */
}

static void test_init_validation(void)
{
    assert(ws_ble_beacon_init(NULL) == WS_BLE_ERR_ARG);
    ws_ble_transport_t incomplete = {NULL, fake_read, fake_delay};
    assert(ws_ble_beacon_init(&incomplete) == WS_BLE_ERR_ARG);
}

int main(void)
{
    test_adv_payload_format();
    test_adv_payload_truncation();
    test_hci_reset_cmd();
    test_adv_params_cmd();
    test_adv_enable_cmd();
    test_beacon_start_sequence();
    test_beacon_stop();
    test_init_validation();
    return 0;
}
