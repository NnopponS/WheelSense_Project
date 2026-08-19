#ifndef WS_IPC_QUEUE_H
#define WS_IPC_QUEUE_H

#include <stddef.h>
#include <stdint.h>
#include "ws_status.h"
#include "ws_protocol.h"

/*
 * WheelSense IPC bounded message queue.
 *
 * A host-sim-testable ring buffer that stores encoded message frames
 * (envelope + payload). No RTOS handles, no raw pointers cross cores.
 *
 * Diagnostic counters track: enqueue OK, queue-full, dropped, sequence
 * gap, encode/decode failures, and high-water mark.
 *
 * Drop policy: high-rate messages (IMU) may drop the oldest entry when
 * the queue is full (coalescing). Low-rate messages (status) are rejected.
 */

/* IPC queue frame size is based on actual v1 payload sizes, not the
 * protocol's theoretical 1024-byte max. The largest v1 payload is
 * IMU_UPDATE at 33 bytes, so 64 bytes per frame is sufficient with
 * headroom for future message types. */
#define WS_IPC_QUEUE_FRAME_SIZE (64u)

#ifndef WS_IPC_QUEUE_MAX_CAPACITY
#define WS_IPC_QUEUE_MAX_CAPACITY 4u
#endif

/* Diagnostic counters. */
typedef struct
{
    uint32_t enqueue_ok;
    uint32_t queue_full;
    uint32_t dropped;
    uint32_t sequence_gap;
    uint32_t decode_fail;
    uint32_t encode_fail;
    uint32_t unknown_version;
    uint32_t unknown_type;
    uint32_t high_water_mark;
} ws_ipc_queue_counters_t;

/* Queue state. Instances are owned by the caller (static or shared memory). */
typedef struct
{
    uint16_t capacity;
    uint16_t head;
    uint16_t tail;
    uint16_t count;
    uint32_t last_sequence;
    int      has_last_sequence;
    ws_ipc_queue_counters_t counters;
    /* Frame storage follows in the same allocation. The init function
     * uses a fixed maximum capacity to keep the struct self-contained
     * without dynamic allocation. */
    uint16_t frame_len[WS_IPC_QUEUE_MAX_CAPACITY];
    uint8_t  frame_data[WS_IPC_QUEUE_MAX_CAPACITY][WS_IPC_QUEUE_FRAME_SIZE];
} ws_ipc_queue_t;

/*
 * Initialize a queue with the given capacity (must be > 0 and
 * <= WS_IPC_QUEUE_MAX_CAPACITY). Resets all counters.
 */
ws_status_t ws_ipc_queue_init(ws_ipc_queue_t *q, uint16_t capacity);

/*
 * Enqueue a message frame. Returns WS_STATUS_READY on success,
 * WS_STATUS_OVERFLOW if the queue is full.
 *
 * The frame must be at least WS_PROTOCOL_HEADER_SIZE bytes and at most
 * WS_IPC_QUEUE_FRAME_SIZE bytes. The envelope is validated.
 */
ws_status_t ws_ipc_queue_enqueue(ws_ipc_queue_t *q,
                                 const uint8_t *frame, size_t frame_size);

/*
 * Enqueue with drop policy. For high-rate message types (IMU), if the
 * queue is full, the oldest entry is dropped and the new one is enqueued.
 * For low-rate types, behaves like ws_ipc_queue_enqueue (rejects when full).
 */
ws_status_t ws_ipc_queue_enqueue_with_drop(ws_ipc_queue_t *q,
                                           const uint8_t *frame, size_t frame_size);

/*
 * Dequeue a message frame. Returns WS_STATUS_READY on success,
 * WS_STATUS_INVALID_SAMPLE if the queue is empty or arguments are null.
 *
 * out_len receives the actual frame size. The caller must provide a
 * buffer of at least WS_IPC_QUEUE_FRAME_SIZE bytes.
 */
ws_status_t ws_ipc_queue_dequeue(ws_ipc_queue_t *q,
                                 uint8_t *out, size_t out_capacity,
                                 size_t *out_len);

/* Query functions. */
uint16_t ws_ipc_queue_count(const ws_ipc_queue_t *q);
int ws_ipc_queue_is_empty(const ws_ipc_queue_t *q);
int ws_ipc_queue_is_full(const ws_ipc_queue_t *q);

/* Get a copy of the diagnostic counters. */
void ws_ipc_queue_get_counters(const ws_ipc_queue_t *q,
                               ws_ipc_queue_counters_t *out);

/* Reset the queue (clear all entries and counters). */
void ws_ipc_queue_reset(ws_ipc_queue_t *q);

#endif /* WS_IPC_QUEUE_H */
