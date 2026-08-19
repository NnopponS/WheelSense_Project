#ifndef WS_TYPES_H
#define WS_TYPES_H

#include <stdbool.h>
#include <stdint.h>

typedef struct
{
    uint64_t timestamp_us;
    float accel_mps2[3];
    float gyro_rads[3];
    bool valid;
} ws_imu_sample_t;

typedef struct
{
    uint64_t timestamp_us;
    float temperature_c;
    float relative_humidity_percent;
    float pressure_hpa;
    uint32_t valid_mask;
} ws_environment_sample_t;

typedef struct
{
    uint64_t timestamp_us;
    uint16_t class_id;
    float confidence;
    uint32_t inference_time_us;
    uint32_t model_version;
    bool valid;
} ws_motion_result_t;

#endif
