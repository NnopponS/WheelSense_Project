#ifndef INPUT_MANAGER_H
#define INPUT_MANAGER_H

#include <M5StickCPlus2.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>

enum ButtonID {
    BTN_A, // Front
    BTN_B, // Side
    BTN_C, // Power/Small
    BTN_NONE
};

class InputManager {
public:
    InputManager();
    void begin();
    void update();
    
    bool wasPressed(ButtonID btn);
    bool wasLongPressed(ButtonID btn);
    bool wasReleased(ButtonID btn);
    bool isPressed(ButtonID btn);
    
private:
    static void inputTask(void* param);
    
    volatile bool btnAPressed = false;
    volatile bool btnBPressed = false;
    volatile bool btnCPressed = false;
    volatile bool btnALongPress = false;
    volatile bool btnBLongPress = false;
    volatile bool btnCLongPress = false;
    unsigned long lastPressMs[3] = {0, 0, 0};
    bool longPressLatched[3] = {false, false, false};
    
    TaskHandle_t taskHandle = nullptr;
};

extern InputManager InputMgr;

#endif
