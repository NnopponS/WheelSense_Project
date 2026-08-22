/*
 * WheelSense IPC transport.
 *
 * Target builds use Infineon's MTB-IPC queue and hardware semaphores. Host
 * builds use the deterministic queue below so shared protocol logic remains
 * sanitizer-testable without target headers or hardware.
 */

#include "ws_ipc_transport.h"

#if defined(WS_TARGET_MTB_IPC) && (WS_TARGET_MTB_IPC == 1)

#include <string.h>

#include "cy_ipc_drv.h"
#include "cy_sysint.h"
#include "mtb_ipc_config.h"

static mtb_ipc_t ws_ipc_instance;
static mtb_ipc_queue_t ws_ipc_tx_handle;
static mtb_ipc_queue_t ws_ipc_rx_handle;

#if CY_SYSTEM_CPU_M33
#define WS_IPC_LOCAL_INDEX 0u
#define WS_IPC_TX_QUEUE    0u
#define WS_IPC_RX_QUEUE    1u
#else
#define WS_IPC_LOCAL_INDEX 1u
#define WS_IPC_TX_QUEUE    1u
#define WS_IPC_RX_QUEUE    0u
#endif

static void ws_ipc_semaphore_interrupt_handler(void)
{
    mtb_ipc_semaphore_process_interrupt(&ws_ipc_instance);
}

static void ws_ipc_queue_interrupt_handler(void)
{
    mtb_ipc_queue_process_interrupt(&ws_ipc_instance);
}

static ws_status_t ws_ipc_interrupts_init(uint32_t semaphore_irq, uint32_t queue_irq)
{
    const cy_stc_sysint_t semaphore_config = {
        .intrSrc = (IRQn_Type)CY_IPC_INTR_MUX(semaphore_irq),
        .intrPriority = 7u,
    };
    const cy_stc_sysint_t queue_config = {
        .intrSrc = (IRQn_Type)CY_IPC_INTR_MUX(queue_irq),
        .intrPriority = 7u,
    };

    if ((Cy_SysInt_Init(&semaphore_config, ws_ipc_semaphore_interrupt_handler) != CY_SYSINT_SUCCESS) ||
        (Cy_SysInt_Init(&queue_config, ws_ipc_queue_interrupt_handler) != CY_SYSINT_SUCCESS))
    {
        return WS_STATUS_BUS_ERROR;
    }

    NVIC_EnableIRQ((IRQn_Type)CY_IPC_INTR_MUX(semaphore_irq));
    NVIC_EnableIRQ((IRQn_Type)CY_IPC_INTR_MUX(queue_irq));
    return WS_STATUS_READY;
}

static ws_status_t ws_ipc_result(cy_rslt_t result)
{
    if (result == CY_RSLT_SUCCESS)
    {
        return WS_STATUS_READY;
    }
    if (result == MTB_IPC_RSLT_ERR_QUEUE_EMPTY)
    {
        return WS_STATUS_BUSY;
    }
    if (result == MTB_IPC_RSLT_ERR_QUEUE_FULL)
    {
        return WS_STATUS_OVERFLOW;
    }
    if (result == MTB_IPC_RSLT_ERR_NOT_INITIALIZED)
    {
        return WS_STATUS_NOT_INITIALIZED;
    }
    return WS_STATUS_BUS_ERROR;
}

static mtb_ipc_config_t ws_ipc_config(uint32_t semaphore_irq, uint32_t queue_irq)
{
    const mtb_ipc_config_t config = {
        .internal_channel_index = MTB_IPC_CHANNEL_WS,
        .semaphore_irq = semaphore_irq,
        .queue_irq = queue_irq,
        .semaphore_num = MTB_IPC_SEMA_NUM_WS,
    };
    return config;
}

