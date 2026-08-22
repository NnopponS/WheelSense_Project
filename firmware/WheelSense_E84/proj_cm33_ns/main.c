/*******************************************************************************
* File Name        : main.c
*
* Description      : This source file contains the main routine for non-secure
*                    application in the CM33 CPU
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
#include "cy_syslib.h"
#include "ws_ipc_messages.h"
#include "ws_ipc_transport.h"

/*******************************************************************************
* Macros
*******************************************************************************/
/* The timeout value in microseconds used to wait for CM55 core to be booted */
#define CM55_BOOT_WAIT_TIME_USEC    (10U)

/* App boot address for CM55 project */
#define CM55_APP_BOOT_ADDR          (CYMEM_CM33_0_m55_nvm_START + \
                                        CYBSP_MCUBOOT_HEADER_SIZE)

/* WheelSense MTB-IPC state in the CM33/CM55 shared SOCMEM region. */
CY_SECTION(".cy_shared_socmem") ws_ipc_shared_queue_t ws_ipc_shared;

/*******************************************************************************
* Function Name: main
********************************************************************************
* Summary:
* This is the main function of the CM33 non-secure application. 
* 
* It initializes the device and board peripherals.
* 
*
* Parameters:
*  none
*
* Return:
*  int
*
*******************************************************************************/
int main(void)
{
    cy_rslt_t result = CY_RSLT_SUCCESS;
    ws_status_t ipc_status = WS_STATUS_NOT_INITIALIZED;

    /* Initialize the device and board peripherals. */
    result = cybsp_init();

    /* Board initialization failed. Stop program execution. */
    if (CY_RSLT_SUCCESS != result)
    {
        /* Disable all interrupts. */
        __disable_irq();

        CY_ASSERT(0);

        /* Infinite loop */
        while(true);
    }

    /* Enable global interrupts */
    __enable_irq();

    /* Initialize synchronized WheelSense MTB-IPC and publish a boot probe. */
    ipc_status = ws_ipc_transport_sender_init(&ws_ipc_shared);
    ws_ipc_shared.diagnostic_sender_init_status = (uint32_t)ipc_status;
    ws_ipc_shared.diagnostic_boot_send_status = (uint32_t)WS_STATUS_NOT_INITIALIZED;
    if (ipc_status == WS_STATUS_READY)
    {
        uint8_t frame[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_DIAG_SIZE];
        const ws_envelope_t header = {
            .version = WS_PROTOCOL_VERSION,
            .message_type = WS_IPC_DIAGNOSTIC_EVENT,
            .payload_length = WS_PAYLOAD_DIAG_SIZE,
            .flags = 0u,
            .sequence = 1u,
            .timestamp_us = 0u,
        };

        if ((ws_envelope_encode(frame, sizeof(frame), &header) == WS_STATUS_READY) &&
            (ws_diag_event_encode(frame + WS_PROTOCOL_HEADER_SIZE,
                                  WS_PAYLOAD_DIAG_SIZE,
                                  WS_DIAG_EVENT_CM33_NS_BOOT_READY,
                                  1u) == WS_STATUS_READY))
        {
            ws_ipc_shared.diagnostic_boot_send_status =
                (uint32_t)ws_ipc_transport_send(&ws_ipc_shared, frame, sizeof(frame));
        }
    }

    /* Enable CM55. */
    /* CM55_APP_BOOT_ADDR must be updated if CM55 memory layout is changed.*/
    Cy_SysEnableCM55(MXCM55, CM55_APP_BOOT_ADDR, CM55_BOOT_WAIT_TIME_USEC);

    /* Complete a bounded reverse-path handshake before entering deep sleep. */
    if (ipc_status == WS_STATUS_READY)
    {
        for (uint32_t attempt = 0u; attempt < 5000u; ++attempt)
        {
            uint8_t received[WS_IPC_QUEUE_FRAME_SIZE];
            size_t received_size = 0u;

            if (ws_ipc_transport_receive(&ws_ipc_shared, received,
                                         sizeof(received), &received_size) == WS_STATUS_READY)
            {
                ws_envelope_t received_header;
                uint16_t event_id = 0u;
                uint32_t counter = 0u;

                if ((ws_envelope_decode(&received_header, received, received_size) == WS_STATUS_READY) &&
                    (received_header.message_type == WS_IPC_DIAGNOSTIC_EVENT) &&
                    (ws_diag_event_decode(&event_id, &counter,
                                          received + WS_PROTOCOL_HEADER_SIZE,
                                          received_header.payload_length) == WS_STATUS_READY) &&
                    (event_id == WS_DIAG_EVENT_CM55_BOOT_ACK))
                {
                    uint8_t confirmation[WS_PROTOCOL_HEADER_SIZE + WS_PAYLOAD_DIAG_SIZE];
                    const ws_envelope_t confirmation_header = {
                        .version = WS_PROTOCOL_VERSION,
                        .message_type = WS_IPC_DIAGNOSTIC_EVENT,
                        .payload_length = WS_PAYLOAD_DIAG_SIZE,
                        .flags = 0u,
                        .sequence = 2u,
                        .timestamp_us = 0u,
                    };

                    if ((ws_envelope_encode(confirmation, sizeof(confirmation),
                                            &confirmation_header) == WS_STATUS_READY) &&
                        (ws_diag_event_encode(confirmation + WS_PROTOCOL_HEADER_SIZE,
                                              WS_PAYLOAD_DIAG_SIZE,
                                              WS_DIAG_EVENT_CM33_NS_ACK,
                                              1u) == WS_STATUS_READY))
                    {
                        (void)ws_ipc_transport_send(&ws_ipc_shared, confirmation,
                                                    sizeof(confirmation));
                    }
                    break;
                }
            }
            Cy_SysLib_Delay(1u);
        }
    }

    /* Put the CPU to Deep Sleep */
    for (;;)
    {
        Cy_SysPm_CpuEnterDeepSleep(CY_SYSPM_WAIT_FOR_INTERRUPT);
    }


}

/* [] END OF FILE */
