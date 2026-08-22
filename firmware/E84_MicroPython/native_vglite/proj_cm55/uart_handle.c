/*******************************************************************************
* File Name        : uart_handle.c
*
* Description      : This file contains and UART CLI command handling for user
*                    interaction
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


#include "vglite_demos.h"
#include "retarget_io_init.h"

/*******************************************************************************
* Macros
*******************************************************************************/

/* Macros for UART input handling */
#define UART_KEY_CANCEL        (0x03)   /* Ctrl+C */
#define UART_KEY_ENTER_CR      (0x0D)   /* Carriage Return */
#define UART_KEY_ENTER_LF      (0x0A)   /* Line Feed */
#define UART_KEY_MIN           ('1')    /* Lowest valid app number */
#define UART_KEY_MAX           ('5')    /* Highest valid app number */

/*******************************************************************************
* Extern Variables 
*******************************************************************************/
extern QueueHandle_t event_queque;
extern bool cancel_requested;

/*******************************************************************************
 *  Function Name: benchmarking_case
 * *****************************************************************************
 * Summary:
 *  -This function handles the benchmarking cases based on user input.
 *  -It takes a case number as input and executes the corresponding demo.
 * 
 * Parameters:
 *  case_number: The number of the case to execute.
 * 
 * Return:
 *  None
 * ****************************************************************************/
void benchmarking_case(int case_number)
{
    event_t event;
    event.b_event = EVENT_DEFAULT;

    switch (case_number)
    {
    case 0:
        printf("Fill rules: two vector path shapes using different fill rules\n\r\r\n");
        printf("LEFT SIDE : VG_LITE_FILL_EVEN_ODD   &  RIGHT SIDE : VG_LITE_FILL_NON_ZERO\n\r\r\n");
        event.b_event = EVENT_FILL_RULES;
        break;
    case 1:
        printf("Alpha behavior: Alpha blending between two vector path shapes using different blend modes\n\r\r\n");
        printf("LEFT SIDE : VG_LITE_BLEND_SRC_OVER   &  RIGHT SIDE : VG_LITE_BLEND_MULTIPLY\n\r\r\n");
        event.b_event = EVENT_ALPHA_BEHAVIOR;
        break;
    case 2:
        printf("Blit color: Blit in rectangle Infineon logo\n\r\r\n");
        event.b_event = EVENT_BLIT_COLOR;
        break;
    case 3:
        printf("Pattern fill: Pattern fill demonstration\n\r\r\n");
        event.b_event = EVENT_PATTERN_FILL;
        break;
    case 4:
        printf("UI/filter: Demonstrate VG_LITE_FILTER_LINEAR\n\r\r\n");
        event.b_event = EVENT_UI_FILTER;
        break;
    default:
        printf("Invalid case\n\r");
        break;
    }

    if (event.b_event != EVENT_DEFAULT)
    {
        xQueueSend(event_queque, &event, 0);
    }
    return;
}


/*******************************************************************************
* Function Name: uart_cli_handler
********************************************************************************
* Summary:
*  -Handles UART CLI commands for the OOB application.
*  -This function displays a menu for the user to select a demo topic,       
*   processes the user's choice, and invokes the corresponding demo function.
*  -It also handles cancellation requests (Ctrl+C) to return to the menu.
*  -This function runs in an infinite loop, waiting for user input.
*
* Parameters:   
*  pvParameters: Pointer to parameters passed to the task (unused).
*
* Returns:
*  None 
*******************************************************************************/
void uart_cli_handler(void *pv_parameters)
{
    (void)pv_parameters; /* Unused parameter */
    uint8_t uart_read_choice = 0;

    while (1) 
    {   
        /* ANSI ESC sequence for clear screen */
        printf("\x1b[2J\x1b[;H");
        printf("****************** "
                    "PSOC Edge MCU: Graphics using VGLite API"
                    " ****************** \r\n\n");
        printf("Choose one of the list of options below by entering a number between 1 - 5: \r\n");
        printf("1. Fill Rules (Vector Paths) \n\r");
        printf("2. Alpha Blending (Vector Paths) \n\r");
        printf("3. Blit Color Rendering \n\r");
        printf("4. Pattern Fill \n\r");
        printf("5. UI/Filter Demo \n\r");
        printf("\nTo return to main menu, press Ctrl+C\n\r\r\n");
        bool waiting_for_enter = false;

        while (1) 
        {

            if ( Cy_SCB_UART_GetNumInRxFifo(CYBSP_DEBUG_UART_HW) ) 
            {
                uart_read_choice = (uint8_t) Cy_SCB_UART_Get(CYBSP_DEBUG_UART_HW);

                if (uart_read_choice == UART_KEY_CANCEL) 
                {
                    printf("Operation cancelled. Returning to menu.\r\n");
                    cancel_requested = true;
                    waiting_for_enter = false; /* reset state */
                    break;
                }
                else if (uart_read_choice == UART_KEY_ENTER_CR || uart_read_choice == UART_KEY_ENTER_LF) 
                {
                    cancel_requested = true;
                    waiting_for_enter = false;  /* allow new number input after Enter */
                    break;
                }
                else if (!waiting_for_enter && uart_read_choice >= UART_KEY_MIN && uart_read_choice <= UART_KEY_MAX) 
                {
                    uint8_t app_number = uart_read_choice - UART_KEY_MIN;
                    cancel_requested = false;
                    waiting_for_enter = true;  /* block further number input until Enter is pressed */

                    /* ANSI ESC sequence for clear screen */
                    printf("\x1b[2J\x1b[;H");

                    benchmarking_case(app_number);
                }
                else if (!waiting_for_enter) 
                {
                    printf("Invalid choice. Please try again.\r\n");
                }
            }
            vTaskDelay(pdMS_TO_TICKS(1));
        }
    }
}

/* [] END OF FILE */