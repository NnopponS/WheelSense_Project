/*******************************************************************************
* File Name        : main.c
*
* Description      : This source file contains the main routine for CM55 CPU
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
#include "retarget_io_init.h"
#include "vg_lite_platform.h"
#include "cybsp.h"
#include "cy_time.h"
#include "cycfg_peripherals.h"
#include "vglite_demos.h"
#include "task.h"
#include "cyabs_rtos.h"
#include "cyabs_rtos_impl.h"
#include "mtb_disp_dsi_waveshare_4p3.h"
#include "cycfg_qspi_memslot.h"
#include "mtb_serial_memory.h"

/*******************************************************************************
* Macros
*******************************************************************************/
#define GFX_TASK_NAME                       ("CM55 Gfx Task")
#define GFX_TASK_STACK_SIZE                 (configMINIMAL_STACK_SIZE)
#define GFX_TASK_PRIORITY                   (configMAX_PRIORITIES - 1)

#define DISPLAY_I2C_CONTROLLER_HW           CYBSP_I2C_DISPLAY_CONTROLLER_HW
#define DISPLAY_I2C_CONTROLLER_IRQ          CYBSP_I2C_DISPLAY_CONTROLLER_IRQ
#define DISPLAY_I2C_CONTROLLER_CONFIG       CYBSP_I2C_DISPLAY_CONTROLLER_config


#define UART_CLI_TASK_NAME                  ("UART CLI Task")
#define UART_CLI_TASK_STACK_SIZE            (configMINIMAL_STACK_SIZE * 2)
#define UART_CLI_TASK_PRIORITY              (configMAX_PRIORITIES - 1)

#define GFX_TASK_DELAY_MS                   (67U)
#define DC_INT_PRIORITY                     (3U)
#define GPU_INT_PRIORITY                    (3U)
#define I2C_CONTROLLER_IRQ_PRIORITY         (2UL)

#define COLOR_DEPTH                         (16U)
#define BITS_PER_PIXEL                      (8U)
#define APP_BUFFER_COUNT                    (3U)

#define DISP_H                              (480U)
#define DISP_W                              (832U)
#define DISP_W_ACTUAL                       (800U)

#define ALIGN_128                           (128U)
/* 64 KB */
#define DEFAULT_GPU_CMD_BUFFER_SIZE         ((64U) * (1024U))

#define GPU_TESSELLATION_BUFFER_SIZE        ((DISP_H) * 128U)

#define FRAME_BUFFER_SIZE                   ((DISP_W) * (DISP_H) * \
                                             ((COLOR_DEPTH) / (BITS_PER_PIXEL)))

#define VGLITE_HEAP_SIZE                    (((FRAME_BUFFER_SIZE) * \
                                              (APP_BUFFER_COUNT)) + \
                                              ((DEFAULT_GPU_CMD_BUFFER_SIZE) * \
                                               (APP_BUFFER_COUNT)) + \
                                              ((GPU_TESSELLATION_BUFFER_SIZE) * \
                                               (APP_BUFFER_COUNT)))

#define GPU_MEM_BASE                        (0x0U)
#define SMIF_INIT_TIMEOUT_US                (1000U)


#define TARGET_NUM_FRAMES                   (60U)


/* Rotation and scaling parameters */
#define DEF_X_SCALE                         (0.3f)
#define DEF_Y_SCALE                         (0.3f)
#define TRANSFORMATION_OFFSET               (2U)
#define VG_PARAMS_POS                       (0UL)

/* Enabling or disabling a MCWDT requires a wait time of upto 2 CLK_LF cycles
 * to come into effect. This wait time value will depend on the actual CLK_LF
 * frequency set by the BSP.
 */
#define LPTIMER_1_WAIT_TIME_USEC            (62U)

/* Define the LPTimer interrupt priority number. '1' implies highest priority.*/
#define APP_LPTIMER_INTERRUPT_PRIORITY      (1U)


/*******************************************************************************
* Global Variables
*******************************************************************************/
static mtb_hal_rtc_t rtc_obj;
static mtb_serial_memory_t serial_memory_obj;
static cy_stc_smif_mem_context_t smif_mem_context;
static cy_stc_smif_mem_info_t smif_mem_info;

