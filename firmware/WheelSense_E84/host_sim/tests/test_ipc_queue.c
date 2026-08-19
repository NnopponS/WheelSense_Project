/*
 * P1.6 IPC queue tests: bounded FIFO loopback, queue-full, sequence gap,
 * high-water mark, and diagnostic counters.
 *
 * The queue is host-sim testable (no RTOS/hardware). It stores encoded
 * message frames (envelope + payload) and tracks diagnostic counters.
 */
#include <assert.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

#include "ws_ipc_queue.h"
#include "ws_ipc_messages.h"
#include "ws_protocol.h"
#include "ws_types.h"
#include "ws_status.h"

/* ============================================================ */
/* --- Queue init and basic enqueue/dequeue ---                 */
/* ============================================================ */

static void test_queue_init(void)
{
    ws_ipc_queue_t q;
    ws_status_t st = ws_ipc_queue_init(&q, 4);
    assert(st == WS_STATUS_READY);
    assert(ws_ipc_queue_count(&q) == 0);
    assert(ws_ipc_queue_is_full(&q) == 0);
    assert(ws_ipc_queue_is_empty(&q) == 1);
    ws_ipc_queue_counters_t c;
    ws_ipc_queue_get_counters(&q, &c);
    assert(c.enqueue_ok == 0);
    assert(c.queue_full == 0);
    assert(c.sequence_gap == 0);
    assert(c.high_water_mark == 0);
}

static void test_queue_reject_null(void)
{
    assert(ws_ipc_queue_init(NULL, 4) != WS_STATUS_READY);
}

static void test_queue_reject_zero_capacity(void)
{
    ws_ipc_queue_t q;
    assert(ws_ipc_queue_init(&q, 0) != WS_STATUS_READY);
}

static void test_queue_enqueue_dequeue_single(void)
{
    ws_ipc_queue_t q;
    assert(ws_ipc_queue_init(&q, 4) == WS_STATUS_READY);

    uint8_t msg[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_STATUS_SIZE];
    ws_envelope_t hdr = {
        .version = 1,
        .message_type = WS_IPC_BLE_STATUS,
        .payload_length = WS_PAYLOAD_STATUS_SIZE,
        .flags = 0,
        .sequence = 1u,
        .timestamp_us = 1000ULL,
    };
    assert(ws_envelope_encode(msg, sizeof(msg), &hdr) == WS_STATUS_READY);
    msg[WS_PROTOCOL_HEADER_SIZE] = (uint8_t)WS_STATUS_READY;

    assert(ws_ipc_queue_enqueue(&q, msg, sizeof(msg)) == WS_STATUS_READY);
    assert(ws_ipc_queue_count(&q) == 1);
    assert(ws_ipc_queue_is_empty(&q) == 0);
    assert(ws_ipc_queue_is_full(&q) == 0);

    uint8_t out_buf[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_STATUS_SIZE];
    size_t out_len = 0;
    assert(ws_ipc_queue_dequeue(&q, out_buf, sizeof(out_buf), &out_len) == WS_STATUS_READY);
    assert(out_len == sizeof(msg));
    assert(memcmp(out_buf, msg, sizeof(msg)) == 0);
    assert(ws_ipc_queue_count(&q) == 0);
    assert(ws_ipc_queue_is_empty(&q) == 1);

    ws_ipc_queue_counters_t c;
    ws_ipc_queue_get_counters(&q, &c);
    assert(c.enqueue_ok == 1);
    assert(c.high_water_mark == 1);
}

static void test_queue_reject_null_enqueue(void)
{
    ws_ipc_queue_t q;
    assert(ws_ipc_queue_init(&q, 4) == WS_STATUS_READY);
    uint8_t msg[WS_PROTOCOL_HEADER_SIZE];
    assert(ws_ipc_queue_enqueue(&q, NULL, sizeof(msg)) != WS_STATUS_READY);
    assert(ws_ipc_queue_enqueue(NULL, msg, sizeof(msg)) != WS_STATUS_READY);
}

static void test_queue_reject_oversized(void)
{
    ws_ipc_queue_t q;
    assert(ws_ipc_queue_init(&q, 4) == WS_STATUS_READY);
    uint8_t big[WS_PROTOCOL_HEADER_SIZE + WS_PROTOCOL_MAX_PAYLOAD_SIZE + 1];
    assert(ws_ipc_queue_enqueue(&q, big, sizeof(big)) != WS_STATUS_READY);
}

