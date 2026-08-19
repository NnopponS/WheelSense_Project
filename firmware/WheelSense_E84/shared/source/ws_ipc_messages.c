/*
 * WheelSense v1 IPC message payload codecs.
 *
 * Frozen contract: firmware/WheelSense_E84/docs/protocol.md
 * Packed LE payloads using helpers from ws_protocol.h.
 * No partial mutation on decode failure.
 */

#include "ws_ipc_messages.h"
#include "ws_protocol.h"

#include <string.h>

/* --- Payload size accessor --- */

uint16_t ws_payload_size_for_type(uint16_t message_type)
{
    switch (message_type)
    {
        case WS_IPC_ENV_UPDATE:            return WS_PAYLOAD_ENV_SIZE;
        case WS_IPC_IMU_UPDATE:            return WS_PAYLOAD_IMU_SIZE;
        case WS_IPC_AI_RESULT:             return WS_PAYLOAD_AI_SIZE;
        case WS_IPC_AUDIO_STATUS:          return WS_PAYLOAD_STATUS_SIZE;
        case WS_IPC_CAMERA_STATUS:         return WS_PAYLOAD_STATUS_SIZE;
        case WS_IPC_WIFI_STATUS:           return WS_PAYLOAD_STATUS_SIZE;
        case WS_IPC_BLE_STATUS:            return WS_PAYLOAD_STATUS_SIZE;
        case WS_IPC_UI_COMMAND:            return WS_PAYLOAD_UI_CMD_SIZE;
        case WS_IPC_CALIBRATION_COMMAND:   return WS_PAYLOAD_CAL_CMD_SIZE;
        case WS_IPC_DIAGNOSTIC_EVENT:      return WS_PAYLOAD_DIAG_SIZE;
        default:                           return 0u;
    }
}

/* --- ENV_UPDATE --- */

ws_status_t ws_env_encode(uint8_t *buf, size_t buf_size,
                          const ws_environment_sample_t *s)
{
    if (buf == NULL || s == NULL)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    if (buf_size < WS_PAYLOAD_ENV_SIZE)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }

    ws_le_put_u64(buf + 0u,  s->timestamp_us);
    ws_le_put_f32(buf + 8u,  s->temperature_c);
    ws_le_put_f32(buf + 12u, s->relative_humidity_percent);
    ws_le_put_f32(buf + 16u, s->pressure_hpa);
    ws_le_put_u32(buf + 20u, s->valid_mask);

    return WS_STATUS_READY;
}

ws_status_t ws_env_decode(ws_environment_sample_t *out,
                          const uint8_t *buf, size_t buf_size)
{
    if (out == NULL || buf == NULL)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    if (buf_size != WS_PAYLOAD_ENV_SIZE)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }

    ws_environment_sample_t tmp;
    tmp.timestamp_us              = ws_le_get_u64(buf + 0u);
    tmp.temperature_c             = ws_le_get_f32(buf + 8u);
    tmp.relative_humidity_percent = ws_le_get_f32(buf + 12u);
    tmp.pressure_hpa              = ws_le_get_f32(buf + 16u);
    tmp.valid_mask                = ws_le_get_u32(buf + 20u);

    *out = tmp;
    return WS_STATUS_READY;
}

/* --- IMU_UPDATE --- */

ws_status_t ws_imu_encode(uint8_t *buf, size_t buf_size,
                          const ws_imu_sample_t *s)
{
    if (buf == NULL || s == NULL)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    if (buf_size < WS_PAYLOAD_IMU_SIZE)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }

    ws_le_put_u64(buf + 0u,  s->timestamp_us);
    for (int i = 0; i < 3; i++)
    {
        ws_le_put_f32(buf + 8u + (size_t)i * 4u, s->accel_mps2[i]);
    }
    for (int i = 0; i < 3; i++)
    {
        ws_le_put_f32(buf + 20u + (size_t)i * 4u, s->gyro_rads[i]);
    }
    buf[32u] = s->valid ? 1u : 0u;

    return WS_STATUS_READY;
}

ws_status_t ws_imu_decode(ws_imu_sample_t *out,
                          const uint8_t *buf, size_t buf_size)
{
    if (out == NULL || buf == NULL)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    if (buf_size != WS_PAYLOAD_IMU_SIZE)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }

    ws_imu_sample_t tmp;
    tmp.timestamp_us = ws_le_get_u64(buf + 0u);
    for (int i = 0; i < 3; i++)
    {
        tmp.accel_mps2[i] = ws_le_get_f32(buf + 8u + (size_t)i * 4u);
    }
    for (int i = 0; i < 3; i++)
    {
        tmp.gyro_rads[i] = ws_le_get_f32(buf + 20u + (size_t)i * 4u);
    }
    tmp.valid = (buf[32u] != 0u) ? true : false;
    if (buf[32u] > 1u)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }

    *out = tmp;
    return WS_STATUS_READY;
}