GFXSS_Type* base = (GFXSS_Type*) GFXSS;

cy_stc_gfx_context_t gfx_context;
vg_lite_buffer_t buffer0;
vg_lite_buffer_t buffer1;
vg_lite_buffer_t intermediate_buffer;

vg_lite_buffer_t *render_target;
vg_lite_matrix_t matrix;

QueueHandle_t event_queque;

bool cancel_requested = false;
volatile bool fb_pending        = false;

/* Heap memory for VGLite to allocate memory for buffers, command, and
   tessellation buffers */
CY_SECTION(".cy_xip") __attribute__((used)) uint8_t contiguous_mem[VGLITE_HEAP_SIZE];

volatile void *vglite_heap_base = &contiguous_mem;

/* DC IRQ Config */
cy_stc_sysint_t dc_irq_cfg =
{
    .intrSrc = gfxss_interrupt_dc_IRQn,
    .intrPriority = DC_INT_PRIORITY
};

/* GPU IRQ Config */
cy_stc_sysint_t gpu_irq_cfg =
{
    .intrSrc = gfxss_interrupt_gpu_IRQn,
    .intrPriority = GPU_INT_PRIORITY
};

event_handler_t event_handlers[] = {
    [EVENT_FILL_RULES]      = fill_rules_draw,
    [EVENT_ALPHA_BEHAVIOR]  = alpha_behavior_draw,
    [EVENT_BLIT_COLOR]      = blit_color_draw,
    [EVENT_PATTERN_FILL]    = pattern_fill_draw,
    [EVENT_UI_FILTER]       = filter_draw,
    /* Add more handlers as needed */
};

cy_stc_scb_i2c_context_t disp_i2c_controller_context;

cy_stc_sysint_t disp_i2c_controller_irq_cfg =
{
    .intrSrc      = DISPLAY_I2C_CONTROLLER_IRQ,
    .intrPriority = I2C_CONTROLLER_IRQ_PRIORITY,
};

/* LPTimer HAL object */
static mtb_hal_lptimer_t lptimer_obj;


/*******************************************************************************
* Extern Functions 
*******************************************************************************/
extern void uart_cli_handler(void *pvParameters);


/*******************************************************************************
* Functions
*******************************************************************************/

static void init_psram(void)
{
    Cy_SMIF_Disable(CYBSP_SMIF_CORE_1_PSRAM_HW);
    if (CY_SMIF_SUCCESS != Cy_SMIF_Init(CYBSP_SMIF_CORE_1_PSRAM_hal_config.base,
                                        CYBSP_SMIF_CORE_1_PSRAM_hal_config.config,
                                        SMIF_INIT_TIMEOUT_US,
                                        &smif_mem_context.smif_context))
    {
        handle_app_error();
    }

    Cy_SMIF_SetDataSelect(CYBSP_SMIF_CORE_1_PSRAM_hal_config.base,
                          smif1BlockConfig.memConfig[0]->slaveSelect,
                          smif1BlockConfig.memConfig[0]->dataSelect);
    Cy_SMIF_Enable(CYBSP_SMIF_CORE_1_PSRAM_hal_config.base,
                   &smif_mem_context.smif_context);

    cy_rslt_t result = mtb_serial_memory_setup(&serial_memory_obj,
                                                MTB_SERIAL_MEMORY_CHIP_SELECT_2,
                                                CYBSP_SMIF_CORE_1_PSRAM_hal_config.base,
                                                CYBSP_SMIF_CORE_1_PSRAM_hal_config.clock,
                                                &smif_mem_context,
                                                &smif_mem_info,
                                                &smif1BlockConfig);
    if (CY_RSLT_SUCCESS == result)
    {
        result = mtb_serial_memory_enable_xip(&serial_memory_obj, true);
    }
    if (CY_RSLT_SUCCESS == result)
    {
        result = mtb_serial_memory_set_write_enable(&serial_memory_obj, true);
    }
    if (CY_RSLT_SUCCESS != result)
    {
        handle_app_error();
    }
}

