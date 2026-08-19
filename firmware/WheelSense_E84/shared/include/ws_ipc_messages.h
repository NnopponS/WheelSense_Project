#ifndef WS_IPC_MESSAGES_H
#define WS_IPC_MESSAGES_H

#include <stddef.h>
#include <stdint.h>
#include "ws_status.h"
#include "ws_types.h"

/*
 * WheelSense v1 IPC message payload codecs.
 *
 * Frozen contract: firmware/WheelSense_E84/docs/protocol.md
 * Each payload is packed (no padding) using LE helpers from ws_protocol.h.
 * The 20-byte envelope header is handled by ws_envelope_encode/decode;
 * these functions handle only the payload bytes that follow the header.
 */

/* --- Payload size constants --- */

#define WS_PAYLOAD_ENV_SIZE     24u  /* u64 + 3*f32 + u32 */
#define WS_PAYLOAD_IMU_SIZE     33u  /* u64 + 6*f32 + u8  */
#define WS_PAYLOAD_AI_SIZE      23u  /* u64 + u16 + f32 + 2*u32 + u8 */
#define WS_PAYLOAD_STATUS_SIZE   1u  /* u8 */
#define WS_PAYLOAD_UI_CMD_SIZE   2u  /* u16 */
#define WS_PAYLOAD_CAL_CMD_SIZE  6u  /* u16 + f32 */
#define WS_PAYLOAD_DIAG_SIZE     6u  /* u16 + u32 */

/* --- Payload size accessor --- */

/*
 * Returns the exact encoded payload size for a known v1 message type,
 * or 0 if the type is unknown.
 */
uint16_t ws_payload_size_for_type(uint16_t message_type);

/* --- ENV_UPDATE (ws_environment_sample_t) --- */

ws_status_t ws_env_encode(uint8_t *buf, size_t buf_size,
                          const ws_environment_sample_t *s);
ws_status_t ws_env_decode(ws_environment_sample_t *out,
                          const uint8_t *buf, size_t buf_size);

/* --- IMU_UPDATE (ws_imu_sample_t) --- */

ws_status_t ws_imu_encode(uint8_t *buf, size_t buf_size,
                          const ws_imu_sample_t *s);
ws_status_t ws_imu_decode(ws_imu_sample_t *out,
                          const uint8_t *buf, size_t buf_size);

/* --- AI_RESULT (ws_motion_result_t) --- */

ws_status_t ws_ai_encode(uint8_t *buf, size_t buf_size,
                         const ws_motion_result_t *r);
ws_status_t ws_ai_decode(ws_motion_result_t *out,
                         const uint8_t *buf, size_t buf_size);

/* --- Status messages (AUDIO/CAMERA/WIFI/BLE_STATUS) --- */

ws_status_t ws_status_encode(uint8_t *buf, size_t buf_size,
                             ws_status_t status);
ws_status_t ws_status_decode(ws_status_t *out,
                             const uint8_t *buf, size_t buf_size);

/* --- UI_COMMAND --- */

ws_status_t ws_ui_command_encode(uint8_t *buf, size_t buf_size,
                                 uint16_t command_id);
ws_status_t ws_ui_command_decode(uint16_t *out,
                                 const uint8_t *buf, size_t buf_size);

/* --- CALIBRATION_COMMAND --- */

ws_status_t ws_cal_command_encode(uint8_t *buf, size_t buf_size,
                                  uint16_t command_id, float parameter);
ws_status_t ws_cal_command_decode(uint16_t *out_id, float *out_param,
                                  const uint8_t *buf, size_t buf_size);

/* --- DIAGNOSTIC_EVENT --- */

ws_status_t ws_diag_event_encode(uint8_t *buf, size_t buf_size,
                                 uint16_t event_id, uint32_t counter);
ws_status_t ws_diag_event_decode(uint16_t *out_id, uint32_t *out_counter,
                                 const uint8_t *buf, size_t buf_size);

#endif /* WS_IPC_MESSAGES_H */
