/*******************************************************************************
* File Name        : initd.c
*
* Description      : Sets up filesystem,protocol, network (Wi-Fi/TSP/HTTP/UPnP),
*                    USB, and shell services at system startup.
*
* Related Document: See README.md
*
*******************************************************************************
* (c) 2026, Infineon Technologies AG, or an affiliate of Infineon
* Technologies AG. All rights reserved.
* This software, associated documentation and materials ("Software") is
* owned by Infineon Technologies AG or one of its affiliates ("Infineon")
* and is protected by and subject to worldwide patent protection, worldwide
* copyright laws, and international treaty provisions. Therefore, you may use
* this Software only as provided in the license agreement accompanying the
* software package from which you obtained this Software. If no license
* agreement applies, then any use, reproduction, modification, translation, or
* compilation of this Software is prohibited without the express written
* permission of Infineon.
*
* Disclaimer: UNLESS OTHERWISE EXPRESSLY AGREED WITH INFINEON, THIS SOFTWARE
* IS PROVIDED AS-IS, WITH NO WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
* INCLUDING, BUT NOT LIMITED TO, ALL WARRANTIES OF NON-INFRINGEMENT OF
* THIRD-PARTY RIGHTS AND IMPLIED WARRANTIES SUCH AS WARRANTIES OF FITNESS FOR A
* SPECIFIC USE/PURPOSE OR MERCHANTABILITY.
* Infineon reserves the right to make changes to the Software without notice.
* You are responsible for properly designing, programming, and testing the
* functionality and safety of your intended application of the Software, as
* well as complying with any legal requirements related to its use. Infineon
* does not guarantee that the Software will be free from intrusion, data theft
* or loss, or other breaches ("Security Breaches"), and Infineon shall have
* no liability arising out of any Security Breaches. Unless otherwise
* explicitly approved by Infineon, the Software may not be used in any
* application where a failure of the Product or any consequences of the use
* thereof can reasonably be expected to result in personal injury.
*******************************************************************************/

/*******************************************************************************
* Header Files
*******************************************************************************/
#include  "cybsp.h"
#include <string.h>
#include <stdlib.h>
#include <inttypes.h>
#include <cy_gpio.h>
#include <stdio.h>

/* RTOS header file */
#include <cyabs_rtos.h>
#include <FreeRTOS.h>
#include <task.h>

#include "protocol/protocol.h"
#include "build.h"
#include "common.h"
#include "ws_clock.h"
#include "board.h"
#include "system.h"
#include "initd.h"

#include "services.h"
#include "wifi_configs/im_config.h"
#include "usbd.h"
#include "services/ws_mqtt.h"
#include "ws_ui_state.h"

#define WS_NODE_FIRMWARE_VERSION "4.0.0"
#define WS_NODE_DEFAULT_MQTT      "broker.emqx.io"

static ws_ui_state_t ws_node_ui_state;

static void ws_node_command(const ws_node_command_t *command, void *context)
{
    ws_ui_state_t *state = (ws_ui_state_t *)context;
    if (command == NULL || state == NULL) return;

    switch (command->type) {
        case WS_NODE_COMMAND_ASSIGN_TASK:
            if (ws_ui_apply_task(state, command->task_id, command->task_title,
                                 command->room_name, command->caregiver_name) == WS_STATUS_READY) {
                (void)ws_mqtt_publish_ack(command->command_id, command->command, "ok",
                                          "task_displayed", command->task_id);
            } else {
                (void)ws_mqtt_publish_ack(command->command_id, command->command, "error",
                                          "invalid_task", command->task_id);
            }
            break;
        case WS_NODE_COMMAND_ENTER_CONFIG:
            ws_ui_set_provisioning(state, true);
            (void)ws_mqtt_publish_ack(command->command_id, command->command, "ok",
                                      "entering_config_mode", NULL);
            break;
        case WS_NODE_COMMAND_REBOOT:
            (void)ws_mqtt_publish_ack(command->command_id, command->command, "ok",
                                      "rebooting", NULL);
            vTaskDelay(pdMS_TO_TICKS(200u));
            NVIC_SystemReset();
            break;
        default:
            (void)ws_mqtt_publish_ack(command->command_id, command->command, "error",
                                      "camera_port_deferred", NULL);
            break;
    }
}