#if ( configGENERATE_RUN_TIME_STATS == 1 )
/*******************************************************************************
* Function Name: setup_run_time_stats_timer
********************************************************************************
* Summary:
*  This function configuresTCPWM 0 GRP 0 Counter 0 as the timer source for
*  FreeRTOS runtime statistics.
*
* Parameters:
*  void
*
* Return:
*  void
*
*******************************************************************************/
void setup_run_time_stats_timer(void)
{
    /* Initialze TCPWM block with required timer configuration */
    if (CY_TCPWM_SUCCESS != Cy_TCPWM_Counter_Init(CYBSP_GENERAL_PURPOSE_TIMER_HW,
            CYBSP_GENERAL_PURPOSE_TIMER_NUM,
            &CYBSP_GENERAL_PURPOSE_TIMER_config))
    {
        handle_app_error();
    }

    /* Enable the initialized counter */
    Cy_TCPWM_Counter_Enable(CYBSP_GENERAL_PURPOSE_TIMER_HW,
            CYBSP_GENERAL_PURPOSE_TIMER_NUM);

    /* Start the counter */
    Cy_TCPWM_TriggerStart_Single(CYBSP_GENERAL_PURPOSE_TIMER_HW,
            CYBSP_GENERAL_PURPOSE_TIMER_NUM);
}


/*******************************************************************************
* Function Name: get_run_time_counter_value
********************************************************************************
* Summary:
*  Function to fetch run time counter value. This will be used by FreeRTOS for
*  run time statistics calculation.
*
* Parameters:
*  void
*
* Return:
*  uint32_t: TCPWM 0 GRP 0 Counter 0 value
*
*******************************************************************************/
uint32_t get_run_time_counter_value(void)
{
    return (Cy_TCPWM_Counter_GetCounter(CYBSP_GENERAL_PURPOSE_TIMER_HW,
            CYBSP_GENERAL_PURPOSE_TIMER_NUM));
}


/*******************************************************************************
* Function Name: calculate_idle_percentage
********************************************************************************
* Summary:
*  Function to calculate CPU idle percentage. This function is used by LVGL to
*  showcase CPU usage.
*
* Parameters:
*  void
*
* Return:
*  uint32_t: CPU idle percentage
*
*******************************************************************************/
uint32_t calculate_idle_percentage(void)
{
    static uint32_t previousIdleTime = 0;
    static TickType_t previousTick = 0;
    uint32_t time_diff = 0;
    uint32_t idle_percent = 0;

    uint32_t currentIdleTime = ulTaskGetIdleRunTimeCounter();
    TickType_t currentTick = portGET_RUN_TIME_COUNTER_VALUE();

    time_diff = currentTick - previousTick;
    if((currentIdleTime >= previousIdleTime) && (currentTick > previousTick))
    {
        idle_percent = ((currentIdleTime - previousIdleTime) * 100)/time_diff;
    }
    else if ((currentIdleTime >= previousIdleTime) && (currentTick < previousTick))
    {
        time_diff = 10000 - previousTick + currentTick;
        idle_percent = ((currentIdleTime - previousIdleTime) * 100)/time_diff;
      
    }
    previousIdleTime = ulTaskGetIdleRunTimeCounter();
    previousTick = portGET_RUN_TIME_COUNTER_VALUE();

    return idle_percent;
}
#endif /*( configGENERATE_RUN_TIME_STATS == 1 )*/

/*******************************************************************************
* Function Name: lptimer_interrupt_handler
********************************************************************************
* Summary:
* Interrupt handler function for LPTimer instance.
*
* Parameters:
*  void
*
* Return:
*  void
*
*******************************************************************************/
static void lptimer_interrupt_handler(void)
{
    mtb_hal_lptimer_process_interrupt(&lptimer_obj);
}


