/*
 * P1.6 IPC transport tests: real shared queue with two separate instances
 * simulating CM33 NS (sender) and CM55 (receiver) accessing the same
 * shared memory. This is NOT a single-endpoint role-swap loopback —
 * it's a two-core simulation via a shared queue instance.
 */
#include <assert.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

#include "ws_ipc_transport.h"
#include "ws_ipc_messages.h"
#include "ws_protocol.h"
#include "ws_status.h"

/* Simulated shared memory — both cores access this same instance. */
static ws_ipc_shared_queue_t shared_mem;

static void test_transport_sender_init(void)
{
    memset(&shared_mem, 0, sizeof(shared_mem));
    assert(ws_ipc_transport_sender_init(&shared_mem) == WS_STATUS_READY);
}

static void test_transport_receiver_init(void)
{
    /* Receiver attaches to already-initialized queue. */
    assert(ws_ipc_transport_receiver_init(&shared_mem) == WS_STATUS_READY);
}

static void test_transport_receiver_init_uninitialized(void)
{
    ws_ipc_shared_queue_t fresh;
    memset(&fresh, 0, sizeof(fresh));
    assert(ws_ipc_transport_receiver_init(&fresh) == WS_STATUS_NOT_INITIALIZED);
}

static void test_transport_null_rejected(void)
{
    assert(ws_ipc_transport_sender_init(NULL) == WS_STATUS_INVALID_SAMPLE);
    assert(ws_ipc_transport_receiver_init(NULL) == WS_STATUS_INVALID_SAMPLE);
    assert(ws_ipc_transport_send(NULL, NULL, 0) == WS_STATUS_INVALID_SAMPLE);
    assert(ws_ipc_transport_receive(NULL, NULL, 0, NULL) == WS_STATUS_INVALID_SAMPLE);
}

static void test_transport_cross_core_send_receive(void)
{
    memset(&shared_mem, 0, sizeof(shared_mem));
    assert(ws_ipc_transport_sender_init(&shared_mem) == WS_STATUS_READY);
    assert(ws_ipc_transport_receiver_init(&shared_mem) == WS_STATUS_READY);

    /* CM33 NS sends a STATUS message. */
    uint8_t msg[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_STATUS_SIZE];
    ws_envelope_t hdr = {
        .version = 1, .message_type = WS_IPC_BLE_STATUS,
        .payload_length = WS_PAYLOAD_STATUS_SIZE, .flags = 0,
        .sequence = 1u, .timestamp_us = 1000ULL,
    };
    ws_envelope_encode(msg, sizeof(msg), &hdr);
    msg[WS_PROTOCOL_HEADER_SIZE] = (uint8_t)WS_STATUS_READY;

    assert(ws_ipc_transport_send(&shared_mem, msg, sizeof(msg)) == WS_STATUS_READY);

    /* CM55 receives it. */
    uint8_t out[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_STATUS_SIZE];
    size_t out_len = 0;
    assert(ws_ipc_transport_receive(&shared_mem, out, sizeof(out), &out_len) == WS_STATUS_READY);
    assert(out_len == sizeof(msg));
    assert(memcmp(out, msg, sizeof(msg)) == 0);

    /* Queue should be empty now. */
    assert(ws_ipc_transport_receive(&shared_mem, out, sizeof(out), &out_len) == WS_STATUS_BUSY);
}

