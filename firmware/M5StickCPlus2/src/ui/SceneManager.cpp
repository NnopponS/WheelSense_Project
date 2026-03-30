#include "SceneManager.h"
#include <math.h>

SceneManager SceneMgr;

static const char* CHARS_LOWER = "abcdefghijklmnopqrstuvwxyz0123456789-_.@:/";
static const char* CHARS_UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.@:/";
static const int CHARSET_LEN = 41;

SceneManager::SceneManager() {}

void SceneManager::begin() {
    DisplayMgr.begin();
    switchScene(SCENE_BOOT);
}

void SceneManager::switchScene(SceneID scene) {
    currentScene = scene;
    menuIndex = 0;
    deviceInfoIndex = 0;
    wifiScanIndex = 0;
    wifiScanCount = -1;
    needsRedraw = true;
    if (scene == SCENE_BOOT) bootStartMs = millis();
}

bool SceneManager::isWiFiScanScene() const {
    return currentScene == SCENE_WIFI_SCAN;
}

bool SceneManager::isAPPortalActive() const {
    return currentScene == SCENE_AP_PORTAL && APPortalMgr.isRunning();
}

const char* SceneManager::getCharset() {
    return keyboardCaps ? CHARS_UPPER : CHARS_LOWER;
}

int SceneManager::getCharsetLen() {
    return CHARSET_LEN;
}

void SceneManager::startKeyboardInput(const char* title, String* targetStr,
                                       int maxLen, SceneID returnScene, KeyboardContext ctx) {
    keyboardTarget = targetStr;
    keyboardMaxLen = min((int)sizeof(keyboardBuffer) - 1, maxLen);
    lastScene = returnScene;
    keyboardReturnContext = ctx;
    
    memset(keyboardBuffer, 0, sizeof(keyboardBuffer));
    if (targetStr) {
        strncpy(keyboardBuffer, targetStr->c_str(), sizeof(keyboardBuffer) - 1);
    }
    snprintf(keyboardTitle, sizeof(keyboardTitle), "%s", title ? title : "Input");
    
    keyboardCursorIndex = strlen(keyboardBuffer);
    keyboardCharIndex = 0;
    keyboardActionIndex = 0;
    keyboardCaps = false;
    keyboardSelectAction = false;
    needsRedraw = true;
    currentScene = SCENE_KEYBOARD;
}

void SceneManager::startConfirm(const char* title, const char* message,
                                 ConfirmContext ctx, SceneID returnScene) {
    snprintf(confirmTitle, sizeof(confirmTitle), "%s", title ? title : "Confirm");
    snprintf(confirmMessage, sizeof(confirmMessage), "%s", message ? message : "Are you sure?");
    confirmContext = ctx;
    lastScene = returnScene;
    needsRedraw = true;
    currentScene = SCENE_CONFIRM;
}

void SceneManager::update() {
    switch (currentScene) {
        case SCENE_BOOT:        updateBoot(); break;
        case SCENE_DASHBOARD:   updateDashboard(); break;
        case SCENE_MAIN_MENU:   updateMainMenu(); break;
        case SCENE_WIFI_SCAN:   updateWiFiScan(); break;
        case SCENE_KEYBOARD:    updateKeyboard(); break;
        case SCENE_MQTT_CONFIG: updateMQTTConfig(); break;
        case SCENE_DEVICE_INFO: updateDeviceInfo(); break;
        case SCENE_AP_PORTAL:   updateAPPortal(); break;
        case SCENE_CONFIRM:     updateConfirm(); break;
    }
    DisplayMgr.present();
}