static void test_queue_reject_short_enqueue(void)
{
    ws_ipc_queue_t q;
    assert(ws_ipc_queue_init(&q, 4) == WS_STATUS_READY);
    uint8_t small[WS_PROTOCOL_HEADER_SIZE - 1];
    assert(ws_ipc_queue_enqueue(&q, small, sizeof(small)) != WS_STATUS_READY);
}

/* ============================================================ */
/* --- Queue-full behavior ---                                  */
/* ============================================================ */

static void test_queue_full(void)
{
    ws_ipc_queue_t q;
    assert(ws_ipc_queue_init(&q, 2) == WS_STATUS_READY);

    uint8_t msg[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_STATUS_SIZE];
    ws_envelope_t hdr = {
        .version = 1,
        .message_type = WS_IPC_BLE_STATUS,
        .payload_length = WS_PAYLOAD_STATUS_SIZE,
        .flags = 0,
        .sequence = 1u,
        .timestamp_us = 0,
    };
    ws_envelope_encode(msg, sizeof(msg), &hdr);
    msg[WS_PROTOCOL_HEADER_SIZE] = (uint8_t)WS_STATUS_READY;

    assert(ws_ipc_queue_enqueue(&q, msg, sizeof(msg)) == WS_STATUS_READY);
    hdr.sequence = 2u;
    ws_envelope_encode(msg, sizeof(msg), &hdr);
    assert(ws_ipc_queue_enqueue(&q, msg, sizeof(msg)) == WS_STATUS_READY);
    assert(ws_ipc_queue_is_full(&q) == 1);
    assert(ws_ipc_queue_count(&q) == 2);

    hdr.sequence = 3u;
    ws_envelope_encode(msg, sizeof(msg), &hdr);
    assert(ws_ipc_queue_enqueue(&q, msg, sizeof(msg)) != WS_STATUS_READY);

    ws_ipc_queue_counters_t c;
    ws_ipc_queue_get_counters(&q, &c);
    assert(c.queue_full == 1);
    assert(c.enqueue_ok == 2);
    assert(c.high_water_mark == 2);
}

static void test_queue_full_then_drain(void)
{
    ws_ipc_queue_t q;
    assert(ws_ipc_queue_init(&q, 2) == WS_STATUS_READY);

    uint8_t msg[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_STATUS_SIZE];
    ws_envelope_t hdr = {
        .version = 1,
        .message_type = WS_IPC_BLE_STATUS,
        .payload_length = WS_PAYLOAD_STATUS_SIZE,
        .flags = 0,
        .sequence = 1u,
        .timestamp_us = 0,
    };
    ws_envelope_encode(msg, sizeof(msg), &hdr);
    msg[WS_PROTOCOL_HEADER_SIZE] = (uint8_t)WS_STATUS_READY;

    ws_ipc_queue_enqueue(&q, msg, sizeof(msg));
    hdr.sequence = 2u;
    ws_envelope_encode(msg, sizeof(msg), &hdr);
    ws_ipc_queue_enqueue(&q, msg, sizeof(msg));

    uint8_t out[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_STATUS_SIZE];
    size_t out_len;
    ws_ipc_queue_dequeue(&q, out, sizeof(out), &out_len);
    assert(ws_ipc_queue_is_full(&q) == 0);

    /* Now we can enqueue again */
    hdr.sequence = 3u;
    ws_envelope_encode(msg, sizeof(msg), &hdr);
    assert(ws_ipc_queue_enqueue(&q, msg, sizeof(msg)) == WS_STATUS_READY);
    assert(ws_ipc_queue_count(&q) == 2);
}

/* ============================================================ */
/* --- FIFO ordering ---                                        */
/* ============================================================ */

static void test_queue_fifo_order(void)
{
    ws_ipc_queue_t q;
    assert(ws_ipc_queue_init(&q, 4) == WS_STATUS_READY);

    for (uint32_t i = 1; i <= 4; i++) {
        uint8_t msg[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_STATUS_SIZE];
        ws_envelope_t hdr = {
            .version = 1,
            .message_type = WS_IPC_BLE_STATUS,
            .payload_length = WS_PAYLOAD_STATUS_SIZE,
            .flags = 0,
            .sequence = i,
            .timestamp_us = 0,
        };
        ws_envelope_encode(msg, sizeof(msg), &hdr);
        msg[WS_PROTOCOL_HEADER_SIZE] = (uint8_t)WS_STATUS_READY;
        assert(ws_ipc_queue_enqueue(&q, msg, sizeof(msg)) == WS_STATUS_READY);
    }

    for (uint32_t i = 1; i <= 4; i++) {
        uint8_t out[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_STATUS_SIZE];
        size_t out_len;
        assert(ws_ipc_queue_dequeue(&q, out, sizeof(out), &out_len) == WS_STATUS_READY);
        ws_envelope_t dec;
        assert(ws_envelope_decode(&dec, out, out_len) == WS_STATUS_READY);
        assert(dec.sequence == i);
    }
}