static void test_transport_cross_core_env_message(void)
{
    memset(&shared_mem, 0, sizeof(shared_mem));
    assert(ws_ipc_transport_sender_init(&shared_mem) == WS_STATUS_READY);
    assert(ws_ipc_transport_receiver_init(&shared_mem) == WS_STATUS_READY);

    uint8_t msg[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_ENV_SIZE];
    ws_envelope_t hdr = {
        .version = 1, .message_type = WS_IPC_ENV_UPDATE,
        .payload_length = WS_PAYLOAD_ENV_SIZE, .flags = 0,
        .sequence = 42u, .timestamp_us = 9999ULL,
    };
    ws_environment_sample_t sample = {
        .timestamp_us = 500ULL,
        .temperature_c = 25.0F,
        .relative_humidity_percent = 60.0F,
        .pressure_hpa = 1013.25F,
        .valid_mask = 0x7u,
    };
    ws_envelope_encode(msg, sizeof(msg), &hdr);
    ws_env_encode(msg + WS_PROTOCOL_HEADER_SIZE, WS_PAYLOAD_ENV_SIZE, &sample);

    assert(ws_ipc_transport_send(&shared_mem, msg, sizeof(msg)) == WS_STATUS_READY);

    uint8_t out[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_ENV_SIZE];
    size_t out_len;
    assert(ws_ipc_transport_receive(&shared_mem, out, sizeof(out), &out_len) == WS_STATUS_READY);

    ws_envelope_t dec_hdr;
    ws_environment_sample_t dec_sample;
    assert(ws_envelope_decode(&dec_hdr, out, out_len) == WS_STATUS_READY);
    assert(dec_hdr.message_type == WS_IPC_ENV_UPDATE);
    assert(dec_hdr.sequence == 42u);
    assert(ws_env_decode(&dec_sample, out + WS_PROTOCOL_HEADER_SIZE, WS_PAYLOAD_ENV_SIZE) == WS_STATUS_READY);
    assert(dec_sample.temperature_c == 25.0F);
    assert(dec_sample.valid_mask == 0x7u);
}

static void test_transport_queue_full(void)
{
    memset(&shared_mem, 0, sizeof(shared_mem));
    assert(ws_ipc_transport_sender_init(&shared_mem) == WS_STATUS_READY);

    uint8_t msg[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_STATUS_SIZE];
    ws_envelope_t hdr = {
        .version = 1, .message_type = WS_IPC_BLE_STATUS,
        .payload_length = WS_PAYLOAD_STATUS_SIZE, .flags = 0,
        .sequence = 1u, .timestamp_us = 0,
    };
    ws_envelope_encode(msg, sizeof(msg), &hdr);
    msg[WS_PROTOCOL_HEADER_SIZE] = (uint8_t)WS_STATUS_READY;

    /* Fill the queue (capacity = WS_IPC_QUEUE_MAX_CAPACITY = 4). */
    for (uint16_t i = 0; i < WS_IPC_QUEUE_MAX_CAPACITY; i++)
    {
        hdr.sequence = i + 1u;
        ws_envelope_encode(msg, sizeof(msg), &hdr);
        msg[WS_PROTOCOL_HEADER_SIZE] = (uint8_t)WS_STATUS_READY;
        assert(ws_ipc_transport_send(&shared_mem, msg, sizeof(msg)) == WS_STATUS_READY);
    }

    /* Next send should fail (status is not droppable). */
    hdr.sequence = 99u;
    ws_envelope_encode(msg, sizeof(msg), &hdr);
    assert(ws_ipc_transport_send(&shared_mem, msg, sizeof(msg)) != WS_STATUS_READY);

    ws_ipc_queue_counters_t c;
    ws_ipc_transport_get_counters(&shared_mem, &c);
    assert(c.enqueue_ok == WS_IPC_QUEUE_MAX_CAPACITY);
    assert(c.queue_full >= 1u);
    assert(c.high_water_mark == WS_IPC_QUEUE_MAX_CAPACITY);
}

static void test_transport_imu_drop_policy(void)
{
    memset(&shared_mem, 0, sizeof(shared_mem));
    assert(ws_ipc_transport_sender_init(&shared_mem) == WS_STATUS_READY);

    uint8_t msg[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_IMU_SIZE];
    ws_envelope_t hdr = {
        .version = 1, .message_type = WS_IPC_IMU_UPDATE,
        .payload_length = WS_PAYLOAD_IMU_SIZE, .flags = 0,
        .sequence = 1u, .timestamp_us = 0,
    };
    ws_imu_sample_t sample = {
        .timestamp_us = 0,
        .accel_mps2 = {1.0F, 2.0F, 3.0F},
        .gyro_rads = {0.1F, 0.2F, 0.3F},
        .valid = true,
    };
    ws_envelope_encode(msg, sizeof(msg), &hdr);
    ws_imu_encode(msg + WS_PROTOCOL_HEADER_SIZE, WS_PAYLOAD_IMU_SIZE, &sample);

    /* Fill the queue. */
    for (uint16_t i = 0; i < WS_IPC_QUEUE_MAX_CAPACITY; i++)
    {
        hdr.sequence = i + 1u;
        ws_envelope_encode(msg, sizeof(msg), &hdr);
        assert(ws_ipc_transport_send(&shared_mem, msg, sizeof(msg)) == WS_STATUS_READY);
    }

    /* Next IMU send should succeed (drop oldest). */
    hdr.sequence = 99u;
    ws_envelope_encode(msg, sizeof(msg), &hdr);
    assert(ws_ipc_transport_send(&shared_mem, msg, sizeof(msg)) == WS_STATUS_READY);

    ws_ipc_queue_counters_t c;
    ws_ipc_transport_get_counters(&shared_mem, &c);
    assert(c.dropped >= 1u);
}

