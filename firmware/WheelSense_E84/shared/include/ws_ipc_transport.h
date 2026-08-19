#ifndef WS_IPC_TRANSPORT_H
#define WS_IPC_TRANSPORT_H

#include <stddef.h>
#include <stdint.h>
#include "ws_status.h"
#include "ws_ipc_queue.h"

/*
 * WheelSense IPC transport — real cross-core shared memory queue.
 *
 * Uses CY_SECTION_SHAREDMEM to place the queue in shared memory accessible
 * by both CM33 NS and CM55. The sender (CM33 NS) enqueues; the receiver
 * (CM55) dequeues. A simple flag-based notification is used instead of
 * interrupts for Phase 1 simplicity — the receiver polls.
 *
 * The shared queue is placed in the .cy_sharedmem section which the linker
 * script maps to the inter-core shared SRAM region.
 */

/* Shared queue instance — placed in shared memory by the linker. */
typedef struct
{
    ws_ipc_queue_t queue;
} ws_ipc_shared_queue_t;

/*
 * Initialize the shared queue. Called by the sender core (CM33 NS).
 * The shared_queue pointer must point to shared memory (CY_SECTION_SHAREDMEM).
 */
ws_status_t ws_ipc_transport_sender_init(ws_ipc_shared_queue_t *shared);

/*
 * Initialize the shared queue receiver. Called by the receiver core (CM55).
 * Does NOT reinitialize the queue — just attaches to the existing shared
 * instance. The sender must have initialized it first.
 */
ws_status_t ws_ipc_transport_receiver_init(ws_ipc_shared_queue_t *shared);

/*
 * Send a frame via the shared queue (sender side).
 */
ws_status_t ws_ipc_transport_send(ws_ipc_shared_queue_t *shared,
                                  const uint8_t *frame, size_t frame_size);

/*
 * Receive a frame from the shared queue (receiver side, non-blocking poll).
 * Returns WS_STATUS_BUSY if empty.
 */
ws_status_t ws_ipc_transport_receive(ws_ipc_shared_queue_t *shared,
                                     uint8_t *out, size_t out_capacity,
                                     size_t *out_len);

/* Get diagnostic counters from the shared queue. */
void ws_ipc_transport_get_counters(const ws_ipc_shared_queue_t *shared,
                                   ws_ipc_queue_counters_t *out);

#endif /* WS_IPC_TRANSPORT_H */
