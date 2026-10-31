/* EaseAI E84 room node (UI/network/AI on CM55; BLE on CM33 NS).
 *
 * 800x480 touchscreen, matching the "E84 Room Node Dashboard" design:
 *   Room       - older adults in room, safety status, light + air-con tiles
 *   Fall alert - full-screen red overlay with "Assistance completed"
 *   Smart home - room lights/switches and the air conditioner
 *   Settings   - theme (sun/moon), Wi-Fi, web server (MQTT), node id, room
 *
 * Talks to the WheelSense web over MQTT (ws_mqtt.c); contract in
 * .project/EASEAI_E84_ROOM_NODE_WEB_CONTRACT.md.
 */

#include "app_interface.h"

#include "edge_ai.h"
#include "edge_camera.h"
#include "ws_mqtt.h"
#include "ws_wifi.h"

#include "FreeRTOS.h"
#include "task.h"

#include "lvgl.h"

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* ---- palette ------------------------------------------------------------- */

typedef struct
{
    uint32_t bg, surface, surface2, border, divider;
    uint32_t text, text_soft, muted, faint;
    uint32_t nav_active, seg_bg, step_border;
    uint32_t info_bg, info_text, accent, on_accent;
    uint32_t warm_bg, warm_border, warm_text;
    uint32_t pill_on_bg, pill_on_text, pill_off_bg, pill_off_text, dot_off;
} ws_palette_t;

static const ws_palette_t PALETTE_DARK = {
    0x0E1116, 0x171C24, 0x202733, 0x2A3240, 0x222A36,
    0xEEF1F5, 0xC9D1DC, 0x9AA4B2, 0x5A6474,
    0x233044, 0x0E1116, 0x3A4454,
    0x12304A, 0x7CC2F8, 0x3DA5F4, 0x0E1116,
    0x2A2416, 0xF5A524, 0xF5A524,
    0x12304A, 0xCDE6FB, 0x3A2A12, 0xF8CF8A, 0xF5A524,
};

static const ws_palette_t PALETTE_LIGHT = {
    0xF4F6F9, 0xFFFFFF, 0xEEF1F5, 0xD9DEE6, 0xE3E7ED,
    0x141A22, 0x3A4454, 0x5B6573, 0xA0A9B5,
    0xE1ECF8, 0xEEF1F5, 0xC9D1DC,
    0xE1F0FC, 0x155E96, 0x1A6FB8, 0xFFFFFF,
    0xFFF4DE, 0xD98A00, 0x8A5A00,
    0xE1F0FC, 0x155E96, 0xFFF4DE, 0x8A5A00, 0xD98A00,
};

#define ALERT_RED     (0xB3261EU)
#define ALERT_SOFT    (0xFFE3E0U)
#define ALERT_BTN_TXT (0x8C1D18U)

static const ws_palette_t *s_pal = &PALETTE_DARK;
#define C(name) lv_color_hex(s_pal->name)

/* ---- layout -------------------------------------------------------------- */

#define SCREEN_W   (800)
#define SCREEN_H   (480)
#define HEADER_H   (56)
#define NAV_H      (72)
#define CONTENT_H  (SCREEN_H - HEADER_H - NAV_H)
#define INNER_W    (SCREEN_W - 32)
#define INNER_H    (CONTENT_H - 32)
#define BIG_SCALE  (512) /* 2x of Montserrat 40, the largest built-in size */

/* ---- app state ------------------------------------------------------------ */

typedef enum
{
    SCREEN_ROOM = 0,
    SCREEN_HOME,
    SCREEN_SETTINGS,
    SCREEN_WIFI,
    SCREEN_SERVER,
} ws_screen_t;

static const char *const SCREEN_NAMES[] = {"room", "home", "settings", "wifi",
                                           "server"};

#define ACK_SUPPRESS_MS   (15000U)
#define OVERRIDE_MS       (10000U)
#define TEMP_MIN          (16)
#define TEMP_MAX          (30)

static ws_screen_t s_screen = SCREEN_ROOM;
static bool s_dark = true;
static bool s_camera_ok;
static bool s_prev_fall_risk;
static ws_room_state_t s_room;
static uint32_t s_seen_version;
static uint32_t s_seen_alert_version;

static struct
{
    bool active;
    bool from_server;
    int32_t alert_id;
    TickType_t since;
    char fall_event_id[WS_MQTT_EVENT_ID_MAX_LEN];
} s_alert;

static bool s_has_ack;
static TickType_t s_ack_tick;
static int32_t s_acked_alert_id;

/* Optimistic smart-home changes, kept until the server confirms with a new
 * home_state or OVERRIDE_MS passes. */
static struct
{
    bool active;
    bool on;
    int16_t temperature;
    TickType_t until;
} s_override[WS_HOME_MAX_DEVICES];

CY_SECTION(".cy_gpu_buf") static LV_ATTRIBUTE_MEM_ALIGN uint16_t
    s_cam_pixels[EDGE_CAMERA_WIDTH * EDGE_CAMERA_HEIGHT];

/* ---- widgets -------------------------------------------------------------- */

static lv_obj_t *s_root;
static lv_obj_t *s_content;
static lv_obj_t *s_keyboard;
static lv_obj_t *s_room_label;
static lv_obj_t *s_pill;
static lv_obj_t *s_pill_dot;
static lv_obj_t *s_pill_label;
static lv_obj_t *s_wifi_icon;
static lv_obj_t *s_nav[3];
static lv_obj_t *s_alert_layer;
static lv_obj_t *s_alert_detail;
static lv_obj_t *s_alert_sub;

/* Per-screen widgets; cleared whenever the content area is rebuilt. */
static struct
{
    lv_obj_t *occupancy;
    lv_obj_t *people;
    lv_obj_t *occupancy_note;
    lv_obj_t *safety_sub;
    lv_obj_t *light_tile;
    lv_obj_t *light_state;
    lv_obj_t *ac_tile;
    lv_obj_t *ac_state;
    int8_t light_index;
    int8_t ac_index;

    lv_obj_t *home_rows[WS_HOME_MAX_DEVICES];
    lv_obj_t *home_row_state[WS_HOME_MAX_DEVICES];
    lv_obj_t *ac_power;
    lv_obj_t *ac_power_label;
    lv_obj_t *ac_minus;
    lv_obj_t *ac_plus;
    lv_obj_t *ac_temp;
    uint32_t layout_version;

    lv_obj_t *wifi_list;
    lv_obj_t *wifi_ssid;
    lv_obj_t *wifi_pass;
    lv_obj_t *wifi_status;

    lv_obj_t *broker;
    lv_obj_t *port;
    lv_obj_t *node;
    lv_obj_t *server_status;
} s_w;

static char s_wifi_ssid_rows[WS_WIFI_MAX_SCAN_RESULTS][WS_WIFI_SSID_MAX_LEN];

static void build_ui(void);
static void build_screen(ws_screen_t screen);
static void refresh(void);
static void go_screen_cb(void *p);

/* ---- small widget helpers -------------------------------------------------- */

