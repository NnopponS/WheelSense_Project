/*******************************************************************************
* File Name        : main.c
*
* Description      : This source file contains the main routine for CM55 CPU
*
* Related Document: See README.md
*
*******************************************************************************
* (c) 2025-2026, Infineon Technologies AG, or an affiliate of Infineon
* Technologies AG. All rights reserved.
* This software, associated documentation and materials ("Software") is
* owned by Infineon Technologies AG or one of its affiliates ("Infineon")
* and is protected by and subject to worldwide patent protection, worldwide
* copyright laws, and international treaty provisions. Therefore, you may use
* this Software only as provided in the license agreement accompanying the
* software package from which you obtained this Software. If no license
* agreement applies, then any use, reproduction, modification, translation, or
* compilation of this Software is prohibited without the express written
* permission of Infineon.
*
* Disclaimer: UNLESS OTHERWISE EXPRESSLY AGREED WITH INFINEON, THIS SOFTWARE
* IS PROVIDED AS-IS, WITH NO WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
* INCLUDING, BUT NOT LIMITED TO, ALL WARRANTIES OF NON-INFRINGEMENT OF
* THIRD-PARTY RIGHTS AND IMPLIED WARRANTIES SUCH AS WARRANTIES OF FITNESS FOR A
* SPECIFIC USE/PURPOSE OR MERCHANTABILITY.
* Infineon reserves the right to make changes to the Software without notice.
* You are responsible for properly designing, programming, and testing the
* functionality and safety of your intended application of the Software, as
* well as complying with any legal requirements related to its use. Infineon
* does not guarantee that the Software will be free from intrusion, data theft
* or loss, or other breaches ("Security Breaches"), and Infineon shall have
* no liability arising out of any Security Breaches. Unless otherwise
* explicitly approved by Infineon, the Software may not be used in any
* application where a failure of the Product or any consequences of the use
* thereof can reasonably be expected to result in personal injury.
*******************************************************************************/

/*******************************************************************************
* Header Files
*******************************************************************************/
#include "cybsp.h"
#include <string.h>
#include <stdlib.h>
#include <inttypes.h>
#include <stdio.h>
/* RTOS header file */
#include <cyabs_rtos.h>
#include <FreeRTOS.h>
#include <task.h>
#include "protocol/protocol.h"
#include "build.h"
#include "common.h"
#include "ws_clock.h"
#include "board.h"
#include "system.h"
#include "wifi_configs/im_config.h"
#include "initd.h"
#include "usbd.h"
#include "retarget_io_init.h"
#include "ws_ipc_messages.h"
#include "ws_ipc_transport.h"

/* WheelSense MTB-IPC state at the same shared SOCMEM address as CM33 NS. */
CY_SECTION(".cy_shared_socmem") ws_ipc_shared_queue_t ws_ipc_shared;

#ifdef IM_ENABLE_SHELL
#include "shell/debug_uart.h"
#endif
#include "ws_environment.h"

