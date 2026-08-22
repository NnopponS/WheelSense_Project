#include "ws_node_contract.h"

#include <ctype.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

typedef struct
{
    const char *cursor;
    const char *end;
} ws_json_reader_t;

static void ws_json_skip_space(ws_json_reader_t *reader)
{
    while (reader->cursor < reader->end && isspace((unsigned char)*reader->cursor)) {
        reader->cursor++;
    }
}

static bool ws_json_string(ws_json_reader_t *reader, char *output, size_t capacity)
{
    size_t used = 0u;
    if (reader->cursor >= reader->end || *reader->cursor++ != '"') return false;

    while (reader->cursor < reader->end) {
        unsigned char ch = (unsigned char)*reader->cursor++;
        if (ch == '"') {
            if (capacity > 0u) output[used] = '\0';
            return true;
        }
        if (ch < 0x20u) return false;
        if (ch == '\\') {
            if (reader->cursor >= reader->end) return false;
            ch = (unsigned char)*reader->cursor++;
            if (ch == 'n') ch = '\n';
            else if (ch == 'r') ch = '\r';
            else if (ch == 't') ch = '\t';
            else if (ch != '"' && ch != '\\' && ch != '/') return false;
        }
        if (used + 1u >= capacity) return false;
        output[used++] = (char)ch;
    }
    return false;
}

static bool ws_json_uint32(ws_json_reader_t *reader, uint32_t *value)
{
    uint64_t next = 0u;
    const char *start = reader->cursor;
    while (reader->cursor < reader->end && isdigit((unsigned char)*reader->cursor)) {
        next = (next * 10u) + (uint64_t)(*reader->cursor++ - '0');
        if (next > UINT32_MAX) return false;
    }
    if (reader->cursor == start) return false;
    *value = (uint32_t)next;
    return true;
}

static bool ws_json_skip_value(ws_json_reader_t *reader)
{
    if (reader->cursor >= reader->end) return false;
    if (*reader->cursor == '"') {
        reader->cursor++;
        while (reader->cursor < reader->end) {
            const char ch = *reader->cursor++;
            if (ch == '"') return true;
            if (ch == '\\') {
                if (reader->cursor >= reader->end) return false;
                reader->cursor++;
            } else if ((unsigned char)ch < 0x20u) {
                return false;
            }
        }
        return false;
    }
    const char *start = reader->cursor;
    while (reader->cursor < reader->end && *reader->cursor != ',' &&
           *reader->cursor != '}') {
        reader->cursor++;
    }
    return reader->cursor > start;
}

static ws_node_command_type_t ws_node_command_type(const char *command)
{
    if (strcmp(command, "start_stream") == 0) return WS_NODE_COMMAND_START_STREAM;
    if (strcmp(command, "stop_stream") == 0) return WS_NODE_COMMAND_STOP_STREAM;
    if (strcmp(command, "capture") == 0 || strcmp(command, "capture_frame") == 0 ||
        strcmp(command, "snapshot") == 0) return WS_NODE_COMMAND_CAPTURE;
    if (strcmp(command, "set_resolution") == 0) return WS_NODE_COMMAND_SET_RESOLUTION;
    if (strcmp(command, "reboot") == 0) return WS_NODE_COMMAND_REBOOT;
    if (strcmp(command, "enter_config_mode") == 0) return WS_NODE_COMMAND_ENTER_CONFIG;
    if (strcmp(command, "assign_task") == 0) return WS_NODE_COMMAND_ASSIGN_TASK;
    return WS_NODE_COMMAND_NONE;
}

