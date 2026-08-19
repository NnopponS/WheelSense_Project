/*
 * WheelSense IPC bounded message queue implementation.
 *
 * Host-sim-testable ring buffer. No RTOS, no dynamic allocation.
 * Diagnostic counters and drop policy per the Phase 1 brief.
 */

#include "ws_ipc_queue.h"

#include <string.h>

static int ws_is_droppable_message(uint16_t message_type)
{
    /* High-rate messages that can be coalesced/dropped when queue is full. */
    return (message_type == WS_IPC_IMU_UPDATE) ? 1 : 0;
}

ws_status_t ws_ipc_queue_init(ws_ipc_queue_t *q, uint16_t capacity)
{
    if (q == NULL)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    if (capacity == 0u || capacity > WS_IPC_QUEUE_MAX_CAPACITY)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }

    memset(q, 0, sizeof(*q));
    q->capacity = capacity;
    q->has_last_sequence = 0;
    return WS_STATUS_READY;
}

ws_status_t ws_ipc_queue_enqueue(ws_ipc_queue_t *q,
                                 const uint8_t *frame, size_t frame_size)
{
    if (q == NULL || frame == NULL)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    if (frame_size < WS_PROTOCOL_HEADER_SIZE)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    if (frame_size > WS_IPC_QUEUE_FRAME_SIZE)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }

    if (q->count >= q->capacity)
    {
        q->counters.queue_full++;
        return WS_STATUS_OVERFLOW;
    }

    /* Validate the envelope before storing. */
    ws_envelope_t hdr;
    ws_status_t st = ws_envelope_decode(&hdr, frame, frame_size);
    if (st != WS_STATUS_READY)
    {
        if (st == WS_STATUS_UNSUPPORTED)
        {
            q->counters.unknown_version++;
        }
        else if (st == WS_STATUS_INVALID_SAMPLE)
        {
            q->counters.decode_fail++;
        }
        return st;
    }

    /* Sequence gap detection on enqueue (when the frame arrives). */
    if (q->has_last_sequence)
    {
        int32_t diff = (int32_t)(hdr.sequence - q->last_sequence);
        if (diff > 1)
        {
            q->counters.sequence_gap++;
        }
    }
    q->last_sequence = hdr.sequence;
    q->has_last_sequence = 1;

    /* Store the frame. */
    uint16_t slot = q->tail;
    q->frame_len[slot] = (uint16_t)frame_size;
    memcpy(q->frame_data[slot], frame, frame_size);
    q->tail = (uint16_t)((q->tail + 1u) % q->capacity);
    q->count++;

    if (q->count > q->counters.high_water_mark)
    {
        q->counters.high_water_mark = q->count;
    }
    q->counters.enqueue_ok++;

    return WS_STATUS_READY;
}

ws_status_t ws_ipc_queue_enqueue_with_drop(ws_ipc_queue_t *q,
                                           const uint8_t *frame, size_t frame_size)
{
    if (q == NULL || frame == NULL)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    if (frame_size < WS_PROTOCOL_HEADER_SIZE || frame_size > WS_IPC_QUEUE_FRAME_SIZE)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }

    /* Peek at message type to decide drop policy. */
    ws_envelope_t hdr;
    ws_status_t st = ws_envelope_decode(&hdr, frame, frame_size);
    if (st != WS_STATUS_READY)
    {
        if (st == WS_STATUS_UNSUPPORTED)
        {
            q->counters.unknown_version++;
        }
        else
        {
            q->counters.decode_fail++;
        }
        return st;
    }

    /* Sequence gap detection on enqueue. */
    if (q->has_last_sequence)
    {
        int32_t diff = (int32_t)(hdr.sequence - q->last_sequence);
        if (diff > 1)
        {
            q->counters.sequence_gap++;
        }
    }
    q->last_sequence = hdr.sequence;
    q->has_last_sequence = 1;

    if (q->count >= q->capacity)
    {
        if (ws_is_droppable_message(hdr.message_type))
        {
            /* Drop the oldest entry. */
            q->head = (uint16_t)((q->head + 1u) % q->capacity);
            q->count--;
            q->counters.dropped++;
            /* Fall through to enqueue the new frame. */
        }
        else
        {
            q->counters.queue_full++;
            return WS_STATUS_OVERFLOW;
        }
    }

    /* Store the frame (same as enqueue, but we already validated). */
    uint16_t slot = q->tail;
    q->frame_len[slot] = (uint16_t)frame_size;
    memcpy(q->frame_data[slot], frame, frame_size);
    q->tail = (uint16_t)((q->tail + 1u) % q->capacity);
    q->count++;

    if (q->count > q->counters.high_water_mark)
    {
        q->counters.high_water_mark = q->count;
    }
    q->counters.enqueue_ok++;

    return WS_STATUS_READY;
}

ws_status_t ws_ipc_queue_dequeue(ws_ipc_queue_t *q,
                                 uint8_t *out, size_t out_capacity,
                                 size_t *out_len)
{
    if (q == NULL || out == NULL || out_len == NULL)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    if (q->count == 0u)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }

    uint16_t slot = q->head;
    uint16_t len = q->frame_len[slot];

    if (out_capacity < len)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }

    memcpy(out, q->frame_data[slot], len);
    *out_len = len;

    q->head = (uint16_t)((q->head + 1u) % q->capacity);
    q->count--;

    return WS_STATUS_READY;
}

uint16_t ws_ipc_queue_count(const ws_ipc_queue_t *q)
{
    return (q != NULL) ? q->count : 0u;
}

int ws_ipc_queue_is_empty(const ws_ipc_queue_t *q)
{
    return (q != NULL && q->count == 0u) ? 1 : 0;
}

int ws_ipc_queue_is_full(const ws_ipc_queue_t *q)
{
    return (q != NULL && q->count >= q->capacity) ? 1 : 0;
}

void ws_ipc_queue_get_counters(const ws_ipc_queue_t *q,
                               ws_ipc_queue_counters_t *out)
{
    if (q != NULL && out != NULL)
    {
        *out = q->counters;
    }
}

void ws_ipc_queue_reset(ws_ipc_queue_t *q)
{
    if (q == NULL)
    {
        return;
    }
    uint16_t cap = q->capacity;
    memset(q, 0, sizeof(*q));
    q->capacity = cap;
    q->has_last_sequence = 0;
}
