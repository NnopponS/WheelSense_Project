#ifndef WS_IPC_TRANSPORT_H
#define WS_IPC_TRANSPORT_H

#include <stddef.h>
#include <stdint.h>
#include "ws_status.h"
#include "ws_ipc_queue.h"

#if defined(WS_TARGET_MTB_IPC) && (WS_TARGET_MTB_IPC == 1)
#include "mtb_ipc.h"
#endif

/*
 * WheelSense IPC transport.
 *
 * Target builds use Infineon's MTB-IPC semaphore-protected queue. Host builds
 * retain the deterministic in-process queue used by the CTest suites.
 */

/* Shared queue instance — placed in shared memory by the linker. */
#if defined(WS_TARGET_MTB_IPC) && (WS_TARGET_MTB_IPC == 1)
typedef struct
{
    uint16_t frame_size;
    uint8_t frame[WS_IPC_QUEUE_FRAME_SIZE];
} ws_ipc_target_item_t;

typedef struct
{
    mtb_ipc_shared_t ipc;
    mtb_ipc_queue_data_t queue[2];
    union
    {
        uint64_t align;
        uint8_t bytes[sizeof(ws_ipc_target_item_t) * WS_IPC_QUEUE_MAX_CAPACITY];
    } pool[2];
    ws_ipc_queue_counters_t counters[2];
    uint32_t last_sequence[2];
    uint8_t has_last_sequence[2];
    volatile uint32_t diagnostic_sender_init_status;
    volatile uint32_t diagnostic_boot_send_status;
} ws_ipc_shared_queue_t;
#else
typedef struct
{
    ws_ipc_queue_t queue;
} ws_ipc_shared_queue_t;
#endif

/*
 * Initialize the shared queue. Called by the sender core (CM33 NS).
 * The pointer must refer to the shared CM33/CM55 SOCMEM section.
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
