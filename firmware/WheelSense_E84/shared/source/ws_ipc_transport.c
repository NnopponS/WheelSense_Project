/*
 * WheelSense IPC transport — real cross-core shared memory queue.
 *
 * The shared queue is placed in CY_SECTION_SHAREDMEM which the linker
 * maps to inter-core shared SRAM. Both CM33 NS and CM55 access the
 * same physical memory.
 *
 * Phase 1: simple polling (no interrupts). The sender enqueues, the
 * receiver polls. Phase 2 will add mtb_ipc interrupt notification.
 */

#include "ws_ipc_transport.h"

ws_status_t ws_ipc_transport_sender_init(ws_ipc_shared_queue_t *shared)
{
    if (shared == NULL)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    return ws_ipc_queue_init(&shared->queue, WS_IPC_QUEUE_MAX_CAPACITY);
}

ws_status_t ws_ipc_transport_receiver_init(ws_ipc_shared_queue_t *shared)
{
    if (shared == NULL)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    /* Receiver does not reinitialize — the sender already did.
     * Just verify the queue is valid by checking capacity. */
    if (shared->queue.capacity == 0u)
    {
        return WS_STATUS_NOT_INITIALIZED;
    }
    return WS_STATUS_READY;
}

ws_status_t ws_ipc_transport_send(ws_ipc_shared_queue_t *shared,
                                  const uint8_t *frame, size_t frame_size)
{
    if (shared == NULL)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    return ws_ipc_queue_enqueue_with_drop(&shared->queue, frame, frame_size);
}

ws_status_t ws_ipc_transport_receive(ws_ipc_shared_queue_t *shared,
                                     uint8_t *out, size_t out_capacity,
                                     size_t *out_len)
{
    if (shared == NULL)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    if (ws_ipc_queue_is_empty(&shared->queue))
    {
        return WS_STATUS_BUSY;
    }
    return ws_ipc_queue_dequeue(&shared->queue, out, out_capacity, out_len);
}

void ws_ipc_transport_get_counters(const ws_ipc_shared_queue_t *shared,
                                   ws_ipc_queue_counters_t *out)
{
    if (shared != NULL && out != NULL)
    {
        ws_ipc_queue_get_counters(&shared->queue, out);
    }
}