/*******************************************************************************
* Function Name: setup_tickless_idle_timer
********************************************************************************
* Summary:
* 1. This function first configures and initializes an interrupt for LPTimer.
* 2. Then it initializes the LPTimer HAL object to be used in the RTOS
*    tickless idle mode implementation to allow the device enter deep sleep
*    when idle task runs. LPTIMER_1 instance is configured for CM55 CPU.
* 3. It then passes the LPTimer object to abstraction RTOS library that
*    implements tickless idle mode
*
* Parameters:
*  void
*
* Return:
*  void
*
*******************************************************************************/
static void setup_tickless_idle_timer(void)
{
    /* Interrupt configuration structure for LPTimer */
    cy_stc_sysint_t lptimer_intr_cfg =
    {
        .intrSrc = CYBSP_CM55_LPTIMER_1_IRQ,
        .intrPriority = APP_LPTIMER_INTERRUPT_PRIORITY
    };

    /* Initialize the LPTimer interrupt and specify the interrupt handler. */
    cy_en_sysint_status_t interrupt_init_status =
                                    Cy_SysInt_Init(&lptimer_intr_cfg,
                                                    lptimer_interrupt_handler);

    /* LPTimer interrupt initialization failed. Stop program execution. */
    if (CY_SYSINT_SUCCESS != interrupt_init_status)
    {
        handle_app_error();
    }

    /* Enable NVIC interrupt. */
    NVIC_EnableIRQ(lptimer_intr_cfg.intrSrc);

    /* Initialize the MCWDT block */
    cy_en_mcwdt_status_t mcwdt_init_status =
                                    Cy_MCWDT_Init(CYBSP_CM55_LPTIMER_1_HW,
                                                &CYBSP_CM55_LPTIMER_1_config);

    /* MCWDT initialization failed. Stop program execution. */
    if (CY_MCWDT_SUCCESS != mcwdt_init_status)
    {
        handle_app_error();
    }

    /* Enable MCWDT instance */
    Cy_MCWDT_Enable(CYBSP_CM55_LPTIMER_1_HW,
                    CY_MCWDT_CTR_Msk,
                    LPTIMER_1_WAIT_TIME_USEC);

    /* Setup LPTimer using the HAL object and desired configuration as defined
     * in the device configurator. */
    cy_rslt_t result = mtb_hal_lptimer_setup(&lptimer_obj,
                                            &CYBSP_CM55_LPTIMER_1_hal_config);

    /* LPTimer setup failed. Stop program execution. */
    if (CY_RSLT_SUCCESS != result)
    {
        handle_app_error();
    }

    /* Pass the LPTimer object to abstraction RTOS library that implements
     * tickless idle mode
     */
    cyabs_rtos_set_lptimer(&lptimer_obj);
}


/*******************************************************************************
* Function Name: dc_irq_handler
********************************************************************************
* Summary:
*  Display Controller interrupt handler which gets invoked when the DC finishes
*  utilizing the current frame buffer.
*
* Parameters:
*  void
*
* Return:
*  void
*
*******************************************************************************/
static void dc_irq_handler(void)
{
    fb_pending = false;
    Cy_GFXSS_Clear_DC_Interrupt(base, &gfx_context);
}


/*******************************************************************************
* Function Name: gpu_irq_handler
********************************************************************************
* Summary:
*  GPU interrupt handler which gets invoked when the GPU finishes composing
*  a frame.
*
* Parameters:
*  void
*
* Return:
*  void
*
*******************************************************************************/
static void gpu_irq_handler(void)
{
    Cy_GFXSS_Clear_GPU_Interrupt(GFXSS, &gfx_context);
    vg_lite_IRQHandler();
}

/*******************************************************************************
* Function Name: disp_i2c_controller_interrupt
********************************************************************************
* Summary:
*  I2C controller ISR which invokes Cy_SCB_I2C_Interrupt to perform I2C transfer
*  as controller.
*
* Parameters:
*  void
*
* Return:
*  void
*
*******************************************************************************/
static void disp_i2c_controller_interrupt(void)
{
    Cy_SCB_I2C_Interrupt(DISPLAY_I2C_CONTROLLER_HW, &disp_i2c_controller_context);
}

