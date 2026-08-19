/*
 * WheelSense v1 wire protocol — envelope codec implementation.
 *
 * Frozen contract: firmware/WheelSense_E84/docs/protocol.md
 * Explicit little-endian helpers + 20-byte v1 envelope only.
 * No payload codecs (P1.5), no IPC queues, no transport.
 */

#include "ws_protocol.h"

#include <string.h>
#include <float.h>

/* Build-time assertions: float is 32-bit IEEE-754 binary32.
 * Checks both size and that FLT_MANT_DIG == 24 (IEEE-754 binary32 mantissa). */
typedef char ws_float_is_32bit[(sizeof(float) == 4u) ? 1 : -1];
typedef char ws_float_is_ieee754[(FLT_MANT_DIG == 24) ? 1 : -1];

/* --- Little-endian helpers --- */

void ws_le_put_u16(uint8_t *p, uint16_t v)
{
    p[0] = (uint8_t)(v & 0xFFu);
    p[1] = (uint8_t)((v >> 8) & 0xFFu);
}

void ws_le_put_u32(uint8_t *p, uint32_t v)
{
    p[0] = (uint8_t)(v & 0xFFu);
    p[1] = (uint8_t)((v >> 8) & 0xFFu);
    p[2] = (uint8_t)((v >> 16) & 0xFFu);
    p[3] = (uint8_t)((v >> 24) & 0xFFu);
}

void ws_le_put_u64(uint8_t *p, uint64_t v)
{
    p[0] = (uint8_t)(v & 0xFFu);
    p[1] = (uint8_t)((v >> 8) & 0xFFu);
    p[2] = (uint8_t)((v >> 16) & 0xFFu);
    p[3] = (uint8_t)((v >> 24) & 0xFFu);
    p[4] = (uint8_t)((v >> 32) & 0xFFu);
    p[5] = (uint8_t)((v >> 40) & 0xFFu);
    p[6] = (uint8_t)((v >> 48) & 0xFFu);
    p[7] = (uint8_t)((v >> 56) & 0xFFu);
}

void ws_le_put_f32(uint8_t *p, float v)
{
    uint32_t bits;
    memcpy(&bits, &v, sizeof(bits));
    ws_le_put_u32(p, bits);
}

uint16_t ws_le_get_u16(const uint8_t *p)
{
    return (uint16_t)((uint16_t)p[0] | ((uint16_t)p[1] << 8));
}

uint32_t ws_le_get_u32(const uint8_t *p)
{
    return (uint32_t)p[0]
         | ((uint32_t)p[1] << 8)
         | ((uint32_t)p[2] << 16)
         | ((uint32_t)p[3] << 24);
}

uint64_t ws_le_get_u64(const uint8_t *p)
{
    return (uint64_t)p[0]
         | ((uint64_t)p[1] << 8)
         | ((uint64_t)p[2] << 16)
         | ((uint64_t)p[3] << 24)
         | ((uint64_t)p[4] << 32)
         | ((uint64_t)p[5] << 40)
         | ((uint64_t)p[6] << 48)
         | ((uint64_t)p[7] << 56);
}

float ws_le_get_f32(const uint8_t *p)
{
    uint32_t bits = ws_le_get_u32(p);
    float v;
    memcpy(&v, &bits, sizeof(v));
    return v;
}

/* --- Internal validation --- */

static ws_status_t ws_validate_header_fields(uint16_t version,
                                             uint16_t message_type,
                                             uint16_t flags,
                                             uint16_t payload_length)
{
    if (version != WS_PROTOCOL_VERSION)
    {
        return WS_STATUS_UNSUPPORTED;
    }
    if (message_type < 1u || message_type > 10u)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    if (flags != 0u)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    if (payload_length > WS_PROTOCOL_MAX_PAYLOAD_SIZE)
    {
        return WS_STATUS_OVERFLOW;
    }
    return WS_STATUS_READY;
}

/* --- Envelope codec --- */

ws_status_t ws_envelope_encode(uint8_t *buf, size_t buf_size,
                               const ws_envelope_t *hdr)
{
    if (buf == NULL || hdr == NULL)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    if (buf_size < WS_PROTOCOL_HEADER_SIZE)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }

    ws_status_t st = ws_validate_header_fields(hdr->version,
                                               hdr->message_type,
                                               hdr->flags,
                                               hdr->payload_length);
    if (st != WS_STATUS_READY)
    {
        return st;
    }

    ws_le_put_u16(buf + 0u,  hdr->version);
    ws_le_put_u16(buf + 2u,  hdr->message_type);
    ws_le_put_u16(buf + 4u,  hdr->payload_length);
    ws_le_put_u16(buf + 6u,  hdr->flags);
    ws_le_put_u32(buf + 8u,  hdr->sequence);
    ws_le_put_u64(buf + 12u, hdr->timestamp_us);

    return WS_STATUS_READY;
}

ws_status_t ws_envelope_decode(ws_envelope_t *out,
                               const uint8_t *buf, size_t buf_size)
{
    if (out == NULL || buf == NULL)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }
    if (buf_size < WS_PROTOCOL_HEADER_SIZE)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }

    /* Read fields first, then validate. Do not write to *out until
     * all checks pass — this guarantees no partial mutation on failure. */
    uint16_t version        = ws_le_get_u16(buf + 0u);
    uint16_t message_type   = ws_le_get_u16(buf + 2u);
    uint16_t payload_length = ws_le_get_u16(buf + 4u);
    uint16_t flags          = ws_le_get_u16(buf + 6u);
    uint32_t sequence       = ws_le_get_u32(buf + 8u);
    uint64_t timestamp_us   = ws_le_get_u64(buf + 12u);

    ws_status_t st = ws_validate_header_fields(version, message_type,
                                               flags, payload_length);
    if (st != WS_STATUS_READY)
    {
        return st;
    }

    /* Check buf_size matches header + payload (rejects truncation/trailing). */
    size_t expected = WS_PROTOCOL_HEADER_SIZE + (size_t)payload_length;
    if (buf_size != expected)
    {
        return WS_STATUS_INVALID_SAMPLE;
    }

    out->version        = version;
    out->message_type   = message_type;
    out->payload_length = payload_length;
    out->flags          = flags;
    out->sequence       = sequence;
    out->timestamp_us   = timestamp_us;

    return WS_STATUS_READY;
}

int ws_sequence_is_newer(uint32_t incoming, uint32_t previous)
{
    return ((int32_t)(incoming - previous) > 0) ? 1 : 0;
}