static mtb_ipc_queue_config_t ws_ipc_queue_config(ws_ipc_shared_queue_t *shared,
                                                   uint32_t queue_num,
                                                   uint32_t semaphore_num)
{
    const mtb_ipc_queue_config_t config = {
        .channel_num = MTB_IPC_CHANNEL_WS_QUEUE,
        .queue_num = queue_num,
        .max_num_items = WS_IPC_QUEUE_MAX_CAPACITY,
        .item_size = sizeof(ws_ipc_target_item_t),
        .queue_pool = shared->pool[queue_num].bytes,
        .semaphore_num = semaphore_num,
    };
    return config;
}

ws_status_t ws_ipc_transport_sender_init(ws_ipc_shared_queue_t *shared)
{
    if (shared == NULL)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }

    ws_status_t status = ws_ipc_interrupts_init(MTB_IPC_IRQ_SEMA_WS_CM33,
                                                MTB_IPC_IRQ_QUEUE_WS_CM33);
    if (status != WS_STATUS_READY)
    {
        return status;
    }

    memset(shared->counters, 0, sizeof(shared->counters));
    memset(shared->last_sequence, 0, sizeof(shared->last_sequence));
    memset(shared->has_last_sequence, 0, sizeof(shared->has_last_sequence));

    const mtb_ipc_config_t ipc_config = ws_ipc_config(MTB_IPC_IRQ_SEMA_WS_CM33,
                                                       MTB_IPC_IRQ_QUEUE_WS_CM33);
    cy_rslt_t result = mtb_ipc_init(&ws_ipc_instance, &shared->ipc, &ipc_config);
    if (result != CY_RSLT_SUCCESS)
    {
        return ws_ipc_result(result);
    }

    const mtb_ipc_queue_config_t forward_config = ws_ipc_queue_config(
        shared, 0u, MTB_IPC_SEMA_NUM_WS_QUEUE_CM33_TO_CM55);
    result = mtb_ipc_queue_init(&ws_ipc_instance, &ws_ipc_tx_handle,
                                &shared->queue[0], &forward_config);
    if (result != CY_RSLT_SUCCESS)
    {
        return ws_ipc_result(result);
    }

    const mtb_ipc_queue_config_t reverse_config = ws_ipc_queue_config(
        shared, 1u, MTB_IPC_SEMA_NUM_WS_QUEUE_CM55_TO_CM33);
    return ws_ipc_result(mtb_ipc_queue_init(&ws_ipc_instance, &ws_ipc_rx_handle,
                                            &shared->queue[1], &reverse_config));
}

ws_status_t ws_ipc_transport_receiver_init(ws_ipc_shared_queue_t *shared)
{
    if (shared == NULL)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }

    ws_status_t status = ws_ipc_interrupts_init(MTB_IPC_IRQ_SEMA_WS_CM55,
                                                MTB_IPC_IRQ_QUEUE_WS_CM55);
    if (status != WS_STATUS_READY)
    {
        return status;
    }

    const mtb_ipc_config_t config = ws_ipc_config(MTB_IPC_IRQ_SEMA_WS_CM55,
                                                   MTB_IPC_IRQ_QUEUE_WS_CM55);
    cy_rslt_t result = mtb_ipc_get_handle(&ws_ipc_instance, &config, 1000u);
    if (result != CY_RSLT_SUCCESS)
    {
        return ws_ipc_result(result);
    }

    result = mtb_ipc_queue_get_handle(&ws_ipc_instance, &ws_ipc_tx_handle,
                                      MTB_IPC_CHANNEL_WS_QUEUE, WS_IPC_TX_QUEUE);
    if (result != CY_RSLT_SUCCESS)
    {
        return ws_ipc_result(result);
    }
    result = mtb_ipc_queue_get_handle(&ws_ipc_instance, &ws_ipc_rx_handle,
                                      MTB_IPC_CHANNEL_WS_QUEUE, WS_IPC_RX_QUEUE);
    return ws_ipc_result(result);
}

