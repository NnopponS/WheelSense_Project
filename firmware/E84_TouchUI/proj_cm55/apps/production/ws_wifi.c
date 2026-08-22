/* WiFi manager: cy_wcm bring-up, async scan/join worker, status snapshot. */

#include "ws_wifi.h"

#include "cy_wcm.h"
#include "cyabs_rtos.h"
#include "cy_sd_host.h"
#include "cy_sysint.h"
#include "cybsp.h"
#include "cycfg_peripherals.h"
#include "mtb_hal_gpio.h"
#include "mtb_hal_sdio.h"

#include "FreeRTOS.h"
#include "queue.h"
#include "task.h"

#include <stdio.h>
#include <string.h>

#define WS_WIFI_SDIO_INTERRUPT_PRIORITY      (7U)
#define WS_WIFI_HOST_WAKE_INTERRUPT_PRIORITY (2U)
#define WS_WIFI_SDIO_FREQUENCY_HZ            (25000000U)
#define WS_WIFI_SDIO_BLOCK_SIZE               (64U)

typedef enum
{
    WS_WIFI_CMD_SCAN,
    WS_WIFI_CMD_JOIN,
} ws_wifi_cmd_t;

typedef struct
{
    ws_wifi_cmd_t cmd;
    char ssid[WS_WIFI_SSID_MAX_LEN];
    char password[WS_WIFI_PASS_MAX_LEN];
} ws_wifi_msg_t;

static ws_wifi_status_t s_status;
static ws_wifi_scan_result_t s_results[WS_WIFI_MAX_SCAN_RESULTS];
static QueueHandle_t s_cmd_queue;
static bool s_wcm_ready = false;
static mtb_hal_sdio_t s_sdio_instance;
static cy_stc_sd_host_context_t s_sdhc_host_context;
static cy_wcm_config_t s_wcm_config;

static void sdio_interrupt_handler(void)
{
    mtb_hal_sdio_process_interrupt(&s_sdio_instance);
}

static void host_wake_interrupt_handler(void)
{
    mtb_hal_gpio_process_interrupt(&s_wcm_config.wifi_host_wake_pin);
}

static cy_rslt_t wifi_radio_init(void)
{
    cy_stc_sysint_t sdio_interrupt = {
        .intrSrc = CYBSP_WIFI_SDIO_IRQ,
        .intrPriority = WS_WIFI_SDIO_INTERRUPT_PRIORITY,
    };
    cy_stc_sysint_t host_wake_interrupt = {
        .intrSrc = CYBSP_WIFI_HOST_WAKE_IRQ,
        .intrPriority = WS_WIFI_HOST_WAKE_INTERRUPT_PRIORITY,
    };
    mtb_hal_sdio_cfg_t sdio_config = {
        .frequencyhal_hz = WS_WIFI_SDIO_FREQUENCY_HZ,
        .block_size = WS_WIFI_SDIO_BLOCK_SIZE,
    };

    if (CY_SYSINT_SUCCESS !=
        Cy_SysInt_Init(&sdio_interrupt, sdio_interrupt_handler))
    {
        return CY_RSLT_TYPE_ERROR;
    }
    NVIC_EnableIRQ(CYBSP_WIFI_SDIO_IRQ);

    cy_rslt_t result = mtb_hal_sdio_setup(
        &s_sdio_instance, &CYBSP_WIFI_SDIO_sdio_hal_config, NULL,
        &s_sdhc_host_context);
    if (CY_RSLT_SUCCESS != result)
    {
        return result;
    }

    Cy_SD_Host_Enable(CYBSP_WIFI_SDIO_HW);
    (void)Cy_SD_Host_Init(CYBSP_WIFI_SDIO_HW,
                         CYBSP_WIFI_SDIO_sdio_hal_config.host_config,
                         &s_sdhc_host_context);
    Cy_SD_Host_SetHostBusWidth(CYBSP_WIFI_SDIO_HW,
                               CY_SD_HOST_BUS_WIDTH_4_BIT);
    (void)mtb_hal_sdio_configure(&s_sdio_instance, &sdio_config);

    (void)mtb_hal_gpio_setup(&s_wcm_config.wifi_wl_pin,
                             CYBSP_WIFI_WL_REG_ON_PORT_NUM,
                             CYBSP_WIFI_WL_REG_ON_PIN);
    (void)mtb_hal_gpio_setup(&s_wcm_config.wifi_host_wake_pin,
                             CYBSP_WIFI_HOST_WAKE_PORT_NUM,
                             CYBSP_WIFI_HOST_WAKE_PIN);
    if (CY_SYSINT_SUCCESS !=
        Cy_SysInt_Init(&host_wake_interrupt, host_wake_interrupt_handler))
    {
        return CY_RSLT_TYPE_ERROR;
    }
    NVIC_EnableIRQ(CYBSP_WIFI_HOST_WAKE_IRQ);

    s_wcm_config.interface = CY_WCM_INTERFACE_TYPE_STA;
    s_wcm_config.wifi_interface_instance = &s_sdio_instance;
    return cy_wcm_init(&s_wcm_config);
}

