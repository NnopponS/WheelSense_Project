/*
 * P1.4 golden-vector and malformed-input tests for the v1 wire envelope.
 *
 * Frozen contract: firmware/WheelSense_E84/docs/protocol.md
 * - 20-byte little-endian header
 * - version=1, known message_type (1..10), flags=0
 * - reject null/short/wrong-version/unknown-type/reserved-flag/trailing/truncated
 * - no partial mutation of destination on failure
 * - sequence wrap via (int32_t)(incoming - previous) > 0
 */
#include <assert.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

#include "ws_protocol.h"

/* --- Frozen golden 20-byte header vector ---
 * Non-symmetric sequence/timestamp so endianness errors are visible.
 *   version          = 1                        -> 01 00
 *   message_type     = 10 (DIAGNOSTIC_EVENT)    -> 0A 00
 *   payload_length   = 0                        -> 00 00
 *   flags            = 0                        -> 00 00
 *   sequence         = 0x12345678               -> 78 56 34 12
 *   timestamp_us     = 0x0123456789ABCDEF       -> EF CD AB 89 67 45 23 01
 */
static const uint8_t GOLDEN_HEADER[WS_PROTOCOL_HEADER_SIZE] = {
    0x01, 0x00,
    0x0A, 0x00,
    0x00, 0x00,
    0x00, 0x00,
    0x78, 0x56, 0x34, 0x12,
    0xEF, 0xCD, 0xAB, 0x89, 0x67, 0x45, 0x23, 0x01,
};

/* --- Golden encode / decode / round-trip --- */

static void test_golden_encode(void)
{
    uint8_t buf[WS_PROTOCOL_HEADER_SIZE];
    ws_envelope_t hdr = {
        .version = 1,
        .message_type = WS_IPC_DIAGNOSTIC_EVENT,
        .payload_length = 0,
        .flags = 0,
        .sequence = 0x12345678u,
        .timestamp_us = 0x0123456789ABCDEFULL,
    };
    memset(buf, 0xAA, sizeof(buf));
    ws_status_t st = ws_envelope_encode(buf, sizeof(buf), &hdr);
    assert(st == WS_STATUS_READY);
    assert(memcmp(buf, GOLDEN_HEADER, WS_PROTOCOL_HEADER_SIZE) == 0);
}

static void test_golden_decode(void)
{
    ws_envelope_t out;
    memset(&out, 0xAA, sizeof(out));
    ws_status_t st = ws_envelope_decode(&out, GOLDEN_HEADER, WS_PROTOCOL_HEADER_SIZE);
    assert(st == WS_STATUS_READY);
    assert(out.version == 1);
    assert(out.message_type == WS_IPC_DIAGNOSTIC_EVENT);
    assert(out.payload_length == 0);
    assert(out.flags == 0);
    assert(out.sequence == 0x12345678u);
    assert(out.timestamp_us == 0x0123456789ABCDEFULL);
}

static void test_round_trip_all_message_types(void)
{
    uint8_t buf[WS_PROTOCOL_HEADER_SIZE];
    ws_message_type_t types[] = {
        WS_IPC_ENV_UPDATE,
        WS_IPC_IMU_UPDATE,
        WS_IPC_AI_RESULT,
        WS_IPC_AUDIO_STATUS,
        WS_IPC_CAMERA_STATUS,
        WS_IPC_WIFI_STATUS,
        WS_IPC_BLE_STATUS,
        WS_IPC_UI_COMMAND,
        WS_IPC_CALIBRATION_COMMAND,
        WS_IPC_DIAGNOSTIC_EVENT,
    };
    for (size_t i = 0; i < sizeof(types) / sizeof(types[0]); i++) {
        ws_envelope_t in = {
            .version = 1,
            .message_type = types[i],
            .payload_length = 0,
            .flags = 0,
            .sequence = (uint32_t)(i + 1),
            .timestamp_us = (uint64_t)i * 1000ULL,
        };
        ws_envelope_t out;
        memset(&out, 0xAA, sizeof(out));
        assert(ws_envelope_encode(buf, sizeof(buf), &in) == WS_STATUS_READY);
        assert(ws_envelope_decode(&out, buf, sizeof(buf)) == WS_STATUS_READY);
        assert(out.version == in.version);
        assert(out.message_type == in.message_type);
        assert(out.payload_length == in.payload_length);
        assert(out.flags == in.flags);
        assert(out.sequence == in.sequence);
        assert(out.timestamp_us == in.timestamp_us);
    }
}

