/* OV7675 DVP capture wrapper: double-buffered DMA frames as RGB565 320x240.
 * Ported from the TESA firmware-stack face_detection example; shares the
 * display/touch I2C context owned by the master template's main.c. */

#include "edge_camera.h"

#include "cy_pdl.h"
#include "mtb_dvp_camera_ov7675.h"
#include "vg_lite.h"

#include "FreeRTOS.h"
#include "task.h"

#include <stdio.h>
#include <string.h>

#define MOTION_GRID_X (40U)
#define MOTION_GRID_Y (30U)
#define MOTION_THRESHOLD (9U)

extern cy_stc_scb_i2c_context_t disp_touch_i2c_controller_context;

CY_SECTION(".cy_gpu_buf")
static uint16_t s_frames[2][EDGE_CAMERA_WIDTH * EDGE_CAMERA_HEIGHT];

static vg_lite_buffer_t s_camera_buffers[2];
static bool s_frame_ready = false;
static bool s_active_frame = false;
static bool s_initialized = false;
static uint8_t s_previous_luma[MOTION_GRID_X * MOTION_GRID_Y];
static bool s_have_previous = false;
static uint32_t s_frame_count = 0U;
static TickType_t s_fps_start = 0U;
static uint32_t s_fps = 0U;

static uint8_t rgb565_luma(uint16_t pixel)
{
    uint32_t red = (pixel >> 11U) & 0x1FU;
    uint32_t green = (pixel >> 5U) & 0x3FU;
    uint32_t blue = pixel & 0x1FU;
    return (uint8_t)((red * 2U + green * 3U + blue) / 6U);
}

bool edge_camera_init(void)
{
    if (s_initialized)
    {
        return true;
    }

    (void)memset(s_frames, 0, sizeof(s_frames));
    (void)memset(s_camera_buffers, 0, sizeof(s_camera_buffers));

    for (uint32_t i = 0U; i < 2U; i++)
    {
        s_camera_buffers[i].width = EDGE_CAMERA_WIDTH;
        s_camera_buffers[i].height = EDGE_CAMERA_HEIGHT;
        s_camera_buffers[i].stride = EDGE_CAMERA_WIDTH * sizeof(uint16_t);
        s_camera_buffers[i].format = VG_LITE_RGB565;
        s_camera_buffers[i].memory = s_frames[i];
        s_camera_buffers[i].address = (uint32_t)s_frames[i];
    }

    cy_rslt_t result = mtb_dvp_cam_ov7675_init(
        s_camera_buffers,
        &disp_touch_i2c_controller_context,
        &s_frame_ready,
        &s_active_frame);
    if (CY_RSLT_SUCCESS != result)
    {
        (void)printf("[CAMERA] OV7675 init failed: 0x%08lX\n",
                     (unsigned long)result);
        return false;
    }

    s_initialized = true;
    s_fps_start = xTaskGetTickCount();
    (void)printf("[CAMERA] OV7675 DVP 320x240 ready\n");
    return true;
}

bool edge_camera_poll(uint16_t *destination,
                      edge_camera_status_t *status)
{
    if ((NULL == destination) || (NULL == status))
    {
        return false;
    }

    status->ready = s_initialized;
    status->activity = false;
    status->activity_score = 0U;
    status->frame_count = s_frame_count;
    status->fps = s_fps;

    if (!s_initialized || !s_frame_ready)
    {
        return false;
    }

    s_frame_ready = false;
    uint32_t index = s_active_frame ? 1U : 0U;

#if defined(__DCACHE_PRESENT) && (__DCACHE_PRESENT != 0)
    SCB_InvalidateDCache_by_Addr((uint32_t *)s_frames[index],
                                 sizeof(s_frames[index]));
#endif

    /* OV7675 transmits each RGB565 pixel most-significant byte first.  The
     * CM55 and LVGL store RGB565 as native little-endian uint16_t values. */
    for (uint32_t i = 0U; i < (EDGE_CAMERA_WIDTH * EDGE_CAMERA_HEIGHT); i++)
    {
        const uint16_t camera_pixel = s_frames[index][i];
        destination[i] = (uint16_t)((camera_pixel << 8U) |
                                    (camera_pixel >> 8U));
    }

    uint32_t total_difference = 0U;
    uint32_t total_luma = 0U;
    uint32_t nonzero_samples = 0U;
    uint32_t sample_index = 0U;
    for (uint32_t y = 4U; y < EDGE_CAMERA_HEIGHT; y += 8U)
    {
        for (uint32_t x = 4U; x < EDGE_CAMERA_WIDTH; x += 8U)
        {
            uint8_t luma = rgb565_luma(destination[y * EDGE_CAMERA_WIDTH + x]);
            total_luma += luma;
            nonzero_samples += (0U != destination[y * EDGE_CAMERA_WIDTH + x]);
            if (s_have_previous)
            {
                uint8_t previous = s_previous_luma[sample_index];
                total_difference += (luma > previous) ?
                                        (uint32_t)(luma - previous) :
                                        (uint32_t)(previous - luma);
            }
            s_previous_luma[sample_index++] = luma;
        }
    }

    s_have_previous = true;
    s_frame_count++;

    TickType_t now = xTaskGetTickCount();
    TickType_t elapsed = now - s_fps_start;
    if (elapsed >= pdMS_TO_TICKS(1000U))
    {
        s_fps = (uint32_t)((s_frame_count * configTICK_RATE_HZ) /
                           (elapsed > 0U ? elapsed : 1U));
        s_frame_count = 0U;
        s_fps_start = now;
    }

    status->ready = true;
    status->activity_score =
        total_difference / (MOTION_GRID_X * MOTION_GRID_Y);
    status->nonzero_samples = nonzero_samples;
    status->average_luma =
        (uint8_t)(total_luma / (MOTION_GRID_X * MOTION_GRID_Y));
    status->activity = s_have_previous &&
                       (status->activity_score >= MOTION_THRESHOLD);
    status->frame_count = s_frame_count;
    status->fps = s_fps;

    static bool first_frame_logged = false;
    if (!first_frame_logged)
    {
        (void)printf("[CAMERA] first frame light=%u pixels=%lu\n",
                     (unsigned)status->average_luma,
                     (unsigned long)status->nonzero_samples);
        first_frame_logged = true;
    }
    return true;
}