#if ((WS_FEATURE_ENVIRONMENT == 1) || (WS_FEATURE_TOUCH == 1) || \
     (WS_FEATURE_MICROPHONE == 1))
#define WS_SENSOR_POLL_STACK_SIZE (1024u)
#define WS_SENSOR_POLL_PRIORITY   (tskIDLE_PRIORITY + 1u)

static pb_ostream_t ws_sensor_sink = PB_OSTREAM_SIZING;

static void ws_sensor_poll_task(void *arg)
{
    protocol_t *protocol = (protocol_t *)arg;
    for (;;)
    {
        ws_sensor_sink.bytes_written = 0u;
        (void)protocol_call_device_poll(protocol, &ws_sensor_sink);
        vTaskDelay(pdMS_TO_TICKS(1u));
    }
}

static bool ws_sensor_start_devices(protocol_t *protocol)
{
    unsigned started = 0u;
    const unsigned expected =
        ((WS_FEATURE_ENVIRONMENT == 1) ? 2u : 0u) +
        ((WS_FEATURE_TOUCH == 1) ? 1u : 0u) +
        ((WS_FEATURE_MICROPHONE == 1) ? 1u : 0u);
    for (int i = 0; i < protocol->board.devices_count; ++i)
    {
        const char *name = protocol->board.devices[i].name;
        bool selected = false;
#if (WS_FEATURE_ENVIRONMENT == 1)
        selected = (strcmp(name, "DPS") == 0) || (strcmp(name, "SHT4X") == 0);
#endif
#if (WS_FEATURE_TOUCH == 1)
        selected = selected || (strcmp(name, "IMU") == 0);
#endif
#if (WS_FEATURE_MICROPHONE == 1)
        selected = selected || (strcmp(name, "Microphone") == 0);
#endif
        if (!selected)
        {
            continue;
        }

        device_manager_t *manager = &protocol->device_managers[i];
        if (manager->start == NULL)
        {
            return false;
        }
        manager->busy = &ws_sensor_sink;
        manager->start(protocol, i, &ws_sensor_sink, manager->arg);
        if (protocol->board.devices[i].status !=
            protocol_DeviceStatus_DEVICE_STATUS_ACTIVE)
        {
            manager->busy = NULL;
            return false;
        }
        ++started;
    }
    return started == expected;
}
#endif

#ifdef IM_ENABLE_NET
#include "net/wifi.h"
#include "net/tsp.h"
#endif

#ifdef IM_ENABLE_NET
#include "net/upnp.h"
#endif

#ifdef IM_ENABLE_HTTP
#include "net/http.h"
#endif

#ifdef IM_ENABLE_SHELL
#include "shell/commands.h"
#include "shell/debug_uart.h"
#include "shell/terminal.h"
#include "shell/process.h"
#include "shell/fs/fs.h"
#include "shell/fs/lfs_drv.h"

/*******************************************************************************
 * Global Variables
 ******************************************************************************/
extern volatile bool button_pressed;
/*Space for holding the boardname to be able to rename it.*/
char board_name[128];

/*******************************************************************************
* Function Name: debug_terminal_write
********************************************************************************
* Summary:
* This function writes data to the debug terminal.
*
* Parameters:
*  terminal - Pointer to the terminal structure
*  buf - Pointer to the data buffer
*  size - Size of the data to write
*
* Return:
*  Number of bytes written
*
*******************************************************************************/
static size_t debug_terminal_write(terminal_t* terminal, const void* buf, size_t size)
{
    return debug_uart_write((const void*)buf, size);
}

/*******************************************************************************
* Function Name: debug_shell_task
********************************************************************************
* Summary:
* This function initializes the debug shell task.
*
* Parameters:
*  arg - Pointer to the task argument
*
* Return:
*  None
*
*******************************************************************************/
static void debug_shell_task(void* arg)
{

    terminal_t* terminal = process_new_terminal(NULL, debug_terminal_write);
    debug_start_input_stream(terminal);

#if LESS_ANSI == 1
    terminal->attr &= ~(TERMINAL_ATTR_REDUCED_ANSI | TERMINAL_ATTR_INJECT_CR_BEFORE_LF);
#endif
    setvbuf(stdin, NULL, _IONBF, 0);
#if REQUIRE_PASSWORD_USB_UART == 1
    process_exec_command("login -u", EXEC_MODE_BLOCK);
#else
    process_exec_command("sh -i", EXEC_MODE_BLOCK);
#endif
    vTaskDelete(NULL);
}