static void copy_text(char *destination, size_t capacity, const char *source)
{
    if ((NULL == destination) || (0U == capacity))
    {
        return;
    }
    const size_t length = (NULL == source) ? 0U : strlen(source);
    const size_t copy_length = (length < (capacity - 1U)) ? length
                                                          : (capacity - 1U);
    (void)memset(destination, 0, capacity);
    if (0U != copy_length)
    {
        (void)memcpy(destination, source, copy_length);
    }
}

static void scan_callback(cy_wcm_scan_result_t *result, void *user_data,
                          cy_wcm_scan_status_t status)
{
    (void)user_data;
    if (CY_WCM_SCAN_COMPLETE == status)
    {
        s_status.scan_done = true;
        return;
    }
    if ((NULL == result) || (s_status.scan_count >= WS_WIFI_MAX_SCAN_RESULTS))
    {
        return;
    }
    /* Keep the strongest networks; simple first-come fill. */
    ws_wifi_scan_result_t *slot = &s_results[s_status.scan_count];
    (void)memset(slot, 0, sizeof(*slot));
    (void)memcpy(slot->ssid, result->SSID, sizeof(slot->ssid) - 1U);
    slot->ssid[WS_WIFI_SSID_MAX_LEN - 1U] = '\0';
    slot->rssi = result->signal_strength;
    slot->channel = result->channel;
    slot->security = (uint32_t)result->security;
    s_status.scan_count++;
}

static void do_scan(void)
{
    s_status.state = WS_WIFI_STATE_SCANNING;
    s_status.scan_done = false;
    s_status.scan_count = 0U;
    (void)memset(s_results, 0, sizeof(s_results));

    cy_rslt_t r = cy_wcm_start_scan(scan_callback, NULL, NULL);
    if (CY_RSLT_SUCCESS != r)
    {
        printf("[WIFI] scan start failed: 0x%08lx\r\n", (unsigned long)r);
        s_status.state = WS_WIFI_STATE_ERROR;
        return;
    }

    /* Scan callbacks stream in; give them a few seconds. */
    for (uint32_t i = 0U; i < 50U; i++)
    {
        vTaskDelay(pdMS_TO_TICKS(100U));
    }
    (void)cy_wcm_stop_scan();
    s_status.scan_done = true;
    s_status.state = cy_wcm_is_connected_to_ap()
                         ? WS_WIFI_STATE_CONNECTED
                         : WS_WIFI_STATE_IDLE;
    printf("[WIFI] scan done: %u networks\r\n", (unsigned)s_status.scan_count);
}

