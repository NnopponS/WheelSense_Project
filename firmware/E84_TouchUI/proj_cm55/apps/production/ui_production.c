/* EaseAI E84 production episode (UI/network/sensors/AI on CM55; BLE on CM33 NS).
 *
 * Four-page touchscreen UI on one screen (tabview):
 *   Dash    - live environment gauges + room/patient assignment
 *   Camera  - live OV7675 320x240 preview
 *   WiFi    - scan list + on-screen keyboard credential entry + join
 *   MQTT    - broker/port/node-id entry + connect + publish counters
 *
 * Telemetry: JSON-lines on the KitProg3 UART at 1 Hz and MQTT telemetry on
 * WheelSense/camera/<id>/status once WiFi + MQTT are up.
 */

#include "app_interface.h"

#include "edge_ai.h"
#include "edge_camera.h"
#include "sensor_bus.h"
#include "ws_mqtt.h"
#include "ws_wifi.h"

#include "dps368_reader.h"
#include "sht4x_reader.h"

#include "FreeRTOS.h"
#include "task.h"

#include "lvgl.h"

#include <stdio.h>
#include <string.h>

#define COLOR_BG     lv_color_hex(0x0F172A)
#define COLOR_CARD   lv_color_hex(0x1E293B)
#define COLOR_BORDER lv_color_hex(0x334155)
#define COLOR_TEXT   lv_color_hex(0xFFFFFF)
#define COLOR_MUTED  lv_color_hex(0x94A3B8)
#define COLOR_ACCENT lv_color_hex(0x0EA5E9)
#define COLOR_GOOD   lv_color_hex(0x4ADE80)
#define COLOR_BAD    lv_color_hex(0xF87171)
#define COLOR_BTN_BG lv_color_hex(0x334155)

/* Calibrated on the enclosed EaseAI board: 32.90 C indicated at 22.00 C
 * ambient. Keep this physical calibration knob for each enclosure revision. */
#define WS_SHT4X_TEMP_OFFSET_X100 (-1090)

static void fmt_fixed(char *buf, size_t size, int32_t value,
                      uint32_t scale, int decimals)
{
    const bool negative = value < 0;
    const uint32_t magnitude = negative ? (uint32_t)(-(int64_t)value)
                                        : (uint32_t)value;
    (void)snprintf(buf, size, "%s%lu.%0*lu", negative ? "-" : "",
                   (unsigned long)(magnitude / scale), decimals,
                   (unsigned long)(magnitude % scale));
}

static void fmt_x100(char *buf, size_t size, int32_t value)
{
    fmt_fixed(buf, size, value, 100U, 2);
}

/* ---- shared state ------------------------------------------------------- */

typedef struct
{
    volatile int32_t sht_temp_x100;
    volatile int32_t sht_hum_x100;
    volatile int32_t dps_pressure_x100;
    volatile uint32_t seq;
} ws_snapshot_t;

static ws_snapshot_t s_snap;
static bool s_sht4x_ok, s_dps368_ok;
static bool s_camera_ok;

/* ---- widgets ------------------------------------------------------------ */

static lv_obj_t *s_tabview;
static lv_obj_t *s_status_wifi;
static lv_obj_t *s_status_mqtt;

static lv_obj_t *s_temp_arc;
static lv_obj_t *s_hum_arc;
static lv_obj_t *s_pressure_arc;
static lv_obj_t *s_temp_value;
static lv_obj_t *s_hum_value;
static lv_obj_t *s_pressure_value;
static lv_obj_t *s_assignment_room;
static lv_obj_t *s_assignment_patient;

static lv_obj_t *s_cam_canvas;
static lv_obj_t *s_cam_status;
static lv_obj_t *s_ai_status;
CY_SECTION(".cy_gpu_buf") static LV_ATTRIBUTE_MEM_ALIGN uint16_t
    s_cam_pixels[EDGE_CAMERA_WIDTH * EDGE_CAMERA_HEIGHT];

static lv_obj_t *s_wifi_list;
static lv_obj_t *s_wifi_ssid_ta;
static lv_obj_t *s_wifi_pass_ta;
static lv_obj_t *s_wifi_status;
static char s_wifi_ssid_rows[WS_WIFI_MAX_SCAN_RESULTS][WS_WIFI_SSID_MAX_LEN];

