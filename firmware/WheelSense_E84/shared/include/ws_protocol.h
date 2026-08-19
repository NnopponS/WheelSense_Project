#ifndef WS_PROTOCOL_H
#define WS_PROTOCOL_H

#include <stddef.h>
#include <stdint.h>
#include "ws_status.h"

/*
 * WheelSense v1 wire protocol — envelope codec and LE helpers.
 *
 * Frozen contract: firmware/WheelSense_E84/docs/protocol.md
 * All multi-byte fields are little-endian. The 20-byte header is never
 * transmitted by copying a C struct; fields are written individually.
 */

#define WS_PROTOCOL_VERSION       1u
#define WS_PROTOCOL_HEADER_SIZE   20u
#define WS_PROTOCOL_MAX_PAYLOAD_SIZE 1024u

/* Frozen v1 message IDs (docs/protocol.md). */
typedef enum
{
    WS_IPC_ENV_UPDATE            = 1,
    WS_IPC_IMU_UPDATE            = 2,
    WS_IPC_AI_RESULT             = 3,
    WS_IPC_AUDIO_STATUS          = 4,
    WS_IPC_CAMERA_STATUS         = 5,
    WS_IPC_WIFI_STATUS           = 6,
    WS_IPC_BLE_STATUS            = 7,
    WS_IPC_UI_COMMAND            = 8,
    WS_IPC_CALIBRATION_COMMAND   = 9,
    WS_IPC_DIAGNOSTIC_EVENT      = 10
} ws_message_type_t;

/* Decoded envelope header. Process-local only — never memcpy'd to wire. */
typedef struct
{
    uint16_t version;
    uint16_t message_type;
    uint16_t payload_length;
    uint16_t flags;
    uint32_t sequence;
    uint64_t timestamp_us;
} ws_envelope_t;

/* --- Little-endian helpers (used by envelope and P1.5 payload codecs) --- */

void ws_le_put_u16(uint8_t *p, uint16_t v);
void ws_le_put_u32(uint8_t *p, uint32_t v);
void ws_le_put_u64(uint8_t *p, uint64_t v);
void ws_le_put_f32(uint8_t *p, float v);

uint16_t ws_le_get_u16(const uint8_t *p);
uint32_t ws_le_get_u32(const uint8_t *p);
uint64_t ws_le_get_u64(const uint8_t *p);
float    ws_le_get_f32(const uint8_t *p);

/* --- Envelope codec --- */

/*
 * Encode a 20-byte v1 header into buf.
 *
 * Requires buf_size >= WS_PROTOCOL_HEADER_SIZE.
 * Validates: version == 1, message_type in 1..10, flags == 0,
 *            payload_length <= WS_PROTOCOL_MAX_PAYLOAD_SIZE.
 * Does not write anything on failure (no partial mutation).
 *
 * Returns WS_STATUS_READY on success, an error status otherwise.
 */
ws_status_t ws_envelope_encode(uint8_t *buf, size_t buf_size,
                               const ws_envelope_t *hdr);

/*
 * Decode a 20-byte v1 header from buf.
 *
 * Requires buf_size >= WS_PROTOCOL_HEADER_SIZE.
 * Validates all header fields and checks that buf_size ==
 * WS_PROTOCOL_HEADER_SIZE + payload_length (rejects truncation/trailing).
 * Does not mutate *out on failure (no partial mutation).
 *
 * Returns WS_STATUS_READY on success, an error status otherwise.
 */
ws_status_t ws_envelope_decode(ws_envelope_t *out,
                               const uint8_t *buf, size_t buf_size);

/*
 * Sequence wrap comparison.
 * Returns 1 if incoming is newer than previous using
 * (int32_t)(incoming - previous) > 0, else 0.
 */
int ws_sequence_is_newer(uint32_t incoming, uint32_t previous);

#endif /* WS_PROTOCOL_H */