/*******************************************************************************
* Function Name: initialize_filesystem
********************************************************************************
* Summary:
* This function initializes the filesystem.
*
* Parameters:
*  void
*
* Return:
*  None
*
*******************************************************************************/
void initialize_filesystem(void)
{
    bool do_factory_reset;

    /* Load file system driver */
    printf("Loading lfs driver.\n");
    lfs_load_driver();

    /* If true the flash will be formatted and default configuration files will be restored. */
    do_factory_reset = false;

    clock_tick_t start = clock_get_tick();

    while (Cy_GPIO_Read(CYBSP_USER_BTN_PORT, CYBSP_USER_BTN_NUM) == 0U)
    {
        if ((clock_get_tick() - start) > (CLOCK_TICK_PER_SECOND * 3))
        {
            log_message(LOG_LEVEL_INFO, "initd", "Factory reset button held for 3 seconds. A format will be performed, and the default configuration will be restored.");
            do_factory_reset = true;
            break;
        }
    }

    /* Clear any edge-triggered flag set during boot */
    button_pressed = false;

    /* Mount root filesystem */
    #ifdef USE_KIT_PSE84_HMI
    if (!do_factory_reset && (process_exec_command("mount -t lfs -o 33554432 /", EXEC_MODE_BLOCK) != 0))
    #else
    if (!do_factory_reset && (process_exec_command("mount -t lfs -o 10485760 /", EXEC_MODE_BLOCK) != 0))
    #endif
    {
        /* If mount failed, do a factory reset */
        do_factory_reset = true;
        log_message(LOG_LEVEL_INFO, "initd", "Failed to mount the filesystem. A format will be performed, and the default configuration will be restored.");
    }

    if (do_factory_reset)
    {
        log_message(LOG_LEVEL_INFO, "initd", "Formatting file system and restoring default configuration files.");

        /* If mount failed, re-initialize the the root drive */
    #ifdef USE_KIT_PSE84_HMI
        process_exec_command("format -t lfs -o 33554432 -y", EXEC_MODE_BLOCK);
        process_exec_command("mount -t lfs -o 33554432 /", EXEC_MODE_BLOCK);
    #else
        process_exec_command("format -t lfs -o 10485760 -y", EXEC_MODE_BLOCK);
        process_exec_command("mount -t lfs -o 10485760 /", EXEC_MODE_BLOCK);
    #endif

        /* Create system directory */
        process_exec_command("mkdir /system", EXEC_MODE_BLOCK);

        /* Create directory where all device configurations are saved with dsave command */
        process_exec_command("mkdir /system/devices", EXEC_MODE_BLOCK);

        /* Create directory where capture data is stored */
        process_exec_command("mkdir /data", EXEC_MODE_BLOCK);

        /* Explicitly remove the Wi-Fi credentials file so the device does not
           auto-connect to a previously configured network after factory reset. */
        process_exec_command("rm /system/wifi", EXEC_MODE_BLOCK);

        /* Startup script executed each system boot. May be edited by the user. */
        const char* default_boot_script =
            "# Startup script executed each system boot\n"
            "echo \"Running boot script\"\n"
            "\n"
            "# Sets the current log level for logging messages.\n"
            "loglevel info\n"
            "\n"
            "# Connect to last configured Wi-Fi\n"
            "sh -e -f /system/wifi\n"
            "\n"
            "# Restore last device configurations\n"
            "sh -e -d /system/devices\n";

        FILE* file = fopen("/system/boot", "w");
        fwrite(default_boot_script, sizeof(char), strlen(default_boot_script), file);
        fflush(file);
        fclose(file);

        /* Script executed when the network IP is acquired. May be edited by the user. */
        const char* default_net_up_script =
            "# Script executed when the network is up and an IP address has been acquired\n"
            "echo \"Running net-up script\"\n"
            "\n"
            "# Start HTTPS service (stop first to avoid conflicts, ignore errors)\n"
            "httpd stop || true\n"
            "httpd start -p 80\n"
            "\n"
            "# Start Tensor Streaming Protocol service (stop first to avoid conflicts, ignore errors)\n"
            "tspd stop || true\n"
            "tspd start -p 14325\n"
            "\n"
            "# Start UPnP service (stop first to avoid conflicts, ignore errors)\n"
            "upnpd stop || true\n"
            "upnpd start";

        file = fopen("/system/net-up", "w");
        fwrite(default_net_up_script, sizeof(char), strlen(default_net_up_script), file);
        fflush(file);
        fclose(file);

        /* Script executed when the network IP is down. May be edited by the user. */
        const char* default_net_down_script =
            "# Script executed when the network is down\n"
            "echo \"Running net-down script\"\n"
            "\n"
            "# Stop HTTPS service\n"
            "httpd stop\n"
            "\n"
            "# Stop Tensor Streaming Protocol service\n"
            "tspd stop\n"
            "\n"
            "# StopUPnP service\n"
            "upnpd stop";

        file = fopen("/system/net-down", "w");
        fwrite(default_net_down_script, sizeof(char), strlen(default_net_down_script), file);
        fflush(file);
        fclose(file);

        /* Script executed when a user login. May be edited by the user. */
        const char* default_login_script =
            "# Login script executed each login\n"
            "echo \"Welcome to Imagimob TSP Shell.\"\n"
            "version\n"
            "echo\n"
            "echo \"NOTE! If you are using USB then ignore the following Wi-Fi related command\"\n"
            "echo \"Type 'help' for list of commands.\"\n"
            "echo \"Configure Wi-Fi with command 'wifi setup'\"\n"
            "echo \"NOTE! Don't forget to change the default password with command 'passwd'\"";

        file = fopen("/system/login", "w");
        fwrite(default_login_script, sizeof(char), strlen(default_login_script), file);
        fflush(file);
        fclose(file);

        /* Default password (the password is 'imagimob') */
        const char* default_password = "33412abf7d047679b035f5c582053515";
        file = fopen("/system/password", "w");
        fwrite(default_password, sizeof(char), strlen(default_password), file);
        fflush(file);
        fclose(file);

        /* Unmount and remount the filesystem to ensure all changes are committed to flash */
        log_message(LOG_LEVEL_INFO, "initd", "Syncing filesystem to flash...");
        process_exec_command("umount /", EXEC_MODE_BLOCK);
    #ifdef USE_KIT_PSE84_HMI
        process_exec_command("mount -t lfs -o 33554432 /", EXEC_MODE_BLOCK);
    #else
        process_exec_command("mount -t lfs -o 10485760 /", EXEC_MODE_BLOCK);
    #endif

        log_message(LOG_LEVEL_INFO, "initd", "Filesystem sync complete.");

        printf("Done factory reset.\n");
    }
    else
    {
        printf("Factory reset not done.\n");
    }

    return;
}

