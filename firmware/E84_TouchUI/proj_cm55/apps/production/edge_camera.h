#ifndef EDGE_CAMERA_H
#define EDGE_CAMERA_H

#include <stdbool.h>
#include <stdint.h>

#define EDGE_CAMERA_WIDTH (320U)
#define EDGE_CAMERA_HEIGHT (240U)

typedef struct
{
    bool ready;
    bool activity;
    uint32_t activity_score;
    uint32_t frame_count;
    uint32_t fps;
    uint32_t nonzero_samples;
    uint8_t average_luma;
} edge_camera_status_t;

bool edge_camera_init(void);
bool edge_camera_poll(uint16_t *rgb565_destination,
                      edge_camera_status_t *status);

#endif /* EDGE_CAMERA_H */