/* --- AI_RESULT --- */

ws_status_t ws_ai_encode(uint8_t *buf, size_t buf_size,
                         const ws_motion_result_t *r)
{
    if (buf == NULL || r == NULL)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    if (buf_size < WS_PAYLOAD_AI_SIZE)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }

    ws_le_put_u64(buf + 0u,  r->timestamp_us);
    ws_le_put_u16(buf + 8u,  r->class_id);
    ws_le_put_f32(buf + 10u, r->confidence);
    ws_le_put_u32(buf + 14u, r->inference_time_us);
    ws_le_put_u32(buf + 18u, r->model_version);
    buf[22u] = r->valid ? 1u : 0u;

    return WS_STATUS_READY;
}

ws_status_t ws_ai_decode(ws_motion_result_t *out,
                         const uint8_t *buf, size_t buf_size)
{
    if (out == NULL || buf == NULL)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    if (buf_size != WS_PAYLOAD_AI_SIZE)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }

    ws_motion_result_t tmp;
    tmp.timestamp_us      = ws_le_get_u64(buf + 0u);
    tmp.class_id          = ws_le_get_u16(buf + 8u);
    tmp.confidence        = ws_le_get_f32(buf + 10u);
    tmp.inference_time_us = ws_le_get_u32(buf + 14u);
    tmp.model_version     = ws_le_get_u32(buf + 18u);
    tmp.valid             = (buf[22u] != 0u) ? true : false;
    if (buf[22u] > 1u)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }

    *out = tmp;
    return WS_STATUS_READY;
}

/* --- Status messages --- */

ws_status_t ws_status_encode(uint8_t *buf, size_t buf_size,
                             ws_status_t status)
{
    if (buf == NULL)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    if (buf_size < WS_PAYLOAD_STATUS_SIZE)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    buf[0u] = (uint8_t)status;
    return WS_STATUS_READY;
}

ws_status_t ws_status_decode(ws_status_t *out,
                             const uint8_t *buf, size_t buf_size)
{
    if (out == NULL || buf == NULL)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    if (buf_size != WS_PAYLOAD_STATUS_SIZE)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    uint8_t raw = buf[0u];
    if (raw > (uint8_t)WS_STATUS_INTERNAL_ERROR)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    *out = (ws_status_t)raw;
    return WS_STATUS_READY;
}

/* --- UI_COMMAND --- */

ws_status_t ws_ui_command_encode(uint8_t *buf, size_t buf_size,
                                 uint16_t command_id)
{
    if (buf == NULL)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    if (buf_size < WS_PAYLOAD_UI_CMD_SIZE)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    ws_le_put_u16(buf, command_id);
    return WS_STATUS_READY;
}

ws_status_t ws_ui_command_decode(uint16_t *out,
                                 const uint8_t *buf, size_t buf_size)
{
    if (out == NULL || buf == NULL)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    if (buf_size != WS_PAYLOAD_UI_CMD_SIZE)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    *out = ws_le_get_u16(buf);
    return WS_STATUS_READY;
}

/* --- CALIBRATION_COMMAND --- */

ws_status_t ws_cal_command_encode(uint8_t *buf, size_t buf_size,
                                  uint16_t command_id, float parameter)
{
    if (buf == NULL)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    if (buf_size < WS_PAYLOAD_CAL_CMD_SIZE)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    ws_le_put_u16(buf + 0u, command_id);
    ws_le_put_f32(buf + 2u, parameter);
    return WS_STATUS_READY;
}

ws_status_t ws_cal_command_decode(uint16_t *out_id, float *out_param,
                                  const uint8_t *buf, size_t buf_size)
{
    if (out_id == NULL || out_param == NULL || buf == NULL)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    if (buf_size != WS_PAYLOAD_CAL_CMD_SIZE)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    *out_id   = ws_le_get_u16(buf + 0u);
    *out_param = ws_le_get_f32(buf + 2u);
    return WS_STATUS_READY;
}

/* --- DIAGNOSTIC_EVENT --- */

ws_status_t ws_diag_event_encode(uint8_t *buf, size_t buf_size,
                                 uint16_t event_id, uint32_t counter)
{
    if (buf == NULL)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    if (buf_size < WS_PAYLOAD_DIAG_SIZE)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    ws_le_put_u16(buf + 0u, event_id);
    ws_le_put_u32(buf + 2u, counter);
    return WS_STATUS_READY;
}

ws_status_t ws_diag_event_decode(uint16_t *out_id, uint32_t *out_counter,
                                 const uint8_t *buf, size_t buf_size)
{
    if (out_id == NULL || out_counter == NULL || buf == NULL)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    if (buf_size != WS_PAYLOAD_DIAG_SIZE)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    *out_id     = ws_le_get_u16(buf + 0u);
    *out_counter = ws_le_get_u32(buf + 2u);
    return WS_STATUS_READY;
}