// ===== BOOT =====
void SceneManager::updateBoot() {
    unsigned long elapsed = millis() - bootStartMs;
    float progress = min(1.0f, (float)elapsed / (float)BOOT_DURATION_MS);
    
    if (needsRedraw || (millis() - lastDrawMs) >= 100) {
        auto& g = DisplayMgr.getGfx();
        int w = g.width(), h = g.height();
        DisplayMgr.clear();
        
        g.setTextDatum(MC_DATUM);
        g.setTextColor(COLOR_PRIMARY);
        g.setTextSize(2);
        g.drawString("WheelSense", w / 2, h / 2 - 20);
        g.setTextSize(1);
        g.setTextColor(COLOR_TEXT);
        g.drawString("v" FIRMWARE_VERSION, w / 2, h / 2 + 5);
        g.setTextColor(0xC618);
        g.drawString("IMU + RSSI Data Logger", w / 2, h / 2 + 22);
        
        // Progress bar
        int barW = w - 40;
        int fillW = (int)(barW * progress);
        g.drawRoundRect(20, h - 24, barW, 10, 5, 0x7BEF);
        if (fillW > 2) g.fillRoundRect(21, h - 23, fillW - 2, 8, 4, COLOR_PRIMARY);
        
        needsRedraw = false;
        lastDrawMs = millis();
    }

    if (progress >= 1.0f) {
        delay(300);
        switchScene(SCENE_DASHBOARD);
    }
}

