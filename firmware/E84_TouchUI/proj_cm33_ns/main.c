/*******************************************************************************
* File Name        : main.c
*
* Description      : This source file contains the main routine for non-secure
*                    application running on CM33 CPU.
*
* Related Document : See README.md
*
********************************************************************************
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
#include "GeneratedSource/cycfg_bt_settings.h"
#include "FreeRTOS.h"
#include "task.h"
#include "wiced_bt_ble.h"
#include "wiced_bt_stack.h"

#include <stdio.h>


/*******************************************************************************
* Macros
*******************************************************************************/
/* The timeout value in microseconds used to wait for CM55 core to be booted */
#define CM55_BOOT_WAIT_TIME_USEC    (10U)

/* App boot address for CM55 project */
#define CM55_APP_BOOT_ADDR          (CYMEM_CM33_0_m55_nvm_START + \
                                        CYBSP_MCUBOOT_HEADER_SIZE)

#define BLE_TASK_STACK_SIZE         (configMINIMAL_STACK_SIZE * 4U)
#define BLE_TASK_PRIORITY           (tskIDLE_PRIORITY + 2U)

static const uint8_t s_ble_name[] = "EaseAI E84";

static wiced_result_t ble_management_callback(
    wiced_bt_management_evt_t event,
    wiced_bt_management_evt_data_t *event_data)
{
    if (BTM_ENABLED_EVT == event)
    {
        if (WICED_BT_SUCCESS != event_data->enabled.status)
        {
            printf("[BLE] stack enable failed: 0x%02x\r\n",
                   event_data->enabled.status);
            return event_data->enabled.status;
        }

        uint8_t flags = BTM_BLE_GENERAL_DISCOVERABLE_FLAG |
                        BTM_BLE_BREDR_NOT_SUPPORTED;
        wiced_bt_ble_advert_elem_t elements[2] = {
            {
                .advert_type = BTM_BLE_ADVERT_TYPE_FLAG,
                .len = sizeof(flags),
                .p_data = &flags,
            },
            {
                .advert_type = BTM_BLE_ADVERT_TYPE_NAME_COMPLETE,
                .len = sizeof(s_ble_name) - 1U,
                .p_data = (uint8_t *)s_ble_name,
            },
        };
        wiced_result_t result =
            wiced_bt_ble_set_raw_advertisement_data(2U, elements);
        if (WICED_SUCCESS == result)
        {
            result = wiced_bt_start_advertisements(
                BTM_BLE_ADVERT_UNDIRECTED_HIGH, BLE_ADDR_PUBLIC, NULL);
        }
        printf("[BLE] advertising '%s': 0x%02x\r\n", s_ble_name, result);
        return result;
    }

    if ((BTM_BLE_ADVERT_STATE_CHANGED_EVT == event) &&
        (BTM_BLE_ADVERT_OFF == event_data->ble_advert_state_changed))
    {
        (void)wiced_bt_start_advertisements(
            BTM_BLE_ADVERT_UNDIRECTED_HIGH, BLE_ADDR_PUBLIC, NULL);
    }
    return WICED_SUCCESS;
}

static void ble_task(void *arg)
{
    (void)arg;
    const wiced_result_t result =
        wiced_bt_stack_init(ble_management_callback, &cy_bt_cfg_settings);
    printf("[BLE] stack init: 0x%02x\r\n", result);
    for (;;)
    {
        vTaskDelay(pdMS_TO_TICKS(10000U));
    }
}


/*******************************************************************************
* Function Name: main
********************************************************************************
* Summary:
* This is the main function of the CM33 non-secure application.
*
* It initializes the device and board peripherals. Post that the
* CM55 core is enabled and then the programs enters to deepsleep.
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
    cy_rslt_t result = CY_RSLT_SUCCESS;

    /* Initialize the device and board peripherals */
    result = cybsp_init();

    /* Board initialization failed. Stop program execution */
    if (CY_RSLT_SUCCESS != result)
    {
        /* Disable all interrupts. */
        __disable_irq();

        CY_ASSERT(0);

        /* Infinite loop */
        while(true);
    }

    /* Enable CM55. */
    /* CM55_APP_BOOT_ADDR must be updated if CM55 memory layout is changed.*/
    Cy_SysEnableCM55(MXCM55, CM55_APP_BOOT_ADDR, CM55_BOOT_WAIT_TIME_USEC);

    /* Enable global interrupts */
    __enable_irq();

    if (pdPASS != xTaskCreate(ble_task, "ble_adv", BLE_TASK_STACK_SIZE,
                              NULL, BLE_TASK_PRIORITY, NULL))
    {
        CY_ASSERT(0);
    }
    vTaskStartScheduler();

    CY_ASSERT(0);
    for (;;)
    {
    }
}


/* [] END OF FILE */
