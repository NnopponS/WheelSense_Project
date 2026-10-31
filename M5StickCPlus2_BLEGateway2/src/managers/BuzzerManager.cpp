#include "BuzzerManager.h"

BuzzerManager BuzzerMgr;

BuzzerManager::BuzzerManager() {}

void BuzzerManager::begin() {
    M5.Speaker.begin();
    M5.Speaker.setVolume(50);  // Reduced from 80 for power saving
}

void BuzzerManager::beep(int freq, int durationMs) {
    M5.Speaker.tone(freq, durationMs);
}

void BuzzerManager::beepButton() {
    M5.Speaker.tone(TONE_BUTTON_FREQ, TONE_BUTTON_MS);
}

void BuzzerManager::beepSuccess() {
    M5.Speaker.tone(TONE_SUCCESS_FREQ, TONE_SUCCESS_MS);
    delay(TONE_SUCCESS_MS + 50);
    M5.Speaker.tone(TONE_SUCCESS_FREQ, TONE_SUCCESS_MS);
}

void BuzzerManager::beepError() {
    M5.Speaker.tone(TONE_ERROR_FREQ, TONE_ERROR_MS);
}

void BuzzerManager::beepStartRecord() {
    // 3 short beeps (1 per sec) then 1 long beep
    for (int i = 0; i < 3; i++) {
        M5.Speaker.tone(1500, 200);
        delay(1000);
    }
    M5.Speaker.tone(2500, 500);
    delay(500); // Ensures it fully finishes before data collection
}

void BuzzerManager::beepStopRecord() {
    M5.Speaker.tone(2000, 150);
    delay(200);
    M5.Speaker.tone(1000, 300);
}
