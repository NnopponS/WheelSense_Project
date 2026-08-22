#ifndef WS_WIFI_H
#define WS_WIFI_H

#include <stdbool.h>
#include <stdint.h>

#define WS_WIFI_MAX_SCAN_RESULTS (16U)
#define WS_WIFI_SSID_MAX_LEN (33U)
#define WS_WIFI_PASS_MAX_LEN (65U)

typedef struct
{
    char ssid[WS_WIFI_SSID_MAX_LEN];
    int16_t rssi;
    uint8_t channel;
    uint32_t security; /* cy_wcm_security_t value */
} ws_wifi_scan_result_t;

typedef enum
{
    WS_WIFI_STATE_DISABLED = 0,
    WS_WIFI_STATE_IDLE,
    WS_WIFI_STATE_SCANNING,
    WS_WIFI_STATE_JOINING,
    WS_WIFI_STATE_CONNECTED,
    WS_WIFI_STATE_ERROR,
} ws_wifi_state_t;

typedef struct
{
    volatile ws_wifi_state_t state;
    volatile bool scan_done;
    volatile uint8_t scan_count;
    volatile uint32_t ip_addr; /* host-order IPv4, 0 when not joined */
    char joined_ssid[WS_WIFI_SSID_MAX_LEN];
} ws_wifi_status_t;

/* Starts the WiFi worker task and initializes cy_wcm. Safe to call once. */
bool ws_wifi_start(void);

/* Async scan request; results appear in ws_wifi_status() once scan_done. */
void ws_wifi_request_scan(void);

/* Async join request with the given credentials (copied). */
void ws_wifi_request_join(const char *ssid, const char *password);

const ws_wifi_status_t *ws_wifi_status(void);
const ws_wifi_scan_result_t *ws_wifi_scan_results(void);
void ws_wifi_consume_scan_results(void);

#endif /* WS_WIFI_H */