static void test_round_trip_wrap_edges(void)
{
    uint8_t buf[WS_PROTOCOL_HEADER_SIZE];
    uint32_t seqs[] = {0u, 0xFFFFFFFFu, 0x80000000u, 0x7FFFFFFFu, 1u};
    for (size_t i = 0; i < sizeof(seqs) / sizeof(seqs[0]); i++) {
        ws_envelope_t in = {
            .version = 1,
            .message_type = WS_IPC_ENV_UPDATE,
            .payload_length = 0,
            .flags = 0,
            .sequence = seqs[i],
            .timestamp_us = 0,
        };
        ws_envelope_t out;
        memset(&out, 0xAA, sizeof(out));
        assert(ws_envelope_encode(buf, sizeof(buf), &in) == WS_STATUS_READY);
        assert(ws_envelope_decode(&out, buf, sizeof(buf)) == WS_STATUS_READY);
        assert(out.sequence == seqs[i]);
        assert(out.timestamp_us == 0);
    }
}

/* --- Malformed-input rejection matrix --- */

static void test_reject_null_buf_encode(void)
{
    ws_envelope_t hdr = {.version = 1, .message_type = WS_IPC_ENV_UPDATE, .flags = 0};
    assert(ws_envelope_encode(NULL, WS_PROTOCOL_HEADER_SIZE, &hdr) != WS_STATUS_READY);
}

static void test_reject_null_hdr_encode(void)
{
    uint8_t buf[WS_PROTOCOL_HEADER_SIZE];
    assert(ws_envelope_encode(buf, sizeof(buf), NULL) != WS_STATUS_READY);
}

static void test_reject_short_buf_encode(void)
{
    uint8_t buf[WS_PROTOCOL_HEADER_SIZE - 1];
    ws_envelope_t hdr = {.version = 1, .message_type = WS_IPC_ENV_UPDATE, .flags = 0};
    assert(ws_envelope_encode(buf, sizeof(buf), &hdr) != WS_STATUS_READY);
}

static void test_reject_null_out_decode(void)
{
    assert(ws_envelope_decode(NULL, GOLDEN_HEADER, WS_PROTOCOL_HEADER_SIZE) != WS_STATUS_READY);
}

static void test_reject_null_buf_decode(void)
{
    ws_envelope_t out;
    assert(ws_envelope_decode(&out, NULL, WS_PROTOCOL_HEADER_SIZE) != WS_STATUS_READY);
}

static void test_reject_short_buf_decode(void)
{
    ws_envelope_t out;
    assert(ws_envelope_decode(&out, GOLDEN_HEADER, WS_PROTOCOL_HEADER_SIZE - 1) != WS_STATUS_READY);
}

static void test_reject_trailing_bytes(void)
{
    uint8_t buf[WS_PROTOCOL_HEADER_SIZE + 1];
    memcpy(buf, GOLDEN_HEADER, WS_PROTOCOL_HEADER_SIZE);
    buf[WS_PROTOCOL_HEADER_SIZE] = 0xFF;
    ws_envelope_t out;
    memset(&out, 0xAA, sizeof(out));
    /* payload_length=0 but buf has 21 bytes -> trailing */
    assert(ws_envelope_decode(&out, buf, sizeof(buf)) != WS_STATUS_READY);
}

static void test_reject_truncation(void)
{
    uint8_t buf[WS_PROTOCOL_HEADER_SIZE];
    memcpy(buf, GOLDEN_HEADER, WS_PROTOCOL_HEADER_SIZE);
    /* set payload_length=4 but only provide 20 bytes -> truncation */
    buf[4] = 0x04;
    buf[5] = 0x00;
    ws_envelope_t out;
    memset(&out, 0xAA, sizeof(out));
    assert(ws_envelope_decode(&out, buf, sizeof(buf)) != WS_STATUS_READY);
}

static void test_accept_valid_with_payload(void)
{
    uint8_t buf[WS_PROTOCOL_HEADER_SIZE + 4];
    memcpy(buf, GOLDEN_HEADER, WS_PROTOCOL_HEADER_SIZE);
    /* set payload_length=4 and provide 4 payload bytes -> valid */
    buf[4] = 0x04;
    buf[5] = 0x00;
    buf[20] = 0xDE;
    buf[21] = 0xAD;
    buf[22] = 0xBE;
    buf[23] = 0xEF;
    ws_envelope_t out;
    memset(&out, 0xAA, sizeof(out));
    assert(ws_envelope_decode(&out, buf, sizeof(buf)) == WS_STATUS_READY);
    assert(out.payload_length == 4);
}