#endif /* IM_ENABLE_SHELL */

#ifdef IM_ENABLE_NET
/*******************************************************************************
* Function Name: wifi_connected
********************************************************************************
* Summary:
* This function is called when the Wi-Fi has connected to an access point.
* It turns on the WiFi LED and executes the net-up script if the shell is enabled.
*
* Parameters:
*  wifi_t* wifi - Pointer to the Wi-Fi structure
*
* Return:
*  None
*
*******************************************************************************/
static void wifi_connected(wifi_t* wifi)
{
    /* Turn on Wi-Fi LED */
    set_led1(true);
    char ip_address[48] = {0};
    cy_nw_ntoa(&wifi->ip_addr, ip_address);
    ws_ui_apply_connectivity(&ws_node_ui_state, true,
                             ws_node_ui_state.ble_connected,
                             ws_node_ui_state.camera_ready);
    ws_mqtt_wifi_changed(true, ip_address);

#ifdef IM_ENABLE_SHELL
    /* If shell is enabled, run the /system/net-up script */
    process_exec_command("sh -e -f /system/net-up", EXEC_MODE_BLOCK);
#else
    /* If no shell is present fallback to start the TSP server anyway */
    tsp_t* tsp = SYS_SERVICE_TSP();
    tsp_start(tsp, wifi->ip_addr, 14325);
#endif /* IM_ENABLE_SHELL */
}