/*******************************************************************************
* Function Name: main
********************************************************************************
* Summary:
* This is the main function for CM55 application.It also initializes the 
* the device and board peripherals, retarget-io middleware, clock and streaming interface.
* 
* CM33 application enables the CM55 CPU and then the CM33 CPU enters 
* deep sleep.
* 
* Parameters:
*  void
*
* Return:
*  int
*
*******************************************************************************/
int main(void)
{
    ws_status_t ipc_attach_status;
    ws_status_t ipc_receive_status = WS_STATUS_NOT_INITIALIZED;
    bool ipc_boot_probe_pass = false;
    bool ipc_bidirectional_probe_pass = false;

    /* Initialize the device and board peripherals */
    board_init_system();

    /* Initialize retarget-io middleware */
    init_retarget_io();

    /* Attach to the synchronized MTB-IPC queue initialized by CM33 NS. */
    ipc_attach_status = ws_ipc_transport_receiver_init(&ws_ipc_shared);

    /* Start clock */
    if(!clock_init())
    {
        halt_error(LED_CODE_CLOCK_ERROR);
    }

   #ifdef IM_ENABLE_SHELL
    /* Init debug UART, continue if failed. */ 
      debug_uart_init();   
   #else
   #endif

    if (ipc_attach_status == WS_STATUS_READY)
    {
        uint8_t frame[WS_IPC_QUEUE_FRAME_SIZE];
        size_t frame_size = 0u;

        ipc_receive_status = ws_ipc_transport_receive(&ws_ipc_shared, frame,
                                                      sizeof(frame), &frame_size);
        if (ipc_receive_status == WS_STATUS_READY)
        {
            ws_envelope_t header;
            uint16_t event_id = 0u;
            uint32_t counter = 0u;

            if ((ws_envelope_decode(&header, frame, frame_size) == WS_STATUS_READY) &&
                (header.message_type == WS_IPC_DIAGNOSTIC_EVENT) &&
                (ws_diag_event_decode(&event_id, &counter,
                                      frame + WS_PROTOCOL_HEADER_SIZE,
                                      header.payload_length) == WS_STATUS_READY) &&
                (event_id == WS_DIAG_EVENT_CM33_NS_BOOT_READY))
            {
                ipc_boot_probe_pass = true;

                uint8_t acknowledgement[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_DIAG_SIZE];
                const ws_envelope_t acknowledgement_header = {
                    .version = WS_PROTOCOL_VERSION,
                    .message_type = WS_IPC_DIAGNOSTIC_EVENT,
                    .payload_length = WS_PAYLOAD_DIAG_SIZE,
                    .flags = 0u,
                    .sequence = 1u,
                    .timestamp_us = 0u,
                };

                if ((ws_envelope_encode(acknowledgement, sizeof(acknowledgement),
                                        &acknowledgement_header) == WS_STATUS_READY) &&
                    (ws_diag_event_encode(acknowledgement + WS_PROTOCOL_HEADER_SIZE,
                                          WS_PAYLOAD_DIAG_SIZE,
                                          WS_DIAG_EVENT_CM55_BOOT_ACK,
                                          1u) == WS_STATUS_READY) &&
                    (ws_ipc_transport_send(&ws_ipc_shared, acknowledgement,
                                           sizeof(acknowledgement)) == WS_STATUS_READY))
                {
                    for (uint32_t attempt = 0u; attempt < 5000u; ++attempt)
                    {
                        uint8_t confirmation[WS_IPC_QUEUE_FRAME_SIZE];
                        size_t confirmation_size = 0u;

                        if (ws_ipc_transport_receive(&ws_ipc_shared, confirmation,
                                                     sizeof(confirmation),
                                                     &confirmation_size) == WS_STATUS_READY)
                        {
                            ws_envelope_t confirmation_header;
                            uint16_t confirmation_event = 0u;
                            uint32_t confirmation_counter = 0u;

                            if ((ws_envelope_decode(&confirmation_header, confirmation,
                                                    confirmation_size) == WS_STATUS_READY) &&
                                (confirmation_header.message_type == WS_IPC_DIAGNOSTIC_EVENT) &&
                                (ws_diag_event_decode(&confirmation_event,
                                                      &confirmation_counter,
                                                      confirmation + WS_PROTOCOL_HEADER_SIZE,
                                                      confirmation_header.payload_length) == WS_STATUS_READY) &&
                                (confirmation_event == WS_DIAG_EVENT_CM33_NS_ACK))
                            {
                                ipc_bidirectional_probe_pass = true;
                                break;
                            }
                        }
                        Cy_SysLib_Delay(1u);
                    }
                }
            }
        }
    }

#if (WS_FEATURE_ENVIRONMENT == 1)
    const ws_environment_config_t environment_config = {
        .sample_rate_hz = 2u,
        .enable_sht40 = true,
        .enable_dps368 = true,
    };
    if (ws_environment_init(&environment_config) != WS_STATUS_READY)
    {
        printf("[EASE_AI] environment cache init FAIL\r\n");
    }
#endif

    if (!ipc_boot_probe_pass)
    {
#ifdef IM_ENABLE_SHELL
        printk("[EASE_AI] IPC CM33_NS->CM55 boot probe FAIL (attach=%u receive=%u sender_init=%lu send=%lu)\n",
               (unsigned int)ipc_attach_status,
               (unsigned int)ipc_receive_status,
               (unsigned long)ws_ipc_shared.diagnostic_sender_init_status,
               (unsigned long)ws_ipc_shared.diagnostic_boot_send_status);
#else
        printf("[EASE_AI] IPC CM33_NS->CM55 boot probe FAIL (attach=%u receive=%u sender_init=%lu send=%lu)\r\n",
               (unsigned int)ipc_attach_status,
               (unsigned int)ipc_receive_status,
               (unsigned long)ws_ipc_shared.diagnostic_sender_init_status,
               (unsigned long)ws_ipc_shared.diagnostic_boot_send_status);
#endif
    }
    else if (ipc_bidirectional_probe_pass)
    {
#ifdef IM_ENABLE_SHELL
        printk("[EASE_AI] IPC CM33_NS<->CM55 bidirectional boot probe PASS\n");
#else
        printf("[EASE_AI] IPC CM33_NS<->CM55 bidirectional boot probe PASS\r\n");
#endif
    }
    else
    {
#ifdef IM_ENABLE_SHELL
        printk("[EASE_AI] IPC CM33_NS<->CM55 bidirectional boot probe FAIL\n");
#else
        printf("[EASE_AI] IPC CM33_NS<->CM55 bidirectional boot probe FAIL\r\n");
#endif
    }
   
    /* Start task with pid 1, this is the parent for all tasks */
    xTaskCreate(
        initd_task,
        "initd",
        INITD_STACK_SIZE,
        NULL,
        INITD_PRIO,
        NULL);

    /* Start the FreeRTOS scheduler. */
    vTaskStartScheduler();

    /* Should never get here. */
    return 0;
    
}

/* [] END OF FILE */