static lv_obj_t *box(lv_obj_t *parent, int32_t x, int32_t y, int32_t w,
                     int32_t h)
{
    lv_obj_t *obj = lv_obj_create(parent);
    lv_obj_remove_style_all(obj);
    lv_obj_set_pos(obj, x, y);
    lv_obj_set_size(obj, w, h);
    lv_obj_remove_flag(obj, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(obj, LV_OBJ_FLAG_CLICKABLE);
    return obj;
}

static lv_obj_t *card(lv_obj_t *parent, int32_t x, int32_t y, int32_t w,
                      int32_t h)
{
    lv_obj_t *obj = box(parent, x, y, w, h);
    lv_obj_set_style_bg_opa(obj, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(obj, C(surface), 0);
    lv_obj_set_style_border_width(obj, 1, 0);
    lv_obj_set_style_border_color(obj, C(border), 0);
    lv_obj_set_style_radius(obj, 16, 0);
    return obj;
}

static lv_obj_t *text(lv_obj_t *parent, const char *str, const lv_font_t *font,
                      lv_color_t color)
{
    lv_obj_t *label = lv_label_create(parent);
    lv_label_set_text(label, str);
    lv_obj_set_style_text_font(label, font, 0);
    lv_obj_set_style_text_color(label, color, 0);
    return label;
}

static lv_obj_t *button(lv_obj_t *parent, int32_t x, int32_t y, int32_t w,
                        int32_t h, lv_event_cb_t cb, void *user_data)
{
    lv_obj_t *btn = lv_button_create(parent);
    lv_obj_remove_style_all(btn);
    lv_obj_set_pos(btn, x, y);
    lv_obj_set_size(btn, w, h);
    lv_obj_set_style_bg_opa(btn, LV_OPA_COVER, 0);
    lv_obj_set_style_radius(btn, 12, 0);
    lv_obj_set_style_opa(btn, LV_OPA_70, LV_STATE_PRESSED);
    lv_obj_set_style_opa(btn, LV_OPA_40, LV_STATE_DISABLED);
    lv_obj_remove_flag(btn, LV_OBJ_FLAG_SCROLLABLE);
    if (NULL != cb)
    {
        lv_obj_add_event_cb(btn, cb, LV_EVENT_CLICKED, user_data);
    }
    return btn;
}

static void style_tile(lv_obj_t *tile, bool on, bool warm)
{
    if (on)
    {
        lv_obj_set_style_bg_color(tile, warm ? C(warm_bg) : C(info_bg), 0);
        lv_obj_set_style_border_color(tile, warm ? C(warm_border) : C(accent), 0);
        lv_obj_set_style_text_color(tile, warm ? C(warm_text) : C(info_text), 0);
    }
    else
    {
        lv_obj_set_style_bg_color(tile, C(surface), 0);
        lv_obj_set_style_border_color(tile, C(border), 0);
        lv_obj_set_style_text_color(tile, C(muted), 0);
    }
    lv_obj_set_style_border_width(tile, 1, 0);
}

static void set_enabled(lv_obj_t *obj, bool enabled)
{
    if (NULL == obj)
    {
        return;
    }
    if (enabled)
    {
        lv_obj_remove_state(obj, LV_STATE_DISABLED);
    }
    else
    {
        lv_obj_add_state(obj, LV_STATE_DISABLED);
    }
}

static void style_textarea(lv_obj_t *ta)
{
    lv_obj_set_style_bg_color(ta, C(surface2), 0);
    lv_obj_set_style_text_color(ta, C(text), 0);
    lv_obj_set_style_border_color(ta, C(step_border), 0);
    lv_obj_set_style_border_color(ta, C(accent), LV_STATE_FOCUSED);
    lv_obj_set_style_text_font(ta, &lv_font_montserrat_16, 0);
    lv_obj_set_style_radius(ta, 10, 0);
}

/* Sun and moon drawn from primitives: Montserrat has no such glyphs. */
static const lv_point_precise_t SUN_RAYS[8][2] = {
    {{19, 12}, {22, 12}}, {{16.95f, 16.95f}, {19.07f, 19.07f}},
    {{12, 19}, {12, 22}}, {{7.05f, 16.95f}, {4.93f, 19.07f}},
    {{5, 12}, {2, 12}},   {{7.05f, 7.05f}, {4.93f, 4.93f}},
    {{12, 5}, {12, 2}},   {{16.95f, 7.05f}, {19.07f, 4.93f}},
};

static lv_obj_t *dot(lv_obj_t *parent, int32_t x, int32_t y, int32_t d,
                     lv_color_t color)
{
    lv_obj_t *obj = box(parent, x, y, d, d);
    lv_obj_set_style_radius(obj, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_opa(obj, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(obj, color, 0);
    return obj;
}

static void draw_sun(lv_obj_t *parent, lv_color_t color)
{
    lv_obj_t *icon = box(parent, 0, 0, 24, 24);
    lv_obj_center(icon);
    (void)dot(icon, 7, 7, 10, color);
    for (uint32_t i = 0U; i < 8U; i++)
    {
        lv_obj_t *ray = lv_line_create(icon);
        lv_line_set_points(ray, SUN_RAYS[i], 2U);
        lv_obj_set_style_line_width(ray, 2, 0);
        lv_obj_set_style_line_color(ray, color, 0);
        lv_obj_set_style_line_rounded(ray, true, 0);
    }
}

static void draw_moon(lv_obj_t *parent, lv_color_t color, lv_color_t bg)
{
    lv_obj_t *icon = box(parent, 0, 0, 24, 24);
    lv_obj_center(icon);
    (void)dot(icon, 3, 3, 18, color);
    (void)dot(icon, 10, -1, 16, bg); /* bite out of the disc: crescent */
}

/* Montserrat 40 scaled 2x around its top-left corner. */
static lv_obj_t *big_number(lv_obj_t *parent, const char *str, lv_color_t color)
{
    lv_obj_t *label = text(parent, str, &lv_font_montserrat_40, color);
    lv_obj_set_style_transform_scale(label, BIG_SCALE, 0);
    lv_obj_set_style_transform_pivot_x(label, 0, 0);
    lv_obj_set_style_transform_pivot_y(label, 0, 0);
    return label;
}

static int32_t big_width(lv_obj_t *label)
{
    lv_obj_update_layout(label);
    return (lv_obj_get_width(label) * BIG_SCALE) / 256;
}

/* ---- smart-home view model -------------------------------------------------- */

static bool online(void)
{
    return WS_MQTT_STATE_CONNECTED == ws_mqtt_status()->state;
}

static bool device_on(uint8_t i)
{
    return s_override[i].active ? s_override[i].on : s_room.home[i].on;
}

static int16_t device_temperature(uint8_t i)
{
    int16_t t = s_override[i].active ? s_override[i].temperature
                                     : s_room.home[i].temperature;
    return (0 == t) ? 25 : t;
}

static int8_t find_device(bool climate)
{
    for (uint8_t i = 0U; i < s_room.home_count; i++)
    {
        if ((WS_HOME_CLIMATE == s_room.home[i].type) == climate)
        {
            return (int8_t)i;
        }
    }
    return -1;
}

static void send_home_command(uint8_t i, const char *action, int16_t temperature)
{
    char id[WS_MQTT_EVENT_ID_MAX_LEN];
    char payload[WS_MQTT_EVENT_MAX_LEN];
    ws_mqtt_next_event_id(id, sizeof(id));
    if (0 == strcmp(action, "set_temperature"))
    {
        (void)snprintf(payload, sizeof(payload),
                       "{\"event_id\":\"%s\",\"type\":\"home_command\","
                       "\"smart_device_id\":%ld,\"action\":\"%s\","
                       "\"parameters\":{\"temperature\":%d}}",
                       id, (long)s_room.home[i].id, action, (int)temperature);
    }
    else
    {
        (void)snprintf(payload, sizeof(payload),
                       "{\"event_id\":\"%s\",\"type\":\"home_command\","
                       "\"smart_device_id\":%ld,\"action\":\"%s\"}",
                       id, (long)s_room.home[i].id, action);
    }
    (void)ws_mqtt_send_event(payload);
}

static void set_override(uint8_t i, bool on, int16_t temperature)
{
    s_override[i].active = true;
    s_override[i].on = on;
    s_override[i].temperature = temperature;
    s_override[i].until = xTaskGetTickCount() + pdMS_TO_TICKS(OVERRIDE_MS);
}

static void toggle_device_event(lv_event_t *e)
{
    const int32_t i = (int32_t)(intptr_t)lv_event_get_user_data(e);
    if ((i < 0) || (i >= (int32_t)s_room.home_count) || !online())
    {
        return;
    }
    const bool on = !device_on((uint8_t)i);
    send_home_command((uint8_t)i, on ? "turn_on" : "turn_off", 0);
    set_override((uint8_t)i, on, device_temperature((uint8_t)i));
    refresh();
}

static void temperature_event(lv_event_t *e)
{
    const int32_t delta = (int32_t)(intptr_t)lv_event_get_user_data(e);
    const int8_t i = find_device(true);
    if ((i < 0) || !online())
    {
        return;
    }
    int16_t t = (int16_t)(device_temperature((uint8_t)i) + delta);
    t = (t < TEMP_MIN) ? TEMP_MIN : ((t > TEMP_MAX) ? TEMP_MAX : t);
    send_home_command((uint8_t)i, "set_temperature", t);
    set_override((uint8_t)i, device_on((uint8_t)i), t);
    refresh();
}

/* ---- alert ---------------------------------------------------------------- */

static void show_alert_layer(bool visible)
{
    if (visible)
    {
        if (NULL != s_keyboard)
        {
            lv_obj_add_flag(s_keyboard, LV_OBJ_FLAG_HIDDEN);
        }
        lv_obj_remove_flag(s_alert_layer, LV_OBJ_FLAG_HIDDEN);
        lv_obj_move_foreground(s_alert_layer);
    }
    else
    {
        lv_obj_add_flag(s_alert_layer, LV_OBJ_FLAG_HIDDEN);
    }
}

/* source: "edge_ai" or "test" for a local detection, NULL for a server alert. */
static void start_alert(const char *source, int32_t alert_id)
{
    s_alert.active = true;
    s_alert.from_server = (NULL == source);
    s_alert.alert_id = alert_id;
    s_alert.since = xTaskGetTickCount();
    s_alert.fall_event_id[0] = '\0';

    if (NULL != source)
    {
        char payload[WS_MQTT_EVENT_MAX_LEN];
        ws_mqtt_next_event_id(s_alert.fall_event_id,
                              sizeof(s_alert.fall_event_id));
        (void)snprintf(payload, sizeof(payload),
                       "{\"event_id\":\"%s\",\"type\":\"fall_detected\","
                       "\"source\":\"%s\",\"sitting_confidence_pct\":%u}",
                       s_alert.fall_event_id, source,
                       (unsigned)edge_ai_status()->sitting_percent);
        (void)ws_mqtt_send_event(payload);
    }
    printf("[ROOM] fall alert (%s) id=%ld\r\n",
           (NULL != source) ? source : "server", (long)alert_id);
    show_alert_layer(true);
}

static void end_alert(bool acknowledged_here)
{
    if (acknowledged_here)
    {
        char id[WS_MQTT_EVENT_ID_MAX_LEN];
        char payload[WS_MQTT_EVENT_MAX_LEN];
        ws_mqtt_next_event_id(id, sizeof(id));
        (void)snprintf(payload, sizeof(payload),
                       "{\"event_id\":\"%s\",\"type\":\"alert_ack\","
                       "\"alert_id\":%ld,\"fall_event_id\":\"%s\"}",
                       id, (long)s_alert.alert_id, s_alert.fall_event_id);
        (void)ws_mqtt_send_event(payload);
        s_has_ack = true;
        s_ack_tick = xTaskGetTickCount();
        s_acked_alert_id = s_alert.alert_id;
        printf("[ROOM] assistance completed\r\n");
    }
    s_alert.active = false;
    show_alert_layer(false);
}

static void acknowledge_event(lv_event_t *e)
{
    (void)e;
    end_alert(true);
    refresh();
}

static void test_alert_event(lv_event_t *e)
{
    (void)e;
    if (!s_alert.active)
    {
        start_alert("test", 0);
        refresh();
    }
}

/* Applies a new server alert command. */
static void apply_server_alert(void)
{
    const TickType_t now = xTaskGetTickCount();
    if (s_room.alert_active)
    {
        /* Ignore the server re-announcing an alert we just closed here: it
         * may not have processed our alert_ack yet. */
        const bool recently_acked =
            s_has_ack && ((now - s_ack_tick) < pdMS_TO_TICKS(ACK_SUPPRESS_MS));
        if ((s_room.alert_id == s_acked_alert_id) ||
            (recently_acked && (0 == s_acked_alert_id)))
        {
            s_acked_alert_id = s_room.alert_id;
            return;
        }
        if (s_alert.active)
        {
            s_alert.alert_id = s_room.alert_id; /* server id for our alert */
        }
        else
        {
            start_alert(NULL, s_room.alert_id);
        }
    }
    else if (s_alert.active)
    {
        end_alert(false); /* resolved on the web */
    }
}

/* ---- header / nav / overlay ------------------------------------------------ */

static void go_screen_cb(void *p)
{
    build_screen((ws_screen_t)(uintptr_t)p);
}

static void nav_event(lv_event_t *e)
{
    lv_async_call(go_screen_cb, lv_event_get_user_data(e));
}

static void build_header(void)
{
    lv_obj_t *header = box(s_root, 0, 0, SCREEN_W, HEADER_H);
    lv_obj_t *divider = box(header, 0, HEADER_H - 1, SCREEN_W, 1);
    lv_obj_set_style_bg_opa(divider, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(divider, C(divider), 0);

    lv_obj_t *title = box(header, 16, 0, LV_SIZE_CONTENT, HEADER_H - 1);
    lv_obj_set_flex_flow(title, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(title, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER,
                          LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(title, 12, 0);
    s_room_label = text(title, "Room", &lv_font_montserrat_20, C(text));
    (void)text(title, "Room node " LV_SYMBOL_BULLET " E84",
               &lv_font_montserrat_14, C(muted));

    s_wifi_icon = text(header, LV_SYMBOL_WIFI, &lv_font_montserrat_20, C(muted));
    lv_obj_align(s_wifi_icon, LV_ALIGN_RIGHT_MID, -16, 0);

    s_pill = box(header, 0, 0, LV_SIZE_CONTENT, 32);
    lv_obj_set_style_radius(s_pill, 16, 0);
    lv_obj_set_style_bg_opa(s_pill, LV_OPA_COVER, 0);
    lv_obj_set_style_pad_hor(s_pill, 12, 0);
    lv_obj_set_flex_flow(s_pill, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(s_pill, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER,
                          LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(s_pill, 8, 0);
    s_pill_dot = dot(s_pill, 0, 0, 8, C(accent));
    s_pill_label = text(s_pill, "Offline", &lv_font_montserrat_14, C(text));
    lv_obj_align(s_pill, LV_ALIGN_RIGHT_MID, -52, 0);
}

static void build_nav(void)
{
    static const char *const labels[3] = {
        LV_SYMBOL_EYE_OPEN "  Room",
        LV_SYMBOL_HOME "  Smart home",
        LV_SYMBOL_SETTINGS "  Settings",
    };
    lv_obj_t *nav = box(s_root, 0, SCREEN_H - NAV_H, SCREEN_W, NAV_H);
    lv_obj_t *divider = box(nav, 0, 0, SCREEN_W, 1);
    lv_obj_set_style_bg_opa(divider, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(divider, C(divider), 0);

    for (uint32_t i = 0U; i < 3U; i++)
    {
        s_nav[i] = button(nav, 16 + (int32_t)i * 258, 8, 250, 56, nav_event,
                          (void *)(uintptr_t)i);
        lv_obj_t *label = text(s_nav[i], labels[i], &lv_font_montserrat_16,
                               C(muted));
        lv_obj_center(label);
    }
}

static void build_alert_layer(void)
{
    s_alert_layer = box(s_root, 0, 0, SCREEN_W, SCREEN_H);
    lv_obj_add_flag(s_alert_layer, LV_OBJ_FLAG_CLICKABLE); /* block taps below */
    lv_obj_set_style_bg_opa(s_alert_layer, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(s_alert_layer, lv_color_hex(ALERT_RED), 0);
    lv_obj_set_flex_flow(s_alert_layer, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(s_alert_layer, LV_FLEX_ALIGN_CENTER,
                          LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_row(s_alert_layer, 14, 0);

    lv_obj_t *badge = dot(s_alert_layer, 0, 0, 96, lv_color_hex(0xFFFFFF));
    lv_obj_t *icon = text(badge, LV_SYMBOL_WARNING, &lv_font_montserrat_40,
                          lv_color_hex(ALERT_RED));
    lv_obj_center(icon);

    (void)text(s_alert_layer, "FALL DETECTED", &lv_font_montserrat_40,
               lv_color_hex(0xFFFFFF));
    s_alert_detail = text(s_alert_layer, "", &lv_font_montserrat_20,
                          lv_color_hex(0xFFFFFF));
    s_alert_sub = text(s_alert_layer, "", &lv_font_montserrat_16,
                       lv_color_hex(ALERT_SOFT));

    lv_obj_t *ack = button(s_alert_layer, 0, 0, 520, 76, acknowledge_event, NULL);
    lv_obj_set_style_bg_color(ack, lv_color_hex(0xFFFFFF), 0);
    lv_obj_set_style_radius(ack, 16, 0);
    lv_obj_t *ack_label = text(ack, LV_SYMBOL_OK "  Assistance completed",
                               &lv_font_montserrat_24,
                               lv_color_hex(ALERT_BTN_TXT));
    lv_obj_center(ack_label);

    (void)text(s_alert_layer, "Press after you have helped the resident",
               &lv_font_montserrat_14, lv_color_hex(ALERT_SOFT));

    lv_obj_add_flag(s_alert_layer, LV_OBJ_FLAG_HIDDEN);
}

static void keyboard_close_event(lv_event_t *e)
{
    (void)e;
    lv_keyboard_set_textarea(s_keyboard, NULL);
    lv_obj_add_flag(s_keyboard, LV_OBJ_FLAG_HIDDEN);
}

static void textarea_focus_event(lv_event_t *e)
{
    lv_keyboard_set_textarea(s_keyboard, lv_event_get_target(e));
    lv_obj_remove_flag(s_keyboard, LV_OBJ_FLAG_HIDDEN);
    lv_obj_move_foreground(s_keyboard);
}

static void build_keyboard(void)
{
    s_keyboard = lv_keyboard_create(s_root);
    lv_obj_set_size(s_keyboard, SCREEN_W, 200);
    lv_obj_align(s_keyboard, LV_ALIGN_BOTTOM_MID, 0, 0);
    lv_obj_set_style_bg_color(s_keyboard, C(surface), 0);
    lv_obj_set_style_border_width(s_keyboard, 0, 0);
    lv_obj_set_style_bg_color(s_keyboard, C(surface2), LV_PART_ITEMS);
    lv_obj_set_style_text_color(s_keyboard, C(text), LV_PART_ITEMS);
    lv_obj_add_event_cb(s_keyboard, keyboard_close_event, LV_EVENT_READY, NULL);
    lv_obj_add_event_cb(s_keyboard, keyboard_close_event, LV_EVENT_CANCEL, NULL);
    lv_obj_add_flag(s_keyboard, LV_OBJ_FLAG_HIDDEN);
}

static lv_obj_t *add_textarea(lv_obj_t *parent, int32_t x, int32_t y,
                              int32_t w, const char *value, bool password)
{
    lv_obj_t *ta = lv_textarea_create(parent);
    lv_obj_set_pos(ta, x, y);
    lv_obj_set_size(ta, w, 44);
    lv_textarea_set_one_line(ta, true);
    lv_textarea_set_password_mode(ta, password);
    lv_textarea_set_text(ta, value);
    style_textarea(ta);
    lv_obj_add_event_cb(ta, textarea_focus_event, LV_EVENT_FOCUSED, NULL);
    return ta;
}

/* ---- Room screen ------------------------------------------------------------ */

static lv_obj_t *build_tile(lv_obj_t *parent, int32_t x, const char *name,
                            int8_t index, lv_obj_t **state_label)
{
    lv_obj_t *tile = button(parent, x, 152, 159, 168, toggle_device_event,
                            (void *)(intptr_t)index);
    lv_obj_set_style_radius(tile, 16, 0);
    lv_obj_t *icon = text(tile, LV_SYMBOL_POWER, &lv_font_montserrat_24, C(muted));
    lv_obj_remove_local_style_prop(icon, LV_STYLE_TEXT_COLOR, 0); /* inherit */
    lv_obj_set_pos(icon, 18, 18);
    /* Both anchored to the bottom so a name that wraps grows upwards
     * instead of running into the On/Off line. */
    *state_label = text(tile, "", &lv_font_montserrat_14, C(muted));
    lv_obj_remove_local_style_prop(*state_label, LV_STYLE_TEXT_COLOR, 0);
    lv_obj_align(*state_label, LV_ALIGN_BOTTOM_LEFT, 18, -18);
    lv_obj_t *label = text(tile, name, &lv_font_montserrat_16, C(text));
    lv_label_set_long_mode(label, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(label, 125);
    lv_obj_align(label, LV_ALIGN_BOTTOM_LEFT, 18, -42);
    return tile;
}

static void build_room(void)
{
    lv_obj_t *left = card(s_content, 0, 0, 418, INNER_H);
    lv_obj_set_style_pad_all(left, 24, 0);
    (void)text(left, LV_SYMBOL_EYE_OPEN "  Older adults in room",
               &lv_font_montserrat_16, C(muted));
    s_w.occupancy = big_number(left, "--", C(text));
    lv_obj_set_pos(s_w.occupancy, 0, 56);
    s_w.people = text(left, "people", &lv_font_montserrat_28, C(text_soft));
    s_w.occupancy_note = text(left, "", &lv_font_montserrat_14, C(muted));
    lv_obj_align(s_w.occupancy_note, LV_ALIGN_BOTTOM_LEFT, 0, 0);

    lv_obj_t *status = card(s_content, 434, 0, 334, 136);
    lv_obj_set_style_pad_all(status, 20, 0);
    lv_obj_t *badge = dot(status, 0, 20, 56, C(info_bg));
    lv_obj_t *ok = text(badge, LV_SYMBOL_OK, &lv_font_montserrat_24, C(accent));
    lv_obj_center(ok);
    lv_obj_t *title = text(status, "All safe", &lv_font_montserrat_20, C(text));
    lv_obj_set_pos(title, 72, 22);
    s_w.safety_sub = text(status, "", &lv_font_montserrat_14, C(muted));
    lv_label_set_long_mode(s_w.safety_sub, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(s_w.safety_sub, 220);
    lv_obj_set_pos(s_w.safety_sub, 72, 52);

    s_w.layout_version = s_room.version;
    s_w.light_index = find_device(false);
    s_w.ac_index = find_device(true);
    s_w.light_tile = build_tile(
        s_content, 434,
        (s_w.light_index >= 0) ? s_room.home[s_w.light_index].name : "Light",
        s_w.light_index, &s_w.light_state);
    s_w.ac_tile = build_tile(
        s_content, 609,
        (s_w.ac_index >= 0) ? s_room.home[s_w.ac_index].name : "Air con",
        s_w.ac_index, &s_w.ac_state);
}

static void refresh_room(TickType_t now)
{
    if (s_room.version != s_w.layout_version)
    {
        s_w.layout_version = s_room.version;
        lv_async_call(go_screen_cb, (void *)(uintptr_t)SCREEN_ROOM);
        return;
    }
    if (s_room.occupancy >= 0)
    {
        lv_label_set_text_fmt(s_w.occupancy, "%d", (int)s_room.occupancy);
        lv_label_set_text(s_w.people, (1 == s_room.occupancy) ? "person" : "people");
        lv_label_set_text(s_w.occupancy_note, "From WheelSense room tracking");
    }
    else
    {
        lv_label_set_text(s_w.occupancy, "--");
        lv_label_set_text(s_w.people, "people");
        lv_label_set_text(s_w.occupancy_note,
                          online() ? "Waiting for the room count from the web"
                                   : "Room count needs the web connection");
    }
    lv_obj_set_pos(s_w.people, big_width(s_w.occupancy) + 14, 56 + 80 - 34 + 8);

    if (s_has_ack)
    {
        const uint32_t minutes = (uint32_t)((now - s_ack_tick) /
                                            pdMS_TO_TICKS(60000U));
        char when[24];
        if (0U == minutes)
        {
            (void)snprintf(when, sizeof(when), "just now");
        }
        else
        {
            (void)snprintf(when, sizeof(when), "%lu min ago",
                           (unsigned long)minutes);
        }
        lv_label_set_text_fmt(s_w.safety_sub, "Assisted %s " LV_SYMBOL_BULLET " %s",
                              when, online() ? "logged to web"
                                             : "will sync when online");
        lv_obj_set_style_text_color(s_w.safety_sub, C(info_text), 0);
    }
    else
    {
        lv_label_set_text(s_w.safety_sub, "No falls detected since start-up");
    }

    const bool web = online();
    if (s_w.light_index >= 0)
    {
        const bool on = device_on((uint8_t)s_w.light_index);
        style_tile(s_w.light_tile, on, true);
        lv_label_set_text(s_w.light_state, on ? "On" : "Off");
    }
    else
    {
        style_tile(s_w.light_tile, false, true);
        lv_label_set_text(s_w.light_state, "Not set up");
    }
    set_enabled(s_w.light_tile, web && (s_w.light_index >= 0));

    if (s_w.ac_index >= 0)
    {
        const bool on = device_on((uint8_t)s_w.ac_index);
        style_tile(s_w.ac_tile, on, false);
        if (on)
        {
            lv_label_set_text_fmt(s_w.ac_state, "On " LV_SYMBOL_BULLET " %d\xC2\xB0" "C",
                                  (int)device_temperature((uint8_t)s_w.ac_index));
        }
        else
        {
            lv_label_set_text(s_w.ac_state, "Off");
        }
    }
    else
    {
        style_tile(s_w.ac_tile, false, false);
        lv_label_set_text(s_w.ac_state, "Not set up");
    }
    set_enabled(s_w.ac_tile, web && (s_w.ac_index >= 0));
}

/* ---- Smart home screen ------------------------------------------------------- */

static void build_home(void)
{
    s_w.layout_version = s_room.version;
    if (!s_room.home_received || (0U == s_room.home_count))
    {
        lv_obj_t *empty = card(s_content, 0, 0, INNER_W, INNER_H);
        lv_obj_t *msg = text(empty,
                             s_room.home_received
                                 ? "No smart devices are assigned to this room yet."
                                 : "Smart-home devices appear here once the web\n"
                                   "sends this room's lights and air conditioner.",
                             &lv_font_montserrat_20, C(muted));
        lv_obj_set_style_text_align(msg, LV_TEXT_ALIGN_CENTER, 0);
        lv_obj_center(msg);
        return;
    }

    uint8_t switches[WS_HOME_MAX_DEVICES];
    uint8_t n = 0U;
    for (uint8_t i = 0U; i < s_room.home_count; i++)
    {
        if (WS_HOME_CLIMATE != s_room.home[i].type)
        {
            switches[n++] = i;
        }
    }
    const int8_t ac = find_device(true);
    const int32_t left_w = (ac >= 0) ? 290 : INNER_W;

    if (n > 0U)
    {
        const int32_t row_h = (INNER_H - 16 * ((int32_t)n - 1)) / (int32_t)n;
        for (uint8_t k = 0U; k < n; k++)
        {
            const uint8_t i = switches[k];
            lv_obj_t *row = button(s_content, 0, (int32_t)k * (row_h + 16),
                                   left_w, row_h, toggle_device_event,
                                   (void *)(intptr_t)i);
            lv_obj_set_style_radius(row, 16, 0);
            lv_obj_t *icon = text(row, LV_SYMBOL_POWER, &lv_font_montserrat_28,
                                  C(muted));
            lv_obj_remove_local_style_prop(icon, LV_STYLE_TEXT_COLOR, 0);
            lv_obj_align(icon, LV_ALIGN_LEFT_MID, 24, 0);
            lv_obj_t *name = text(row, s_room.home[i].name,
                                  &lv_font_montserrat_20, C(text));
            lv_label_set_long_mode(name, LV_LABEL_LONG_DOT);
            /* One line high so LONG_DOT truncates instead of wrapping. */
            lv_obj_set_size(name, left_w - 90,
                            lv_font_get_line_height(&lv_font_montserrat_20));
            lv_obj_align(name, LV_ALIGN_LEFT_MID, 72, -12);
            s_w.home_row_state[i] = text(row, "", &lv_font_montserrat_14, C(muted));
            lv_obj_remove_local_style_prop(s_w.home_row_state[i],
                                           LV_STYLE_TEXT_COLOR, 0);
            lv_obj_align(s_w.home_row_state[i], LV_ALIGN_LEFT_MID, 72, 14);
            s_w.home_rows[i] = row;
        }
    }

    if (ac >= 0)
    {
        const int32_t x = (n > 0U) ? 306 : 0;
        const int32_t w = INNER_W - x;
        lv_obj_t *panel = card(s_content, x, 0, w, INNER_H);
        lv_obj_set_style_pad_hor(panel, 24, 0);
        lv_obj_set_style_pad_ver(panel, 20, 0);
        lv_obj_t *name = text(panel, s_room.home[ac].name, &lv_font_montserrat_20,
                              C(text));
        lv_label_set_long_mode(name, LV_LABEL_LONG_DOT);
        lv_obj_set_width(name, w - 160);

        s_w.ac_power = button(panel, w - 48 - 88, 0, 88, 44, toggle_device_event,
                              (void *)(intptr_t)ac);
        lv_obj_set_style_radius(s_w.ac_power, 22, 0);
        s_w.ac_power_label = text(s_w.ac_power, "", &lv_font_montserrat_16,
                                  C(text));
        lv_obj_center(s_w.ac_power_label);

        const int32_t mid = (w - 48) / 2;
        s_w.ac_minus = button(panel, mid - 150, 96, 64, 64, temperature_event,
                              (void *)(intptr_t)-1);
        s_w.ac_plus = button(panel, mid + 86, 96, 64, 64, temperature_event,
                             (void *)(intptr_t)1);
        lv_obj_t *minus = text(s_w.ac_minus, LV_SYMBOL_MINUS,
                               &lv_font_montserrat_24, C(text));
        lv_obj_center(minus);
        lv_obj_t *plus = text(s_w.ac_plus, LV_SYMBOL_PLUS,
                              &lv_font_montserrat_24, C(text));
        lv_obj_center(plus);
        lv_obj_t *steppers[2] = {s_w.ac_minus, s_w.ac_plus};
        for (uint32_t k = 0U; k < 2U; k++)
        {
            lv_obj_set_style_radius(steppers[k], LV_RADIUS_CIRCLE, 0);
            lv_obj_set_style_bg_color(steppers[k], C(surface2), 0);
            lv_obj_set_style_border_width(steppers[k], 1, 0);
            lv_obj_set_style_border_color(steppers[k], C(step_border), 0);
        }

        /* Scaled around its own centre and aligned to the stepper row's
         * centre, so it stays centred between - and + whatever the text. */
        s_w.ac_temp = big_number(panel, "25\xC2\xB0", C(text));
        lv_obj_set_style_transform_pivot_x(s_w.ac_temp, LV_PCT(50), 0);
        lv_obj_set_style_transform_pivot_y(s_w.ac_temp, LV_PCT(50), 0);
        lv_obj_align(s_w.ac_temp, LV_ALIGN_TOP_MID, 0, 128 - 24);
        lv_obj_t *caption = text(panel, "Set temperature", &lv_font_montserrat_14,
                                 C(muted));
        lv_obj_align(caption, LV_ALIGN_TOP_MID, 0, 186);
    }
}

static void refresh_home(void)
{
    if (s_room.version != s_w.layout_version)
    {
        /* Device list may have changed. Rebuild outside any widget event. */
        s_w.layout_version = s_room.version;
        lv_async_call(go_screen_cb, (void *)(uintptr_t)SCREEN_HOME);
        return;
    }
    const bool web = online();
    for (uint8_t i = 0U; i < WS_HOME_MAX_DEVICES; i++)
    {
        if (NULL == s_w.home_rows[i])
        {
            continue;
        }
        const bool on = device_on(i);
        style_tile(s_w.home_rows[i], on, true);
        lv_label_set_text(s_w.home_row_state[i], on ? "On" : "Off");
        set_enabled(s_w.home_rows[i], web);
    }

    const int8_t ac = find_device(true);
    if ((ac >= 0) && (NULL != s_w.ac_temp))
    {
        const bool on = device_on((uint8_t)ac);
        lv_label_set_text(s_w.ac_power_label, on ? "On" : "Off");
        if (on)
        {
            lv_obj_set_style_bg_color(s_w.ac_power, C(accent), 0);
            lv_obj_set_style_border_width(s_w.ac_power, 0, 0);
            lv_obj_set_style_text_color(s_w.ac_power_label, C(on_accent), 0);
        }
        else
        {
            lv_obj_set_style_bg_color(s_w.ac_power, C(surface), 0);
            lv_obj_set_style_border_width(s_w.ac_power, 1, 0);
            lv_obj_set_style_border_color(s_w.ac_power, C(step_border), 0);
            lv_obj_set_style_text_color(s_w.ac_power_label, C(muted), 0);
        }
        lv_label_set_text_fmt(s_w.ac_temp, "%d\xC2\xB0",
                              (int)device_temperature((uint8_t)ac));
        lv_obj_set_style_text_color(s_w.ac_temp, on ? C(text) : C(faint), 0);
        set_enabled(s_w.ac_power, web);
        set_enabled(s_w.ac_minus, web);
        set_enabled(s_w.ac_plus, web);
    }
}

/* ---- Settings screens -------------------------------------------------------- */

static void theme_event(lv_event_t *e);

static lv_obj_t *settings_row(lv_obj_t *parent, int32_t y, const char *label,
                              const char *value, ws_screen_t target, bool last)
{
    lv_obj_t *row = (SCREEN_SETTINGS == target)
                        ? box(parent, 0, y, INNER_W - 2, 63)
                        : button(parent, 0, y, INNER_W - 2, 63, nav_event,
                                 (void *)(uintptr_t)target);
    lv_obj_set_style_bg_opa(row, LV_OPA_TRANSP, 0);
    lv_obj_set_style_radius(row, 0, 0);
    lv_obj_t *name = text(row, label, &lv_font_montserrat_16, C(text));
    lv_obj_align(name, LV_ALIGN_LEFT_MID, 24, 0);
    if (NULL != value)
    {
        char buf[96];
        (void)snprintf(buf, sizeof(buf), "%s%s", value,
                       (SCREEN_SETTINGS == target) ? "" : "  " LV_SYMBOL_RIGHT);
        lv_obj_t *v = text(row, buf, &lv_font_montserrat_16, C(muted));
        lv_obj_align(v, LV_ALIGN_RIGHT_MID, -24, 0);
    }
    if (!last)
    {
        lv_obj_t *line = box(parent, 0, y + 63, INNER_W - 2, 1);
        lv_obj_set_style_bg_opa(line, LV_OPA_COVER, 0);
        lv_obj_set_style_bg_color(line, C(border), 0);
    }
    return row;
}

static void build_settings(void)
{
    const ws_mqtt_status_t *mqtt = ws_mqtt_status();
    const ws_wifi_status_t *wifi = ws_wifi_status();
    char server[WS_MQTT_HOST_MAX_LEN + 8];
    (void)snprintf(server, sizeof(server), "%s:%u", mqtt->broker,
                   (unsigned)mqtt->port);

    lv_obj_t *panel = card(s_content, 0, 0, INNER_W, INNER_H);

    lv_obj_t *theme = settings_row(panel, 0, "Theme", NULL, SCREEN_SETTINGS,
                                   false);
    lv_obj_t *seg = box(theme, 0, 0, 132, 44);
    lv_obj_set_style_bg_opa(seg, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(seg, C(seg_bg), 0);
    lv_obj_set_style_radius(seg, 10, 0);
    lv_obj_align(seg, LV_ALIGN_RIGHT_MID, -24, 0);
    for (uint32_t k = 0U; k < 2U; k++)
    {
        const bool dark_button = (1U == k);
        const bool selected = (dark_button == s_dark);
        lv_obj_t *b = button(seg, (int32_t)k * 68, 0, 64, 44, theme_event,
                             (void *)(uintptr_t)dark_button);
        lv_obj_set_style_radius(b, 10, 0);
        lv_obj_set_style_bg_color(b, selected ? C(nav_active) : C(seg_bg), 0);
        const lv_color_t fg = selected ? C(text) : C(muted);
        if (dark_button)
        {
            draw_moon(b, fg, selected ? C(nav_active) : C(seg_bg));
        }
        else
        {
            draw_sun(b, fg);
        }
    }

    (void)settings_row(panel, 64, "Wi-Fi",
                       (WS_WIFI_STATE_CONNECTED == wifi->state) ? wifi->joined_ssid
                                                                : "Not connected",
                       SCREEN_WIFI, false);
    (void)settings_row(panel, 128, "Web server (MQTT)", server, SCREEN_SERVER,
                       false);
    (void)settings_row(panel, 192, "Node ID", mqtt->node_id, SCREEN_SERVER, false);
    (void)settings_row(panel, 256, "Room name",
                       ('\0' != s_room.room_name[0]) ? s_room.room_name
                                                     : "Not assigned yet",
                       SCREEN_SETTINGS, true);
}

static void build_subpage_header(const char *title)
{
    lv_obj_t *back = button(s_content, 0, 0, 132, 40, nav_event,
                            (void *)(uintptr_t)SCREEN_SETTINGS);
    lv_obj_set_style_bg_color(back, C(surface2), 0);
    lv_obj_t *label = text(back, LV_SYMBOL_LEFT "  Settings",
                           &lv_font_montserrat_16, C(text));
    lv_obj_center(label);
    lv_obj_t *t = text(s_content, title, &lv_font_montserrat_20, C(text));
    lv_obj_set_pos(t, 152, 8);
}

static void scan_event(lv_event_t *e)
{
    (void)e;
    lv_obj_clean(s_w.wifi_list);
    lv_label_set_text(s_w.wifi_status, "Scanning...");
    ws_wifi_request_scan();
}

static void connect_event(lv_event_t *e)
{
    (void)e;
    lv_label_set_text(s_w.wifi_status, "Joining...");
    ws_wifi_request_join(lv_textarea_get_text(s_w.wifi_ssid),
                         lv_textarea_get_text(s_w.wifi_pass));
}

static void network_clicked(lv_event_t *e)
{
    const char *ssid = lv_event_get_user_data(e);
    if (NULL != ssid)
    {
        lv_textarea_set_text(s_w.wifi_ssid, ssid);
    }
}

static void build_wifi(void)
{
    build_subpage_header("Wi-Fi");

    lv_obj_t *list_card = card(s_content, 0, 52, 360, INNER_H - 52);
    lv_obj_set_style_pad_all(list_card, 12, 0);
    lv_obj_t *scan = button(list_card, 0, 0, 120, 40, scan_event, NULL);
    lv_obj_set_style_bg_color(scan, C(surface2), 0);
    lv_obj_t *scan_label = text(scan, LV_SYMBOL_REFRESH "  Scan",
                                &lv_font_montserrat_16, C(text));
    lv_obj_center(scan_label);
    s_w.wifi_list = lv_list_create(list_card);
    lv_obj_set_pos(s_w.wifi_list, 0, 48);
    lv_obj_set_size(s_w.wifi_list, 334, INNER_H - 52 - 24 - 48);
    lv_obj_set_style_bg_color(s_w.wifi_list, C(surface2), 0);
    lv_obj_set_style_border_width(s_w.wifi_list, 0, 0);

    lv_obj_t *form = card(s_content, 376, 52, INNER_W - 376, INNER_H - 52);
    lv_obj_set_style_pad_all(form, 12, 0);
    const int32_t fw = INNER_W - 376 - 26;
    (void)text(form, "Network name", &lv_font_montserrat_14, C(muted));
    s_w.wifi_ssid = add_textarea(form, 0, 20, fw, ws_wifi_status()->joined_ssid,
                                 false);
    lv_obj_t *pl = text(form, "Password", &lv_font_montserrat_14, C(muted));
    lv_obj_set_pos(pl, 0, 72);
    s_w.wifi_pass = add_textarea(form, 0, 92, fw, "", true);
    lv_obj_t *join = button(form, 0, 148, 160, 44, connect_event, NULL);
    lv_obj_set_style_bg_color(join, C(accent), 0);
    lv_obj_t *join_label = text(join, "Connect", &lv_font_montserrat_16,
                                C(on_accent));
    lv_obj_center(join_label);
    s_w.wifi_status = text(form, "", &lv_font_montserrat_14, C(muted));
    lv_label_set_long_mode(s_w.wifi_status, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(s_w.wifi_status, fw - 176);
    lv_obj_set_pos(s_w.wifi_status, 176, 150);
}

static void refresh_wifi(void)
{
    const ws_wifi_status_t *wifi = ws_wifi_status();
    if ((WS_WIFI_STATE_CONNECTED == wifi->state) && (0U != wifi->ip_addr))
    {
        lv_label_set_text_fmt(s_w.wifi_status, "Connected to %s\n%lu.%lu.%lu.%lu",
                              wifi->joined_ssid,
                              (unsigned long)((wifi->ip_addr >> 24) & 0xFFU),
                              (unsigned long)((wifi->ip_addr >> 16) & 0xFFU),
                              (unsigned long)((wifi->ip_addr >> 8) & 0xFFU),
                              (unsigned long)(wifi->ip_addr & 0xFFU));
    }
    else if (WS_WIFI_STATE_ERROR == wifi->state)
    {
        lv_label_set_text(s_w.wifi_status,
                          "Could not connect. Check the password and try again.");
    }

    if (wifi->scan_done)
    {
        const ws_wifi_scan_result_t *results = ws_wifi_scan_results();
        for (uint8_t i = 0U; i < wifi->scan_count; i++)
        {
            char line[48];
            (void)snprintf(s_wifi_ssid_rows[i], sizeof(s_wifi_ssid_rows[i]),
                           "%s", results[i].ssid);
            (void)snprintf(line, sizeof(line), "%s  (%ld dBm)", results[i].ssid,
                           (long)results[i].rssi);
            lv_obj_t *row = lv_list_add_button(s_w.wifi_list, LV_SYMBOL_WIFI,
                                               line);
            lv_obj_set_style_bg_color(row, C(surface2), 0);
            lv_obj_set_style_text_color(row, C(text), 0);
            lv_obj_add_event_cb(row, network_clicked, LV_EVENT_CLICKED,
                                s_wifi_ssid_rows[i]);
        }
        lv_label_set_text_fmt(s_w.wifi_status, "Found %u networks",
                              (unsigned)wifi->scan_count);
        ws_wifi_consume_scan_results();
    }
}

static void server_apply_event(lv_event_t *e)
{
    (void)e;
    uint16_t port = (uint16_t)atoi(lv_textarea_get_text(s_w.port));
    ws_mqtt_apply(lv_textarea_get_text(s_w.broker), (0U == port) ? 1883U : port,
                  lv_textarea_get_text(s_w.node));
    lv_label_set_text(s_w.server_status, "Reconnecting...");
}

static void build_server(void)
{
    const ws_mqtt_status_t *mqtt = ws_mqtt_status();
    char port[8];
    (void)snprintf(port, sizeof(port), "%u", (unsigned)mqtt->port);

    build_subpage_header("Web server (MQTT)");
    lv_obj_t *form = card(s_content, 0, 52, INNER_W, INNER_H - 52);
    lv_obj_set_style_pad_all(form, 12, 0);

    (void)text(form, "Broker address", &lv_font_montserrat_14, C(muted));
    s_w.broker = add_textarea(form, 0, 20, 440, mqtt->broker, false);
    lv_obj_t *pl = text(form, "Port", &lv_font_montserrat_14, C(muted));
    lv_obj_set_pos(pl, 456, 0);
    s_w.port = add_textarea(form, 456, 20, 120, port, false);
    lv_textarea_set_accepted_chars(s_w.port, "0123456789");
    lv_obj_t *nl = text(form, "Node ID", &lv_font_montserrat_14, C(muted));
    lv_obj_set_pos(nl, 592, 0);
    s_w.node = add_textarea(form, 592, 20, INNER_W - 26 - 592, mqtt->node_id,
                            false);

    lv_obj_t *apply = button(form, 0, 80, 220, 48, server_apply_event, NULL);
    lv_obj_set_style_bg_color(apply, C(accent), 0);
    lv_obj_t *apply_label = text(apply, "Save and reconnect",
                                 &lv_font_montserrat_16, C(on_accent));
    lv_obj_center(apply_label);

    lv_obj_t *test = button(form, 236, 80, 220, 48, test_alert_event, NULL);
    lv_obj_set_style_bg_color(test, C(surface2), 0);
    lv_obj_set_style_border_width(test, 1, 0);
    lv_obj_set_style_border_color(test, C(step_border), 0);
    lv_obj_t *test_label = text(test, LV_SYMBOL_WARNING "  Send test alert",
                                &lv_font_montserrat_16, C(text));
    lv_obj_center(test_label);

    s_w.server_status = text(form, "", &lv_font_montserrat_14, C(muted));
    lv_label_set_long_mode(s_w.server_status, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(s_w.server_status, INNER_W - 26);
    lv_obj_set_pos(s_w.server_status, 0, 144);
}

static void refresh_server(void)
{
    const ws_mqtt_status_t *mqtt = ws_mqtt_status();
    const char *state =
        (WS_MQTT_STATE_CONNECTED == mqtt->state)  ? "Connected" :
        (WS_MQTT_STATE_CONNECTING == mqtt->state) ? "Connecting..." :
        (WS_MQTT_STATE_ERROR == mqtt->state)      ? "Could not reach the broker, retrying" :
        (WS_WIFI_STATE_CONNECTED == ws_wifi_status()->state) ? "Waiting to connect"
                                                             : "Waiting for Wi-Fi";
    lv_label_set_text_fmt(s_w.server_status,
                          "%s to %s:%u\nSent %lu messages, %lu failed.\n"
                          "Topics: WheelSense/camera/%s/...",
                          state, mqtt->broker, (unsigned)mqtt->port,
                          (unsigned long)mqtt->pub_count,
                          (unsigned long)mqtt->err_count, mqtt->node_id);
}

/* ---- screen switching ---------------------------------------------------------- */

static void build_screen(ws_screen_t screen)
{
    s_screen = screen;
    lv_obj_clean(s_content);
    (void)memset(&s_w, 0, sizeof(s_w));
    s_w.light_index = -1;
    s_w.ac_index = -1;
    lv_keyboard_set_textarea(s_keyboard, NULL);
    lv_obj_add_flag(s_keyboard, LV_OBJ_FLAG_HIDDEN);

    switch (screen)
    {
        case SCREEN_ROOM:     build_room();     break;
        case SCREEN_HOME:     build_home();     break;
        case SCREEN_SETTINGS: build_settings(); break;
        case SCREEN_WIFI:     build_wifi();     break;
        case SCREEN_SERVER:   build_server();   break;
        default:              build_room();     break;
    }

    const uint32_t active = (screen >= SCREEN_SETTINGS) ? 2U : (uint32_t)screen;
    for (uint32_t i = 0U; i < 3U; i++)
    {
        const bool on = (i == active);
        lv_obj_set_style_bg_color(s_nav[i], on ? C(nav_active) : C(bg), 0);
        lv_obj_t *label = lv_obj_get_child(s_nav[i], 0);
        lv_obj_set_style_text_color(label, on ? C(text) : C(muted), 0);
    }
    refresh();
}

static void rebuild_cb(void *p)
{
    (void)p;
    lv_obj_t *old = s_root;
    build_ui();
    lv_obj_delete(old);
}

static void theme_event(lv_event_t *e)
{
    const bool dark = (0U != (uintptr_t)lv_event_get_user_data(e));
    if (dark != s_dark)
    {
        s_dark = dark;
        s_pal = dark ? &PALETTE_DARK : &PALETTE_LIGHT;
        lv_async_call(rebuild_cb, NULL); /* this button is deleted by the rebuild */
    }
}

/* ---- periodic refresh ------------------------------------------------------------ */

static void refresh_header(void)
{
    const ws_mqtt_state_t state = ws_mqtt_status()->state;
    const bool wifi_up = (WS_WIFI_STATE_CONNECTED == ws_wifi_status()->state);
    const bool connected = (WS_MQTT_STATE_CONNECTED == state);
    const bool connecting = wifi_up && (WS_MQTT_STATE_CONNECTING == state);

    lv_label_set_text(s_room_label, ('\0' != s_room.room_name[0])
                                        ? s_room.room_name
                                        : "Room not assigned");
    lv_label_set_text(s_pill_label, connected ? "Web connected" :
                                    connecting ? "Connecting" : "Offline");
    lv_obj_set_style_bg_color(s_pill, connected ? C(pill_on_bg) : C(pill_off_bg), 0);
    lv_obj_set_style_text_color(s_pill_label,
                                connected ? C(pill_on_text) : C(pill_off_text), 0);
    lv_obj_set_style_bg_color(s_pill_dot, connected ? C(accent) : C(dot_off), 0);
    lv_obj_set_style_text_color(s_wifi_icon, wifi_up ? C(muted) : C(faint), 0);
}

static void refresh_alert(TickType_t now)
{
    if (!s_alert.active)
    {
        return;
    }
    const uint32_t seconds = (uint32_t)((now - s_alert.since) / pdMS_TO_TICKS(1000U));
    lv_label_set_text_fmt(s_alert_detail, "%s  " LV_SYMBOL_BULLET "  %lu:%02lu ago",
                          ('\0' != s_room.room_name[0]) ? s_room.room_name : "This room",
                          (unsigned long)(seconds / 60U),
                          (unsigned long)(seconds % 60U));
    lv_label_set_text(s_alert_sub,
                      s_alert.from_server ? "Alert from the WheelSense web dashboard" :
                      online() ? "Alert sent to the web dashboard and caregivers"
                               : "Offline: the alert will be sent when the connection returns");
}

static void refresh(void)
{
    const TickType_t now = xTaskGetTickCount();

    ws_mqtt_get_room(&s_room);
    if (s_room.version != s_seen_version)
    {
        s_seen_version = s_room.version;
        (void)memset(s_override, 0, sizeof(s_override)); /* server confirmed */
    }
    for (uint32_t i = 0U; i < WS_HOME_MAX_DEVICES; i++)
    {
        if (s_override[i].active && ((int32_t)(now - s_override[i].until) >= 0))
        {
            s_override[i].active = false; /* no confirmation: revert */
        }
    }
    if (s_room.alert_version != s_seen_alert_version)
    {
        s_seen_alert_version = s_room.alert_version;
        apply_server_alert();
    }

    const edge_ai_status_t *ai = edge_ai_status();
    if (ai->fall_risk && !s_prev_fall_risk && !s_alert.active)
    {
        start_alert("edge_ai", 0);
    }
    s_prev_fall_risk = ai->fall_risk;

    refresh_header();
    refresh_alert(now);
    switch (s_screen)
    {
        case SCREEN_ROOM:   refresh_room(now); break;
        case SCREEN_HOME:   refresh_home();    break;
        case SCREEN_WIFI:   refresh_wifi();    break;
        case SCREEN_SERVER: refresh_server();  break;
        default:                               break;
    }

    ws_mqtt_set_ui_state(s_alert.active, s_alert.alert_id,
                         SCREEN_NAMES[s_screen], s_dark);
}

static void refresh_timer(lv_timer_t *timer)
{
    (void)timer;
    refresh();
}

/* Camera frames feed the sitting-posture model once per second. */
static void camera_timer(lv_timer_t *timer)
{
    (void)timer;
    static TickType_t last_ai_submit = 0U;
    edge_camera_status_t status;
    if (s_camera_ok && edge_camera_poll(s_cam_pixels, &status))
    {
        const TickType_t now = xTaskGetTickCount();
        if ((now - last_ai_submit) >= pdMS_TO_TICKS(1000U))
        {
            edge_ai_submit_frame(s_cam_pixels);
            last_ai_submit = now;
        }
    }
}

/* ---- entry ------------------------------------------------------------------------ */

static void build_ui(void)
{
    s_root = box(lv_screen_active(), 0, 0, SCREEN_W, SCREEN_H);
    lv_obj_set_style_bg_opa(s_root, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(s_root, C(bg), 0);
    lv_obj_set_style_text_font(s_root, &lv_font_montserrat_16, 0);
    lv_obj_set_style_text_color(s_root, C(text), 0);

    build_header();
    s_content = box(s_root, 0, HEADER_H, SCREEN_W, CONTENT_H);
    lv_obj_set_style_pad_all(s_content, 16, 0);
    build_nav();
    build_alert_layer();
    build_keyboard();

    build_screen(s_screen);
    if (s_alert.active)
    {
        show_alert_layer(true);
    }
}

void example_main(lv_obj_t *parent)
{
    lv_obj_set_style_bg_color(parent, lv_color_hex(PALETTE_DARK.bg), 0);
    lv_obj_set_style_bg_opa(parent, LV_OPA_COVER, 0);
    lv_obj_set_style_pad_all(parent, 0, 0);

    s_camera_ok = edge_camera_init();
    const bool edge_ai_started = edge_ai_start();

    (void)ws_wifi_start();
    (void)ws_mqtt_start();
    ws_mqtt_set_camera_ready(s_camera_ok);

    build_ui();

    lv_timer_create(refresh_timer, 1000U, NULL);
    lv_timer_create(camera_timer, 100U, NULL);

    printf("[ROOM] room node ready (camera=%d edge_ai=%d)\r\n",
           (int)s_camera_ok, (int)edge_ai_started);
}