// ===== DASHBOARD =====
void SceneManager::updateDashboard() {
    const unsigned long now = millis();
    if (!needsRedraw && (now - lastDrawMs) < DISPLAY_UPDATE_INTERVAL) return;
    
    SensorData& d = SensorMgr.getData();
    BLENode nodes[MAX_BLE_NODES];
    int nodeCount = BLEMgr.copyNodes(nodes, MAX_BLE_NODES);
    auto& g = DisplayMgr.getGfx();
    int w = g.width();
    int h = g.height();

    DisplayMgr.clear();
    DisplayMgr.drawHeader(dashboardPage == 0 ? "Dashboard" : "IMU Raw");
    g.setTextSize(1);

    if (dashboardPage == 0) {
        // --- Page 0: Motion + Connectivity + Orientation ---
        int y = 30;
        
        // Status bar
        g.fillRoundRect(4, y, 60, 12, 3, NetworkMgr.isWiFiConnected() ? 0x0480 : 0x6000);
        g.fillRoundRect(68, y, 60, 12, 3, NetworkMgr.isMQTTConnected() ? 0x0480 : 0x6000);
        
        // Orientation check (Z-axis gravity shouldn't be too high if mounted properly)
        bool orientOk = (fabsf(d.accelZ) < 0.45f);
        uint32_t orientColor = orientOk ? COLOR_PRIMARY : COLOR_ERROR;
        g.fillRoundRect(132, y, w - 136, 12, 3, orientColor);

        g.setTextColor(COLOR_TEXT);
        g.setTextDatum(MC_DATUM);
        g.drawString(NetworkMgr.isWiFiConnected() ? "WiFi" : "NoWiFi", 34, y + 6);
        g.drawString(NetworkMgr.isMQTTConnected() ? "MQTT" : "NoMQ", 98, y + 6);
        g.drawString(orientOk ? "MOUNT OK" : "MOUNT ERR", 132 + (w - 136) / 2, y + 6);
        y += 16;

        // Big equally prominent Speed, Distance, Accel
        int rowH = 26;
        g.setTextDatum(ML_DATUM);

        // Row 1: Speed
        g.fillRoundRect(4, y, w - 8, rowH, 4, 0x1082);
        g.setTextSize(1);
        g.setTextColor(COLOR_CYAN);
        g.drawString("Speed", 10, y + rowH / 2);
        g.setTextSize(2);
        g.setTextColor(COLOR_PRIMARY);
        g.setTextDatum(MR_DATUM);
        g.drawString(String(d.velocityMs, 2) + " m/s", w - 10, y + rowH / 2);
        y += rowH + 4;

        // Row 2: Distance
        g.fillRoundRect(4, y, w - 8, rowH, 4, 0x1082);
        g.setTextSize(1);
        g.setTextColor(COLOR_CYAN);
        g.setTextDatum(ML_DATUM);
        g.drawString("Dist", 10, y + rowH / 2);
        g.setTextSize(2);
        g.setTextColor(COLOR_PRIMARY);
        g.setTextDatum(MR_DATUM);
        g.drawString(String(d.distanceM, 2) + " m", w - 10, y + rowH / 2);
        y += rowH + 4;

        // Row 3: Accel
        g.fillRoundRect(4, y, w - 8, rowH, 4, 0x1082);
        g.setTextSize(1);
        g.setTextColor(COLOR_CYAN);
        g.setTextDatum(ML_DATUM);
        g.drawString("Accel", 10, y + rowH / 2);
        g.setTextSize(2);
        g.setTextColor(COLOR_PRIMARY);
        g.setTextDatum(MR_DATUM);
        g.drawString(String(d.accelMs2, 2), w - 38, y + rowH / 2);
        g.setTextSize(1);
        g.setTextColor(COLOR_TEXT);
        g.drawString("m/s", w - 10, y + 8);
        g.drawString("2", w - 6, y + 14); // pseudo-superscript
        g.setTextSize(1); // restore
        y += rowH + 4;
        
    } else {
        // --- Page 1: Raw IMU + Battery details ---
        int y = 32;
        g.setTextDatum(TL_DATUM);
        g.setTextColor(COLOR_TEXT);
        
        g.fillRoundRect(4, y, w - 8, 90, 6, 0x1082);
        g.drawString("AX: " + String(d.accelX, 3), 10, y + 2);
        g.drawString("AY: " + String(d.accelY, 3), w/2, y + 2);
        g.drawString("AZ: " + String(d.accelZ, 3), 10, y + 14);
        g.setTextColor(COLOR_CYAN);
        g.drawString("GX: " + String(d.gyroX, 1), w/2, y + 14);
        g.drawString("GY: " + String(d.gyroY, 1), 10, y + 26);
        g.drawString("GZ: " + String(d.gyroZ, 1), w/2, y + 26);
        g.setTextColor(COLOR_TEXT);
        g.drawString("P: " + String(d.pitch, 1), 10, y + 42);
        g.drawString("R: " + String(d.roll, 1), w/2, y + 42);
        g.drawString("Bat: " + String(d.batVoltage, 2) + "V " + 
                     String(d.batPercentage) + "% " +
                     (d.isCharging ? "CHG" : "BAT"), 10, y + 58);
        g.drawString("Dir: " + String(d.direction == 1 ? "FWD" : d.direction == -1 ? "BWD" : "STP"),
                     10, y + 74);
        g.drawString("IP: " + NetworkMgr.getIP(), w/2, y + 74);
    }

    // Footer guide
    DisplayMgr.drawFooter("A:MENU", "B:PAGE", "C:MENU");

    needsRedraw = false;
    lastDrawMs = now;

    // Buttons: BtnB=change page, BtnA or BtnC=menu
    if (InputMgr.wasPressed(BTN_B)) {
        dashboardPage = (dashboardPage + 1) % 2;
        needsRedraw = true;
    }
    if (InputMgr.wasPressed(BTN_A) || InputMgr.wasPressed(BTN_C)) {
        switchScene(SCENE_MAIN_MENU);
    }
}

