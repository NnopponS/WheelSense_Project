#ifndef EDGE_AI_H
#define EDGE_AI_H

#include <stdbool.h>
#include <stdint.h>

#include "edge_camera.h"

/* The supplied model contains no label metadata. Change this only after
 * validating the training label order with known sitting/non-sitting images. */
#ifndef WS_SITTING_CLASS_INDEX
#define WS_SITTING_CLASS_INDEX (1U)
#endif

typedef struct
{
    volatile bool ready;
    volatile bool inference_ok;
    volatile bool fall_risk;
    volatile uint8_t sitting_percent;
    volatile uint8_t consecutive_not_sitting;
    volatile uint32_t inference_count;
} edge_ai_status_t;

bool edge_ai_start(void);
void edge_ai_submit_frame(const uint16_t *rgb565_frame);
const edge_ai_status_t *edge_ai_status(void);

#endif /* EDGE_AI_H */