/*******************************************************************************
* Function Name: wifi_disconnected
********************************************************************************
* Summary:
* This function is called when the Wi-Fi has disconnected from an access point.
* It turns off the Wi-Fi LED and executes the net-down script if the shell is enabled.
*
* Parameters:
*  wifi_t* wifi - Pointer to the Wi-Fi structure
*
* Return:
*  None
*
*******************************************************************************/
static void wifi_disconnected(wifi_t* wifi)
{
    (void)wifi;
    /* Turn off Wi-Fi LED */
    set_led1(false);
    ws_ui_apply_connectivity(&ws_node_ui_state, false,
                             ws_node_ui_state.ble_connected,
                             ws_node_ui_state.camera_ready);
    ws_ui_apply_mqtt(&ws_node_ui_state, false);
    ws_mqtt_wifi_changed(false, NULL);

#ifdef IM_ENABLE_SHELL
    /* If shell is enabled, run the /system/net-down script */
    process_exec_command("sh -e -f /system/net-down", EXEC_MODE_BLOCK);
#else
    /* If no shell is present fallback to halt the TSP server anyway */
    tsp_t* tsp = SYS_SERVICE_TSP();
    tsp_stop(tsp);
#endif  /* IM_ENABLE_SHELL */
}

#endif /* IM_ENABLE_NET  */

/*******************************************************************************
* Function Name: initd_task
********************************************************************************
* Summary:
* This function is the main initialization task for the system.
* It sets up the protocol, loads device drivers, and initializes various services.
*
* Parameters:
*  arg - Pointer to the argument passed to the task (not used)
*
* Return:
*  None
*
*******************************************************************************/
void initd_task(void* arg)
{

    /* Firmware version */
    protocol_Version firmware_version =
    {
        .major = 1,
        .minor = 2,
        .build = BUILD_DATE,
        .revision = BUILD_TIME
    };

    /* Serial UUID */
    uint8_t* serial = board_get_serial_uuid();
    char device_id[WS_NODE_DEVICE_ID_MAX + 1u];
    char node_id[WS_NODE_NODE_ID_MAX + 1u];
    (void)snprintf(device_id, sizeof(device_id), "CAM_E84_%02X%02X%02X%02X",
                   serial[12], serial[13], serial[14], serial[15]);
    (void)snprintf(node_id, sizeof(node_id), "WSN_%02X%02X%02X%02X",
                   serial[12], serial[13], serial[14], serial[15]);
    ws_ui_state_init(&ws_node_ui_state);

    /* Create a protocol instance */
#ifdef USE_KIT_PSE84_AI
    strcpy(board_name, "PSOC Edge E84 AI Kit" );
#elif defined(USE_KIT_PSE84_EVAL_EPC2) || defined(USE_KIT_PSE84_EVAL_EPC4)
    strcpy(board_name, "PSOC Edge E84 Evaluation Kit" );
#elif defined(USE_KIT_PSE84_HMI)
    strcpy(board_name, "PSOC Edge E84 HMI Kit");
#endif

#ifdef IM_ENABLE_SHELL
    /* Create database of all commands. Needed for filesystem. */
    commands_t* commands = (commands_t*)sys_malloc(sizeof(commands_t));
    command_init_default(commands);
    system_services[ENV_SERVICE_COMMANDS] = commands;

    /* initialize filesystem */
    initialize_filesystem();

    FILE* board=fopen("system/boardname","rb");

    if (board)
    {
        char buffer[128];
        int len=fread(buffer,1,127,board);
        /* Ensure nulltermination. */
        buffer[len]=0;
        if (len)
        {
            /* Override the default boardname. */
            strcpy(board_name, buffer);
        }
        fclose(board);
    }

#endif /*IM_ENABLE_SHELL*/

    protocol_t* protocol = protocol_create(board_name, serial, firmware_version);
    system_services[ENV_SERVICE_PROTOCOL] = protocol;

    /* Add reset function */
    protocol->board_reset = board_reset;

    /* Load all device drivers */
    system_load_device_drivers(protocol);

#if ((WS_FEATURE_ENVIRONMENT == 1) || (WS_FEATURE_TOUCH == 1) || \
     (WS_FEATURE_MICROPHONE == 1))
    if (!ws_sensor_start_devices(protocol) ||
        (xTaskCreate(ws_sensor_poll_task, "ws_sensor", WS_SENSOR_POLL_STACK_SIZE,
                     protocol, WS_SENSOR_POLL_PRIORITY, NULL) != pdPASS))
    {
        printf("[EASE_AI] sensor acquisition start FAIL\r\n");
    }
