#include "InputManager.h"
#include "BuzzerManager.h"

InputManager InputMgr;

InputManager::InputManager() {}

void InputManager::begin() {
    // Polled from main loop via update()
}

void InputManager::update() {
    const unsigned long now = millis();

    // BtnA - Front
    if (M5.BtnA.wasPressed() && (now - lastPressMs[0] >= DEBOUNCE_MS)) {
        pressed[0] = true;
        lastPressMs[0] = now;
        longPressLatched[0] = false;
        BuzzerMgr.beepButton();
    }
    // BtnB - Side
    if (M5.BtnB.wasPressed() && (now - lastPressMs[1] >= DEBOUNCE_MS)) {
        pressed[1] = true;
        lastPressMs[1] = now;
        longPressLatched[1] = false;
        BuzzerMgr.beepButton();
    }
    // BtnPWR - Power (acts as BtnC)
    if (M5.BtnPWR.wasPressed() && (now - lastPressMs[2] >= DEBOUNCE_MS)) {
        pressed[2] = true;
        lastPressMs[2] = now;
        longPressLatched[2] = false;
        BuzzerMgr.beepButton();
    }

    // Release long press latch
    if (!M5.BtnA.isPressed()) longPressLatched[0] = false;
    if (!M5.BtnB.isPressed()) longPressLatched[1] = false;
    if (!M5.BtnPWR.isPressed()) longPressLatched[2] = false;

    // Long press detection
    if (M5.BtnA.isPressed() && M5.BtnA.pressedFor(LONG_PRESS_MS) && !longPressLatched[0]) {
        longPressed[0] = true;
        longPressLatched[0] = true;
    }
    if (M5.BtnB.isPressed() && M5.BtnB.pressedFor(LONG_PRESS_MS) && !longPressLatched[1]) {
        longPressed[1] = true;
        longPressLatched[1] = true;
    }
    if (M5.BtnPWR.isPressed() && M5.BtnPWR.pressedFor(LONG_PRESS_MS) && !longPressLatched[2]) {
        longPressed[2] = true;
        longPressLatched[2] = true;
    }
}

bool InputManager::wasPressed(ButtonID btn) {
    if (btn >= 3) return false;
    bool r = pressed[btn];
    pressed[btn] = false;
    return r;
}

bool InputManager::wasLongPressed(ButtonID btn) {
    if (btn >= 3) return false;
    bool r = longPressed[btn];
    longPressed[btn] = false;
    return r;
}

bool InputManager::isPressed(ButtonID btn) {
    if (btn == BTN_A) return M5.BtnA.isPressed();
    if (btn == BTN_B) return M5.BtnB.isPressed();
    if (btn == BTN_C) return M5.BtnPWR.isPressed();
    return false;
}
