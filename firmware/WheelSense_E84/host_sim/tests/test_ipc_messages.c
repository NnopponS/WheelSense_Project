/*
 * P1.5 per-message codec tests: round-trip + golden vectors + negative matrix.
 *
 * Covers all 10 frozen v1 message types from docs/protocol.md.
 * Payloads are packed (no padding) using the LE helpers from ws_protocol.h.
 */
#include <assert.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

#include "ws_ipc_messages.h"
#include "ws_ble_payloads.h"
#include "ws_protocol.h"
#include "ws_types.h"
#include "ws_status.h"

/* ============================================================ */
/* --- Golden vectors for sample payloads ---                  */
/* ============================================================ */

/* ENV_UPDATE golden payload (24 bytes):
 *   timestamp_us = 0x0123456789ABCDEF
 *   temperature_c = -12.5F  (0xC1480000 LE: 00 00 48 C1)
 *   relative_humidity_percent = 67.25F  (0x42868000 LE: 00 80 86 42)
 *   pressure_hpa = 1013.25F  (0x447D5000 LE: 00 50 7D 44)
 *   valid_mask = 0x12345678
 */
static const uint8_t GOLDEN_ENV[WS_PAYLOAD_ENV_SIZE] = {
    0xEF, 0xCD, 0xAB, 0x89, 0x67, 0x45, 0x23, 0x01, /* timestamp_us */
    0x00, 0x00, 0x48, 0xC1, /* temperature_c = -12.5 */
    0x00, 0x80, 0x86, 0x42, /* relative_humidity_percent = 67.25 */
    0x00, 0x50, 0x7D, 0x44, /* pressure_hpa = 1013.25 */
    0x78, 0x56, 0x34, 0x12, /* valid_mask = 0x12345678 */
};

/* IMU_UPDATE golden payload (33 bytes):
 *   timestamp_us = 0x0123456789ABCDEF
 *   accel_mps2 = {1.0F, -2.0F, 3.5F}
 *   gyro_rads  = {0.5F, -1.25F, 2.75F}
 *   valid = 1
 */
static const uint8_t GOLDEN_IMU[WS_PAYLOAD_IMU_SIZE] = {
    0xEF, 0xCD, 0xAB, 0x89, 0x67, 0x45, 0x23, 0x01, /* timestamp_us */
    0x00, 0x00, 0x80, 0x3F, /* accel[0] = 1.0 */
    0x00, 0x00, 0x00, 0xC0, /* accel[1] = -2.0 */
    0x00, 0x00, 0x60, 0x40, /* accel[2] = 3.5 */
    0x00, 0x00, 0x00, 0x3F, /* gyro[0] = 0.5 */
    0x00, 0x00, 0xA0, 0xBF, /* gyro[1] = -1.25 */
    0x00, 0x00, 0x30, 0x40, /* gyro[2] = 2.75 */
    0x01,                   /* valid = 1 */
};

/* AI_RESULT golden payload (23 bytes):
 *   timestamp_us = 0x0123456789ABCDEF
 *   class_id = 0x1234
 *   confidence = 0.875F  (0x3F600000 LE: 00 00 60 3F)
 *   inference_time_us = 0x12345678
 *   model_version = 0x00000001
 *   valid = 1
 */
static const uint8_t GOLDEN_AI[WS_PAYLOAD_AI_SIZE] = {
    0xEF, 0xCD, 0xAB, 0x89, 0x67, 0x45, 0x23, 0x01, /* timestamp_us */
    0x34, 0x12,                   /* class_id = 0x1234 */
    0x00, 0x00, 0x60, 0x3F,       /* confidence = 0.875 */
    0x78, 0x56, 0x34, 0x12,       /* inference_time_us = 0x12345678 */
    0x01, 0x00, 0x00, 0x00,       /* model_version = 1 */
    0x01,                         /* valid = 1 */
};

/* ============================================================ */
/* --- ENV_UPDATE ---                                           */
/* ============================================================ */