static void test_reject_wrong_version(void)
{
    uint8_t buf[WS_PROTOCOL_HEADER_SIZE];
    memcpy(buf, GOLDEN_HEADER, WS_PROTOCOL_HEADER_SIZE);
    buf[0] = 0x02;
    buf[1] = 0x00;
    ws_envelope_t out;
    memset(&out, 0xAA, sizeof(out));
    assert(ws_envelope_decode(&out, buf, sizeof(buf)) != WS_STATUS_READY);
}

static void test_reject_unknown_message_type_zero(void)
{
    uint8_t buf[WS_PROTOCOL_HEADER_SIZE];
    memcpy(buf, GOLDEN_HEADER, WS_PROTOCOL_HEADER_SIZE);
    buf[2] = 0x00;
    buf[3] = 0x00;
    ws_envelope_t out;
    memset(&out, 0xAA, sizeof(out));
    assert(ws_envelope_decode(&out, buf, sizeof(buf)) != WS_STATUS_READY);
}

static void test_reject_unknown_message_type_high(void)
{
    uint8_t buf[WS_PROTOCOL_HEADER_SIZE];
    memcpy(buf, GOLDEN_HEADER, WS_PROTOCOL_HEADER_SIZE);
    buf[2] = 0x0B;
    buf[3] = 0x00;
    ws_envelope_t out;
    memset(&out, 0xAA, sizeof(out));
    assert(ws_envelope_decode(&out, buf, sizeof(buf)) != WS_STATUS_READY);
}

static void test_reject_reserved_flags(void)
{
    uint8_t buf[WS_PROTOCOL_HEADER_SIZE];
    memcpy(buf, GOLDEN_HEADER, WS_PROTOCOL_HEADER_SIZE);
    buf[6] = 0x01;
    ws_envelope_t out;
    memset(&out, 0xAA, sizeof(out));
    assert(ws_envelope_decode(&out, buf, sizeof(buf)) != WS_STATUS_READY);
}

static void test_reject_encode_wrong_version(void)
{
    uint8_t buf[WS_PROTOCOL_HEADER_SIZE];
    ws_envelope_t hdr = {.version = 2, .message_type = WS_IPC_ENV_UPDATE, .flags = 0};
    assert(ws_envelope_encode(buf, sizeof(buf), &hdr) != WS_STATUS_READY);
}

static void test_reject_encode_unknown_type(void)
{
    uint8_t buf[WS_PROTOCOL_HEADER_SIZE];
    ws_envelope_t hdr = {.version = 1, .message_type = 0, .flags = 0};
    assert(ws_envelope_encode(buf, sizeof(buf), &hdr) != WS_STATUS_READY);
}

static void test_reject_encode_type_too_high(void)
{
    uint8_t buf[WS_PROTOCOL_HEADER_SIZE];
    ws_envelope_t hdr = {.version = 1, .message_type = 11, .flags = 0};
    assert(ws_envelope_encode(buf, sizeof(buf), &hdr) != WS_STATUS_READY);
}

static void test_reject_encode_nonzero_flags(void)
{
    uint8_t buf[WS_PROTOCOL_HEADER_SIZE];
    ws_envelope_t hdr = {.version = 1, .message_type = WS_IPC_ENV_UPDATE, .flags = 1};
    assert(ws_envelope_encode(buf, sizeof(buf), &hdr) != WS_STATUS_READY);
}

static void test_reject_encode_oversized_payload(void)
{
    uint8_t buf[WS_PROTOCOL_HEADER_SIZE];
    ws_envelope_t hdr = {
        .version = 1,
        .message_type = WS_IPC_ENV_UPDATE,
        .flags = 0,
        .payload_length = WS_PROTOCOL_MAX_PAYLOAD_SIZE + 1,
    };
    assert(ws_envelope_encode(buf, sizeof(buf), &hdr) != WS_STATUS_READY);
}

static void test_reject_decode_oversized_payload(void)
{
    uint8_t buf[WS_PROTOCOL_HEADER_SIZE];
    memcpy(buf, GOLDEN_HEADER, WS_PROTOCOL_HEADER_SIZE);
    /* payload_length = 0xFFFF (exceeds MAX) */
    buf[4] = 0xFF;
    buf[5] = 0xFF;
    ws_envelope_t out;
    memset(&out, 0xAA, sizeof(out));
    assert(ws_envelope_decode(&out, buf, sizeof(buf)) != WS_STATUS_READY);
}

/* --- No partial mutation on failure --- */