/*******************************************************************************
* Function Name: calculate_fps
********************************************************************************
* Summary:  
*  This function calculates the frames per second (FPS) based on the number of
*  frames rendered and the elapsed time since the last calculation.
*  It resets the frame count and start time after reaching the target number of
*  frames.

* Parameters:
*  void   
*  
* Return:
*  None
*******************************************************************************/
uint32_t idle_percent = 0;
void calculate_fps(void)
{
    static uint32_t start_time_ms = RESET_VAL;
    static uint32_t num_frames    = RESET_VAL;
    static uint32_t time_ms       = RESET_VAL;
    static uint32_t fps_x_1000    = RESET_VAL; 
    num_frames++;
    
    if (TARGET_NUM_FRAMES <= num_frames)
    {
        idle_percent = calculate_idle_percentage();
        time_ms = get_time_ms() - start_time_ms;
        fps_x_1000 = (num_frames * 1000 * 1000) / time_ms;

        printf("\rFPS: %u.%03u | CPU usage: %3u%%", (uint8_t)(fps_x_1000 / 1000),
                    (uint16_t)(fps_x_1000 % 1000),
                    (uint8_t)(100 - idle_percent));
        fflush(stdout);

        num_frames = RESET_VAL;
        start_time_ms = get_time_ms();
    }

}

