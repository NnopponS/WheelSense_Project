#include "edge_ai.h"

#include "models/sitting_mnet025_int8.h"

#include "cy_result.h"
#include "cy_utils.h"
#include "mtb_ml.h"

#include "FreeRTOS.h"
#include "task.h"

#include <stdio.h>
#include <string.h>

#define EDGE_AI_INPUT_WIDTH (128U)
#define EDGE_AI_INPUT_HEIGHT (128U)
#define EDGE_AI_INPUT_CHANNELS (3U)
#define EDGE_AI_NOT_SITTING_THRESHOLD (55U)
#define EDGE_AI_ALERT_FRAMES (5U)

CY_SECTION(".cy_socmem_data") CY_ALIGN(16)
static uint8_t s_tensor_arena[SITTING_MNET025_ARENA_SIZE];

CY_SECTION(".cy_gpu_buf") CY_ALIGN(16)
static uint16_t s_inference_frame[EDGE_CAMERA_WIDTH * EDGE_CAMERA_HEIGHT];

static edge_ai_status_t s_status;
static TaskHandle_t s_task;
static volatile bool s_frame_pending;

static void prepare_input(const uint16_t *frame, uint8_t *input)
{
    for (uint32_t y = 0U; y < EDGE_AI_INPUT_HEIGHT; y++)
    {
        const uint32_t source_y = y * EDGE_CAMERA_HEIGHT / EDGE_AI_INPUT_HEIGHT;
        for (uint32_t x = 0U; x < EDGE_AI_INPUT_WIDTH; x++)
        {
            const uint32_t source_x = x * EDGE_CAMERA_WIDTH / EDGE_AI_INPUT_WIDTH;
            const uint16_t pixel = frame[source_y * EDGE_CAMERA_WIDTH + source_x];
            *input++ = (uint8_t)((((pixel >> 11U) & 0x1FU) * 255U) / 31U - 128U);
            *input++ = (uint8_t)((((pixel >> 5U) & 0x3FU) * 255U) / 63U - 128U);
            *input++ = (uint8_t)(((pixel & 0x1FU) * 255U) / 31U - 128U);
        }
    }
}

static void ai_task(void *argument)
{
    (void)argument;
    mtb_ml_model_t *model = NULL;
    MTB_ML_DATA_T *input = NULL;
    MTB_ML_DATA_T *output = NULL;
    size_t input_size = 0U;
    size_t output_size = 0U;
    int *dims = NULL;
    int dim_count = 0;
    int zero_point = 0;
    float scale = 0.0f;

    const mtb_ml_model_bin_t model_bin = {
        "SITTING_MNET025",
        sitting_mnet025_model_bin,
        SITTING_MNET025_MODEL_BIN_LEN,
        SITTING_MNET025_ARENA_SIZE,
    };
    const mtb_ml_model_buffer_t model_buffer = {
        .tensor_arena = s_tensor_arena,
        .tensor_arena_size = sizeof(s_tensor_arena),
    };

    cy_rslt_t result = mtb_ml_init(0U);
    if (CY_RSLT_SUCCESS == result)
    {
        result = mtb_ml_model_init(&model_bin, &model_buffer, &model);
    }
    if (CY_RSLT_SUCCESS == result)
    {
        result = mtb_ml_model_get_input_detail(model, 0, &input, &input_size,
                                                &dims, &dim_count,
                                                &zero_point, &scale);
    }
    if (CY_RSLT_SUCCESS == result)
    {
        result = mtb_ml_model_get_output_detail(model, 0, &output, &output_size,
                                                 &dims, &dim_count,
                                                 &zero_point, &scale);
    }
    if ((CY_RSLT_SUCCESS != result) ||
        (input_size != EDGE_AI_INPUT_WIDTH * EDGE_AI_INPUT_HEIGHT * EDGE_AI_INPUT_CHANNELS) ||
        (output_size < 2U) || (WS_SITTING_CLASS_INDEX >= output_size))
    {
        printf("[AI] model init failed: 0x%08lX input=%lu output=%lu\r\n",
               (unsigned long)result, (unsigned long)input_size,
               (unsigned long)output_size);
        vTaskDelete(NULL);
    }

    s_status.ready = true;
    printf("[AI] sitting_mnet025 ready; class=%u arena=%u\r\n",
           (unsigned)WS_SITTING_CLASS_INDEX,
           (unsigned)SITTING_MNET025_ARENA_SIZE);

    for (;;)
    {
        (void)ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
        prepare_input(s_inference_frame, (uint8_t *)input);
        result = mtb_ml_model_run(model, input);
        s_frame_pending = false;
        s_status.inference_ok = (CY_RSLT_SUCCESS == result);
        if (CY_RSLT_SUCCESS != result)
        {
            printf("[AI] inference failed: 0x%08lX\r\n", (unsigned long)result);
            continue;
        }

        const uint8_t sitting = (uint8_t)
            ((int16_t)((const int8_t *)output)[WS_SITTING_CLASS_INDEX] + 128);
        s_status.sitting_percent = (uint8_t)(((uint32_t)sitting * 100U) / 255U);
        s_status.inference_count++;
        if (s_status.sitting_percent < EDGE_AI_NOT_SITTING_THRESHOLD)
        {
            if (s_status.consecutive_not_sitting < UINT8_MAX)
            {
                s_status.consecutive_not_sitting++;
            }
        }
        else
        {
            s_status.consecutive_not_sitting = 0U;
        }
        s_status.fall_risk =
            s_status.consecutive_not_sitting >= EDGE_AI_ALERT_FRAMES;
    }
}

bool edge_ai_start(void)
{
    if (NULL != s_task)
    {
        return true;
    }
    (void)memset(&s_status, 0, sizeof(s_status));
    return pdPASS == xTaskCreate(ai_task, "edge_ai",
                                 configMINIMAL_STACK_SIZE * 12U, NULL,
                                 tskIDLE_PRIORITY + 1U, &s_task);
}

void edge_ai_submit_frame(const uint16_t *rgb565_frame)
{
    if ((NULL == rgb565_frame) || (NULL == s_task) ||
        !s_status.ready || s_frame_pending)
    {
        return;
    }
    (void)memcpy(s_inference_frame, rgb565_frame, sizeof(s_inference_frame));
    s_frame_pending = true;
    (void)xTaskNotifyGive(s_task);
}

const edge_ai_status_t *edge_ai_status(void)
{
    return &s_status;
}