/* ============================================================ */
/* --- Sequence gap detection ---                               */
/* ============================================================ */

static void test_sequence_gap_detection(void)
{
    ws_ipc_queue_t q;
    assert(ws_ipc_queue_init(&q, 4) == WS_STATUS_READY);

    uint8_t msg[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_STATUS_SIZE];

    /* Enqueue seq=1 */
    ws_envelope_t hdr = {
        .version = 1, .message_type = WS_IPC_BLE_STATUS,
        .payload_length = WS_PAYLOAD_STATUS_SIZE, .flags = 0,
        .sequence = 1u, .timestamp_us = 0,
    };
    ws_envelope_encode(msg, sizeof(msg), &hdr);
    msg[WS_PROTOCOL_HEADER_SIZE] = (uint8_t)WS_STATUS_READY;
    ws_ipc_queue_enqueue(&q, msg, sizeof(msg));

    /* Dequeue seq=1 — this sets last_seen=1 */
    uint8_t out[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_STATUS_SIZE];
    size_t out_len;
    ws_ipc_queue_dequeue(&q, out, sizeof(out), &out_len);

    /* Enqueue seq=5 — gap of 3 (2,3,4 missing) */
    hdr.sequence = 5u;
    ws_envelope_encode(msg, sizeof(msg), &hdr);
    ws_ipc_queue_enqueue(&q, msg, sizeof(msg));

    /* Dequeue seq=5 — should detect gap */
    ws_ipc_queue_dequeue(&q, out, sizeof(out), &out_len);

    ws_ipc_queue_counters_t c;
    ws_ipc_queue_get_counters(&q, &c);
    assert(c.sequence_gap == 1);
}

static void test_sequence_no_gap_consecutive(void)
{
    ws_ipc_queue_t q;
    assert(ws_ipc_queue_init(&q, 4) == WS_STATUS_READY);

    uint8_t msg[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_STATUS_SIZE];
    uint8_t out[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_STATUS_SIZE];
    size_t out_len;

    for (uint32_t i = 1; i <= 4; i++) {
        ws_envelope_t hdr = {
            .version = 1, .message_type = WS_IPC_BLE_STATUS,
            .payload_length = WS_PAYLOAD_STATUS_SIZE, .flags = 0,
            .sequence = i, .timestamp_us = 0,
        };
        ws_envelope_encode(msg, sizeof(msg), &hdr);
        msg[WS_PROTOCOL_HEADER_SIZE] = (uint8_t)WS_STATUS_READY;
        ws_ipc_queue_enqueue(&q, msg, sizeof(msg));
        ws_ipc_queue_dequeue(&q, out, sizeof(out), &out_len);
    }

    ws_ipc_queue_counters_t c;
    ws_ipc_queue_get_counters(&q, &c);
    assert(c.sequence_gap == 0);
}

static void test_sequence_wrap_no_gap(void)
{
    ws_ipc_queue_t q;
    assert(ws_ipc_queue_init(&q, 4) == WS_STATUS_READY);

    uint8_t msg[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_STATUS_SIZE];
    uint8_t out[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_STATUS_SIZE];
    size_t out_len;

    /* seq=0xFFFFFFFF → 0x00000000 (wrap, no gap) */
    ws_envelope_t hdr = {
        .version = 1, .message_type = WS_IPC_BLE_STATUS,
        .payload_length = WS_PAYLOAD_STATUS_SIZE, .flags = 0,
        .sequence = 0xFFFFFFFFu, .timestamp_us = 0,
    };
    ws_envelope_encode(msg, sizeof(msg), &hdr);
    msg[WS_PROTOCOL_HEADER_SIZE] = (uint8_t)WS_STATUS_READY;
    ws_ipc_queue_enqueue(&q, msg, sizeof(msg));
    ws_ipc_queue_dequeue(&q, out, sizeof(out), &out_len);

    hdr.sequence = 0u;
    ws_envelope_encode(msg, sizeof(msg), &hdr);
    ws_ipc_queue_enqueue(&q, msg, sizeof(msg));
    ws_ipc_queue_dequeue(&q, out, sizeof(out), &out_len);

    ws_ipc_queue_counters_t c;
    ws_ipc_queue_get_counters(&q, &c);
    assert(c.sequence_gap == 0);
}