// ===== MAIN MENU =====
void SceneManager::updateMainMenu() {
    const char* items[] = {
        "WiFi Settings",
        "MQTT Config",
        "Device Name",
        "AP Config Mode",
        "Device Info",
        "Reset Distance",
        "Factory Reset",
        "Exit"
    };
    const int count = 8;

    if (InputMgr.wasPressed(BTN_B)) {
        menuIndex = (menuIndex + 1) % count;
        needsRedraw = true;
    }
    if (InputMgr.wasPressed(BTN_C)) {
        switchScene(SCENE_DASHBOARD);
        return;
    }
    if (InputMgr.wasPressed(BTN_A)) {
        switch (menuIndex) {
            case 0: // WiFi Settings
                isScanning = false; scanFailed = false;
                switchScene(SCENE_WIFI_SCAN);
                return;
            case 1: // MQTT Config
                switchScene(SCENE_MQTT_CONFIG);
                return;
            case 2: // Device Name
                startKeyboardInput("Device Name", &ConfigMgr.getConfig().deviceName, 20,
                                   SCENE_MAIN_MENU, KBD_CTX_DEVICE_NAME);
                return;
            case 3: // AP Config Mode
                NetworkMgr.disconnect();
                APPortalMgr.start();
                switchScene(SCENE_AP_PORTAL);
                return;
            case 4: // Device Info
                switchScene(SCENE_DEVICE_INFO);
                return;
            case 5: // Reset Distance
                SensorMgr.getData().distanceM = 0.0f;
                DisplayMgr.drawMessage("Distance", "Reset to 0.0m", COLOR_PRIMARY);
                DisplayMgr.present(true);
                delay(800);
                needsRedraw = true;
                return;
            case 6: // Factory Reset
                startConfirm("Factory Reset",
                             "Erase all settings?\nA=Yes  C=Cancel",
                             CONFIRM_FACTORY_RESET, SCENE_MAIN_MENU);
                return;
            case 7: // Exit
                switchScene(SCENE_DASHBOARD);
                return;
        }
    }

    if (needsRedraw) {
        DisplayMgr.drawMenu("Menu", items, count, menuIndex, false);
        needsRedraw = false;
        lastDrawMs = millis();
    }
}

// ===== WIFI SCAN =====
void SceneManager::updateWiFiScan() {
    if (wifiScanCount < 0 && !scanFailed && !isScanning) {
        if (needsRedraw) {
            DisplayMgr.drawMessage("WiFi", "Scanning...");
            DisplayMgr.present(true);
            needsRedraw = false;
        }

        isScanning = true;
        WiFi.scanDelete();
        WiFi.mode(WIFI_STA);
        WiFi.disconnect(false, false);
        delay(50);
        int count = WiFi.scanNetworks(false, true);
        if (count == WIFI_SCAN_FAILED) {
            WiFi.disconnect(false, false);
            delay(100);
            count = WiFi.scanNetworks(false, true);
        }
        isScanning = false;
        if (count == WIFI_SCAN_FAILED) { scanFailed = true; needsRedraw = true; return; }
        wifiScanCount = count;
        wifiScanIndex = 0;
        needsRedraw = true;
        return;
    }

    if (scanFailed) {
        if (needsRedraw) {
            DisplayMgr.drawMessage("WiFi", "Scan failed\nA=Retry C=Back", COLOR_ERROR);
            needsRedraw = false;
        }
        if (InputMgr.wasPressed(BTN_A)) { scanFailed = false; wifiScanCount = -1; needsRedraw = true; }
        if (InputMgr.wasPressed(BTN_C)) switchScene(SCENE_MAIN_MENU);
        return;
    }

    if (wifiScanCount <= 0) {
        if (needsRedraw) {
            DisplayMgr.drawMessage("WiFi", "No networks\nA=Rescan C=Back", COLOR_WARNING);
            needsRedraw = false;
        }
        if (InputMgr.wasPressed(BTN_A)) { wifiScanCount = -1; needsRedraw = true; }
        if (InputMgr.wasPressed(BTN_C)) switchScene(SCENE_MAIN_MENU);
        return;
    }

    if (InputMgr.wasPressed(BTN_B)) {
        wifiScanIndex = (wifiScanIndex + 1) % wifiScanCount;
        needsRedraw = true;
    }
    if (InputMgr.wasPressed(BTN_A)) {
        String ssid = NetworkMgr.getSSID(wifiScanIndex);
        if (ssid.length() > 0) {
            ConfigMgr.getConfig().wifiSSID = ssid;
            WiFi.scanDelete();
            startKeyboardInput("WiFi Pass", &ConfigMgr.getConfig().wifiPass, 32,
                               SCENE_MAIN_MENU, KBD_CTX_WIFI_PASS);
            return;
        }
    }
    if (InputMgr.wasPressed(BTN_C)) {
        WiFi.scanDelete();
        switchScene(SCENE_MAIN_MENU);
        return;
    }

    if (needsRedraw) {
        auto& g = DisplayMgr.getGfx();
        DisplayMgr.clear();
        DisplayMgr.drawHeader("Select WiFi");
        int y = 28, itemH = 18, maxItems = 6;
        int startIdx = max(0, wifiScanIndex - maxItems + 1);
        for (int i = 0; i < min(wifiScanCount - startIdx, maxItems); i++) {
            int idx = startIdx + i;
            int py = y + i * itemH;
            bool sel = (idx == wifiScanIndex);
            g.fillRoundRect(4, py, g.width() - 8, itemH - 2, 3, sel ? COLOR_PRIMARY : 0x18E3);
            g.setTextColor(sel ? COLOR_BG : COLOR_TEXT);
            g.setTextDatum(ML_DATUM);
            String ssid = NetworkMgr.getSSID(idx);
            if (ssid.length() > 14) ssid = ssid.substring(0, 14) + "..";
            g.drawString(ssid, 10, py + itemH / 2);
            g.setTextDatum(MR_DATUM);
            g.drawString(String(NetworkMgr.getRSSI(idx)), g.width() - 8, py + itemH / 2);
        }
        DisplayMgr.drawFooter("A:SEL", "B:NEXT", "C:BACK");
        needsRedraw = false;
        lastDrawMs = millis();
    }
}

