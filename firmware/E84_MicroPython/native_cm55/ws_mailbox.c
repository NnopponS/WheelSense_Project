#include "ws_mailbox.h"

#include <string.h>

static uint16_t load_u16(const volatile uint8_t *p)
{
    return (uint16_t)p[0] | ((uint16_t)p[1] << 8);
}

static uint32_t load_u32(const volatile uint8_t *p)
{
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) |
           ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

static void store_u16(volatile uint8_t *p, uint16_t value)
{
    p[0] = (uint8_t)value;
    p[1] = (uint8_t)(value >> 8);
}

static void store_u32(volatile uint8_t *p, uint32_t value)
{
    p[0] = (uint8_t)value;
    p[1] = (uint8_t)(value >> 8);
    p[2] = (uint8_t)(value >> 16);
    p[3] = (uint8_t)(value >> 24);
}

static uint32_t crc32_bytes(const volatile uint8_t *data, size_t length)
{
    uint32_t crc = 0xFFFFFFFFu;
    for (size_t i = 0; i < length; ++i) {
        crc ^= data[i];
        for (unsigned bit = 0; bit < 8; ++bit) {
            crc = (crc >> 1) ^ (0xEDB88320u & (0u - (crc & 1u)));
        }
    }
    return ~crc;
}

int ws_mailbox_read(const volatile uint8_t *slot, uint32_t last_sequence,
                    ws_mailbox_view_t *view)
{
    if (!slot || !view || load_u32(slot) != WS_MAILBOX_MAGIC ||
        load_u16(slot + 4) != WS_MAILBOX_VERSION) {
        return 0;
    }
    const uint16_t length = load_u16(slot + 6);
    const uint32_t sequence = load_u32(slot + 8);
    if (sequence == last_sequence) {
        return 0;
    }
    if (length > WS_MAILBOX_SIZE - WS_MAILBOX_HEADER_SIZE ||
        crc32_bytes(slot + WS_MAILBOX_HEADER_SIZE, length) != load_u32(slot + 16)) {
        return -1;
    }
    view->command = load_u16(slot + 12);
    view->sequence = sequence;
    view->payload = (const uint8_t *)(slot + WS_MAILBOX_HEADER_SIZE);
    view->payload_length = length;
    return 1;
}

int ws_mailbox_find(const ws_mailbox_view_t *view, uint8_t id,
                    char *value, size_t value_size)
{
    if (!view || !value || value_size == 0) {
        return -1;
    }
    size_t offset = 0;
    while (offset < view->payload_length) {
        if (view->payload_length - offset < 3) {
            return -1;
        }
        const uint8_t field_id = view->payload[offset];
        const uint16_t length = (uint16_t)view->payload[offset + 1] |
                                ((uint16_t)view->payload[offset + 2] << 8);
        offset += 3;
        if (length > view->payload_length - offset) {
            return -1;
        }
        if (field_id == id) {
            if ((size_t)length >= value_size) {
                return -1;
            }
            memcpy(value, view->payload + offset, length);
            value[length] = '\0';
            return 1;
        }
        offset += length;
    }
    return 0;
}

int ws_mailbox_write(volatile uint8_t *slot, uint32_t sequence, uint16_t command,
                     const ws_mailbox_field_t *fields, size_t field_count)
{
    if (!slot || (!fields && field_count)) {
        return -1;
    }
    store_u32(slot, 0);
    size_t offset = WS_MAILBOX_HEADER_SIZE;
    for (size_t i = 0; i < field_count; ++i) {
        const size_t length = strlen(fields[i].value);
        if (length > UINT16_MAX || offset + 3 + length > WS_MAILBOX_SIZE) {
            return -1;
        }
        slot[offset++] = fields[i].id;
        store_u16(slot + offset, (uint16_t)length);
        offset += 2;
        memcpy((void *)(slot + offset), fields[i].value, length);
        offset += length;
    }
    const uint16_t payload_length = (uint16_t)(offset - WS_MAILBOX_HEADER_SIZE);
    store_u16(slot + 4, WS_MAILBOX_VERSION);
    store_u16(slot + 6, payload_length);
    store_u32(slot + 8, sequence);
    store_u16(slot + 12, command);
    store_u16(slot + 14, 0);
    store_u32(slot + 16, crc32_bytes(slot + WS_MAILBOX_HEADER_SIZE, payload_length));
    store_u32(slot, WS_MAILBOX_MAGIC);
    return 0;
}
