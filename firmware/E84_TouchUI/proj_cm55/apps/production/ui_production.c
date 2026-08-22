/* EaseAI E84 production episode (all on CM55).
 *
 * Four-page touchscreen UI on one screen (tabview):
 *   Dash    - live sensor values + tap counter + link status
 *   Camera  - live OV7675 320x240 preview
 *   WiFi    - scan list + on-screen keyboard credential entry + join
 *   MQTT    - broker/port/node-id entry + connect + publish counters
 *
 * Telemetry: JSON-lines on the KitProg3 UART at 1 Hz and MQTT telemetry on
 * WheelSense/camera/<id>/status once WiFi + MQTT are up.
 */

#include "app_interface.h"

#include "edge_camera.h"
#include "sensor_bus.h"
#include "ws_mqtt.h"
#include "ws_wifi.h"

#include "bmi270_reader.h"
#include "bmm350_reader.h"
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

static void fmt_x1000(char *buf, size_t size, int32_t value)
{
    fmt_fixed(buf, size, value, 1000U, 3);
}

static void fmt_x10(char *buf, size_t size, int32_t value)
{
    fmt_fixed(buf, size, value, 10U, 1);
}

/* ---- shared state ------------------------------------------------------- */

typedef struct
{
    volatile int32_t sht_temp_x100;
    volatile int32_t sht_hum_x100;
    volatile int32_t dps_pressure_x100;
    volatile int32_t dps_temp_x100;
    volatile int32_t bmi_acc_mgx1000;
    volatile int32_t bmi_gyr_x100;
    volatile int32_t mag_heading_x10;
    volatile uint32_t seq;
} ws_snapshot_t;

static ws_snapshot_t s_snap;
static bool s_sht4x_ok, s_dps368_ok, s_bmi270_ok, s_bmm350_ok;
static bool s_camera_ok;

/* ---- widgets ------------------------------------------------------------ */

static lv_obj_t *s_tabview;
static lv_obj_t *s_status_wifi;
static lv_obj_t *s_status_mqtt;

static lv_obj_t *s_dash_sht;
static lv_obj_t *s_dash_dps;
static lv_obj_t *s_dash_bmi;
static lv_obj_t *s_dash_bmm;
static lv_obj_t *s_dash_counter;

static lv_obj_t *s_cam_canvas;
static lv_obj_t *s_cam_status;
static LV_ATTRIBUTE_MEM_ALIGN uint16_t
    s_cam_pixels[EDGE_CAMERA_WIDTH * EDGE_CAMERA_HEIGHT];

static lv_obj_t *s_wifi_list;
static lv_obj_t *s_wifi_ssid_ta;
static lv_obj_t *s_wifi_pass_ta;
static lv_obj_t *s_wifi_status;
static lv_obj_t *s_wifi_keyboard;

static lv_obj_t *s_mqtt_broker_ta;
static lv_obj_t *s_mqtt_port_ta;
static lv_obj_t *s_mqtt_node_ta;
static lv_obj_t *s_mqtt_status;
static lv_obj_t *s_mqtt_keyboard;

static uint32_t s_tap_count;

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