static void do_join(const char *ssid, const char *password)
{
    cy_wcm_connect_params_t params;
    cy_wcm_ip_address_t ip;

    s_status.state = WS_WIFI_STATE_JOINING;
    (void)memset(&params, 0, sizeof(params));
    copy_text((char *)params.ap_credentials.SSID,
              sizeof(params.ap_credentials.SSID), ssid);
    copy_text((char *)params.ap_credentials.password,
              sizeof(params.ap_credentials.password), password);
    params.ap_credentials.security =
        (NULL != password && '\0' != password[0])
            ? CY_WCM_SECURITY_WPA3_WPA2_PSK
            : CY_WCM_SECURITY_OPEN;

    printf("[WIFI] joining \"%s\"...\r\n", ssid);
    cy_rslt_t r = cy_wcm_connect_ap(&params, &ip);
    if (CY_RSLT_SUCCESS != r)
    {
        printf("[WIFI] join failed: 0x%08lx\r\n", (unsigned long)r);
        s_status.state = WS_WIFI_STATE_ERROR;
        return;
    }

    s_status.ip_addr = ((uint32_t)(ip.ip.v4 & 0xFFU) << 24) |
                       ((uint32_t)((ip.ip.v4 >> 8) & 0xFFU) << 16) |
                       ((uint32_t)((ip.ip.v4 >> 16) & 0xFFU) << 8) |
                       ((uint32_t)((ip.ip.v4 >> 24) & 0xFFU));
    copy_text(s_status.joined_ssid, sizeof(s_status.joined_ssid), ssid);
    s_status.state = WS_WIFI_STATE_CONNECTED;
    printf("[WIFI] joined \"%s\" ip=%lu.%lu.%lu.%lu\r\n", ssid,
           (unsigned long)((s_status.ip_addr >> 24) & 0xFFU),
           (unsigned long)((s_status.ip_addr >> 16) & 0xFFU),
           (unsigned long)((s_status.ip_addr >> 8) & 0xFFU),
           (unsigned long)(s_status.ip_addr & 0xFFU));
}

static void wifi_task(void *arg)
{
    (void)arg;
    ws_wifi_msg_t msg;

    cy_rslt_t r = wifi_radio_init();
    if (CY_RSLT_SUCCESS != r)
    {
        printf("[WIFI] wcm init failed: 0x%08lx\r\n", (unsigned long)r);
        s_status.state = WS_WIFI_STATE_ERROR;
        vTaskDelete(NULL);
        return;
    }
    s_wcm_ready = true;
    s_status.state = WS_WIFI_STATE_IDLE;
    printf("[WIFI] wcm ready\r\n");

    for (;;)
    {
        if (pdPASS != xQueueReceive(s_cmd_queue, &msg, portMAX_DELAY))
        {
            continue;
        }
        if (WS_WIFI_CMD_SCAN == msg.cmd)
        {
            do_scan();
        }
        else if (WS_WIFI_CMD_JOIN == msg.cmd)
        {
            do_join(msg.ssid, msg.password);
        }
    }
}

bool ws_wifi_start(void)
{
    if (NULL != s_cmd_queue)
    {
        return true;
    }
    (void)memset(&s_status, 0, sizeof(s_status));
    s_status.state = WS_WIFI_STATE_DISABLED;

    s_cmd_queue = xQueueCreate(4U, sizeof(ws_wifi_msg_t));
    if (NULL == s_cmd_queue)
    {
        return false;
    }
    BaseType_t ok = xTaskCreate(wifi_task, "ws_wifi",
                                configMINIMAL_STACK_SIZE * 12U, NULL,
                                tskIDLE_PRIORITY + 2U, NULL);
    return (pdPASS == ok);
}

void ws_wifi_request_scan(void)
{
    if ((NULL == s_cmd_queue) || !s_wcm_ready)
    {
        return;
    }
    ws_wifi_msg_t msg = {.cmd = WS_WIFI_CMD_SCAN};
    (void)xQueueSend(s_cmd_queue, &msg, 0U);
}

void ws_wifi_request_join(const char *ssid, const char *password)
{
    if ((NULL == s_cmd_queue) || !s_wcm_ready)
    {
        return;
    }
    ws_wifi_msg_t msg = {.cmd = WS_WIFI_CMD_JOIN};
    copy_text(msg.ssid, sizeof(msg.ssid), ssid);
    copy_text(msg.password, sizeof(msg.password), password);
    (void)xQueueSend(s_cmd_queue, &msg, 0U);
}

const ws_wifi_status_t *ws_wifi_status(void)
{
    return &s_status;
}

const ws_wifi_scan_result_t *ws_wifi_scan_results(void)
{
    return s_results;
}

void ws_wifi_consume_scan_results(void)
{
    s_status.scan_done = false;
}
