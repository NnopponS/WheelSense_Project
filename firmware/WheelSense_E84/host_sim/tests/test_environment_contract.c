/*
 * P3.1 RED/GREEN — Environment service contract test.
 *
 * Verifies that the public header ws_environment.h exists, exposes the
 * required API, config struct, state enum, and validity-mask constants
 * defined by phase-3-brief.md sections 3.6, 3.7, and 3.9.
 *
 * RED phase: this file does not compile because ws_environment.h is absent.
 * GREEN phase: after creating the header, all assertions pass.
 */
#include <assert.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

#include "ws_environment.h"
#include "ws_status.h"
#include "ws_types.h"

/* --- Config struct must exist with the documented fields --- */

static const ws_environment_config_t default_config = {
    .sample_rate_hz = 1,
    .enable_sht40 = true,
    .enable_dps368 = true,
};

/* --- Validity mask bits must be defined --- */

static void test_validity_mask_bits(void)
{
    /* Each bit corresponds to one field in ws_environment_sample_t */
    assert(WS_ENV_VALID_TEMPERATURE == 0x01u);
    assert(WS_ENV_VALID_HUMIDITY    == 0x02u);
    assert(WS_ENV_VALID_PRESSURE    == 0x04u);
}

/* --- State enum must match the brief's required transitions --- */

static void test_state_enum_values(void)
{
    /* The brief requires these lifecycle states (section 3.7) */
    ws_environment_state_t s;
    s = WS_ENV_STATE_NOT_INITIALIZED;
    assert(s == WS_ENV_STATE_NOT_INITIALIZED);
    s = WS_ENV_STATE_READY;
    assert(s == WS_ENV_STATE_READY);
    s = WS_ENV_STATE_DISABLED;
    assert(s == WS_ENV_STATE_DISABLED);
    s = WS_ENV_STATE_ERROR;
    assert(s == WS_ENV_STATE_ERROR);
}

/* --- API functions must be declared with the documented signatures --- */

static void test_api_signatures_exist(void)
{
    /* Just verify the symbols are callable — we don't call them here */
    ws_status_t (*init_fn)(const ws_environment_config_t *) = ws_environment_init;
    ws_status_t (*deinit_fn)(void) = ws_environment_deinit;
    ws_status_t (*read_fn)(ws_environment_sample_t *) = ws_environment_read;
    ws_status_t (*status_fn)(ws_environment_state_t *, ws_environment_diag_t *) = ws_environment_get_status;
    (void)init_fn;
    (void)deinit_fn;
    (void)read_fn;
    (void)status_fn;
}

/* --- Diagnostic struct must carry the brief's required fields --- */

static void test_diag_struct_fields(void)
{
    ws_environment_diag_t diag;
    memset(&diag, 0, sizeof(diag));
    /* Fields required by section 3.6: per-field validity, last-update,
     * last error, consecutive failure count, last good sample */
    diag.last_update_us = 1000;
    diag.last_error = WS_STATUS_TIMEOUT;
    diag.consecutive_failures = 3;
    diag.last_good_temperature_c = 25.0f;
    diag.last_good_humidity_pct = 50.0f;
    diag.last_good_pressure_hpa = 1013.25f;
    diag.last_good_age_us = 500000;
    assert(diag.last_update_us == 1000);
    assert(diag.last_error == WS_STATUS_TIMEOUT);
    assert(diag.consecutive_failures == 3);
}

int main(void)
{
    test_validity_mask_bits();
    test_state_enum_values();
    test_api_signatures_exist();
    test_diag_struct_fields();

    /* Verify default config is sane */
    assert(default_config.sample_rate_hz == 1);
    assert(default_config.enable_sht40);
    assert(default_config.enable_dps368);

    return 0;
}