ws_status_t ws_node_parse_control(const char *json, size_t length,
                                  ws_node_command_t *command)
{
    if (json == NULL || length == 0u || command == NULL) return WS_STATUS_INVALID_SAMPLE;
    ws_node_command_t next = {0};
    ws_json_reader_t reader = {json, json + length};
    bool have_command = false;

    ws_json_skip_space(&reader);
    if (reader.cursor >= reader.end || *reader.cursor++ != '{') return WS_STATUS_INVALID_SAMPLE;
    for (;;) {
        char key[32];
        ws_json_skip_space(&reader);
        if (reader.cursor < reader.end && *reader.cursor == '}') {
            reader.cursor++;
            break;
        }
        if (!ws_json_string(&reader, key, sizeof(key))) return WS_STATUS_INVALID_SAMPLE;
        ws_json_skip_space(&reader);
        if (reader.cursor >= reader.end || *reader.cursor++ != ':') return WS_STATUS_INVALID_SAMPLE;
        ws_json_skip_space(&reader);

        if (strcmp(key, "command") == 0 || strcmp(key, "cmd") == 0) {
            if (have_command || !ws_json_string(&reader, next.command, sizeof(next.command)))
                return WS_STATUS_INVALID_SAMPLE;
            have_command = true;
        } else if (strcmp(key, "command_id") == 0) {
            if (!ws_json_string(&reader, next.command_id, sizeof(next.command_id)))
                return WS_STATUS_INVALID_SAMPLE;
        } else if (strcmp(key, "interval_ms") == 0) {
            if (!ws_json_uint32(&reader, &next.interval_ms)) return WS_STATUS_INVALID_SAMPLE;
        } else if (strcmp(key, "resolution") == 0) {
            if (!ws_json_string(&reader, next.resolution, sizeof(next.resolution)))
                return WS_STATUS_INVALID_SAMPLE;
        } else if (strcmp(key, "task_id") == 0) {
            if (!ws_json_string(&reader, next.task_id, sizeof(next.task_id)))
                return WS_STATUS_INVALID_SAMPLE;
        } else if (strcmp(key, "task_title") == 0) {
            if (!ws_json_string(&reader, next.task_title, sizeof(next.task_title)))
                return WS_STATUS_INVALID_SAMPLE;
        } else if (strcmp(key, "room_name") == 0) {
            if (!ws_json_string(&reader, next.room_name, sizeof(next.room_name)))
                return WS_STATUS_INVALID_SAMPLE;
        } else if (strcmp(key, "caregiver_name") == 0) {
            if (!ws_json_string(&reader, next.caregiver_name, sizeof(next.caregiver_name)))
                return WS_STATUS_INVALID_SAMPLE;
        } else if (!ws_json_skip_value(&reader)) {
            return WS_STATUS_INVALID_SAMPLE;
        }

        ws_json_skip_space(&reader);
        if (reader.cursor < reader.end && *reader.cursor == ',') {
            reader.cursor++;
            continue;
        }
        if (reader.cursor < reader.end && *reader.cursor == '}') {
            reader.cursor++;
            break;
        }
        return WS_STATUS_INVALID_SAMPLE;
    }
    ws_json_skip_space(&reader);
    if (reader.cursor != reader.end || !have_command) return WS_STATUS_INVALID_SAMPLE;

    next.type = ws_node_command_type(next.command);
    if (next.type == WS_NODE_COMMAND_NONE) return WS_STATUS_UNSUPPORTED;
    if (next.type == WS_NODE_COMMAND_START_STREAM && next.interval_ms == 0u) next.interval_ms = 200u;
    if (next.type == WS_NODE_COMMAND_START_STREAM &&
        (next.interval_ms < 100u || next.interval_ms > 60000u)) return WS_STATUS_INVALID_SAMPLE;
    if (next.type == WS_NODE_COMMAND_SET_RESOLUTION &&
        strcmp(next.resolution, "QVGA") != 0 && strcmp(next.resolution, "VGA") != 0 &&
        strcmp(next.resolution, "SVGA") != 0 && strcmp(next.resolution, "XGA") != 0)
        return WS_STATUS_INVALID_SAMPLE;
    if (next.type == WS_NODE_COMMAND_ASSIGN_TASK &&
        (next.task_id[0] == '\0' || next.task_title[0] == '\0' ||
         next.room_name[0] == '\0' || next.caregiver_name[0] == '\0'))
        return WS_STATUS_INVALID_SAMPLE;

    *command = next;
    return WS_STATUS_READY;
}

static size_t ws_json_escape(char *output, size_t capacity, const char *value)
{
    size_t used = 0u;
    if (output == NULL || value == NULL) return 0u;
    for (; *value != '\0'; value++) {
        const unsigned char ch = (unsigned char)*value;
        if (ch < 0x20u) return 0u;
        if (ch == '"' || ch == '\\') {
            if (used + 2u >= capacity) return 0u;
            output[used++] = '\\';
        } else if (used + 1u >= capacity) {
            return 0u;
        }
        output[used++] = (char)ch;
    }
    if (used >= capacity) return 0u;
    output[used] = '\0';
    return used;
}

static bool ws_copy_escaped(char *output, size_t capacity, const char *value)
{
    const char *text = value == NULL ? "" : value;
    if (text[0] == '\0') {
        if (output == NULL || capacity == 0u) return false;
        output[0] = '\0';
        return true;
    }
    return ws_json_escape(output, capacity, text) > 0u;
}

size_t ws_node_format_registration(char *output, size_t capacity,
                                   const char *device_id, const char *node_id,
                                   const char *ip_address, const char *firmware,
                                   const char *ble_mac)
{
    char did[96], nid[96], ip[96], fw[48], mac[48];
    if (output == NULL || capacity == 0u || device_id == NULL || device_id[0] == '\0' ||
        node_id == NULL || node_id[0] == '\0' || firmware == NULL || firmware[0] == '\0')
        return 0u;
    if (!ws_copy_escaped(did, sizeof(did), device_id) ||
        !ws_copy_escaped(nid, sizeof(nid), node_id) ||
        !ws_copy_escaped(ip, sizeof(ip), ip_address) ||
        !ws_copy_escaped(fw, sizeof(fw), firmware)) return 0u;
    const bool have_mac = ble_mac != NULL && ble_mac[0] != '\0';
    if (have_mac && !ws_copy_escaped(mac, sizeof(mac), ble_mac)) return 0u;

    const int count = snprintf(output, capacity,
        "{\"type\":\"device_registration\",\"device_id\":\"%s\",\"node_id\":\"%s\","
        "\"device_type\":\"camera\",\"hardware_type\":\"node\",\"ip_address\":\"%s\","
        "\"firmware\":\"%s\"%s%s%s}", did, nid, ip, fw,
        have_mac ? ",\"ble_mac\":\"" : "", have_mac ? mac : "", have_mac ? "\"" : "");
    return count > 0 && (size_t)count < capacity ? (size_t)count : 0u;
}