/*******************************************************************************
* Function Name: cm55_gfx_task 
********************************************************************************
* Summary:
*   This is the FreeRTOS task callback function.
*   It initializes:  
*       - The selected display driver and vglite driver. 
*       - Allocate vglite buffers.
*       - Load an identity matrix into a matrix variable. 
*       - Translate the matrix to a new location.
*       - Scales the matrix in both horizontal and vertical directions.
*       - Call redraw function to draw the image using GPU and render it in 
*         framebuffer.
*
* Parameters:
*  void *arg: Pointer to the argument passed to the task (not used)
*
* Return:
*  void
*
*******************************************************************************/
static void cm55_gfx_task(void *arg)
{
    CY_UNUSED_PARAMETER(arg);

    cy_en_gfx_status_t status;
    vg_lite_error_t error;
    cy_en_sysint_status_t sysint_status;
    cy_en_scb_i2c_status_t i2c_result;
    event_t receive_event;
    bool success = true;

    /* --- Graphics Subsystem Initialization --- */
    GFXSS_config.mipi_dsi_cfg = &mtb_disp_waveshare_4p3_dsi_config;
    status = Cy_GFXSS_Init(base, &GFXSS_config, &gfx_context);
    if (status != CY_GFX_SUCCESS)
    {
        printf("Graphics subsystem initialization failed: %d\r\n", status);
        success = false;
    }

    /* --- Initialize DC Interrupt --- */
    if (success)
    {
        sysint_status = Cy_SysInt_Init(&dc_irq_cfg, dc_irq_handler);
        if (sysint_status != CY_SYSINT_SUCCESS)
        {
            printf("Error in registering DC interrupt: %d\r\n", sysint_status);
            success = false;
        }
        else
        {
            NVIC_EnableIRQ(GFXSS_DC_IRQ);
        }
    }

    /* --- Initialize GPU Interrupt --- */
    if (success)
    {
        sysint_status = Cy_SysInt_Init(&gpu_irq_cfg, gpu_irq_handler);
        if (sysint_status != CY_SYSINT_SUCCESS)
        {
            printf("Error in registering GPU interrupt: %d\r\n", sysint_status);
            success = false;
        }
        else
        {
            Cy_GFXSS_Enable_GPU_Interrupt(base);
            NVIC_EnableIRQ(GFXSS_GPU_IRQ);
        }
    }

    /* --- I2C Initialization --- */
    if (success)
    {
        i2c_result = Cy_SCB_I2C_Init(DISPLAY_I2C_CONTROLLER_HW,
                    &DISPLAY_I2C_CONTROLLER_CONFIG, &disp_i2c_controller_context);

        if (i2c_result != CY_SCB_I2C_SUCCESS)
        {
            printf("I2C controller initialization failed !!\n");
            success = false;
        }
        else
        {
            sysint_status = Cy_SysInt_Init(&disp_i2c_controller_irq_cfg,
                                           &disp_i2c_controller_interrupt);
            if (sysint_status != CY_SYSINT_SUCCESS)
            {
                printf("I2C controller interrupt initialization failed\r\n");
                success = false;
            }
            else
            {
                NVIC_EnableIRQ(disp_i2c_controller_irq_cfg.intrSrc);
                Cy_SCB_I2C_Enable(DISPLAY_I2C_CONTROLLER_HW);
            }
        }
    }

    vTaskDelay(pdMS_TO_TICKS(500));
    /* --- Display Initialization --- */
    if (success)
    {
        i2c_result = mtb_disp_waveshare_4p3_init(DISPLAY_I2C_CONTROLLER_HW,
                                                 &disp_i2c_controller_context);
        if (i2c_result != CY_SCB_I2C_SUCCESS)
        {
            printf("Waveshare 4.3-Inch display init failed: %u\r\n", (unsigned int)i2c_result);
            success = false;
        }
    }

    /* --- VGLite Initialization --- */
    if (success)
    {
        vg_module_parameters_t vg_params;
        vg_params.register_mem_base = (uint32_t)GFXSS_GFXSS_GPU_GCNANO;
        vg_params.gpu_mem_base[VG_PARAMS_POS] = GPU_MEM_BASE;
        vg_params.contiguous_mem_base[VG_PARAMS_POS] = (volatile void *) vglite_heap_base;
        vg_params.contiguous_mem_size[VG_PARAMS_POS] = VGLITE_HEAP_SIZE;

        vg_lite_init_mem(&vg_params);

        error = vg_lite_init(DISP_W, DISP_H);
        if (error != VG_LITE_SUCCESS)
        {
            printf("vg_lite engine init failed: %d\r\n", error);
            success = false;
        }
    }

    /* --- Buffers Setup --- */
    if (success)
    {
        buffer0.width  = DISP_W_ACTUAL;
        buffer0.height = DISP_H;
        buffer0.format = VG_LITE_BGR565;
        error = vg_lite_allocate_with_align(&buffer0,ALIGN_128);
        if (error)
        {
            printf("Buffer0 allocation failed: %d\r\n", error);
            success = false;
        }
        else
        {
            render_target = &buffer0;
        }
    }

    if (success)
    {
        buffer1.width  = DISP_W_ACTUAL;
        buffer1.height = DISP_H;
        buffer1.format = VG_LITE_BGR565;
        error = vg_lite_allocate_with_align(&buffer1,ALIGN_128);
        if (error)
        {
            printf("Buffer1 allocation failed: %d\r\n", error);
            success = false;
        }
    }

    if (success)
    {
        intermediate_buffer.width  = DISP_W/2;
        intermediate_buffer.height = DISP_H/2;
        intermediate_buffer.format = VG_LITE_BGR565;
        error = vg_lite_allocate(&intermediate_buffer);
        if (error)
        {
            printf("Intermediate buffer allocation failed: %d\r\n", error);
            success = false;
        }
    }

    /* --- Image/Logo Initialization --- */
    if (success)
    {
        error = vg_lite_clear(render_target, NULL, WHITE_COLOR);
        if (error)
        {
            printf("Clear failed: %d\r\n", error);
            success = false;
        }
    }

    if (success)
    {
        vg_lite_identity(&matrix);

        if (!load_images())
        {
            printf("Failed to load icons\r\n");
            success = false;
        }
        else
        {
            vg_lite_translate(DISP_W / TRANSFORMATION_OFFSET,
                              DISP_H / TRANSFORMATION_OFFSET,
                              &matrix);
            vg_lite_scale(DEF_X_SCALE, DEF_Y_SCALE, &matrix);
        }
    }

    /* --- Final Task Loop --- */
    if (success)
    {
        for (;;)
        {
            if (xQueueReceive(event_queque, &receive_event, 0) == pdTRUE)
            {
                if (receive_event.b_event < (sizeof(event_handlers)/sizeof(event_handlers[0])) &&
                    event_handlers[receive_event.b_event] != NULL)
                {
                    cancel_requested = false;
                    while (!cancel_requested)
                    {
                        event_handlers[receive_event.b_event]();
                        vTaskDelay(pdMS_TO_TICKS(GFX_TASK_DELAY_MS));
                    }
                    scale_count = RESET_VAL;
                    zoom_out    = false;
                    vg_lite_identity(&matrix);
                    vg_lite_translate(DISP_W / TRANSFORMATION_OFFSET,
                                      DISP_H / TRANSFORMATION_OFFSET,
                                      &matrix);
                    vg_lite_scale(DEF_X_SCALE, DEF_Y_SCALE, &matrix);
                }
            }

            default_draw();
            vTaskDelay(pdMS_TO_TICKS(GFX_TASK_DELAY_MS));
        }
    }
    else
    {
        cleanup(EVENT_DEFAULT,EXIT_2);
    }
}



