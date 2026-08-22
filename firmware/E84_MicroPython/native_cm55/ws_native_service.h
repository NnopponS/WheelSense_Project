#ifndef WS_NATIVE_SERVICE_H
#define WS_NATIVE_SERVICE_H

#include <stdbool.h>
#include <stdint.h>

typedef struct {
    bool stream_enabled;
    bool config_mode;
    uint8_t config_field;
    uint32_t capture_interval_ms;
    char resolution[8];
    char task_id[33];
    char task_title[97];
    char room_name[65];
    char caregiver_name[65];
    char command_id[65];
    char wifi_ssid[33];
    char wifi_password[64];
    char mqtt_broker[129];
    char mqtt_port[6];
    char node_id[33];
} ws_native_state_t;

void ws_native_service_init(void);
int ws_native_service_process(const volatile uint8_t *slot);
int ws_native_service_poll(void);
const ws_native_state_t *ws_native_service_state(void);
int ws_native_service_confirm_task(bool accepted);
int ws_native_service_staff_detected(const char *name, const char *beacon_id, int rssi);
int ws_native_service_config_append(char character);
void ws_native_service_config_backspace(void);
void ws_native_service_config_next(void);
int ws_native_service_config_submit(void);
int ws_native_service_config_submit_to(volatile uint8_t *slot);

#endif