size_t ws_node_format_status(char *output, size_t capacity,
                             const ws_node_status_snapshot_t *status)
{
    if (output == NULL || capacity == 0u || status == NULL || status->device_id == NULL ||
        status->device_id[0] == '\0' || status->node_id == NULL || status->node_id[0] == '\0' ||
        status->firmware == NULL || status->firmware[0] == '\0' ||
        !isfinite(status->temperature_c) ||
        !isfinite(status->humidity_pct) || !isfinite(status->pressure_hpa) ||
        status->humidity_pct < 0.0f || status->humidity_pct > 100.0f) return 0u;
    char did[96], nid[96], ip[96], fw[48], mac[48];
    if (!ws_copy_escaped(did, sizeof(did), status->device_id) ||
        !ws_copy_escaped(nid, sizeof(nid), status->node_id) ||
        !ws_copy_escaped(ip, sizeof(ip), status->ip_address) ||
        !ws_copy_escaped(fw, sizeof(fw), status->firmware)) return 0u;
    const bool have_mac = status->ble_mac != NULL && status->ble_mac[0] != '\0';
    if (have_mac && !ws_copy_escaped(mac, sizeof(mac), status->ble_mac)) return 0u;

    const int count = snprintf(output, capacity,
        "{\"type\":\"status\",\"protocolVersion\":1,\"device_id\":\"%s\",\"node_id\":\"%s\","
        "\"device_type\":\"camera\",\"hardware_type\":\"node\",\"status\":\"%s\","
        "\"ip_address\":\"%s\",\"rssi\":%ld,\"uptime_s\":%lu,\"firmware\":\"%s\","
        "\"timestampUs\":%llu,\"stream_enabled\":false,\"frames_captured\":0,"
        "\"battery_available\":false,\"wifi_connected\":%s,\"mqtt_connected\":%s,"
        "\"ble_ready\":%s,\"camera_ready\":%s,\"provisioning\":%s,"
        "\"environment\":{\"temperatureC\":%.2f,\"humidityPct\":%.2f,"
        "\"pressureHpa\":%.2f,\"validMask\":%lu}%s%s%s}",
        did, nid, status->mqtt_connected ? "online" : "offline", ip,
        (long)status->rssi, (unsigned long)status->uptime_s, fw,
        (unsigned long long)status->timestamp_us,
        status->wifi_connected ? "true" : "false",
        status->mqtt_connected ? "true" : "false",
        status->ble_ready ? "true" : "false",
        status->camera_ready ? "true" : "false",
        status->provisioning ? "true" : "false",
        (double)status->temperature_c, (double)status->humidity_pct,
        (double)status->pressure_hpa, (unsigned long)status->environment_valid_mask,
        have_mac ? ",\"ble_mac\":\"" : "", have_mac ? mac : "", have_mac ? "\"" : "");
    return count > 0 && (size_t)count < capacity ? (size_t)count : 0u;
}

size_t ws_node_format_ack(char *output, size_t capacity,
                          const char *device_id, const char *command_id,
                          const char *command, const char *status,
                          const char *message, const char *task_id,
                          uint64_t timestamp_ms)
{
    char did[96], cid[136], cmd[64], stat[32], msg[160], tid[96];
    if (output == NULL || capacity == 0u || device_id == NULL || device_id[0] == '\0' ||
        command == NULL || command[0] == '\0' || status == NULL || status[0] == '\0')
        return 0u;
    if (!ws_copy_escaped(did, sizeof(did), device_id) ||
        !ws_copy_escaped(cid, sizeof(cid), command_id) ||
        !ws_copy_escaped(cmd, sizeof(cmd), command) ||
        !ws_copy_escaped(stat, sizeof(stat), status) ||
        !ws_copy_escaped(msg, sizeof(msg), message)) return 0u;
    const bool have_task = task_id != NULL && task_id[0] != '\0';
    if (have_task && !ws_copy_escaped(tid, sizeof(tid), task_id)) return 0u;

    const int count = snprintf(output, capacity,
        "{\"command_id\":\"%s\",\"device_id\":\"%s\",\"command\":\"%s\","
        "\"status\":\"%s\",\"message\":\"%s\",\"timestamp_ms\":%llu%s%s%s}",
        cid, did, cmd, stat, msg, (unsigned long long)timestamp_ms,
        have_task ? ",\"task_id\":\"" : "", have_task ? tid : "", have_task ? "\"" : "");
    return count > 0 && (size_t)count < capacity ? (size_t)count : 0u;
}
