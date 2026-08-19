#include <stddef.h>

#include "ws_status.h"
#include "ws_types.h"

_Static_assert(sizeof(uint16_t) == 2, "uint16_t width");
_Static_assert(sizeof(uint32_t) == 4, "uint32_t width");
_Static_assert(sizeof(uint64_t) == 8, "uint64_t width");
_Static_assert(sizeof(float) == 4, "wire-compatible float width");

_Static_assert(WS_STATUS_NOT_INITIALIZED == 0, "stable status base");
_Static_assert(WS_STATUS_INTERNAL_ERROR == 10, "stable status range");

void ws_test_compile_public_fields(void)
{
    ws_imu_sample_t imu = {0};
    ws_environment_sample_t environment = {0};
    ws_motion_result_t motion = {0};

    imu.timestamp_us = 1U;
    imu.accel_mps2[0] = 1.0F;
    imu.gyro_rads[0] = 1.0F;
    imu.valid = true;

    environment.timestamp_us = 2U;
    environment.temperature_c = 25.0F;
    environment.relative_humidity_percent = 50.0F;
    environment.pressure_hpa = 1013.25F;
    environment.valid_mask = 0x7U;

    motion.timestamp_us = 3U;
    motion.class_id = 1U;
    motion.confidence = 0.75F;
    motion.inference_time_us = 100U;
    motion.model_version = 1U;
    motion.valid = true;

    (void)imu;
    (void)environment;
    (void)motion;
}
