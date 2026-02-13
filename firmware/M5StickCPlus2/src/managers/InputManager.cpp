#include "InputManager.h"
#include "Config.h"

InputManager InputMgr;

InputManager::InputManager() {}

void InputManager::begin() {
    // Polled from main loop via InputManager::update().
}

void InputManager::inputTask(void* param) {
    (void)param;
}

void InputManager::update() {
    const unsigned long now = millis();

    if (M5.BtnA.wasPressed() && (now - lastPressMs[0] >= INPUT_DEBOUNCE_MS)) {
        btnAPressed = true;
        lastPressMs[0] = now;
        longPressLatched[0] = false;
    }
    if (M5.BtnB.wasPressed() && (now - lastPressMs[1] >= INPUT_DEBOUNCE_MS)) {
        btnBPressed = true;
        lastPressMs[1] = now;
        longPressLatched[1] = false;
    }
    if (M5.BtnPWR.wasPressed() && (now - lastPressMs[2] >= INPUT_DEBOUNCE_MS)) {
        btnCPressed = true;
        lastPressMs[2] = now;
        longPressLatched[2] = false;
    }

    if (!M5.BtnA.isPressed()) longPressLatched[0] = false;
    if (!M5.BtnB.isPressed()) longPressLatched[1] = false;
    if (!M5.BtnPWR.isPressed()) longPressLatched[2] = false;

    if (M5.BtnA.isPressed() && M5.BtnA.pressedFor(1000) && !longPressLatched[0]) {
        btnALongPress = true;
        longPressLatched[0] = true;
    }
    if (M5.BtnB.isPressed() && M5.BtnB.pressedFor(1000) && !longPressLatched[1]) {
        btnBLongPress = true;
        longPressLatched[1] = true;
    }
    if (M5.BtnPWR.isPressed() && M5.BtnPWR.pressedFor(1000) && !longPressLatched[2]) {
        btnCLongPress = true;
        longPressLatched[2] = true;
    }
}

bool InputManager::wasPressed(ButtonID btn) {
    bool r = false;
    if (btn == BTN_A) { r = btnAPressed; btnAPressed = false; }
    else if (btn == BTN_B) { r = btnBPressed; btnBPressed = false; }
    else if (btn == BTN_C) { r = btnCPressed; btnCPressed = false; }
    return r;
}

bool InputManager::wasLongPressed(ButtonID btn) {
    bool r = false;
    if (btn == BTN_A) { r = btnALongPress; btnALongPress = false; }
    else if (btn == BTN_B) { r = btnBLongPress; btnBLongPress = false; }
    else if (btn == BTN_C) { r = btnCLongPress; btnCLongPress = false; }
    return r;
}

bool InputManager::wasReleased(ButtonID btn) {
    if (btn == BTN_A) return M5.BtnA.wasReleased();
    if (btn == BTN_B) return M5.BtnB.wasReleased();
    if (btn == BTN_C) return M5.BtnPWR.wasReleased();
    return false;
}

bool InputManager::isPressed(ButtonID btn) {
    if (btn == BTN_A) return M5.BtnA.isPressed();
    if (btn == BTN_B) return M5.BtnB.isPressed();
    if (btn == BTN_C) return M5.BtnPWR.isPressed();
    return false;
}