ws_status_t ws_ipc_transport_send(ws_ipc_shared_queue_t *shared,
                                  const uint8_t *frame, size_t frame_size)
{
    if ((shared == NULL) || (frame == NULL) ||
        (frame_size < WS_PROTOCOL_HEADER_SIZE) || (frame_size > WS_IPC_QUEUE_FRAME_SIZE))
    {
        return WS_STATUS_INVALID_SAMPLE;
    }

    ws_envelope_t header;
    ws_status_t status = ws_envelope_decode(&header, frame, frame_size);
    if (status != WS_STATUS_READY)
    {
        if (status == WS_STATUS_UNSUPPORTED)
        {
            shared->counters[WS_IPC_LOCAL_INDEX].unknown_version++;
        }
        else
        {
            shared->counters[WS_IPC_LOCAL_INDEX].decode_fail++;
        }
        return status;
    }

    if (shared->has_last_sequence[WS_IPC_LOCAL_INDEX] != 0u)
    {
        const int32_t difference =
            (int32_t)(header.sequence - shared->last_sequence[WS_IPC_LOCAL_INDEX]);
        if (difference > 1)
        {
            shared->counters[WS_IPC_LOCAL_INDEX].sequence_gap++;
        }
    }
    shared->last_sequence[WS_IPC_LOCAL_INDEX] = header.sequence;
    shared->has_last_sequence[WS_IPC_LOCAL_INDEX] = 1u;

    ws_ipc_target_item_t item = { .frame_size = (uint16_t)frame_size };
    memcpy(item.frame, frame, frame_size);

    cy_rslt_t result = mtb_ipc_queue_put(&ws_ipc_tx_handle, &item, 0u);
    if ((result == MTB_IPC_RSLT_ERR_QUEUE_FULL) &&
        (header.message_type == WS_IPC_IMU_UPDATE))
    {
        ws_ipc_target_item_t discarded;
        if (mtb_ipc_queue_get(&ws_ipc_tx_handle, &discarded, 0u) == CY_RSLT_SUCCESS)
        {
            shared->counters[WS_IPC_LOCAL_INDEX].dropped++;
            result = mtb_ipc_queue_put(&ws_ipc_tx_handle, &item, 0u);
        }
    }

    if (result != CY_RSLT_SUCCESS)
    {
        if (result == MTB_IPC_RSLT_ERR_QUEUE_FULL)
        {
            shared->counters[WS_IPC_LOCAL_INDEX].queue_full++;
        }
        return ws_ipc_result(result);
    }

    shared->counters[WS_IPC_LOCAL_INDEX].enqueue_ok++;
    const uint32_t count = mtb_ipc_queue_count(&ws_ipc_tx_handle);
    if (count > shared->counters[WS_IPC_LOCAL_INDEX].high_water_mark)
    {
        shared->counters[WS_IPC_LOCAL_INDEX].high_water_mark = count;
    }
    return WS_STATUS_READY;
}

ws_status_t ws_ipc_transport_receive(ws_ipc_shared_queue_t *shared,
                                     uint8_t *out, size_t out_capacity,
                                     size_t *out_len)
{
    if ((shared == NULL) || (out == NULL) || (out_len == NULL))
    {
        return WS_STATUS_INVALID_SAMPLE;
    }

    ws_ipc_target_item_t item;
    const cy_rslt_t result = mtb_ipc_queue_get(&ws_ipc_rx_handle, &item, 0u);
    if (result != CY_RSLT_SUCCESS)
    {
        return ws_ipc_result(result);
    }
    if ((item.frame_size < WS_PROTOCOL_HEADER_SIZE) ||
        (item.frame_size > WS_IPC_QUEUE_FRAME_SIZE) ||
        ((size_t)item.frame_size > out_capacity))
    {
        shared->counters[WS_IPC_LOCAL_INDEX].decode_fail++;
        return WS_STATUS_INVALID_SAMPLE;
    }

    memcpy(out, item.frame, item.frame_size);
    *out_len = item.frame_size;
    return WS_STATUS_READY;
}

void ws_ipc_transport_get_counters(const ws_ipc_shared_queue_t *shared,
                                   ws_ipc_queue_counters_t *out)
{
    if ((shared != NULL) && (out != NULL))
    {
        *out = shared->counters[WS_IPC_LOCAL_INDEX];
    }
}

#else

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

#endif
