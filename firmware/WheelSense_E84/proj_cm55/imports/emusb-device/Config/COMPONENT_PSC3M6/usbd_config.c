/*********************************************************************
*                   (c) SEGGER Microcontroller GmbH                  *
*                        The Embedded Experts                        *
**********************************************************************
*                                                                    *
*       (c) 2003 - 2025     SEGGER Microcontroller GmbH              *
*                                                                    *
*       www.segger.com     Support: www.segger.com/ticket            *
*                                                                    *
**********************************************************************
*                                                                    *
*       emUSB-Device * USB Device stack for embedded applications    *
*                                                                    *
*       Please note: Knowledge of this file may under no             *
*       circumstances be used to write a similar product.            *
*       Thank you for your fairness !                                *
*                                                                    *
**********************************************************************
*                                                                    *
*       emUSB-Device version: V3.70.0                                *
*                                                                    *
**********************************************************************
----------------------------------------------------------------------
All Intellectual Property rights in the software belongs to SEGGER.
emUSB Device is protected by international copyright laws. This file
may only be used in accordance with the following terms:

The source code of the emUSB Device software has been licensed to Cypress
Semiconductor Corporation, whose registered office is 198 Champion
Court, San Jose, CA 95134, USA including the
right to create and distribute the object code version of
the emUSB Device software for its Cortex M0, M0+, M4, M33 and M55 based devices.
The object code version can be used by Cypress customers under the
terms and conditions of the associated End User License Agreement.
Support for the object code version is provided by Cypress,
full source code is available at: www.segger.com

We appreciate your understanding and fairness.
----------------------------------------------------------------------
Licensing information
Licensor:                 SEGGER Microcontroller Systems LLC
Licensed to:              Cypress Semiconductor Corp, 198 Champion Ct., San Jose, CA 95134, USA
Licensed SEGGER software: emUSB-Device
License number:           USBD-00500
License model:            Cypress Services and License Agreement, signed November 17th/18th, 2010
                          and Amendment Number One, signed December 28th, 2020 and February 10th, 2021
                          and Amendment Number Three, signed May 2nd, 2022 and May 5th, 2022 and Amendment Number Four, signed August 28th, 2023
Licensed platform:        Cypress devices containing ARM Cortex M cores: M0, M0+, M4, M33 and M55
----------------------------------------------------------------------
Support and Update Agreement (SUA)
SUA period:               2022-05-12 - 2025-05-19
Contact to extend SUA:    sales@segger.com
----------------------------------------------------------------------
File        : usbd_config.c
Purpose     : emUSB-Device configuration file for CAT1A device
--------  END-OF-HEADER  ---------------------------------------------
*/
#include "USB.h"
#include "USB_HW_Infineon_psc3m6.h"
#include "cybsp.h"
#if defined (USBD_USE_PDL) && (USBD_USE_PDL == 1U)
#include "cy_pdl.h"
#else
#include "mtb_hal.h"
#endif /* #if defined (USBD_USE_PDL) && (USBD_USE_PDL == 1U) */

/* Define interrupt priority */
#define USBD_ISR_PRIO                           (3U)

/*  Use the driver with DMA support. Can be defined in Makefile */
#if !defined (USBD_ENABLE_DMA)
#define USBD_ENABLE_DMA                         (false)
#endif /* #if !defined (USBD_ENABLE_DMA) */

#if !defined (USBD_NORTOS_TICKCNT_ENABLE)
#if defined (COMPONENT_RTOS_AWARE)
#define USBD_NORTOS_TICKCNT_ENABLE              (0U)
#else
#define USBD_NORTOS_TICKCNT_ENABLE              (1U)
#endif /* #if defined (COMPONENT_RTOS_AWARE) */
#endif /* #if !defined USBD_NORTOS_TICKCNT_ENABLE */

#if (USBD_NORTOS_TICKCNT_ENABLE == 1U)
#include "mtb_hal_timer.h"
#endif /* #if (USBD_NORTOS_TICKCNT_ENABLE == 1U) */

#define USBD_INTERRUPT_NUM                      (usb_0_interrupt_med_IRQn)

#if USBD_ENABLE_DMA == true

/* Define the size of memory dedicated for drivers with DMA in
 * bytes. The memory is used for endpoints buffers and
 * transfer descriptors. Update this value with the optimal
 * memory pool size (strongly recommended) for the application.
 * For details on selecting the optimal memory pool size, refer
 * to the USBD_AssignMemory() description in emUSB-Device User
 * Guide & Reference Manual.
 */
#define USBD_MEMORY_POOL_SIZE                   (2048U)
#endif /* #if USBD_ENABLE_DMA == true */

#if (USBD_NORTOS_TICKCNT_ENABLE == 1U)
#define TIMER_IRQ_PRIORITY  (3U)