// ===== KEYBOARD =====
void SceneManager::updateKeyboard() {
    const char* charset = getCharset();
    int charLen = getCharsetLen();

    if (InputMgr.wasPressed(BTN_B)) {
        if (keyboardSelectAction) {
            keyboardActionIndex = (keyboardActionIndex + 1) % 5;
        } else {
            keyboardCharIndex = (keyboardCharIndex + 1) % charLen;
        }
        needsRedraw = true;
    }
    if (InputMgr.wasPressed(BTN_C)) {
        // Toggle between char select and action bar
        keyboardSelectAction = !keyboardSelectAction;
        keyboardActionIndex = 0;
        needsRedraw = true;
    }
    if (InputMgr.wasPressed(BTN_A)) {
        if (keyboardSelectAction) {
            // Actions: 0=OK, 1=DEL, 2=CAPS, 3=SPACE, 4=CANCEL
            switch (keyboardActionIndex) {
                case 0: { // OK - done
                    if (keyboardTarget) *keyboardTarget = String(keyboardBuffer);
                    // Apply context
                    if (keyboardReturnContext == KBD_CTX_WIFI_PASS) {
                        ConfigMgr.saveConfig();
                        NetworkMgr.connect(ConfigMgr.getConfig().wifiSSID.c_str(),
                                          ConfigMgr.getConfig().wifiPass.c_str());
                    } else if (keyboardReturnContext == KBD_CTX_MQTT_BROKER ||
                               keyboardReturnContext == KBD_CTX_MQTT_PORT ||
                               keyboardReturnContext == KBD_CTX_MQTT_USER ||
                               keyboardReturnContext == KBD_CTX_MQTT_PASS) {
                        if (keyboardReturnContext == KBD_CTX_MQTT_PORT) {
                            ConfigMgr.getConfig().mqttPort = String(keyboardBuffer).toInt();
                        }
                        ConfigMgr.saveConfig();
                    } else if (keyboardReturnContext == KBD_CTX_DEVICE_NAME) {
                        ConfigMgr.saveConfig();
                    } else if (keyboardReturnContext == KBD_CTX_WHEEL_RADIUS) {
                        ConfigMgr.getConfig().wheelRadiusM = String(keyboardBuffer).toFloat();
                        ConfigMgr.saveConfig();
                    }
                    switchScene(lastScene);
                    return;
                }
                case 1: // DEL
                    if (keyboardCursorIndex > 0) {
                        keyboardCursorIndex--;
                        keyboardBuffer[keyboardCursorIndex] = '\0';
                    }
                    break;
                case 2: // CAPS
                    keyboardCaps = !keyboardCaps;
                    break;
                case 3: // SPACE
                    if (keyboardCursorIndex < keyboardMaxLen) {
                        keyboardBuffer[keyboardCursorIndex++] = ' ';
                        keyboardBuffer[keyboardCursorIndex] = '\0';
                    }
                    break;
                case 4: // CANCEL
                    switchScene(lastScene);
                    return;
            }
        } else {
            // Type character
            if (keyboardCursorIndex < keyboardMaxLen) {
                keyboardBuffer[keyboardCursorIndex++] = charset[keyboardCharIndex];
                keyboardBuffer[keyboardCursorIndex] = '\0';
            }
        }
        needsRedraw = true;
    }

    if (needsRedraw) {
        auto& g = DisplayMgr.getGfx();
        DisplayMgr.clear();
        DisplayMgr.drawHeader(keyboardTitle);
        
        // Input display
        g.fillRoundRect(4, 28, g.width() - 8, 18, 4, 0x1082);
        g.setTextColor(COLOR_PRIMARY);
        g.setTextDatum(TL_DATUM);
        String display = String(keyboardBuffer) + "_";
        if (display.length() > 28) display = ".." + display.substring(display.length() - 26);
        g.drawString(display, 8, 32);

        // Character selector
        g.setTextColor(COLOR_TEXT);
        int y = 52;
        g.drawString("Char:", 8, y);
        for (int i = -3; i <= 3; i++) {
            int ci = (keyboardCharIndex + i + charLen) % charLen;
            int x = g.width() / 2 + i * 16;
            bool sel = (i == 0 && !keyboardSelectAction);
            if (sel) {
                g.fillRoundRect(x - 7, y - 2, 14, 14, 3, COLOR_PRIMARY);
                g.setTextColor(COLOR_BG);
            } else {
                g.setTextColor(COLOR_TEXT);
            }
            g.setTextDatum(MC_DATUM);
            char ch[2] = {charset[ci], 0};
            g.drawString(ch, x, y + 5);
        }

        // Action bar (5 items now)
        y = 72;
        const char* actions[] = {"OK", "DEL", "CAP", "SPC", "ESC"};
        g.setTextDatum(MC_DATUM);
        for (int i = 0; i < 5; i++) {
            int x = 16 + i * (g.width() - 32) / 4;
            bool sel = (keyboardSelectAction && keyboardActionIndex == i);
            if (sel) {
                g.fillRoundRect(x - 14, y - 2, 28, 14, 3, COLOR_PRIMARY);
                g.setTextColor(COLOR_BG);
            } else {
                g.setTextColor(0x7BEF);
            }
            g.drawString(actions[i], x, y + 5);
        }

        g.setTextColor(0x7BEF);
        g.setTextDatum(TL_DATUM);
        g.drawString(keyboardSelectAction ? "B:next A:sel" : "B:char A:type", 4, g.height() - 12);
        g.drawString("C:toggle actions", g.width() / 2, g.height() - 12);
        
        needsRedraw = false;
        lastDrawMs = millis();
    }
}