static void test_decode_no_partial_mutation(void)
{
    uint8_t buf[WS_PROTOCOL_HEADER_SIZE];
    memcpy(buf, GOLDEN_HEADER, WS_PROTOCOL_HEADER_SIZE);
    buf[0] = 0x02; /* wrong version */
    ws_envelope_t original = {
        .version = 0xDEAD,
        .message_type = 0xBEEF,
        .payload_length = 0xCAFE,
        .flags = 0xFEED,
        .sequence = 0x87654321u,
        .timestamp_us = 0xFEDCBA9876543210ULL,
    };
    ws_envelope_t out = original;
    ws_status_t st = ws_envelope_decode(&out, buf, sizeof(buf));
    assert(st != WS_STATUS_READY);
    assert(out.version == original.version);
    assert(out.message_type == original.message_type);
    assert(out.payload_length == original.payload_length);
    assert(out.flags == original.flags);
    assert(out.sequence == original.sequence);
    assert(out.timestamp_us == original.timestamp_us);
}

static void test_encode_no_partial_mutation(void)
{
    uint8_t buf[WS_PROTOCOL_HEADER_SIZE];
    memset(buf, 0xAA, sizeof(buf));
    ws_envelope_t hdr = {.version = 2, .message_type = WS_IPC_ENV_UPDATE, .flags = 0};
    ws_status_t st = ws_envelope_encode(buf, sizeof(buf), &hdr);
    assert(st != WS_STATUS_READY);
    for (size_t i = 0; i < sizeof(buf); i++) {
        assert(buf[i] == 0xAA);
    }
}

/* --- Sequence wrap comparison --- */

static void test_sequence_is_newer(void)
{
    assert(ws_sequence_is_newer(1, 0) == 1);
    assert(ws_sequence_is_newer(0, 0) == 0);
    assert(ws_sequence_is_newer(0, 0xFFFFFFFFu) == 1);
    assert(ws_sequence_is_newer(0xFFFFFFFFu, 0) == 0);
    assert(ws_sequence_is_newer(0x80000000u, 0) == 0);
    assert(ws_sequence_is_newer(0x80000000u, 0x7FFFFFFFu) == 1);
    assert(ws_sequence_is_newer(100, 50) == 1);
    assert(ws_sequence_is_newer(50, 100) == 0);
}

/* --- LE helper round-trip --- */

static void test_le_helpers(void)
{
    uint8_t p[8];

    ws_le_put_u16(p, 0x1234);
    assert(p[0] == 0x34 && p[1] == 0x12);
    assert(ws_le_get_u16(p) == 0x1234);

    ws_le_put_u32(p, 0x12345678u);
    assert(p[0] == 0x78 && p[1] == 0x56 && p[2] == 0x34 && p[3] == 0x12);
    assert(ws_le_get_u32(p) == 0x12345678u);

    ws_le_put_u64(p, 0x0123456789ABCDEFULL);
    assert(p[0] == 0xEF && p[1] == 0xCD && p[2] == 0xAB && p[3] == 0x89);
    assert(p[4] == 0x67 && p[5] == 0x45 && p[6] == 0x23 && p[7] == 0x01);
    assert(ws_le_get_u64(p) == 0x0123456789ABCDEFULL);

    ws_le_put_f32(p, 1.0F);
    assert(p[0] == 0x00 && p[1] == 0x00 && p[2] == 0x80 && p[3] == 0x3F);
    assert(ws_le_get_f32(p) == 1.0F);

    ws_le_put_f32(p, -2.5F);
    assert(ws_le_get_f32(p) == -2.5F);
}

int main(void)
{
    test_golden_encode();
    test_golden_decode();
    test_round_trip_all_message_types();
    test_round_trip_wrap_edges();
    test_reject_null_buf_encode();
    test_reject_null_hdr_encode();
    test_reject_short_buf_encode();
    test_reject_null_out_decode();
    test_reject_null_buf_decode();
    test_reject_short_buf_decode();
    test_reject_trailing_bytes();
    test_reject_truncation();
    test_accept_valid_with_payload();
    test_reject_wrong_version();
    test_reject_unknown_message_type_zero();
    test_reject_unknown_message_type_high();
    test_reject_reserved_flags();
    test_reject_encode_wrong_version();
    test_reject_encode_unknown_type();
    test_reject_encode_type_too_high();
    test_reject_encode_nonzero_flags();
    test_reject_encode_oversized_payload();
    test_reject_decode_oversized_payload();
    test_decode_no_partial_mutation();
    test_encode_no_partial_mutation();
    test_sequence_is_newer();
    test_le_helpers();
    return 0;
}