/*******************************************************************************
* Function Name: setup_clib_support
********************************************************************************
* Summary:
*    1. This function configures and initializes the Real-Time Clock (RTC).
*    2. It then initializes the RTC HAL object to enable CLIB support library 
*       to work with the provided Real-Time Clock (RTC) module.
*
* Parameters:
*  void
*
* Return:
*  void
*
*******************************************************************************/
static void setup_clib_support(void)
{
    /* RTC Initialization */
    Cy_RTC_Init(&CYBSP_RTC_config);
    Cy_RTC_SetDateAndTime(&CYBSP_RTC_config);

    /* Initialize the ModusToolbox CLIB support library */
    mtb_clib_support_init(&rtc_obj);
}


/*******************************************************************************
* Function Name: main
********************************************************************************
* Summary:
*  This is the main function for CM55 non-secure application.
*    1. It initializes the device and board peripherals.
*    2. It sets up the LPtimer instance for CM55 CPU and initializes debug UART. 
*    3. It creates the FreeRTOS application task 'cm55_gfx_task'.
*    4. It starts the RTOS task scheduler.
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
#if defined(WS_HEADLESS_CM55)
#if defined(WS_FORCE_CM33_SAFE_BOOT)
    /* Hold the shared user-button pad low so CM33 skips /main.py. */
    for (;;)
    {
        Cy_GPIO_Pin_FastInit(GPIO_PRT7, 0U, CY_GPIO_DM_STRONG, 0U, HSIOM_SEL_GPIO);
    }
#else
    for (;;)
    {
        __WFI();
    }