static void test_env_golden_encode(void)
{
    uint8_t buf[WS_PAYLOAD_ENV_SIZE];
    ws_environment_sample_t s = {
        .timestamp_us = 0x0123456789ABCDEFULL,
        .temperature_c = -12.5F,
        .relative_humidity_percent = 67.25F,
        .pressure_hpa = 1013.25F,
        .valid_mask = 0x12345678u,
    };
    memset(buf, 0xAA, sizeof(buf));
    assert(ws_env_encode(buf, sizeof(buf), &s) == WS_STATUS_READY);
    assert(memcmp(buf, GOLDEN_ENV, WS_PAYLOAD_ENV_SIZE) == 0);
}

static void test_env_golden_decode(void)
{
    ws_environment_sample_t out;
    memset(&out, 0xAA, sizeof(out));
    assert(ws_env_decode(&out, GOLDEN_ENV, WS_PAYLOAD_ENV_SIZE) == WS_STATUS_READY);
    assert(out.timestamp_us == 0x0123456789ABCDEFULL);
    assert(out.temperature_c == -12.5F);
    assert(out.relative_humidity_percent == 67.25F);
    assert(out.pressure_hpa == 1013.25F);
    assert(out.valid_mask == 0x12345678u);
}

static void test_env_round_trip(void)
{
    uint8_t buf[WS_PAYLOAD_ENV_SIZE];
    ws_environment_sample_t in = {
        .timestamp_us = 999999ULL,
        .temperature_c = 42.5F,
        .relative_humidity_percent = 0.0F,
        .pressure_hpa = 999.99F,
        .valid_mask = 0x7u,
    };
    ws_environment_sample_t out;
    memset(&out, 0xAA, sizeof(out));
    assert(ws_env_encode(buf, sizeof(buf), &in) == WS_STATUS_READY);
    assert(ws_env_decode(&out, buf, sizeof(buf)) == WS_STATUS_READY);
    assert(out.timestamp_us == in.timestamp_us);
    assert(out.temperature_c == in.temperature_c);
    assert(out.relative_humidity_percent == in.relative_humidity_percent);
    assert(out.pressure_hpa == in.pressure_hpa);
    assert(out.valid_mask == in.valid_mask);
}

static void test_env_reject_null(void)
{
    ws_environment_sample_t s = {0};
    uint8_t buf[WS_PAYLOAD_ENV_SIZE];
    assert(ws_env_encode(NULL, sizeof(buf), &s) != WS_STATUS_READY);
    assert(ws_env_encode(buf, sizeof(buf), NULL) != WS_STATUS_READY);
    assert(ws_env_decode(NULL, buf, sizeof(buf)) != WS_STATUS_READY);
    assert(ws_env_decode(&s, NULL, sizeof(buf)) != WS_STATUS_READY);
}

static void test_env_reject_short_buf(void)
{
    uint8_t buf[WS_PAYLOAD_ENV_SIZE - 1];
    ws_environment_sample_t s = {0};
    assert(ws_env_encode(buf, sizeof(buf), &s) != WS_STATUS_READY);
    assert(ws_env_decode(&s, buf, sizeof(buf)) != WS_STATUS_READY);
}

static void test_env_reject_trailing(void)
{
    uint8_t buf[WS_PAYLOAD_ENV_SIZE + 1];
    memcpy(buf, GOLDEN_ENV, WS_PAYLOAD_ENV_SIZE);
    buf[WS_PAYLOAD_ENV_SIZE] = 0xFF;
    ws_environment_sample_t out;
    memset(&out, 0xAA, sizeof(out));
    assert(ws_env_decode(&out, buf, sizeof(buf)) != WS_STATUS_READY);
}

