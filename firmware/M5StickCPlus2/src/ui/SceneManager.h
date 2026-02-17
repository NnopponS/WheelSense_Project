#ifndef SCENE_MANAGER_H
#define SCENE_MANAGER_H

#include "DisplayManager.h"
#include "../managers/InputManager.h"
#include "../managers/ConfigManager.h"
#include "../managers/SensorManager.h"
#include "../managers/NetworkManager.h"
#include "../managers/BuzzerManager.h"
#include "../utils/FingerprintMatcher.h"

enum SceneID {
    SCENE_BOOT,
    SCENE_DASHBOARD,
    SCENE_MAIN_MENU,
    SCENE_WIFI_SCAN,
    SCENE_KEYBOARD,
    SCENE_MQTT_CONFIG,
    SCENE_DEVICE_INFO,
    SCENE_SERVER_CONFIG,
    SCENE_CALIBRATE,
    SCENE_CAMERA_CONFIG,
    SCENE_QR_CODE
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
        KBD_CTX_BACKEND_URL,
        KBD_CTX_DEVICE_NAME,
        KBD_CTX_WHEEL_RADIUS,
        KBD_CTX_CAMERA_MQTT_PORT
    };

    SceneManager();
    void begin();
    void update();
    void switchScene(SceneID scene);
    bool isWiFiScanScene() const;
    
    void startKeyboardInput(const char* title, String* targetStr, int maxLen, SceneID returnScene, KeyboardContext ctx = KBD_CTX_NONE);
    
private:
    SceneID currentScene = SCENE_BOOT;
    SceneID lastScene = SCENE_BOOT; // specific for keyboard return
    
    // Keyboard State
    String* keyboardTarget;
    int keyboardMaxLen;
    char keyboardBuffer[64];
    char keyboardTitle[24];
    String keyboardScratch;
    int keyboardCursorIndex;
    int keyboardCharIndex; // A-Z, 0-9 index
    bool keyboardCaps = false;
    int keyboardActionIndex = 0; // 0:OK, 1:CAP, 2:DEL, 3:SPACE
    bool keyboardSelectAction = false;
    
    // Menu State
    int menuIndex = 0;
    int menuScrollOffset = 0;
    int deviceInfoIndex = 0; // 0=name, 1=wheel radius
    
    // Dashboard Page
    int dashboardPage = 0; // 0: Main, 1: Status, 2: Large
    
    // WiFi Scan
    int wifiScanIndex = 0;
    int wifiScanCount = -1;
    bool isScanning = false;
    bool scanFailed = false;
    unsigned long wifiScanStartedMs = 0;
    uint8_t wifiScanRetryCount = 0;
    
    // Boot (non-blocking)
    unsigned long bootStartMs = 0;
    bool bootReachedFull = false;
    bool bootRenderedFull = false;
    unsigned long bootFullShownMs = 0;
    int bootLastDrawnPct = -1;
    
    // Config from Server
    bool serverConfigSyncing = false;
    bool serverConfigSyncSuccess = false;
    bool serverConfigSyncDone = false;
    
    // Calibration
    int calibrateStep = 0;       // 0=select room, 1=position, 2=scanning, 3=done
    int calibrateRoomIndex = 0;
    int calibrateScanRound = 0;
    static const int CALIBRATE_SCAN_ROUNDS = 10;
    unsigned long calibrateScanStartMs = 0;
    bool calibrateScanRequested = false;
    
    // Dirty flag / UI throttle
    bool needsRedraw = true;
    unsigned long lastDrawMs = 0;
    uint32_t dashboardLastHash = 0;
    bool dashboardHashValid = false;
    
    KeyboardContext keyboardReturnContext = KBD_CTX_NONE;
    
    // MQTT Config dynamic strings (member buffers for drawMenu safety)
    char mqttMenuBrokerStr[48];
    char mqttMenuPortStr[16];
    char mqttMenuUserStr[32];
    char mqttMenuPassStr[32];
    char mqttMenuModeStr[32];

    // Camera Config (Phase 2)
    static const int MAX_CAMERA_NODES = 12;
    CameraNodeInfo cameraNodes[MAX_CAMERA_NODES];
    int cameraNodeCount = 0;
    int cameraNodeIndex = 0;
    bool cameraListLoaded = false;
    bool cameraListLoading = false;
    bool cameraListOk = false;

    bool cameraEditorActive = false;
    int cameraEditMenuIndex = 0;
    String cameraTargetDeviceId;
    CameraConfigPayload cameraDraft;
    String cameraDraftMqttPort;

    String cameraStatusText;
    bool cameraStatusSuccess = false;
    bool cameraResultMode = false;
    int cameraLastAction = -1; // 0=Push,1=Push+Sync,2=EnterConfig,3=SyncOnly

    char cameraItemDevice[48];
    char cameraItemNode[48];
    char cameraItemRoomId[48];
    char cameraItemRoomName[48];
    char cameraItemWiFiSsid[48];
    char cameraItemWiFiPass[32];
    char cameraItemMqttHost[48];
    char cameraItemMqttPort[24];
    char cameraItemMqttUser[32];
    char cameraItemMqttPass[32];
    char cameraItemBackend[48];
    
    void updateBoot();
    void updateDashboard();
    void updateMainMenu();
    void updateWiFiScan();
    void updateKeyboard();
    void updateMQTTConfig();
    void updateServerConfig();
    void updateCalibrate();
    void updateCameraConfig();
    
    void drawDashboard();
    uint32_t buildDashboardHash();
    void drawMainMenu();
    void drawWiFiScan();
    void drawKeyboard();
    void drawCameraList();
    void drawCameraEditor();
    void drawCameraResult();
    
    // Helper
    const char* getCharFromIndex(int index);
    int getKeyboardCharCount();
    char getKeyboardCharAt(int index);
    void appendKeyboardChar(char c);
    bool loadCameraNodes();
    void activateCameraEditor(int index);
    bool runCameraAction(int actionId, String& outMessage);
};

extern SceneManager SceneMgr;

#endif