static lv_obj_t *s_mqtt_broker_ta;
static lv_obj_t *s_mqtt_port_ta;
static lv_obj_t *s_mqtt_node_ta;
static lv_obj_t *s_mqtt_status;
static lv_obj_t *s_keyboard;

enum
{
    WS_TAB_DASH = 0U,
    WS_TAB_CAMERA = 1U,
    WS_TAB_WIFI = 2U,
    WS_TAB_MQTT = 3U,
};

static lv_obj_t *make_card(lv_obj_t *parent, int32_t w, int32_t h)
{
    lv_obj_t *card = lv_obj_create(parent);
    lv_obj_set_size(card, w, h);
    lv_obj_set_style_bg_color(card, COLOR_CARD, 0);
    lv_obj_set_style_border_color(card, COLOR_BORDER, 0);
    lv_obj_set_style_radius(card, 12, 0);
    lv_obj_set_style_pad_all(card, 10, 0);
    lv_obj_clear_flag(card, LV_OBJ_FLAG_SCROLLABLE);
    return card;
}

static lv_obj_t *make_button(lv_obj_t *parent, const char *text,
                             lv_color_t bg, int32_t w, int32_t h,
                             lv_event_cb_t cb)
{
    lv_obj_t *button = lv_button_create(parent);
    lv_obj_set_size(button, w, h);
    lv_obj_set_style_bg_color(button, bg, 0);
    lv_obj_set_style_radius(button, 12, 0);
    lv_obj_add_event_cb(button, cb, LV_EVENT_CLICKED, NULL);

    lv_obj_t *label = lv_label_create(button);
    lv_label_set_text(label, text);
    lv_obj_set_style_text_color(label, COLOR_TEXT, 0);
    lv_obj_set_style_text_font(label, &lv_font_montserrat_16, 0);
    lv_obj_center(label);
    return button;
}

/* ---- Dash tab ----------------------------------------------------------- */

