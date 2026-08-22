#ifndef WS_MAILBOX_H
#define WS_MAILBOX_H

#include <stddef.h>
#include <stdint.h>

#define WS_MAILBOX_TX_ADDRESS ((volatile uint8_t *)0x240FF000u)
#define WS_MAILBOX_RX_ADDRESS ((volatile uint8_t *)0x240FF800u)
#define WS_MAILBOX_SIZE 0x800u
#define WS_MAILBOX_HEADER_SIZE 20u
#define WS_MAILBOX_MAGIC 0x38534557u
#define WS_MAILBOX_VERSION 1u

enum ws_mailbox_field_id {
    WS_FIELD_COMMAND = 1,
    WS_FIELD_COMMAND_ID,
    WS_FIELD_INTERVAL_MS,
    WS_FIELD_RESOLUTION,
    WS_FIELD_TASK_ID,
    WS_FIELD_TASK_TITLE,
    WS_FIELD_ROOM_NAME,
    WS_FIELD_CAREGIVER_NAME,
    WS_FIELD_EVENT,
    WS_FIELD_NAME,
    WS_FIELD_BEACON_ID,
    WS_FIELD_RSSI,
    WS_FIELD_WIFI_SSID,
    WS_FIELD_WIFI_PASSWORD,
    WS_FIELD_MQTT_BROKER,
    WS_FIELD_MQTT_PORT,
    WS_FIELD_MQTT_USER,
    WS_FIELD_MQTT_PASSWORD,
    WS_FIELD_NODE_ID,
    WS_FIELD_SYNC_ONLY,
    WS_FIELD_SAVED,
};

typedef struct {
    uint16_t command;
    uint32_t sequence;
    const uint8_t *payload;
    uint16_t payload_length;
} ws_mailbox_view_t;

typedef struct {
    uint8_t id;
    const char *value;
} ws_mailbox_field_t;

int ws_mailbox_read(const volatile uint8_t *slot, uint32_t last_sequence,
                    ws_mailbox_view_t *view);
int ws_mailbox_find(const ws_mailbox_view_t *view, uint8_t id,
                    char *value, size_t value_size);
int ws_mailbox_write(volatile uint8_t *slot, uint32_t sequence, uint16_t command,
                     const ws_mailbox_field_t *fields, size_t field_count);

#endif