static mtb_hal_timer_t timer_obj;
static volatile uint32_t timer_tick_count; /* The value in milliseconds */

void isr_timer(void* arg, mtb_hal_timer_event_t event);
void timer_irq(void);
#endif /* #if (USBD_NORTOS_TICKCNT_ENABLE == 1U) */

/*********************************************************************
*
*       enable_isr
*  Function description
*    Configure and enable interrupts.
*/
static void enable_isr(USB_ISR_HANDLER * pfISRHandler)
{
    cy_stc_sysint_t usb_int_cfg =
    {
        .intrSrc = USBD_INTERRUPT_NUM,
        .intrPriority = USBD_ISR_PRIO
    };

    cy_en_sysint_status_t status;

    /* Install the interrupt service routine */
    status = Cy_SysInt_Init(&usb_int_cfg, pfISRHandler);
    CY_ASSERT(CY_RSLT_SUCCESS == status);
    (void) status; /* To avoid the compiler warning in Release mode */
    NVIC_EnableIRQ(USBD_INTERRUPT_NUM);
}

#if USBD_ENABLE_DMA == true
/*********************************************************************
*
*       trig_mux_sw_trigger
*
*  Function description
*    Triggers the burst end on an endpoint.
*
*  Parameters
*    Endpoint      -  Endpoint number 0..7
*
*/
static void trig_mux_sw_trigger(unsigned Endpoint)
{
    uint32_t out_trig_mux = 0U;
    switch(Endpoint)
    {
#if defined (USBD_DMA_OUT_TRIG_MUX_EP0)
        case 0U:
            out_trig_mux = USBD_DMA_OUT_TRIG_MUX_EP0;
            break;
#endif /* #if defined (USBD_DMA_OUT_TRIG_MUX_EP0) */
#if defined (USBD_DMA_OUT_TRIG_MUX_EP1)
        case 1U:
            out_trig_mux = USBD_DMA_OUT_TRIG_MUX_EP1;
            break;
#endif /* #if defined (USBD_DMA_OUT_TRIG_MUX_EP1) */
#if defined (USBD_DMA_OUT_TRIG_MUX_EP2)
        case 2U:
            out_trig_mux = USBD_DMA_OUT_TRIG_MUX_EP2;
            break;
#endif /* #if defined (USBD_DMA_OUT_TRIG_MUX_EP2) */
#if defined (USBD_DMA_OUT_TRIG_MUX_EP3)
        case 3U:
            out_trig_mux = USBD_DMA_OUT_TRIG_MUX_EP3;
            break;
#endif /* #if defined (USBD_DMA_OUT_TRIG_MUX_EP3) */
#if defined (USBD_DMA_OUT_TRIG_MUX_EP4)
        case 4U:
            out_trig_mux = USBD_DMA_OUT_TRIG_MUX_EP4;
            break;
#endif /* #if defined (USBD_DMA_OUT_TRIG_MUX_EP4) */
#if defined (USBD_DMA_OUT_TRIG_MUX_EP5)
        case 5U:
            out_trig_mux = USBD_DMA_OUT_TRIG_MUX_EP5;
            break;
#endif /* #if defined (USBD_DMA_OUT_TRIG_MUX_EP5) */
#if defined (USBD_DMA_OUT_TRIG_MUX_EP6)
        case 6U:
            out_trig_mux = USBD_DMA_OUT_TRIG_MUX_EP6;
            break;
#endif /* #if defined (USBD_DMA_OUT_TRIG_MUX_EP6) */
#if defined (USBD_DMA_OUT_TRIG_MUX_EP7)
        case 7U:
            out_trig_mux = USBD_DMA_OUT_TRIG_MUX_EP7;
            break;
#endif /* #if defined (USBD_DMA_OUT_TRIG_MUX_EP7) */
        default:
            /* Never go to this */
            USB_OS_Panic("Incorrect SW trigger signal for DMA channel");
            break;
    }
    (void)Cy_TrigMux_SwTrigger(out_trig_mux, CY_TRIGGER_TWO_CYCLES);
}