static void test_env_no_partial_mutation(void)
{
    uint8_t buf[WS_PAYLOAD_ENV_SIZE];
    memcpy(buf, GOLDEN_ENV, WS_PAYLOAD_ENV_SIZE);
    buf[0] = 0xFF; /* corrupt — still valid LE but let's make buf_size wrong */
    ws_environment_sample_t original = {
        .timestamp_us = 0xDEADBEEFCAFEBABEULL,
        .temperature_c = 999.0F,
        .relative_humidity_percent = 999.0F,
        .pressure_hpa = 999.0F,
        .valid_mask = 0xDEAD,
    };
    ws_environment_sample_t out = original;
    /* short buffer → reject, no mutation */
    assert(ws_env_decode(&out, buf, WS_PAYLOAD_ENV_SIZE - 1) != WS_STATUS_READY);
    assert(out.timestamp_us == original.timestamp_us);
    assert(out.temperature_c == original.temperature_c);
    assert(out.valid_mask == original.valid_mask);
}

/* ============================================================ */
/* --- IMU_UPDATE ---                                           */
/* ============================================================ */

static void test_imu_golden_encode(void)
{
    uint8_t buf[WS_PAYLOAD_IMU_SIZE];
    ws_imu_sample_t s = {
        .timestamp_us = 0x0123456789ABCDEFULL,
        .accel_mps2 = {1.0F, -2.0F, 3.5F},
        .gyro_rads = {0.5F, -1.25F, 2.75F},
        .valid = true,
    };
    memset(buf, 0xAA, sizeof(buf));
    assert(ws_imu_encode(buf, sizeof(buf), &s) == WS_STATUS_READY);
    assert(memcmp(buf, GOLDEN_IMU, WS_PAYLOAD_IMU_SIZE) == 0);
}

static void test_imu_golden_decode(void)
{
    ws_imu_sample_t out;
    memset(&out, 0xAA, sizeof(out));
    assert(ws_imu_decode(&out, GOLDEN_IMU, WS_PAYLOAD_IMU_SIZE) == WS_STATUS_READY);
    assert(out.timestamp_us == 0x0123456789ABCDEFULL);
    assert(out.accel_mps2[0] == 1.0F);
    assert(out.accel_mps2[1] == -2.0F);
    assert(out.accel_mps2[2] == 3.5F);
    assert(out.gyro_rads[0] == 0.5F);
    assert(out.gyro_rads[1] == -1.25F);
    assert(out.gyro_rads[2] == 2.75F);
    assert(out.valid == true);
}

static void test_imu_round_trip(void)
{
    uint8_t buf[WS_PAYLOAD_IMU_SIZE];
    ws_imu_sample_t in = {
        .timestamp_us = 12345ULL,
        .accel_mps2 = {0.0F, -9.81F, 0.001F},
        .gyro_rads = {-100.0F, 200.0F, -300.0F},
        .valid = false,
    };
    ws_imu_sample_t out;
    memset(&out, 0xAA, sizeof(out));
    assert(ws_imu_encode(buf, sizeof(buf), &in) == WS_STATUS_READY);
    assert(ws_imu_decode(&out, buf, sizeof(buf)) == WS_STATUS_READY);
    assert(out.timestamp_us == in.timestamp_us);
    assert(out.accel_mps2[0] == in.accel_mps2[0]);
    assert(out.accel_mps2[1] == in.accel_mps2[1]);
    assert(out.accel_mps2[2] == in.accel_mps2[2]);
    assert(out.gyro_rads[0] == in.gyro_rads[0]);
    assert(out.gyro_rads[1] == in.gyro_rads[1]);
    assert(out.gyro_rads[2] == in.gyro_rads[2]);
    assert(out.valid == in.valid);
}

static void test_imu_reject_null(void)
{
    ws_imu_sample_t s = {0};
    uint8_t buf[WS_PAYLOAD_IMU_SIZE];
    assert(ws_imu_encode(NULL, sizeof(buf), &s) != WS_STATUS_READY);
    assert(ws_imu_encode(buf, sizeof(buf), NULL) != WS_STATUS_READY);
    assert(ws_imu_decode(NULL, buf, sizeof(buf)) != WS_STATUS_READY);
    assert(ws_imu_decode(&s, NULL, sizeof(buf)) != WS_STATUS_READY);
}