/* ============================================================ */
/* --- High-water mark ---                                      */
/* ============================================================ */

static void test_high_water_mark(void)
{
    ws_ipc_queue_t q;
    assert(ws_ipc_queue_init(&q, 4) == WS_STATUS_READY);

    uint8_t msg[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_STATUS_SIZE];
    ws_envelope_t hdr = {
        .version = 1, .message_type = WS_IPC_BLE_STATUS,
        .payload_length = WS_PAYLOAD_STATUS_SIZE, .flags = 0,
        .sequence = 0, .timestamp_us = 0,
    };
    ws_envelope_encode(msg, sizeof(msg), &hdr);
    msg[WS_PROTOCOL_HEADER_SIZE] = (uint8_t)WS_STATUS_READY;

    /* Enqueue 3, dequeue 1, enqueue 2 more → peak=4 */
    ws_ipc_queue_enqueue(&q, msg, sizeof(msg));
    hdr.sequence = 1u; ws_envelope_encode(msg, sizeof(msg), &hdr);
    ws_ipc_queue_enqueue(&q, msg, sizeof(msg));
    hdr.sequence = 2u; ws_envelope_encode(msg, sizeof(msg), &hdr);
    ws_ipc_queue_enqueue(&q, msg, sizeof(msg));

    uint8_t out[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_STATUS_SIZE];
    size_t out_len;
    ws_ipc_queue_dequeue(&q, out, sizeof(out), &out_len);

    hdr.sequence = 3u; ws_envelope_encode(msg, sizeof(msg), &hdr);
    ws_ipc_queue_enqueue(&q, msg, sizeof(msg));
    hdr.sequence = 4u; ws_envelope_encode(msg, sizeof(msg), &hdr);
    ws_ipc_queue_enqueue(&q, msg, sizeof(msg));

    ws_ipc_queue_counters_t c;
    ws_ipc_queue_get_counters(&q, &c);
    assert(c.high_water_mark == 4);
}

/* ============================================================ */
/* --- Full loopback: encode → enqueue → dequeue → decode ---   */
/* ============================================================ */

