#ifndef SCENE_MANAGER_H
#define SCENE_MANAGER_H

#include "DisplayManager.h"
#include "../managers/InputManager.h"
#include "../managers/ConfigManager.h"
#include "../managers/SensorManager.h"
#include "../managers/NetworkManager.h"
#include "../managers/BLEManager.h"
#include "../managers/APPortalManager.h"

enum SceneID {
    SCENE_BOOT,
    SCENE_DASHBOARD,
    SCENE_MAIN_MENU,
    SCENE_WIFI_SCAN,
    SCENE_KEYBOARD,
    SCENE_MQTT_CONFIG,
    SCENE_DEVICE_INFO,
    SCENE_AP_PORTAL,
    SCENE_CONFIRM
};

class SceneManager {
public:
    enum KeyboardContext {
        KBD_CTX_NONE,
        KBD_CTX_WIFI_PASS,
        KBD_CTX_MQTT_BROKER,
        KBD_CTX_MQTT_PORT,
        KBD_CTX_MQTT_USER,
        KBD_CTX_MQTT_PASS,
        KBD_CTX_DEVICE_NAME,
        KBD_CTX_WHEEL_RADIUS
    };

    // Confirmation context
    enum ConfirmContext {
        CONFIRM_NONE,
        CONFIRM_FACTORY_RESET
    };

    SceneManager();
    void begin();
    void update();
    void switchScene(SceneID scene);
    bool isWiFiScanScene() const;
    bool isAPPortalActive() const;
    
private:
    SceneID currentScene = SCENE_BOOT;
    SceneID lastScene = SCENE_BOOT;

    // Keyboard
    String* keyboardTarget;
    int keyboardMaxLen;
    char keyboardBuffer[64];
    char keyboardTitle[24];
    String keyboardScratch;
    int keyboardCursorIndex;
    int keyboardCharIndex;
    bool keyboardCaps = false;
    int keyboardActionIndex = 0;
    bool keyboardSelectAction = false;
    KeyboardContext keyboardReturnContext = KBD_CTX_NONE;

    // Menu
    int menuIndex = 0;

    // Dashboard
    int dashboardPage = 0;

    // WiFi Scan
    int wifiScanIndex = 0;
    int wifiScanCount = -1;
    bool isScanning = false;
    bool scanFailed = false;

    // Boot
    unsigned long bootStartMs = 0;

    // Device Info
    int deviceInfoIndex = 0;

    // Confirmation
    ConfirmContext confirmContext = CONFIRM_NONE;
    char confirmTitle[24];
    char confirmMessage[64];

    // Redraw
    bool needsRedraw = true;
    unsigned long lastDrawMs = 0;

    // Scene updates
    void updateBoot();
    void updateDashboard();
    void updateMainMenu();
    void updateWiFiScan();
    void updateKeyboard();
    void updateMQTTConfig();
    void updateDeviceInfo();
    void updateAPPortal();
    void updateConfirm();
    
    // Keyboard helpers
    void startKeyboardInput(const char* title, String* targetStr, int maxLen,
                            SceneID returnScene, KeyboardContext ctx = KBD_CTX_NONE);
    void startConfirm(const char* title, const char* message,
                      ConfirmContext ctx, SceneID returnScene);
    const char* getCharset();
    int getCharsetLen();
};

extern SceneManager SceneMgr;

#endif