static void test_imu_reject_short_buf(void)
{
    uint8_t buf[WS_PAYLOAD_IMU_SIZE - 1];
    ws_imu_sample_t s = {0};
    assert(ws_imu_encode(buf, sizeof(buf), &s) != WS_STATUS_READY);
    assert(ws_imu_decode(&s, buf, sizeof(buf)) != WS_STATUS_READY);
}

static void test_imu_reject_trailing(void)
{
    uint8_t buf[WS_PAYLOAD_IMU_SIZE + 1];
    memcpy(buf, GOLDEN_IMU, WS_PAYLOAD_IMU_SIZE);
    buf[WS_PAYLOAD_IMU_SIZE] = 0xFF;
    ws_imu_sample_t out;
    memset(&out, 0xAA, sizeof(out));
    assert(ws_imu_decode(&out, buf, sizeof(buf)) != WS_STATUS_READY);
}

/* ============================================================ */
/* --- AI_RESULT ---                                            */
/* ============================================================ */

static void test_ai_golden_encode(void)
{
    uint8_t buf[WS_PAYLOAD_AI_SIZE];
    ws_motion_result_t r = {
        .timestamp_us = 0x0123456789ABCDEFULL,
        .class_id = 0x1234,
        .confidence = 0.875F,
        .inference_time_us = 0x12345678u,
        .model_version = 1u,
        .valid = true,
    };
    memset(buf, 0xAA, sizeof(buf));
    assert(ws_ai_encode(buf, sizeof(buf), &r) == WS_STATUS_READY);
    assert(memcmp(buf, GOLDEN_AI, WS_PAYLOAD_AI_SIZE) == 0);
}

static void test_ai_golden_decode(void)
{
    ws_motion_result_t out;
    memset(&out, 0xAA, sizeof(out));
    assert(ws_ai_decode(&out, GOLDEN_AI, WS_PAYLOAD_AI_SIZE) == WS_STATUS_READY);
    assert(out.timestamp_us == 0x0123456789ABCDEFULL);
    assert(out.class_id == 0x1234);
    assert(out.confidence == 0.875F);
    assert(out.inference_time_us == 0x12345678u);
    assert(out.model_version == 1u);
    assert(out.valid == true);
}

static void test_ai_round_trip(void)
{
    uint8_t buf[WS_PAYLOAD_AI_SIZE];
    ws_motion_result_t in = {
        .timestamp_us = 42ULL,
        .class_id = 7,
        .confidence = 0.0F,
        .inference_time_us = 5000u,
        .model_version = 99u,
        .valid = false,
    };
    ws_motion_result_t out;
    memset(&out, 0xAA, sizeof(out));
    assert(ws_ai_encode(buf, sizeof(buf), &in) == WS_STATUS_READY);
    assert(ws_ai_decode(&out, buf, sizeof(buf)) == WS_STATUS_READY);
    assert(out.timestamp_us == in.timestamp_us);
    assert(out.class_id == in.class_id);
    assert(out.confidence == in.confidence);
    assert(out.inference_time_us == in.inference_time_us);
    assert(out.model_version == in.model_version);
    assert(out.valid == in.valid);
}

static void test_ai_reject_null(void)
{
    ws_motion_result_t r = {0};
    uint8_t buf[WS_PAYLOAD_AI_SIZE];
    assert(ws_ai_encode(NULL, sizeof(buf), &r) != WS_STATUS_READY);
    assert(ws_ai_encode(buf, sizeof(buf), NULL) != WS_STATUS_READY);
    assert(ws_ai_decode(NULL, buf, sizeof(buf)) != WS_STATUS_READY);
    assert(ws_ai_decode(&r, NULL, sizeof(buf)) != WS_STATUS_READY);
}