/* DMA configuration */
static const USB_Infineon_PSC3M6_DMA_CONFIG dma_config =
{
    trig_mux_sw_trigger,
    {
#if defined (USBD_DMA_CHANNEL_ADDRESS_EP0) && defined (USBD_DMA_CHANNEL_PRIORITY_EP0)
        { USBD_DMA_CHANNEL_ADDRESS_EP0, USBD_DMA_CHANNEL_PRIORITY_EP0 },
#endif /* #if defined (USBD_DMA_CHANNEL_ADDRESS_EP0) && defined (USBD_DMA_CHANNEL_PRIORITY_EP0) */
#if defined (USBD_DMA_CHANNEL_ADDRESS_EP1) && defined (USBD_DMA_CHANNEL_PRIORITY_EP1)
        { USBD_DMA_CHANNEL_ADDRESS_EP1, USBD_DMA_CHANNEL_PRIORITY_EP1 },
#endif /* #if defined (USBD_DMA_CHANNEL_ADDRESS_EP1) && defined (USBD_DMA_CHANNEL_PRIORITY_EP1) */
#if defined (USBD_DMA_CHANNEL_ADDRESS_EP2) && defined (USBD_DMA_CHANNEL_PRIORITY_EP2)
        { USBD_DMA_CHANNEL_ADDRESS_EP2, USBD_DMA_CHANNEL_PRIORITY_EP2 },
#endif /* #if defined (USBD_DMA_CHANNEL_ADDRESS_EP2) && defined (USBD_DMA_CHANNEL_PRIORITY_EP2) */
#if defined (USBD_DMA_CHANNEL_ADDRESS_EP3) && defined (USBD_DMA_CHANNEL_PRIORITY_EP3)
        { USBD_DMA_CHANNEL_ADDRESS_EP3, USBD_DMA_CHANNEL_PRIORITY_EP3 },
#endif /* #if defined (USBD_DMA_CHANNEL_ADDRESS_EP3) && defined (USBD_DMA_CHANNEL_PRIORITY_EP3) */
#if defined (USBD_DMA_CHANNEL_ADDRESS_EP4) && defined (USBD_DMA_CHANNEL_PRIORITY_EP4)
        { USBD_DMA_CHANNEL_ADDRESS_EP4, USBD_DMA_CHANNEL_PRIORITY_EP4 },
#endif /* #if defined (USBD_DMA_CHANNEL_ADDRESS_EP4) && defined (USBD_DMA_CHANNEL_PRIORITY_EP4) */
#if defined (USBD_DMA_CHANNEL_ADDRESS_EP5) && defined (USBD_DMA_CHANNEL_PRIORITY_EP5)
        { USBD_DMA_CHANNEL_ADDRESS_EP5, USBD_DMA_CHANNEL_PRIORITY_EP5 },
#endif /* #if defined (USBD_DMA_CHANNEL_ADDRESS_EP5) && defined (USBD_DMA_CHANNEL_PRIORITY_EP5) */
#if defined (USBD_DMA_CHANNEL_ADDRESS_EP6) && defined (USBD_DMA_CHANNEL_PRIORITY_EP6)
        { USBD_DMA_CHANNEL_ADDRESS_EP6, USBD_DMA_CHANNEL_PRIORITY_EP6 },
#endif /* #if defined (USBD_DMA_CHANNEL_ADDRESS_EP6) && defined (USBD_DMA_CHANNEL_PRIORITY_EP6) */
#if defined (USBD_DMA_CHANNEL_ADDRESS_EP7) && defined (USBD_DMA_CHANNEL_PRIORITY_EP7)
        { USBD_DMA_CHANNEL_ADDRESS_EP7, USBD_DMA_CHANNEL_PRIORITY_EP7 },
#endif /* #if defined (USBD_DMA_CHANNEL_ADDRESS_EP7) && defined (USBD_DMA_CHANNEL_PRIORITY_EP7) */
    }
};

static U32 ep_mem_pool_dma[USBD_MEMORY_POOL_SIZE / 4U];

#endif /* #if USBD_ENABLE_DMA == true */

/*********************************************************************
*
*       USBD_X_Config
*
*  Function description
*    Configure the USB stack. This function is always called from
*    USBD_Init().
*
*/
void USBD_X_Config(void)
{
    USB_DRIVER_Infineon_PSC3M6_SetBaseAddr(USBFS0_BASE);
#if USBD_ENABLE_DMA == true
    /* Enable the DMA IP block */
    Cy_DMA_Enable(DW0);

    /* Add and configure DMA driver */
    USBD_AddDriver(&USB_Driver_Infineon_PSC3M6_DMA);
    USBD_AssignMemory(ep_mem_pool_dma, sizeof(ep_mem_pool_dma));
    USB_DRIVER_Infineon_PSC3M6_ConfigDMA(&USB_DRIVER_Infineon_PSC3M6_DWx, &dma_config);
#else
    /* Add USB Driver */
    USBD_AddDriver(&USB_Driver_Infineon_PSC3M6);
#endif /* #if USBD_ENABLE_DMA == true */
    /* Configure interrupt */
    USBD_SetISREnableFunc(enable_isr);
}

/*********************************************************************
*
*       USBD_X_EnableInterrupt
*
*  Function description
*    This function is called by the stack to enable USB interrupt(s)
*    after they have been disabled by USBD_X_DisableInterrupt().
*
*/
void USBD_X_EnableInterrupt(void)
{
    NVIC_EnableIRQ(USBD_INTERRUPT_NUM);
}