static lv_obj_t *make_value_label(lv_obj_t *parent, const char *title)
{
    lv_obj_t *title_label = lv_label_create(parent);
    lv_label_set_text(title_label, title);
    lv_obj_set_style_text_color(title_label, COLOR_MUTED, 0);
    lv_obj_set_style_text_font(title_label, &lv_font_montserrat_14, 0);
    lv_obj_set_pos(title_label, 0, 0);

    lv_obj_t *value = lv_label_create(parent);
    lv_label_set_text(value, "--");
    lv_obj_set_style_text_color(value, COLOR_TEXT, 0);
    lv_obj_set_style_text_font(value, &lv_font_montserrat_20, 0);
    lv_obj_set_pos(value, 0, 22);
    return value;
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

static void counter_event(lv_event_t *event)
{
    (void)event;
    s_tap_count++;
    lv_label_set_text_fmt(s_dash_counter, "%lu",
                          (unsigned long)s_tap_count);
}

static void build_dash_tab(lv_obj_t *tab)
{
    lv_obj_t *sht_card = make_card(tab, 370, 80);
    lv_obj_set_pos(sht_card, 5, 5);
    s_dash_sht = make_value_label(sht_card, "SHT4x  temperature / humidity");

    lv_obj_t *dps_card = make_card(tab, 370, 80);
    lv_obj_set_pos(dps_card, 5, 90);
    s_dash_dps = make_value_label(dps_card, "DPS368  pressure / temperature");

    lv_obj_t *bmi_card = make_card(tab, 370, 80);
    lv_obj_set_pos(bmi_card, 5, 175);
    s_dash_bmi = make_value_label(bmi_card, "BMI270  |acc| / |gyro|");

    lv_obj_t *bmm_card = make_card(tab, 370, 80);
    lv_obj_set_pos(bmm_card, 5, 260);
    s_dash_bmm = make_value_label(bmm_card, "BMM350  compass heading");

    lv_obj_t *counter_card = make_card(tab, 400, 170);
    lv_obj_set_pos(counter_card, 380, 5);
    lv_obj_t *hint = lv_label_create(counter_card);
    lv_label_set_text(hint, "Tap counter");
    lv_obj_set_style_text_color(hint, COLOR_MUTED, 0);
    lv_obj_set_style_text_font(hint, &lv_font_montserrat_14, 0);
    lv_obj_set_pos(hint, 0, 0);

    s_dash_counter = lv_label_create(counter_card);
    lv_label_set_text(s_dash_counter, "0");
    lv_obj_set_style_text_color(s_dash_counter, COLOR_ACCENT, 0);
    lv_obj_set_style_text_font(s_dash_counter, &lv_font_montserrat_40, 0);
    lv_obj_set_pos(s_dash_counter, 0, 24);

    lv_obj_t *tap_button = make_button(counter_card, "TAP", COLOR_BTN_BG,
                                       120, 60, counter_event);
    lv_obj_set_pos(tap_button, 250, 40);

    lv_obj_t *cam_note = make_card(tab, 400, 190);
    lv_obj_set_pos(cam_note, 380, 180);
    lv_obj_t *note = lv_label_create(cam_note);
    lv_label_set_text(note,
                      "Camera preview: CAMERA tab\n"
                      "WiFi setup:     WIFI tab\n"
                      "MQTT setup:     MQTT tab\n"
                      "Sensor JSON-lines on UART 115200");
    lv_obj_set_style_text_color(note, COLOR_MUTED, 0);
    lv_obj_set_style_text_font(note, &lv_font_montserrat_14, 0);
    lv_obj_set_pos(note, 0, 4);
}

/* ---- Camera tab --------------------------------------------------------- */

static void camera_ui_timer(lv_timer_t *timer)
{
    (void)timer;
    const uint32_t active_tab = lv_tabview_get_tab_active(s_tabview);
    if (WS_TAB_CAMERA == active_tab)
    {
        edge_camera_status_t status;
        (void)memset(&status, 0, sizeof(status));
        if (s_camera_ok && edge_camera_poll(s_cam_pixels, &status))
        {
            lv_obj_invalidate(s_cam_canvas);
            lv_label_set_text_fmt(s_cam_status,
                                  "OV7675 LIVE  320x240  %lu FPS",
                                  (unsigned long)status.fps);
        }
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

    lv_obj_t *hint = lv_label_create(tab);
    lv_label_set_text(hint, "No AI model: raw DVP stream only");
    lv_obj_set_style_text_color(hint, COLOR_MUTED, 0);
    lv_obj_set_pos(hint, 420, 20);
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
    lv_obj_t *btn = lv_event_get_target(event);
    const char *ssid = lv_event_get_user_data(event);
    (void)btn;
    if (NULL != ssid)
    {
        lv_textarea_set_text(s_wifi_ssid_ta, ssid);
    }
}

static void textarea_focus_event(lv_event_t *event)
{
    lv_obj_t *keyboard = lv_event_get_user_data(event);
    if (NULL != keyboard)
    {
        lv_keyboard_set_textarea(keyboard, lv_event_get_target(event));
    }
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

    s_wifi_keyboard = lv_keyboard_create(tab);
    lv_obj_set_size(s_wifi_keyboard, 786, 180);
    lv_obj_set_pos(s_wifi_keyboard, 5, 285);
    lv_keyboard_set_textarea(s_wifi_keyboard, s_wifi_ssid_ta);
    lv_obj_add_event_cb(s_wifi_ssid_ta, textarea_focus_event,
                        LV_EVENT_FOCUSED, s_wifi_keyboard);
    lv_obj_add_event_cb(s_wifi_pass_ta, textarea_focus_event,
                        LV_EVENT_FOCUSED, s_wifi_keyboard);
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

    s_mqtt_keyboard = lv_keyboard_create(tab);
    lv_obj_set_size(s_mqtt_keyboard, 786, 150);
    lv_obj_set_pos(s_mqtt_keyboard, 5, 285);
    lv_keyboard_set_textarea(s_mqtt_keyboard, s_mqtt_broker_ta);
    lv_obj_add_event_cb(s_mqtt_broker_ta, textarea_focus_event,
                        LV_EVENT_FOCUSED, s_mqtt_keyboard);
    lv_obj_add_event_cb(s_mqtt_port_ta, textarea_focus_event,
                        LV_EVENT_FOCUSED, s_mqtt_keyboard);
    lv_obj_add_event_cb(s_mqtt_node_ta, textarea_focus_event,
                        LV_EVENT_FOCUSED, s_mqtt_keyboard);
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
            (void)snprintf(line, sizeof(line), "%s  (%ld)", results[i].ssid,
                           (long)results[i].rssi);
            lv_obj_t *btn = lv_list_add_button(s_wifi_list, LV_SYMBOL_WIFI,
                                               line);
            lv_obj_add_event_cb(btn, network_clicked, LV_EVENT_CLICKED,
                                (void *)results[i].ssid);
        }
        ws_wifi_consume_scan_results();
    }

    fmt_x100(a, sizeof(a), s_snap.sht_temp_x100);
    fmt_x100(b, sizeof(b), s_snap.sht_hum_x100);
    lv_label_set_text_fmt(s_dash_sht, "%s C   %s %%RH", a, b);

    fmt_x100(a, sizeof(a), s_snap.dps_pressure_x100);
    fmt_x100(b, sizeof(b), s_snap.dps_temp_x100);
    lv_label_set_text_fmt(s_dash_dps, "%s hPa   %s C", a, b);

    fmt_x1000(a, sizeof(a), s_snap.bmi_acc_mgx1000);
    fmt_x100(b, sizeof(b), s_snap.bmi_gyr_x100);
    lv_label_set_text_fmt(s_dash_bmi, "%s g   %s dps", a, b);

    fmt_x10(a, sizeof(a), s_snap.mag_heading_x10);
    lv_label_set_text_fmt(s_dash_bmm, "%s deg", a);

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
    char acceleration[24], gyroscope[24], heading[24];

    s_sht4x_ok = (CY_RSLT_SUCCESS ==
                  sht4x_reader_init(&sensor_i2c_controller_hal_obj));
    s_dps368_ok = (CY_RSLT_SUCCESS ==
                   dps368_reader_init(&sensor_i2c_controller_hal_obj));
    s_bmi270_ok = (CY_RSLT_SUCCESS ==
                   bmi270_reader_init(&sensor_i2c_controller_hal_obj));
    s_bmm350_ok = (CY_RSLT_SUCCESS ==
                   bmm350_reader_init(CYBSP_I3C_CONTROLLER_HW,
                                      &CYBSP_I3C_CONTROLLER_context));

    printf("[SENSOR] init sht4x=%d dps368=%d bmi270=%d bmm350=%d\r\n",
           (int)s_sht4x_ok, (int)s_dps368_ok, (int)s_bmi270_ok,
           (int)s_bmm350_ok);

    for (;;)
    {
        vTaskDelay(pdMS_TO_TICKS(1000U));
        s_snap.seq++;

        sht4x_sample_t sht;
        if (s_sht4x_ok && sht4x_reader_poll(&sht))
        {
            s_snap.sht_temp_x100 = (int32_t)(sht.temperature_c * 100.0f);
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
            s_snap.dps_temp_x100 = (int32_t)(dps.temperature_c * 100.0f);
            printf("{\"sensor\":\"dps368\",\"p_hpax100\":%ld,\"t_cx100\":%ld,\"seq\":%lu}\r\n",
                   (long)s_snap.dps_pressure_x100, (long)s_snap.dps_temp_x100,
                   (unsigned long)s_snap.seq);
        }
        else if (!s_dps368_ok)
        {
            printf("{\"sensor\":\"dps368\",\"error\":\"init failed\"}\r\n");
        }

        bmi270_sample_t imu;
        if (s_bmi270_ok && bmi270_reader_poll(&imu))
        {
            s_snap.bmi_acc_mgx1000 = (int32_t)(imu.acc_mag_g * 1000.0f);
            s_snap.bmi_gyr_x100 = (int32_t)(imu.gyr_mag_dps * 100.0f);
            printf("{\"sensor\":\"bmi270\",\"acc_mgx1000\":%ld,\"gyr_dpsx100\":%ld,\"seq\":%lu}\r\n",
                   (long)s_snap.bmi_acc_mgx1000, (long)s_snap.bmi_gyr_x100,
                   (unsigned long)s_snap.seq);
        }
        else if (!s_bmi270_ok)
        {
            printf("{\"sensor\":\"bmi270\",\"error\":\"init failed\"}\r\n");
        }

        bmm350_sample_t mag;
        if (s_bmm350_ok && bmm350_reader_poll(&mag))
        {
            s_snap.mag_heading_x10 = (int32_t)(mag.heading_deg * 10.0f);
            printf("{\"sensor\":\"bmm350\",\"head_dgx10\":%ld,\"seq\":%lu}\r\n",
                   (long)s_snap.mag_heading_x10,
                   (unsigned long)s_snap.seq);
        }
        else if (!s_bmm350_ok)
        {
            printf("{\"sensor\":\"bmm350\",\"error\":\"init failed\"}\r\n");
        }

        fmt_x100(temperature, sizeof(temperature), s_snap.sht_temp_x100);
        fmt_x100(humidity, sizeof(humidity), s_snap.sht_hum_x100);
        fmt_x100(pressure, sizeof(pressure), s_snap.dps_pressure_x100);
        fmt_x1000(acceleration, sizeof(acceleration),
                  s_snap.bmi_acc_mgx1000);
        fmt_x100(gyroscope, sizeof(gyroscope), s_snap.bmi_gyr_x100);
        fmt_x10(heading, sizeof(heading), s_snap.mag_heading_x10);
        (void)snprintf(payload, sizeof(payload),
                       "{\"protocolVersion\":1,\"device_id\":\"%s\","
                       "\"node_id\":\"%s\",\"status\":\"online\","
                       "\"seq\":%lu,\"camera_ready\":%s,"
                       "\"environment\":{\"temperatureC\":%s,"
                       "\"humidityPct\":%s,\"pressureHpa\":%s},"
                       "\"imu\":{\"accelMagnitudeG\":%s,"
                       "\"gyroMagnitudeDps\":%s,\"headingDeg\":%s}}",
                       ws_mqtt_status()->node_id, ws_mqtt_status()->node_id,
                       (unsigned long)s_snap.seq, s_camera_ok ? "true" : "false",
                       temperature, humidity, pressure, acceleration, gyroscope,
                       heading);
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

    build_dash_tab(tab_dash);
    build_camera_tab(tab_cam);
    build_wifi_tab(tab_wifi);
    build_mqtt_tab(tab_mqtt);

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

    printf("[PRODUCTION] episode ready (camera=%d)\r\n", (int)s_camera_ok);
}