static void test_ai_reject_short_buf(void)
{
    uint8_t buf[WS_PAYLOAD_AI_SIZE - 1];
    ws_motion_result_t r = {0};
    assert(ws_ai_encode(buf, sizeof(buf), &r) != WS_STATUS_READY);
    assert(ws_ai_decode(&r, buf, sizeof(buf)) != WS_STATUS_READY);
}

/* ============================================================ */
/* --- Status messages (AUDIO/CAMERA/WIFI/BLE) ---              */
/* ============================================================ */

static void test_status_round_trip(void)
{
    uint8_t buf[WS_PAYLOAD_STATUS_SIZE];
    ws_status_t statuses[] = {
        WS_STATUS_NOT_INITIALIZED, WS_STATUS_READY, WS_STATUS_DISABLED,
        WS_STATUS_TIMEOUT, WS_STATUS_BUS_ERROR, WS_STATUS_INVALID_SAMPLE,
        WS_STATUS_BUSY, WS_STATUS_OVERFLOW, WS_STATUS_UNDERRUN,
        WS_STATUS_UNSUPPORTED, WS_STATUS_INTERNAL_ERROR,
    };
    for (size_t i = 0; i < sizeof(statuses) / sizeof(statuses[0]); i++) {
        ws_status_t out = WS_STATUS_INTERNAL_ERROR;
        assert(ws_status_encode(buf, sizeof(buf), statuses[i]) == WS_STATUS_READY);
        assert(ws_status_decode(&out, buf, sizeof(buf)) == WS_STATUS_READY);
        assert(out == statuses[i]);
    }
}

static void test_status_reject_null(void)
{
    uint8_t buf[WS_PAYLOAD_STATUS_SIZE];
    assert(ws_status_encode(NULL, sizeof(buf), WS_STATUS_READY) != WS_STATUS_READY);
    assert(ws_status_decode(NULL, buf, sizeof(buf)) != WS_STATUS_READY);
    assert(ws_status_decode((ws_status_t[]){0}, NULL, sizeof(buf)) != WS_STATUS_READY);
}

static void test_status_reject_short_buf(void)
{
    ws_status_t out;
    assert(ws_status_decode(&out, (uint8_t[]){0}, 0) != WS_STATUS_READY);
}

static void test_status_reject_trailing(void)
{
    uint8_t buf[WS_PAYLOAD_STATUS_SIZE + 1] = {0};
    ws_status_t out;
    assert(ws_status_decode(&out, buf, sizeof(buf)) != WS_STATUS_READY);
}

/* ============================================================ */
/* --- UI_COMMAND ---                                           */
/* ============================================================ */

static void test_ui_command_round_trip(void)
{
    uint8_t buf[WS_PAYLOAD_UI_CMD_SIZE];
    uint16_t cmds[] = {0, 1, 0x1234, 0xFFFF};
    for (size_t i = 0; i < sizeof(cmds) / sizeof(cmds[0]); i++) {
        uint16_t out = 0;
        assert(ws_ui_command_encode(buf, sizeof(buf), cmds[i]) == WS_STATUS_READY);
        assert(ws_ui_command_decode(&out, buf, sizeof(buf)) == WS_STATUS_READY);
        assert(out == cmds[i]);
    }
}

static void test_ui_command_reject_null(void)
{
    uint8_t buf[WS_PAYLOAD_UI_CMD_SIZE];
    uint16_t out;
    assert(ws_ui_command_encode(NULL, sizeof(buf), 1) != WS_STATUS_READY);
    assert(ws_ui_command_decode(NULL, buf, sizeof(buf)) != WS_STATUS_READY);
    assert(ws_ui_command_decode(&out, NULL, sizeof(buf)) != WS_STATUS_READY);
}

/* ============================================================ */
/* --- CALIBRATION_COMMAND ---                                  */
/* ============================================================ */