#endif
#else
    cy_rslt_t result       = CY_RSLT_SUCCESS;
    BaseType_t task_return = pdFAIL;
    BaseType_t uxQueueLength = 10;
    /* Initialize the device and board peripherals */
    result = cybsp_init();
    
    /* Board initialization failed. Stop program execution */
    if (CY_RSLT_SUCCESS != result)
    {
        handle_app_error();
    }

    /* MicroPython starts CM55 without enabling its display-owned gates. */
    Cy_SysClk_PeriGroupSlaveInit(CY_MMIO_PASS_PERI_NR, CY_MMIO_PASS_GROUP_NR,
                                 CY_MMIO_PASS_SLAVE_NR, CY_MMIO_PASS_CLK_HF_NR);
    Cy_SysClk_PeriGroupSlaveInit(CY_MMIO_GFXSS_GPU_PERI_NR, CY_MMIO_GFXSS_GPU_GROUP_NR,
                                 CY_MMIO_GFXSS_GPU_SLAVE_NR, CY_MMIO_GFXSS_GPU_CLK_HF_NR);
    Cy_SysClk_PeriGroupSlaveInit(CY_MMIO_GFXSS_DC_PERI_NR, CY_MMIO_GFXSS_DC_GROUP_NR,
                                 CY_MMIO_GFXSS_DC_SLAVE_NR, CY_MMIO_GFXSS_DC_CLK_HF_NR);
    Cy_SysClk_PeriGroupSlaveInit(CY_MMIO_GFXSS_MIPIDSI_PERI_NR, CY_MMIO_GFXSS_MIPIDSI_GROUP_NR,
                                 CY_MMIO_GFXSS_MIPIDSI_SLAVE_NR, CY_MMIO_GFXSS_MIPIDSI_CLK_HF_NR);
    Cy_SysClk_PeriGroupSlaveInit(CY_MMIO_SCB5_PERI_NR, CY_MMIO_SCB5_GROUP_NR,
                                 CY_MMIO_SCB5_SLAVE_NR, CY_MMIO_SCB5_CLK_HF_NR);
    Cy_SysClk_PeriPclkDisableDivider((en_clk_dst_t)CYBSP_I2C_CONTROLLER_CLK_DIV_GRP_NUM,
                                     CY_SYSCLK_DIV_16_BIT, 0U);
    Cy_SysClk_PeriPclkSetDivider((en_clk_dst_t)CYBSP_I2C_CONTROLLER_CLK_DIV_GRP_NUM,
                                 CY_SYSCLK_DIV_16_BIT, 0U, 31U);
    Cy_SysClk_PeriPclkEnableDivider((en_clk_dst_t)CYBSP_I2C_CONTROLLER_CLK_DIV_GRP_NUM,
                                    CY_SYSCLK_DIV_16_BIT, 0U);
    Cy_SysClk_PeriPclkAssignDivider(PCLK_SCB5_CLOCK_SCB_EN, CY_SYSCLK_DIV_16_BIT, 0U);
    Cy_SysClk_PeriGroupSlaveInit(CY_MMIO_TCPWM0_PERI_NR, CY_MMIO_TCPWM0_GROUP_NR,
                                 CY_MMIO_TCPWM0_SLAVE_NR, CY_MMIO_TCPWM0_CLK_HF_NR);
    Cy_SysClk_PeriphAssignDivider(PCLK_TCPWM0_CLOCK_COUNTER_EN0, CY_SYSCLK_DIV_16_BIT, 2U);
    Cy_SysClk_PeriGroupSlaveInit(CY_MMIO_SMIF01_PERI_NR, CY_MMIO_SMIF01_GROUP_NR,
                                 CY_MMIO_SMIF01_SLAVE_NR, CY_MMIO_SMIF01_CLK_HF_NR);

    init_psram();

    /* Setup CLIB support library. */
    setup_clib_support();

    /* Setup the LPTimer instance for CM55*/
    setup_tickless_idle_timer();

    /* Initialize retarget-io middleware */
    init_retarget_io();

    /* Enable global interrupts */
    __enable_irq();
    
    event_queque = xQueueCreate(uxQueueLength, sizeof(event_t));
    if (event_queque == NULL) 
    {
        printf("Failed to create event queue\r\n");
        handle_app_error();
    }
    /* Create the FreeRTOS Task */
    task_return = xTaskCreate(cm55_gfx_task, GFX_TASK_NAME,
                              GFX_TASK_STACK_SIZE, NULL,
                              GFX_TASK_PRIORITY, NULL);

    task_return = xTaskCreate(uart_cli_handler, UART_CLI_TASK_NAME,
                              UART_CLI_TASK_STACK_SIZE,
                              NULL, UART_CLI_TASK_PRIORITY, NULL);
    
    if (pdPASS == task_return)
    {
        /* Start the RTOS Scheduler */
        vTaskStartScheduler();

        /* Should never get here! */
        handle_app_error();
    }
    else
    {
        printf("Error: Failed to create cm55_gfx_task.\r\n");
        handle_app_error();
    }
#endif
}


/*******************************************************************************
* Function Name: swap_frame_buffer
********************************************************************************
* Summary:
*  This function waits for any pending frame buffer operation, sets the 
*  Video/Graphics layer frame buffer to the display controller, and swaps 
*  between two render buffers. It also updates the FPS statistics.
*
* Parameters:
*  void
*
* Return:
*  void
*
*******************************************************************************/
void swap_frame_buffer( void ) 
{
    static int current_buffer = RESET_VAL;

    while (fb_pending);

    fb_pending = true;
    
    /* Sets Video/Graphics layer buffer address and transfers the frame buffer
       to the Display Controller */
    Cy_GFXSS_Set_FrameBuffer(base, (uint32_t*) render_target->address, &gfx_context);
    __DMB();

    /* Swap buffers */
    render_target = (current_buffer) ? &buffer0 : &buffer1;
    current_buffer ^= 1;

    /* Update frame rate statistics */
    calculate_fps();
}

/* [] END OF FILE */