static void test_full_loopback_env(void)
{
    ws_ipc_queue_t q;
    assert(ws_ipc_queue_init(&q, 4) == WS_STATUS_READY);

    /* Build a full ENV_UPDATE message */
    uint8_t msg[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_ENV_SIZE];
    ws_envelope_t hdr = {
        .version = 1,
        .message_type = WS_IPC_ENV_UPDATE,
        .payload_length = WS_PAYLOAD_ENV_SIZE,
        .flags = 0,
        .sequence = 42u,
        .timestamp_us = 123456ULL,
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

    /* Enqueue */
    assert(ws_ipc_queue_enqueue(&q, msg, sizeof(msg)) == WS_STATUS_READY);

    /* Dequeue */
    uint8_t out[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_ENV_SIZE];
    size_t out_len = 0;
    assert(ws_ipc_queue_dequeue(&q, out, sizeof(out), &out_len) == WS_STATUS_READY);
    assert(out_len == sizeof(msg));

    /* Decode envelope + payload */
    ws_envelope_t dec_hdr;
    ws_environment_sample_t dec_sample;
    assert(ws_envelope_decode(&dec_hdr, out, out_len) == WS_STATUS_READY);
    assert(dec_hdr.message_type == WS_IPC_ENV_UPDATE);
    assert(dec_hdr.sequence == 42u);
    assert(ws_env_decode(&dec_sample, out + WS_PROTOCOL_HEADER_SIZE, WS_PAYLOAD_ENV_SIZE) == WS_STATUS_READY);
    assert(dec_sample.temperature_c == 25.0F);
    assert(dec_sample.valid_mask == 0x7u);
}

static void test_full_loopback_imu(void)
{
    ws_ipc_queue_t q;
    assert(ws_ipc_queue_init(&q, 4) == WS_STATUS_READY);

    uint8_t msg[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_IMU_SIZE];
    ws_envelope_t hdr = {
        .version = 1,
        .message_type = WS_IPC_IMU_UPDATE,
        .payload_length = WS_PAYLOAD_IMU_SIZE,
        .flags = 0,
        .sequence = 7u,
        .timestamp_us = 0,
    };
    ws_imu_sample_t imu = {
        .timestamp_us = 100ULL,
        .accel_mps2 = {1.0F, -2.0F, 3.0F},
        .gyro_rads = {0.1F, -0.2F, 0.3F},
        .valid = true,
    };
    ws_envelope_encode(msg, sizeof(msg), &hdr);
    ws_imu_encode(msg + WS_PROTOCOL_HEADER_SIZE, WS_PAYLOAD_IMU_SIZE, &imu);
    ws_ipc_queue_enqueue(&q, msg, sizeof(msg));

    uint8_t out[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_IMU_SIZE];
    size_t out_len;
    ws_ipc_queue_dequeue(&q, out, sizeof(out), &out_len);
    assert(out_len == sizeof(msg));

    ws_envelope_t dec_hdr;
    ws_imu_sample_t dec_imu;
    ws_envelope_decode(&dec_hdr, out, out_len);
    assert(dec_hdr.message_type == WS_IPC_IMU_UPDATE);
    ws_imu_decode(&dec_imu, out + WS_PROTOCOL_HEADER_SIZE, WS_PAYLOAD_IMU_SIZE);
    assert(dec_imu.accel_mps2[0] == 1.0F);
    assert(dec_imu.valid == true);
}

/* ============================================================ */
/* --- Dequeue from empty ---                                   */
/* ============================================================ */

static void test_dequeue_empty(void)
{
    ws_ipc_queue_t q;
    assert(ws_ipc_queue_init(&q, 4) == WS_STATUS_READY);

    uint8_t out[32];
    size_t out_len;
    assert(ws_ipc_queue_dequeue(&q, out, sizeof(out), &out_len) != WS_STATUS_READY);
}

static void test_dequeue_null(void)
{
    ws_ipc_queue_t q;
    assert(ws_ipc_queue_init(&q, 4) == WS_STATUS_READY);

    uint8_t msg[WS_PROTOCOL_HEADER_SIZE];
    ws_envelope_t hdr = {.version=1, .message_type=WS_IPC_BLE_STATUS, .payload_length=0, .flags=0, .sequence=1};
    ws_envelope_encode(msg, sizeof(msg), &hdr);
    ws_ipc_queue_enqueue(&q, msg, sizeof(msg));

    size_t out_len;
    assert(ws_ipc_queue_dequeue(NULL, msg, sizeof(msg), &out_len) != WS_STATUS_READY);
    assert(ws_ipc_queue_dequeue(&q, NULL, sizeof(msg), &out_len) != WS_STATUS_READY);
    assert(ws_ipc_queue_dequeue(&q, msg, sizeof(msg), NULL) != WS_STATUS_READY);
}

/* ============================================================ */
/* --- Reset ---                                                */
/* ============================================================ */

static void test_queue_reset(void)
{
    ws_ipc_queue_t q;
    assert(ws_ipc_queue_init(&q, 4) == WS_STATUS_READY);

    uint8_t msg[WS_PROTOCOL_HEADER_SIZE];
    ws_envelope_t hdr = {.version=1, .message_type=WS_IPC_BLE_STATUS, .payload_length=0, .flags=0, .sequence=1};
    ws_envelope_encode(msg, sizeof(msg), &hdr);
    ws_ipc_queue_enqueue(&q, msg, sizeof(msg));
    ws_ipc_queue_enqueue(&q, msg, sizeof(msg));

    ws_ipc_queue_reset(&q);
    assert(ws_ipc_queue_count(&q) == 0);
    assert(ws_ipc_queue_is_empty(&q) == 1);

    ws_ipc_queue_counters_t c;
    ws_ipc_queue_get_counters(&q, &c);
    assert(c.high_water_mark == 0);
    assert(c.enqueue_ok == 0);
}

/* ============================================================ */
/* --- Drop policy: high-rate IMU vs low-rate status ---        */
/* ============================================================ */

static void test_drop_policy_imu_overwrites_oldest(void)
{
    /* IMU is high-rate: when queue is full, drop the oldest to make room.
     * This tests the coalescing policy from the brief: "High-rate IMU data
     * and low-rate status do not share an unbounded FIFO." */
    ws_ipc_queue_t q;
    assert(ws_ipc_queue_init(&q, 2) == WS_STATUS_READY);

    uint8_t msg[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_IMU_SIZE];
    ws_envelope_t hdr = {
        .version = 1, .message_type = WS_IPC_IMU_UPDATE,
        .payload_length = WS_PAYLOAD_IMU_SIZE, .flags = 0,
        .sequence = 1u, .timestamp_us = 0,
    };
    ws_imu_sample_t imu = {.timestamp_us=0, .accel_mps2={0}, .gyro_rads={0}, .valid=true};
    ws_envelope_encode(msg, sizeof(msg), &hdr);
    ws_imu_encode(msg + WS_PROTOCOL_HEADER_SIZE, WS_PAYLOAD_IMU_SIZE, &imu);

    /* Fill queue */
    ws_ipc_queue_enqueue(&q, msg, sizeof(msg));
    hdr.sequence = 2u; ws_envelope_encode(msg, sizeof(msg), &hdr);
    ws_imu_encode(msg + WS_PROTOCOL_HEADER_SIZE, WS_PAYLOAD_IMU_SIZE, &imu);
    ws_ipc_queue_enqueue(&q, msg, sizeof(msg));
    assert(ws_ipc_queue_is_full(&q) == 1);

    /* Enqueue with drop policy for IMU → should drop oldest, succeed */
    hdr.sequence = 3u; ws_envelope_encode(msg, sizeof(msg), &hdr);
    ws_imu_encode(msg + WS_PROTOCOL_HEADER_SIZE, WS_PAYLOAD_IMU_SIZE, &imu);
    assert(ws_ipc_queue_enqueue_with_drop(&q, msg, sizeof(msg)) == WS_STATUS_READY);

    ws_ipc_queue_counters_t c;
    ws_ipc_queue_get_counters(&q, &c);
    assert(c.queue_full == 0);      /* drop policy handled it, not a full rejection */
    assert(c.dropped == 1);          /* one old message was dropped */

    /* First dequeued should be seq=2 (seq=1 was dropped) */
    uint8_t out[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_IMU_SIZE];
    size_t out_len;
    ws_ipc_queue_dequeue(&q, out, sizeof(out), &out_len);
    ws_envelope_t dec;
    ws_envelope_decode(&dec, out, out_len);
    assert(dec.sequence == 2u);
}

static void test_drop_policy_status_rejects_when_full(void)
{
    /* Status is low-rate: when queue is full, reject (no drop).
     * The caller is expected to retry or report. */
    ws_ipc_queue_t q;
    assert(ws_ipc_queue_init(&q, 2) == WS_STATUS_READY);

    uint8_t msg[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_STATUS_SIZE];
    ws_envelope_t hdr = {
        .version = 1, .message_type = WS_IPC_BLE_STATUS,
        .payload_length = WS_PAYLOAD_STATUS_SIZE, .flags = 0,
        .sequence = 1u, .timestamp_us = 0,
    };
    ws_envelope_encode(msg, sizeof(msg), &hdr);
    msg[WS_PROTOCOL_HEADER_SIZE] = (uint8_t)WS_STATUS_READY;

    ws_ipc_queue_enqueue(&q, msg, sizeof(msg));
    hdr.sequence = 2u; ws_envelope_encode(msg, sizeof(msg), &hdr);
    ws_ipc_queue_enqueue(&q, msg, sizeof(msg));

    /* Status with drop policy → still rejects (status is not droppable) */
    hdr.sequence = 3u; ws_envelope_encode(msg, sizeof(msg), &hdr);
    assert(ws_ipc_queue_enqueue_with_drop(&q, msg, sizeof(msg)) != WS_STATUS_READY);

    ws_ipc_queue_counters_t c;
    ws_ipc_queue_get_counters(&q, &c);
    assert(c.queue_full == 1);
    assert(c.dropped == 0);
}

int main(void)
{
    test_queue_init();
    test_queue_reject_null();
    test_queue_reject_zero_capacity();
    test_queue_enqueue_dequeue_single();
    test_queue_reject_null_enqueue();
    test_queue_reject_oversized();
    test_queue_reject_short_enqueue();
    test_queue_full();
    test_queue_full_then_drain();
    test_queue_fifo_order();
    test_sequence_gap_detection();
    test_sequence_no_gap_consecutive();
    test_sequence_wrap_no_gap();
    test_high_water_mark();
    test_full_loopback_env();
    test_full_loopback_imu();
    test_dequeue_empty();
    test_dequeue_null();
    test_queue_reset();
    test_drop_policy_imu_overwrites_oldest();
    test_drop_policy_status_rejects_when_full();
    return 0;
}
