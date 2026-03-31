#ifndef INPUT_MANAGER_H
#define INPUT_MANAGER_H

#include <M5StickCPlus2.h>

enum ButtonID {
    BTN_A,    // Front button - Select/Confirm
    BTN_B,    // Side button  - Scroll/Next
    BTN_C,    // Power button - Back/Menu
    BTN_NONE
};

class InputManager {
public:
    InputManager();
    void begin();
    void update();
    
    bool wasPressed(ButtonID btn);
    bool peekPressed(ButtonID btn);
    bool wasLongPressed(ButtonID btn);
    bool isPressed(ButtonID btn);
    
private:
    static constexpr unsigned long DEBOUNCE_MS = 120;
    static constexpr unsigned long LONG_PRESS_MS = 1000;

    volatile bool pressed[3] = {false, false, false};
    volatile bool longPressed[3] = {false, false, false};
    unsigned long lastPressMs[3] = {0, 0, 0};
    bool longPressLatched[3] = {false, false, false};
};

extern InputManager InputMgr;

#endif