#endif

    /* Turn of status leds */
    set_led0(false);
    set_led1(false);

    /* Service to manage USB data connections
     (this is not the serial console) */
    xTaskCreate(
        usbd_task,
        "usbd",
        USBD_STACK_SIZE,
        protocol,
        USBD_PRIO,
        NULL);

#ifdef IM_ENABLE_HTTP
    /* Set up HTTPS service */
    http_t* http = (http_t*)sys_malloc(sizeof(http_t));
    http_init(http);
    system_services[ENV_SERVICE_HTTP] = http;
#endif /* IM_ENABLE_HTTP */

#ifdef IM_ENABLE_NET
    /* Initialize Tensor Streaming Protocol structure */
    tsp_t* tsp = (tsp_t*)sys_malloc(sizeof(tsp_t));
    tsp_init(tsp, protocol);
    system_services[ENV_SERVICE_TSP] = tsp;

    /* Setup Wi-Fi service */
    wifi_t* wifi = (wifi_t*)sys_malloc(sizeof(wifi_t));
    wifi_init(wifi, wifi_connected, wifi_disconnected);
    system_services[ENV_SERVICE_WIFI] = wifi;

    const ws_mqtt_config_t mqtt_config = {
        .broker = WS_NODE_DEFAULT_MQTT,
        .port = 1883u,
        .username = "",
        .password = "",
        .device_id = device_id,
        .node_id = node_id,
        .firmware = WS_NODE_FIRMWARE_VERSION,
        .ble_mac = "",
        .command_handler = ws_node_command,
        .command_context = &ws_node_ui_state,
    };
    if (!ws_mqtt_start(&mqtt_config)) {
        printf("[WheelSense] MQTT service initialization failed\r\n");
    }

#endif /* IM_ENABLE_NET */

#ifdef IM_ENABLE_UPNP
    /* Initialize UPNP structure */
    upnp_t* upnp = (upnp_t*)sys_malloc(sizeof(upnp_t));
    upnp_init(upnp, protocol);
    system_services[ENV_SERVICE_UPNP] = upnp;
#endif /* IM_ENABLE_UPNP */

#ifdef IM_ENABLE_SHELL

    /* Run boot script */
    process_exec_command("sh -e -f /system/boot", EXEC_MODE_BLOCK);

    /* Start a system prompt on the debug UART */
    /* See option REQUIRE_PASSWORD_USB_UART in im_config.h */
    xTaskCreate(
        debug_shell_task,
        "sys_shell",
        SHELL_STACK_SIZE,
        NULL,
        SHELL_PRIO,
        NULL);

#else /* IM_ENABLE_SHELL */

#ifdef IM_ENABLE_NET

#if !defined(WIFI_SECURITY) || !defined(WIFI_SSID) || !defined(WIFI_PASSWORD)
#error "WIFI_SECURITY, WIFI_SSID and WIFI_PASSWORD must be defined when compiling with IM_ENABLE_NET but without IM_ENABLE_SHELL. See CY_WCM_SECURITY_* defines for WIFI_SECURITY"
#endif

    /* Connect to Wi-Fi without shell */
    wifi->security = WIFI_SECURITY;
    strncpy(wifi->password, WIFI_PASSWORD, WIFI_MAX_PASSWORD_LEN);
    wifi->password[WIFI_MAX_PASSWORD_LEN] = '\0';  /* Ensure null-termination */
    strncpy(wifi->ssid, WIFI_SSID, WIFI_MAX_SSID_LEN);
    wifi->ssid[WIFI_MAX_SSID_LEN] = '\0';  /* Ensure null-termination */

    int failcount = 0;
    while (!wifi_start(wifi)) {
        printf("Wi-Fi start will retry in 2 seconds.\n");
        vTaskDelay(pdMS_TO_TICKS(2000));
        failcount++;
        if (failcount == 3) {
            printf("Wi-Fi service start failed.\n");
            break;
        }
    }
#endif /* IM_ENABLE_NET */

#endif /* IM_ENABLE_SHELL */
    /* We are done, suspend */
    vTaskSuspend(NULL);
}
/* [] END OF FILE */