static void test_transport_sequence_gap(void)
{
    memset(&shared_mem, 0, sizeof(shared_mem));
    assert(ws_ipc_transport_sender_init(&shared_mem) == WS_STATUS_READY);

    uint8_t msg[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_STATUS_SIZE];
    ws_envelope_t hdr = {
        .version = 1, .message_type = WS_IPC_BLE_STATUS,
        .payload_length = WS_PAYLOAD_STATUS_SIZE, .flags = 0,
        .sequence = 1u, .timestamp_us = 0,
    };
    ws_envelope_encode(msg, sizeof(msg), &hdr);
    msg[WS_PROTOCOL_HEADER_SIZE] = (uint8_t)WS_STATUS_READY;
    assert(ws_ipc_transport_send(&shared_mem, msg, sizeof(msg)) == WS_STATUS_READY);

    /* Skip sequence 2, send sequence 3. */
    hdr.sequence = 3u;
    ws_envelope_encode(msg, sizeof(msg), &hdr);
    msg[WS_PROTOCOL_HEADER_SIZE] = (uint8_t)WS_STATUS_READY;
    assert(ws_ipc_transport_send(&shared_mem, msg, sizeof(msg)) == WS_STATUS_READY);

    ws_ipc_queue_counters_t c;
    ws_ipc_transport_get_counters(&shared_mem, &c);
    assert(c.sequence_gap >= 1u);
}

static void test_transport_fifo_order(void)
{
    memset(&shared_mem, 0, sizeof(shared_mem));
    assert(ws_ipc_transport_sender_init(&shared_mem) == WS_STATUS_READY);
    assert(ws_ipc_transport_receiver_init(&shared_mem) == WS_STATUS_READY);

    uint8_t msg[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_STATUS_SIZE];
    ws_envelope_t hdr = {
        .version = 1, .message_type = WS_IPC_BLE_STATUS,
        .payload_length = WS_PAYLOAD_STATUS_SIZE, .flags = 0,
        .sequence = 0, .timestamp_us = 0,
    };

    /* Enqueue 3 messages with different sequences. */
    for (uint16_t i = 0; i < 3; i++)
    {
        hdr.sequence = i + 10u;
        ws_envelope_encode(msg, sizeof(msg), &hdr);
        msg[WS_PROTOCOL_HEADER_SIZE] = (uint8_t)WS_STATUS_READY;
        assert(ws_ipc_transport_send(&shared_mem, msg, sizeof(msg)) == WS_STATUS_READY);
    }

    /* Dequeue and verify order. */
    for (uint16_t i = 0; i < 3; i++)
    {
        uint8_t out[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_STATUS_SIZE];
        size_t out_len;
        assert(ws_ipc_transport_receive(&shared_mem, out, sizeof(out), &out_len) == WS_STATUS_READY);
        ws_envelope_t dec;
        assert(ws_envelope_decode(&dec, out, out_len) == WS_STATUS_READY);
        assert(dec.sequence == i + 10u);
    }
}

int main(void)
{
    test_transport_sender_init();
    test_transport_receiver_init();
    test_transport_receiver_init_uninitialized();
    test_transport_null_rejected();
    test_transport_cross_core_send_receive();
    test_transport_cross_core_env_message();
    test_transport_queue_full();
    test_transport_imu_drop_policy();
    test_transport_sequence_gap();
    test_transport_fifo_order();
    return 0;
}