static void test_cal_command_round_trip(void)
{
    uint8_t buf[WS_PAYLOAD_CAL_CMD_SIZE];
    uint16_t id = 0x5678;
    float param = -3.14F;
    uint16_t out_id = 0;
    float out_param = 0.0F;
    assert(ws_cal_command_encode(buf, sizeof(buf), id, param) == WS_STATUS_READY);
    assert(ws_cal_command_decode(&out_id, &out_param, buf, sizeof(buf)) == WS_STATUS_READY);
    assert(out_id == id);
    assert(out_param == param);
}

static void test_cal_command_reject_null(void)
{
    uint8_t buf[WS_PAYLOAD_CAL_CMD_SIZE];
    uint16_t id;
    float param;
    assert(ws_cal_command_encode(NULL, sizeof(buf), 1, 1.0F) != WS_STATUS_READY);
    assert(ws_cal_command_encode(buf, sizeof(buf), 1, 1.0F) == WS_STATUS_READY);
    assert(ws_cal_command_decode(NULL, &param, buf, sizeof(buf)) != WS_STATUS_READY);
    assert(ws_cal_command_decode(&id, NULL, buf, sizeof(buf)) != WS_STATUS_READY);
}

/* ============================================================ */
/* --- DIAGNOSTIC_EVENT ---                                     */
/* ============================================================ */

static void test_diag_event_round_trip(void)
{
    uint8_t buf[WS_PAYLOAD_DIAG_SIZE];
    uint16_t id = 0x9ABC;
    uint32_t counter = 0x12345678u;
    uint16_t out_id = 0;
    uint32_t out_counter = 0;
    assert(ws_diag_event_encode(buf, sizeof(buf), id, counter) == WS_STATUS_READY);
    assert(ws_diag_event_decode(&out_id, &out_counter, buf, sizeof(buf)) == WS_STATUS_READY);
    assert(out_id == id);
    assert(out_counter == counter);
}

static void test_diag_event_reject_null(void)
{
    uint8_t buf[WS_PAYLOAD_DIAG_SIZE];
    uint16_t id;
    uint32_t counter;
    assert(ws_diag_event_encode(NULL, sizeof(buf), 1, 1u) != WS_STATUS_READY);
    assert(ws_diag_event_decode(NULL, &counter, buf, sizeof(buf)) != WS_STATUS_READY);
    assert(ws_diag_event_decode(&id, NULL, buf, sizeof(buf)) != WS_STATUS_READY);
}

/* ============================================================ */
/* --- Full-message round-trip (envelope + payload) ---         */
/* ============================================================ */

static void test_full_message_env(void)
{
    uint8_t msg[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_ENV_SIZE];
    ws_envelope_t hdr = {
        .version = 1,
        .message_type = WS_IPC_ENV_UPDATE,
        .payload_length = WS_PAYLOAD_ENV_SIZE,
        .flags = 0,
        .sequence = 42u,
        .timestamp_us = 1000000ULL,
    };
    ws_environment_sample_t sample = {
        .timestamp_us = 999999ULL,
        .temperature_c = 25.0F,
        .relative_humidity_percent = 50.0F,
        .pressure_hpa = 1013.25F,
        .valid_mask = 0x7u,
    };
    assert(ws_envelope_encode(msg, sizeof(msg), &hdr) == WS_STATUS_READY);
    assert(ws_env_encode(msg + WS_PROTOCOL_HEADER_SIZE, WS_PAYLOAD_ENV_SIZE, &sample) == WS_STATUS_READY);

    ws_envelope_t dec_hdr;
    ws_environment_sample_t dec_sample;
    assert(ws_envelope_decode(&dec_hdr, msg, sizeof(msg)) == WS_STATUS_READY);
    assert(dec_hdr.message_type == WS_IPC_ENV_UPDATE);
    assert(dec_hdr.payload_length == WS_PAYLOAD_ENV_SIZE);
    assert(ws_env_decode(&dec_sample, msg + WS_PROTOCOL_HEADER_SIZE, WS_PAYLOAD_ENV_SIZE) == WS_STATUS_READY);
    assert(dec_sample.temperature_c == sample.temperature_c);
    assert(dec_sample.valid_mask == sample.valid_mask);
}