static lv_obj_t *make_gauge(lv_obj_t *parent, const char *title,
                            const char *unit, int32_t min, int32_t max,
                            lv_color_t color, int32_t x,
                            lv_obj_t **value_label)
{
    lv_obj_t *card = make_card(parent, 250, 220);
    lv_obj_set_pos(card, x, 5);

    lv_obj_t *heading = lv_label_create(card);
    lv_label_set_text(heading, title);
    lv_obj_set_style_text_color(heading, COLOR_MUTED, 0);
    lv_obj_set_style_text_font(heading, &lv_font_montserrat_14, 0);
    lv_obj_align(heading, LV_ALIGN_TOP_MID, 0, 0);

    lv_obj_t *arc = lv_arc_create(card);
    lv_obj_set_size(arc, 160, 160);
    lv_arc_set_range(arc, min, max);
    lv_arc_set_bg_angles(arc, 135, 45);
    lv_obj_set_style_arc_width(arc, 14, LV_PART_MAIN);
    lv_obj_set_style_arc_color(arc, COLOR_BORDER, LV_PART_MAIN);
    lv_obj_set_style_arc_width(arc, 14, LV_PART_INDICATOR);
    lv_obj_set_style_arc_color(arc, color, LV_PART_INDICATOR);
    lv_obj_remove_style(arc, NULL, LV_PART_KNOB);
    lv_obj_clear_flag(arc, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_align(arc, LV_ALIGN_CENTER, 0, 14);

    *value_label = lv_label_create(card);
    lv_label_set_text(*value_label, "--");
    lv_obj_set_style_text_color(*value_label, COLOR_TEXT, 0);
    lv_obj_set_style_text_font(*value_label, &lv_font_montserrat_24, 0);
    lv_obj_align(*value_label, LV_ALIGN_CENTER, 0, 10);

    lv_obj_t *unit_label = lv_label_create(card);
    lv_label_set_text(unit_label, unit);
    lv_obj_set_style_text_color(unit_label, COLOR_MUTED, 0);
    lv_obj_align(unit_label, LV_ALIGN_CENTER, 0, 36);
    return arc;
}

static void build_dash_tab(lv_obj_t *tab)
{
    s_temp_arc = make_gauge(tab, "TEMPERATURE", "C", -10, 50,
                            lv_color_hex(0xF97316), 5, &s_temp_value);
    s_hum_arc = make_gauge(tab, "HUMIDITY", "%RH", 0, 100,
                           lv_color_hex(0x38BDF8), 265, &s_hum_value);
    s_pressure_arc = make_gauge(tab, "PRESSURE", "hPa", 950, 1050,
                                lv_color_hex(0xA78BFA), 525,
                                &s_pressure_value);

    lv_obj_t *assignment = make_card(tab, 770, 120);
    lv_obj_set_pos(assignment, 5, 235);
    lv_obj_t *title = lv_label_create(assignment);
    lv_label_set_text(title, "SERVER ASSIGNMENT");
    lv_obj_set_style_text_color(title, COLOR_ACCENT, 0);
    lv_obj_set_style_text_font(title, &lv_font_montserrat_14, 0);

    s_assignment_room = lv_label_create(assignment);
    lv_label_set_text(s_assignment_room, "Room: waiting for server");
    lv_obj_set_style_text_color(s_assignment_room, COLOR_TEXT, 0);
    lv_obj_set_style_text_font(s_assignment_room, &lv_font_montserrat_20, 0);
    lv_obj_set_pos(s_assignment_room, 0, 28);

    s_assignment_patient = lv_label_create(assignment);
    lv_label_set_text(s_assignment_patient, "Patient: not assigned");
    lv_obj_set_style_text_color(s_assignment_patient, COLOR_MUTED, 0);
    lv_obj_set_style_text_font(s_assignment_patient, &lv_font_montserrat_18, 0);
    lv_obj_set_pos(s_assignment_patient, 390, 30);
}

/* ---- Camera tab --------------------------------------------------------- */

static void camera_ui_timer(lv_timer_t *timer)
{
    (void)timer;
    const uint32_t active_tab = lv_tabview_get_tab_active(s_tabview);
    edge_camera_status_t status;
    (void)memset(&status, 0, sizeof(status));
    if (s_camera_ok && edge_camera_poll(s_cam_pixels, &status))
    {
        static TickType_t last_ai_submit = 0U;
        const TickType_t now = xTaskGetTickCount();
        if ((now - last_ai_submit) >= pdMS_TO_TICKS(1000U))
        {
            edge_ai_submit_frame(s_cam_pixels);
            last_ai_submit = now;
        }

        if (WS_TAB_CAMERA == active_tab)
        {
#if defined(__DCACHE_PRESENT) && (__DCACHE_PRESENT != 0)
            SCB_CleanDCache_by_Addr((uint32_t *)s_cam_pixels,
                                    sizeof(s_cam_pixels));
#endif
            lv_obj_invalidate(s_cam_canvas);
            lv_label_set_text_fmt(s_cam_status,
                                  "OV7675 LIVE  %lu FPS  light:%u  pixels:%lu",
                                  (unsigned long)status.fps,
                                  (unsigned)status.average_luma,
                                  (unsigned long)status.nonzero_samples);
        }
    }

    const edge_ai_status_t *ai = edge_ai_status();
    if (!ai->ready)
    {
        lv_label_set_text(s_ai_status, "Edge AI: loading model...");
        lv_obj_set_style_text_color(s_ai_status, COLOR_MUTED, 0);
    }
    else if (!ai->inference_ok)
    {
        lv_label_set_text(s_ai_status, "Edge AI ready - waiting for frame");
        lv_obj_set_style_text_color(s_ai_status, COLOR_ACCENT, 0);
    }
    else
    {
        lv_label_set_text_fmt(s_ai_status,
                              ai->fall_risk
                                  ? "FALL RISK\nSitting confidence: %u%%"
                                  : "Monitoring posture\nSitting confidence: %u%%",
                              (unsigned)ai->sitting_percent);
        lv_obj_set_style_text_color(s_ai_status,
                                    ai->fall_risk ? COLOR_BAD : COLOR_GOOD, 0);
    }
}

static void build_camera_tab(lv_obj_t *tab)
{
    lv_obj_t *card = make_card(tab, 384, 320);
    lv_obj_set_pos(card, 5, 5);

    (void)memset(s_cam_pixels, 0, sizeof(s_cam_pixels));
    s_cam_canvas = lv_canvas_create(card);
    lv_canvas_set_buffer(s_cam_canvas, s_cam_pixels,
                         EDGE_CAMERA_WIDTH, EDGE_CAMERA_HEIGHT,
                         LV_COLOR_FORMAT_RGB565);
    lv_obj_center(s_cam_canvas);

    s_cam_status = lv_label_create(tab);
    lv_label_set_text(s_cam_status, s_camera_ok ? "OV7675 ready"
                                                : "CAMERA ERROR - check module");
    lv_obj_set_style_text_color(
        s_cam_status, s_camera_ok ? COLOR_ACCENT : COLOR_BAD, 0);
    lv_obj_set_pos(s_cam_status, 10, 335);

    s_ai_status = lv_label_create(tab);
    lv_label_set_text(s_ai_status, "Edge AI: loading model...");
    lv_obj_set_style_text_color(s_ai_status, COLOR_MUTED, 0);
    lv_obj_set_style_text_font(s_ai_status, &lv_font_montserrat_20, 0);
    lv_obj_set_pos(s_ai_status, 420, 20);
}

/* ---- WiFi tab ----------------------------------------------------------- */

static void scan_event(lv_event_t *event)
{
    (void)event;
    lv_obj_clean(s_wifi_list);
    lv_label_set_text(s_wifi_status, "scanning...");
    ws_wifi_request_scan();
}

static void connect_event(lv_event_t *event)
{
    (void)event;
    const char *ssid = lv_textarea_get_text(s_wifi_ssid_ta);
    const char *pass = lv_textarea_get_text(s_wifi_pass_ta);
    lv_label_set_text(s_wifi_status, "joining...");
    ws_wifi_request_join(ssid, pass);
}

static void network_clicked(lv_event_t *event)
{
    const char *ssid = lv_event_get_user_data(event);
    if (NULL != ssid)
    {
        lv_textarea_set_text(s_wifi_ssid_ta, ssid);
    }
}

static void textarea_focus_event(lv_event_t *event)
{
    if (NULL != s_keyboard)
    {
        lv_keyboard_set_textarea(s_keyboard, lv_event_get_target(event));
        lv_obj_remove_flag(s_keyboard, LV_OBJ_FLAG_HIDDEN);
        lv_obj_move_foreground(s_keyboard);
    }
}

static void keyboard_close_event(lv_event_t *event)
{
    (void)event;
    lv_keyboard_set_textarea(s_keyboard, NULL);
    lv_obj_add_flag(s_keyboard, LV_OBJ_FLAG_HIDDEN);
}

static void build_wifi_tab(lv_obj_t *tab)
{
    lv_obj_t *list_card = make_card(tab, 384, 360);
    lv_obj_set_pos(list_card, 5, 5);
    s_wifi_list = lv_list_create(list_card);
    lv_obj_set_size(s_wifi_list, 360, 290);
    lv_obj_set_style_bg_color(s_wifi_list, COLOR_BG, 0);
    lv_obj_set_pos(s_wifi_list, 2, 30);

    lv_obj_t *scan_button = make_button(list_card, "SCAN", COLOR_BTN_BG,
                                        120, 24, scan_event);
    lv_obj_set_pos(scan_button, 2, 2);

    lv_obj_t *cred_card = make_card(tab, 396, 360);
    lv_obj_set_pos(cred_card, 395, 5);

    lv_obj_t *ssid_label = lv_label_create(cred_card);
    lv_label_set_text(ssid_label, "SSID");
    lv_obj_set_style_text_color(ssid_label, COLOR_MUTED, 0);
    lv_obj_set_pos(ssid_label, 0, 0);

    s_wifi_ssid_ta = lv_textarea_create(cred_card);
    lv_obj_set_size(s_wifi_ssid_ta, 376, 40);
    lv_obj_set_pos(s_wifi_ssid_ta, 0, 18);
    lv_textarea_set_one_line(s_wifi_ssid_ta, true);
    lv_textarea_set_placeholder_text(s_wifi_ssid_ta, "network name");

    lv_obj_t *pass_label = lv_label_create(cred_card);
    lv_label_set_text(pass_label, "Password");
    lv_obj_set_style_text_color(pass_label, COLOR_MUTED, 0);
    lv_obj_set_pos(pass_label, 0, 66);

    s_wifi_pass_ta = lv_textarea_create(cred_card);
    lv_obj_set_size(s_wifi_pass_ta, 376, 40);
    lv_obj_set_pos(s_wifi_pass_ta, 0, 84);
    lv_textarea_set_one_line(s_wifi_pass_ta, true);
    lv_textarea_set_password_mode(s_wifi_pass_ta, true);
    lv_textarea_set_placeholder_text(s_wifi_pass_ta, "password");

    lv_obj_t *connect_button = make_button(cred_card, "CONNECT", COLOR_ACCENT,
                                           160, 46, connect_event);
    lv_obj_set_pos(connect_button, 0, 132);

    s_wifi_status = lv_label_create(cred_card);
    lv_label_set_text(s_wifi_status, "idle");
    lv_obj_set_style_text_color(s_wifi_status, COLOR_MUTED, 0);
    lv_obj_set_style_text_font(s_wifi_status, &lv_font_montserrat_14, 0);
    lv_label_set_long_mode(s_wifi_status, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(s_wifi_status, 376);
    lv_obj_set_pos(s_wifi_status, 0, 190);

    lv_obj_add_event_cb(s_wifi_ssid_ta, textarea_focus_event,
                        LV_EVENT_FOCUSED, NULL);
    lv_obj_add_event_cb(s_wifi_pass_ta, textarea_focus_event,
                        LV_EVENT_FOCUSED, NULL);
}

/* ---- MQTT tab ----------------------------------------------------------- */

static void mqtt_apply_event(lv_event_t *event)
{
    (void)event;
    const char *broker = lv_textarea_get_text(s_mqtt_broker_ta);
    const char *port_txt = lv_textarea_get_text(s_mqtt_port_ta);
    const char *node = lv_textarea_get_text(s_mqtt_node_ta);
    uint16_t port = (uint16_t)atoi(port_txt);
    if (0U == port)
    {
        port = 1883U;
    }
    ws_mqtt_apply(broker, port, node);
    lv_label_set_text(s_mqtt_status, "applying...");
}

static void build_mqtt_tab(lv_obj_t *tab)
{
    lv_obj_t *card = make_card(tab, 500, 300);
    lv_obj_set_pos(card, 5, 5);

    lv_obj_t *b_label = lv_label_create(card);
    lv_label_set_text(b_label, "Broker host");
    lv_obj_set_style_text_color(b_label, COLOR_MUTED, 0);
    lv_obj_set_pos(b_label, 0, 0);
    s_mqtt_broker_ta = lv_textarea_create(card);
    lv_obj_set_size(s_mqtt_broker_ta, 480, 40);
    lv_obj_set_pos(s_mqtt_broker_ta, 0, 18);
    lv_textarea_set_one_line(s_mqtt_broker_ta, true);
    lv_textarea_set_text(s_mqtt_broker_ta, "broker.emqx.io");

    lv_obj_t *p_label = lv_label_create(card);
    lv_label_set_text(p_label, "Port");
    lv_obj_set_style_text_color(p_label, COLOR_MUTED, 0);
    lv_obj_set_pos(p_label, 0, 66);
    s_mqtt_port_ta = lv_textarea_create(card);
    lv_obj_set_size(s_mqtt_port_ta, 200, 40);
    lv_obj_set_pos(s_mqtt_port_ta, 0, 84);
    lv_textarea_set_one_line(s_mqtt_port_ta, true);
    lv_textarea_set_text(s_mqtt_port_ta, "1883");

    lv_obj_t *n_label = lv_label_create(card);
    lv_label_set_text(n_label, "Node ID");
    lv_obj_set_style_text_color(n_label, COLOR_MUTED, 0);
    lv_obj_set_pos(n_label, 0, 132);
    s_mqtt_node_ta = lv_textarea_create(card);
    lv_obj_set_size(s_mqtt_node_ta, 480, 40);
    lv_obj_set_pos(s_mqtt_node_ta, 0, 150);
    lv_textarea_set_one_line(s_mqtt_node_ta, true);
    lv_textarea_set_text(s_mqtt_node_ta, "CAM_E84_0001");

    lv_obj_t *apply_button = make_button(card, "APPLY & CONNECT", COLOR_ACCENT,
                                         220, 50, mqtt_apply_event);
    lv_obj_set_pos(apply_button, 0, 240);

    s_mqtt_status = lv_label_create(card);
    lv_label_set_text(s_mqtt_status, "waiting for WiFi...");
    lv_obj_set_style_text_color(s_mqtt_status, COLOR_MUTED, 0);
    lv_obj_set_style_text_font(s_mqtt_status, &lv_font_montserrat_14, 0);
    lv_label_set_long_mode(s_mqtt_status, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(s_mqtt_status, 460);
    lv_obj_set_pos(s_mqtt_status, 240, 240);

    lv_obj_t *note = lv_label_create(tab);
    lv_label_set_text(note,
                      "Topics (Node_Tsimcam contract)\n"
                      "WheelSense/camera/<id>/registration\n"
                      "WheelSense/camera/<id>/status");
    lv_obj_set_style_text_color(note, COLOR_MUTED, 0);
    lv_obj_set_pos(note, 520, 20);

    lv_obj_add_event_cb(s_mqtt_broker_ta, textarea_focus_event,
                        LV_EVENT_FOCUSED, NULL);
    lv_obj_add_event_cb(s_mqtt_port_ta, textarea_focus_event,
                        LV_EVENT_FOCUSED, NULL);
    lv_obj_add_event_cb(s_mqtt_node_ta, textarea_focus_event,
                        LV_EVENT_FOCUSED, NULL);
}

/* ---- 1 Hz UI refresh (LVGL task) ---------------------------------------- */

static void ui_refresh_timer(lv_timer_t *timer)
{
    (void)timer;
    char a[12], b[12];

    const ws_wifi_status_t *wifi = ws_wifi_status();
    const ws_mqtt_status_t *mqtt = ws_mqtt_status();

    const char *wifi_txt =
        (WS_WIFI_STATE_CONNECTED == wifi->state) ? "WiFi UP" :
        (WS_WIFI_STATE_SCANNING == wifi->state) ? "scan..." :
        (WS_WIFI_STATE_JOINING == wifi->state) ? "join..." :
        (WS_WIFI_STATE_ERROR == wifi->state) ? "WiFi ERR" : "WiFi down";
    lv_label_set_text(s_status_wifi, wifi_txt);
    lv_obj_set_style_text_color(
        s_status_wifi,
        (WS_WIFI_STATE_CONNECTED == wifi->state) ? COLOR_GOOD : COLOR_MUTED, 0);

    const char *mqtt_txt =
        (WS_MQTT_STATE_CONNECTED == mqtt->state) ? "MQTT UP" :
        (WS_MQTT_STATE_CONNECTING == mqtt->state) ? "MQTT..." :
        (WS_MQTT_STATE_ERROR == mqtt->state) ? "MQTT ERR" : "MQTT off";
    lv_label_set_text(s_status_mqtt, mqtt_txt);
    lv_obj_set_style_text_color(
        s_status_mqtt,
        (WS_MQTT_STATE_CONNECTED == mqtt->state) ? COLOR_GOOD : COLOR_MUTED, 0);

    if (WS_WIFI_STATE_CONNECTED == wifi->state && 0U != wifi->ip_addr)
    {
        char ip[20];
        (void)snprintf(ip, sizeof(ip), "%lu.%lu.%lu.%lu",
                       (unsigned long)((wifi->ip_addr >> 24) & 0xFFU),
                       (unsigned long)((wifi->ip_addr >> 16) & 0xFFU),
                       (unsigned long)((wifi->ip_addr >> 8) & 0xFFU),
                       (unsigned long)(wifi->ip_addr & 0xFFU));
        lv_label_set_text_fmt(s_wifi_status, "joined %s\nip %s",
                              wifi->joined_ssid, ip);
    }
    else if (WS_WIFI_STATE_ERROR == wifi->state)
    {
        lv_label_set_text(s_wifi_status, "WiFi error - retry scan/join");
    }

    if (wifi->scan_done)
    {
        /* One-shot fill of the network list after a completed scan. */
        const ws_wifi_scan_result_t *results = ws_wifi_scan_results();
        for (uint8_t i = 0U; i < wifi->scan_count; i++)
        {
            char line[48];
            (void)snprintf(s_wifi_ssid_rows[i], sizeof(s_wifi_ssid_rows[i]),
                           "%s", results[i].ssid);
            (void)snprintf(line, sizeof(line), "%s  (%ld)", results[i].ssid,
                           (long)results[i].rssi);
            lv_obj_t *btn = lv_list_add_button(s_wifi_list, LV_SYMBOL_WIFI,
                                               line);
            lv_obj_add_event_cb(btn, network_clicked, LV_EVENT_CLICKED,
                                s_wifi_ssid_rows[i]);
        }
        ws_wifi_consume_scan_results();
    }

    fmt_x100(a, sizeof(a), s_snap.sht_temp_x100);
    fmt_x100(b, sizeof(b), s_snap.sht_hum_x100);
    lv_label_set_text(s_temp_value, a);
    lv_label_set_text(s_hum_value, b);
    lv_arc_set_value(s_temp_arc, s_snap.sht_temp_x100 / 100);
    lv_arc_set_value(s_hum_arc, s_snap.sht_hum_x100 / 100);

    fmt_x100(a, sizeof(a), s_snap.dps_pressure_x100);
    lv_label_set_text(s_pressure_value, a);
    lv_arc_set_value(s_pressure_arc, s_snap.dps_pressure_x100 / 100);

    lv_label_set_text_fmt(s_assignment_room, "Room: %s",
                          mqtt->assignment_received ? mqtt->room_name
                                                    : "waiting for server");
    lv_label_set_text_fmt(s_assignment_patient, "Patient: %s",
                          mqtt->assignment_received ? mqtt->patient_name
                                                    : "not assigned");

    lv_label_set_text_fmt(s_mqtt_status,
                          "%s\npub:%lu err:%lu\nbroker %s:%u",
                          (WS_MQTT_STATE_CONNECTED == mqtt->state) ? "connected"
                                                                   : "offline",
                          (unsigned long)mqtt->pub_count,
                          (unsigned long)mqtt->err_count,
                          mqtt->broker, (unsigned)mqtt->port);
}

/* ---- sensor task: readers -> UART JSON + snapshot + MQTT ---------------- */

static void sensor_task(void *arg)
{
    (void)arg;
    char payload[512];
    char temperature[24], humidity[24], pressure[24];

    s_sht4x_ok = (CY_RSLT_SUCCESS ==
                  sht4x_reader_init(&sensor_i2c_controller_hal_obj));
    s_dps368_ok = (CY_RSLT_SUCCESS ==
                   dps368_reader_init(&sensor_i2c_controller_hal_obj));

    printf("[SENSOR] init sht4x=%d dps368=%d temp_offset_x100=%d\r\n",
           (int)s_sht4x_ok, (int)s_dps368_ok,
           WS_SHT4X_TEMP_OFFSET_X100);

    for (;;)
    {
        vTaskDelay(pdMS_TO_TICKS(1000U));
        s_snap.seq++;

        sht4x_sample_t sht;
        if (s_sht4x_ok && sht4x_reader_poll(&sht))
        {
            s_snap.sht_temp_x100 =
                (int32_t)(sht.temperature_c * 100.0f) +
                WS_SHT4X_TEMP_OFFSET_X100;
            s_snap.sht_hum_x100 = (int32_t)(sht.humidity_rh * 100.0f);
            printf("{\"sensor\":\"sht4x\",\"t_cx100\":%ld,\"h_rhx100\":%ld,\"seq\":%lu}\r\n",
                   (long)s_snap.sht_temp_x100, (long)s_snap.sht_hum_x100,
                   (unsigned long)s_snap.seq);
        }
        else if (!s_sht4x_ok)
        {
            printf("{\"sensor\":\"sht4x\",\"error\":\"init failed\"}\r\n");
        }

        dps368_sample_t dps;
        if (s_dps368_ok && dps368_reader_poll(&dps))
        {
            s_snap.dps_pressure_x100 = (int32_t)(dps.pressure_hpa * 100.0f);
            printf("{\"sensor\":\"dps368\",\"p_hpax100\":%ld,\"seq\":%lu}\r\n",
                   (long)s_snap.dps_pressure_x100,
                   (unsigned long)s_snap.seq);
        }
        else if (!s_dps368_ok)
        {
            printf("{\"sensor\":\"dps368\",\"error\":\"init failed\"}\r\n");
        }

        fmt_x100(temperature, sizeof(temperature), s_snap.sht_temp_x100);
        fmt_x100(humidity, sizeof(humidity), s_snap.sht_hum_x100);
        fmt_x100(pressure, sizeof(pressure), s_snap.dps_pressure_x100);
        (void)snprintf(payload, sizeof(payload),
                       "{\"protocolVersion\":1,\"device_id\":\"%s\","
                       "\"node_id\":\"%s\",\"status\":\"online\","
                       "\"seq\":%lu,\"camera_ready\":%s,"
                       "\"edge_ai\":{\"ready\":%s,\"fall_risk\":%s,"
                       "\"sitting_confidence_pct\":%u},"
                       "\"environment\":{\"temperatureC\":%s,"
                       "\"humidityPct\":%s,\"pressureHpa\":%s}}",
                       ws_mqtt_status()->node_id, ws_mqtt_status()->node_id,
                       (unsigned long)s_snap.seq, s_camera_ok ? "true" : "false",
                       edge_ai_status()->ready ? "true" : "false",
                       edge_ai_status()->fall_risk ? "true" : "false",
                       (unsigned)edge_ai_status()->sitting_percent,
                       temperature, humidity, pressure);
        ws_mqtt_publish_telemetry(payload);
    }
}

/* ---- episode entry ------------------------------------------------------- */

void example_main(lv_obj_t *parent)
{
    lv_obj_set_style_bg_color(parent, COLOR_BG, 0);
    lv_obj_set_style_bg_opa(parent, LV_OPA_COVER, 0);
    lv_obj_set_style_pad_all(parent, 0, 0);

    lv_obj_t *title = lv_label_create(parent);
    lv_label_set_text(title, "EaseAI E84");
    lv_obj_set_style_text_color(title, COLOR_TEXT, 0);
    lv_obj_set_style_text_font(title, &lv_font_montserrat_16, 0);
    lv_obj_set_pos(title, 8, 6);

    s_status_wifi = lv_label_create(parent);
    lv_label_set_text(s_status_wifi, "WiFi down");
    lv_obj_set_style_text_font(s_status_wifi, &lv_font_montserrat_14, 0);
    lv_obj_set_pos(s_status_wifi, 600, 8);

    s_status_mqtt = lv_label_create(parent);
    lv_label_set_text(s_status_mqtt, "MQTT off");
    lv_obj_set_style_text_font(s_status_mqtt, &lv_font_montserrat_14, 0);
    lv_obj_set_pos(s_status_mqtt, 700, 8);

    s_tabview = lv_tabview_create(parent);
    lv_obj_set_size(s_tabview, 800, 430);
    lv_obj_set_pos(s_tabview, 0, 30);
    lv_obj_set_style_bg_color(s_tabview, COLOR_BG, 0);
    lv_tabview_set_tab_bar_size(s_tabview, 46);

    lv_obj_t *tab_dash = lv_tabview_add_tab(s_tabview, "Dash");
    lv_obj_t *tab_cam = lv_tabview_add_tab(s_tabview, "Camera");
    lv_obj_t *tab_wifi = lv_tabview_add_tab(s_tabview, "WiFi");
    lv_obj_t *tab_mqtt = lv_tabview_add_tab(s_tabview, "MQTT");

    s_camera_ok = edge_camera_init();
    const bool edge_ai_started = edge_ai_start();

    build_dash_tab(tab_dash);
    build_camera_tab(tab_cam);
    build_wifi_tab(tab_wifi);
    build_mqtt_tab(tab_mqtt);

    s_keyboard = lv_keyboard_create(parent);
    lv_obj_set_size(s_keyboard, 760, 220);
    lv_obj_align(s_keyboard, LV_ALIGN_CENTER, 0, 90);
    lv_obj_set_style_bg_color(s_keyboard, COLOR_CARD, 0);
    lv_obj_set_style_border_color(s_keyboard, COLOR_ACCENT, 0);
    lv_obj_set_style_border_width(s_keyboard, 2, 0);
    lv_obj_set_style_radius(s_keyboard, 14, 0);
    lv_obj_add_event_cb(s_keyboard, keyboard_close_event,
                        LV_EVENT_READY, NULL);
    lv_obj_add_event_cb(s_keyboard, keyboard_close_event,
                        LV_EVENT_CANCEL, NULL);
    lv_obj_add_flag(s_keyboard, LV_OBJ_FLAG_HIDDEN);

    if (!s_camera_ok)
    {
        lv_label_set_text(s_cam_status,
                          "CAMERA ERROR - check OV7675 ribbon/module");
        lv_obj_set_style_text_color(s_cam_status, COLOR_BAD, 0);
    }

    (void)ws_wifi_start();
    (void)ws_mqtt_start();

    if (pdPASS != xTaskCreate(sensor_task, "sensors",
                              configMINIMAL_STACK_SIZE * 8U, NULL,
                              tskIDLE_PRIORITY + 1U, NULL))
    {
        printf("[SENSOR] task creation failed\r\n");
    }

    lv_timer_create(ui_refresh_timer, 1000U, NULL);
    lv_timer_create(camera_ui_timer, 100U, NULL);

    printf("[PRODUCTION] episode ready (camera=%d edge_ai=%d)\r\n",
           (int)s_camera_ok, (int)edge_ai_started);
}