/*********************************************************************
*
*       USBD_X_DisableInterrupt
*
*  Function description
*    This function is called by the stack in cases where the stack
*    must perform a critical operation which can not be interrupted
*    by a new incoming USB interrupt event.
*
*/
void USBD_X_DisableInterrupt(void)
{
    NVIC_DisableIRQ(USBD_INTERRUPT_NUM);
}

#if (USBD_NORTOS_TICKCNT_ENABLE == 1U)
/*********************************************************************
*
*        usbd_timer_config
*
*  Function description
*    Configure the timer to generate an interrupt every 1 ms.
*    Called in usbd_os_abs_rtos.c file.
*/

void usbd_timer_config()
{
    cy_rslt_t rslt = CY_RSLT_SUCCESS;
    cy_en_tcpwm_status_t res;

    /* Use the device-configurator output for the alias "timer" */
    res = Cy_TCPWM_Counter_Init(emUSB_OS_Timer_HW, emUSB_OS_Timer_NUM, &emUSB_OS_Timer_config);
    if (res == CY_TCPWM_SUCCESS)
    {
        rslt = mtb_hal_timer_setup(&timer_obj, &emUSB_OS_Timer_hal_config, NULL);
        if (rslt == CY_RSLT_SUCCESS)
        {
            Cy_TCPWM_Counter_Enable(emUSB_OS_Timer_HW, emUSB_OS_Timer_NUM);
        }

        /* Enable System IRQ */
        if (rslt == CY_RSLT_SUCCESS)
        {
            uint32_t saved_intr_status = mtb_hal_system_critical_section_enter();

            /* Enable IRQ */
            cy_stc_sysint_t intr_cfg;
            intr_cfg.intrSrc = (IRQn_Type)emUSB_OS_Timer_IRQ;
            intr_cfg.intrPriority = TIMER_IRQ_PRIORITY;

            /* Register system callback */
            Cy_SysInt_Init(&intr_cfg, timer_irq);
            NVIC_EnableIRQ((IRQn_Type)emUSB_OS_Timer_IRQ);

            mtb_hal_system_critical_section_exit(saved_intr_status);
        }

        /* Register the Callback and enable the events */
        if (CY_RSLT_SUCCESS == rslt)
        {
            /* Assign the ISR to execute on timer interrupt */
            mtb_hal_timer_register_callback(&timer_obj, isr_timer, NULL);

            /* Set the event on which timer interrupt occurs and enable it */
            mtb_hal_timer_enable_event(&timer_obj, MTB_HAL_TIMER_EVENT_TERMINAL_COUNT, true);
        }

        /* Start the timer */
        if (rslt == CY_RSLT_SUCCESS)
        {
            rslt = mtb_hal_timer_start(&timer_obj);
        }

        CY_ASSERT(rslt == CY_RSLT_SUCCESS);
    }
}

/*********************************************************************
*
*        usbd_timer_config_deinit
*
*  Function description
*    Deinitialization the timer.
*    Called in usbd_os_abs_rtos.c file.
*/
void usbd_timer_config_deinit(void)
{
    cy_rslt_t rslt = mtb_hal_timer_stop(&timer_obj);
    CY_ASSERT(rslt == CY_RSLT_SUCCESS);

    if (CY_RSLT_SUCCESS == rslt)
    {
        rslt = mtb_hal_timer_reset(&timer_obj, 0);
        CY_ASSERT(rslt == CY_RSLT_SUCCESS);

        memset((void*)&timer_obj, 0, sizeof(mtb_hal_timer_t));

        Cy_TCPWM_Counter_Disable(emUSB_OS_Timer_HW, emUSB_OS_Timer_NUM);
        Cy_TCPWM_Counter_DeInit(emUSB_OS_Timer_HW, emUSB_OS_Timer_NUM, &emUSB_OS_Timer_config);

        NVIC_DisableIRQ((IRQn_Type)emUSB_OS_Timer_IRQ);
        timer_tick_count = 0;
    }
}

/*********************************************************************
*
*        isr_timer
*
*  Function description
*     Callback function for HAL driver. Increments value every ms.
*/
void isr_timer(void* arg, mtb_hal_timer_event_t event)
{
    (void)arg;
    (void)event;

    timer_tick_count++;
    USB_DRIVER_Infineon_PSC3M6_SysTick();
}

/*********************************************************************
*
*        timer_irq
*
*  Function description
*    System Timer interrupt.
*/
void timer_irq(void)
{
    mtb_hal_timer_process_interrupt(&timer_obj);
}

/*********************************************************************
*
*        USB_OS_GetTickCnt
*
*  Function description
*    Get ms from the start of timer which increments in interrupt each ms.
*/
U32 USB_OS_GetTickCnt(void)
{
    return (U32) timer_tick_count;;
}
#endif /* #if (USBD_NORTOS_TICKCNT_ENABLE == 1U) */