// ===== MQTT CONFIG =====
void SceneManager::updateMQTTConfig() {
    AppConfig& config = ConfigMgr.getConfig();
    const char* items[] = {"Broker", "Port", "User", "Password", "Back"};
    const int count = 5;

    if (InputMgr.wasPressed(BTN_B)) {
        menuIndex = (menuIndex + 1) % count;
        needsRedraw = true;
    }
    if (InputMgr.wasPressed(BTN_C)) {
        switchScene(SCENE_MAIN_MENU);
        return;
    }
    if (InputMgr.wasPressed(BTN_A)) {
        switch (menuIndex) {
            case 0: startKeyboardInput("MQTT Broker", &config.mqttBroker, 40,
                                       SCENE_MQTT_CONFIG, KBD_CTX_MQTT_BROKER); return;
            case 1: keyboardScratch = String(config.mqttPort);
                    startKeyboardInput("MQTT Port", &keyboardScratch, 6,
                                       SCENE_MQTT_CONFIG, KBD_CTX_MQTT_PORT); return;
            case 2: startKeyboardInput("MQTT User", &config.mqttUser, 24,
                                       SCENE_MQTT_CONFIG, KBD_CTX_MQTT_USER); return;
            case 3: startKeyboardInput("MQTT Pass", &config.mqttPass, 24,
                                       SCENE_MQTT_CONFIG, KBD_CTX_MQTT_PASS); return;
            case 4: switchScene(SCENE_MAIN_MENU); return;
        }
    }

    if (needsRedraw) {
        DisplayMgr.drawMenu("MQTT Config", items, count, menuIndex, false);
        needsRedraw = false;
        lastDrawMs = millis();
    }
}

