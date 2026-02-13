#include "BuzzerManager.h"

BuzzerManager BuzzerMgr;

BuzzerManager::BuzzerManager() {}

void BuzzerManager::beep(int freq, int durationMs) {
    M5.Speaker.tone(freq, durationMs);
}

void BuzzerManager::beepSuccess() {
    M5.Speaker.tone(TONE_SUCCESS_FREQ, TONE_SUCCESS_MS);
    delay(TONE_SUCCESS_MS + 50);
    M5.Speaker.tone(TONE_SUCCESS_FREQ, TONE_SUCCESS_MS);
}

void BuzzerManager::beepError() {
    M5.Speaker.tone(TONE_ERROR_FREQ, TONE_ERROR_MS);
}

void BuzzerManager::beepButton() {
    M5.Speaker.tone(TONE_BUTTON_FREQ, TONE_BUTTON_MS);
}

void BuzzerManager::beepCalibrating() {
    M5.Speaker.tone(TONE_CALIBRATING_FREQ, TONE_CALIBRATING_MS);
}