/* ============================================================ */
/* --- BLE payload size check ---                               */
/* ============================================================ */

static void test_ble_payload_size_limit(void)
{
    /* ENV payload (24 bytes) exceeds BLE max (20) → reject */
    assert(ws_ble_check_payload_size(WS_IPC_ENV_UPDATE, WS_PAYLOAD_ENV_SIZE) != WS_STATUS_READY);
    /* Status payload (1 byte) fits → OK */
    assert(ws_ble_check_payload_size(WS_IPC_BLE_STATUS, WS_PAYLOAD_STATUS_SIZE) == WS_STATUS_READY);
    /* UI command (2 bytes) fits → OK */
    assert(ws_ble_check_payload_size(WS_IPC_UI_COMMAND, WS_PAYLOAD_UI_CMD_SIZE) == WS_STATUS_READY);
    /* Oversized payload → reject */
    assert(ws_ble_check_payload_size(WS_IPC_BLE_STATUS, WS_BLE_MAX_PAYLOAD_SIZE + 1) != WS_STATUS_READY);
}

/* ============================================================ */
/* --- Payload size accessor ---                                */
/* ============================================================ */

static void test_payload_size_for_type(void)
{
    assert(ws_payload_size_for_type(WS_IPC_ENV_UPDATE) == WS_PAYLOAD_ENV_SIZE);
    assert(ws_payload_size_for_type(WS_IPC_IMU_UPDATE) == WS_PAYLOAD_IMU_SIZE);
    assert(ws_payload_size_for_type(WS_IPC_AI_RESULT) == WS_PAYLOAD_AI_SIZE);
    assert(ws_payload_size_for_type(WS_IPC_AUDIO_STATUS) == WS_PAYLOAD_STATUS_SIZE);
    assert(ws_payload_size_for_type(WS_IPC_CAMERA_STATUS) == WS_PAYLOAD_STATUS_SIZE);
    assert(ws_payload_size_for_type(WS_IPC_WIFI_STATUS) == WS_PAYLOAD_STATUS_SIZE);
    assert(ws_payload_size_for_type(WS_IPC_BLE_STATUS) == WS_PAYLOAD_STATUS_SIZE);
    assert(ws_payload_size_for_type(WS_IPC_UI_COMMAND) == WS_PAYLOAD_UI_CMD_SIZE);
    assert(ws_payload_size_for_type(WS_IPC_CALIBRATION_COMMAND) == WS_PAYLOAD_CAL_CMD_SIZE);
    assert(ws_payload_size_for_type(WS_IPC_DIAGNOSTIC_EVENT) == WS_PAYLOAD_DIAG_SIZE);
    /* Unknown type → 0 */
    assert(ws_payload_size_for_type(0) == 0);
    assert(ws_payload_size_for_type(11) == 0);
}

int main(void)
{
    test_env_golden_encode();
    test_env_golden_decode();
    test_env_round_trip();
    test_env_reject_null();
    test_env_reject_short_buf();
    test_env_reject_trailing();
    test_env_no_partial_mutation();

    test_imu_golden_encode();
    test_imu_golden_decode();
    test_imu_round_trip();
    test_imu_reject_null();
    test_imu_reject_short_buf();
    test_imu_reject_trailing();

    test_ai_golden_encode();
    test_ai_golden_decode();
    test_ai_round_trip();
    test_ai_reject_null();
    test_ai_reject_short_buf();

    test_status_round_trip();
    test_status_reject_null();
    test_status_reject_short_buf();
    test_status_reject_trailing();

    test_ui_command_round_trip();
    test_ui_command_reject_null();

    test_cal_command_round_trip();
    test_cal_command_reject_null();

    test_diag_event_round_trip();
    test_diag_event_reject_null();

    test_full_message_env();

    test_ble_payload_size_limit();
    test_payload_size_for_type();
    return 0;
}