// ===== DEVICE INFO =====
void SceneManager::updateDeviceInfo() {
    if (needsRedraw || (millis() - lastDrawMs) >= 500) {
        SensorData& d = SensorMgr.getData();
        AppConfig& config = ConfigMgr.getConfig();
        auto& g = DisplayMgr.getGfx();
        
        DisplayMgr.clear();
        DisplayMgr.drawHeader("Device Info");
        g.setTextDatum(TL_DATUM);
        g.setTextColor(COLOR_TEXT);
        
        int y = 30;
        bool selName = (deviceInfoIndex == 0);
        bool selRadius = (deviceInfoIndex == 1);
        
        g.fillRoundRect(4, y, g.width() - 8, 14, 3, selName ? COLOR_PRIMARY : 0x1082);
        g.setTextColor(selName ? COLOR_BG : COLOR_TEXT);
        g.drawString("Name: " + config.deviceName, 8, y + 2);
        y += 16;
        
        g.fillRoundRect(4, y, g.width() - 8, 14, 3, selRadius ? COLOR_PRIMARY : 0x1082);
        g.setTextColor(selRadius ? COLOR_BG : COLOR_TEXT);
        g.drawString("Wheel R: " + String(config.wheelRadiusM, 3) + "m", 8, y + 2);
        y += 16;
        
        g.setTextColor(COLOR_TEXT);
        g.drawString("IP: " + NetworkMgr.getIP(), 8, y + 2); y += 14;
        g.drawString("MQTT: " + config.mqttBroker, 8, y + 2); y += 14;
        g.drawString("Bat: " + String(d.batPercentage) + "% " +
                     String(d.batVoltage, 2) + "V", 8, y + 2); y += 14;
        g.drawString("FW: " FIRMWARE_VERSION, 8, y + 2);

        DisplayMgr.drawFooter("A:EDIT", "B:NEXT", "C:BACK");
        
        needsRedraw = false;
        lastDrawMs = millis();
    }

    if (InputMgr.wasPressed(BTN_B)) {
        deviceInfoIndex = (deviceInfoIndex + 1) % 2;
        needsRedraw = true;
    }
    if (InputMgr.wasPressed(BTN_A)) {
        if (deviceInfoIndex == 0) {
            startKeyboardInput("Device Name", &ConfigMgr.getConfig().deviceName, 20,
                               SCENE_DEVICE_INFO, KBD_CTX_DEVICE_NAME);
        } else {
            keyboardScratch = String(ConfigMgr.getConfig().wheelRadiusM, 3);
            startKeyboardInput("Wheel Radius", &keyboardScratch, 8,
                               SCENE_DEVICE_INFO, KBD_CTX_WHEEL_RADIUS);
        }
    }
    if (InputMgr.wasPressed(BTN_C)) {
        switchScene(SCENE_MAIN_MENU);
    }
}

// ===== AP PORTAL =====
void SceneManager::updateAPPortal() {
    APPortalMgr.update();

    if (needsRedraw || (millis() - lastDrawMs) >= 1000) {
        auto& g = DisplayMgr.getGfx();
        int w = g.width();
        int h = g.height();
        DisplayMgr.clear();
        DisplayMgr.drawHeader("AP Config Mode");

        // Layout: left side = text info, right side = QR code
        int qrSize = 72;
        int qrX = w - qrSize - 6;
        int qrY = 30;

        // QR code (white bg + code)
        g.fillRect(qrX - 2, qrY - 2, qrSize + 4, qrSize + 4, COLOR_TEXT);
        g.qrcode("http://192.168.4.1", qrX, qrY, qrSize, 3);

        // Text info on the left
        int y = 32;
        g.setTextDatum(TL_DATUM);
        g.setTextSize(1);

        g.setTextColor(COLOR_CYAN);
        g.drawString("WiFi:", 8, y);
        y += 12;
        g.setTextColor(COLOR_PRIMARY);
        String ssid = APPortalMgr.getAPSSID();
        if (ssid.length() > 14) ssid = ssid.substring(0, 14) + "..";
        g.drawString(ssid, 8, y);
        y += 14;

        g.setTextColor(COLOR_CYAN);
        g.drawString("Open:", 8, y);
        y += 12;
        g.setTextColor(COLOR_PRIMARY);
        g.drawString("192.168.4.1", 8, y);
        y += 14;

        g.setTextColor(COLOR_TEXT);
        g.drawString("Scan QR ->", 8, y);
        y += 16;

        // Connected clients + pulsing dot
        unsigned long pulse = (millis() / 500) % 2;
        uint16_t dotColor = pulse ? COLOR_PRIMARY : 0x0300;
        g.fillCircle(16, y + 4, 3, dotColor);
        g.setTextColor(COLOR_TEXT);
        g.drawString("Clients:" + String(WiFi.softAPgetStationNum()), 24, y);

        // Footer
        DisplayMgr.drawFooter("A:STOP", "", "C:STOP");

        needsRedraw = false;
        lastDrawMs = millis();
    }

    if (InputMgr.wasPressed(BTN_A) || InputMgr.wasPressed(BTN_C)) {
        APPortalMgr.stop();
        switchScene(SCENE_MAIN_MENU);
    }
}

// ===== CONFIRMATION SCREEN =====
void SceneManager::updateConfirm() {
    if (needsRedraw) {
        auto& g = DisplayMgr.getGfx();
        int w = g.width(), h = g.height();
        DisplayMgr.clear();
        DisplayMgr.drawHeader(confirmTitle);

        // Warning icon area
        g.fillRoundRect(8, 36, w - 16, 60, 8, 0x1082);
        g.setTextColor(COLOR_WARNING);
        g.setTextDatum(MC_DATUM);
        g.setTextSize(2);
        g.drawString("!", w / 2, 52);
        g.setTextSize(1);

        // Message lines
        g.setTextColor(COLOR_TEXT);
        String msg = String(confirmMessage);
        int y = 72;
        int start = 0;
        while (start <= (int)msg.length()) {
            int idx = msg.indexOf('\n', start);
            String line = (idx < 0) ? msg.substring(start) : msg.substring(start, idx);
            g.setTextDatum(MC_DATUM);
            g.drawString(line, w / 2, y);
            y += 14;
            if (idx < 0) break;
            start = idx + 1;
        }

        // Footer
        DisplayMgr.drawFooter("A:YES", "", "C:CANCEL");

        needsRedraw = false;
        lastDrawMs = millis();
    }

    if (InputMgr.wasPressed(BTN_A)) {
        switch (confirmContext) {
            case CONFIRM_FACTORY_RESET:
                ConfigMgr.factoryReset();
                DisplayMgr.drawMessage("Reset", "Factory reset done!\nRebooting...", COLOR_PRIMARY);
                DisplayMgr.present(true);
                delay(1500);
                ESP.restart();
                break;
            default:
                break;
        }
        switchScene(lastScene);
    }

    if (InputMgr.wasPressed(BTN_C)) {
        switchScene(lastScene);
    }
}
