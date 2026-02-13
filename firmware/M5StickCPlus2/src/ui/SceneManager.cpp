#include "SceneManager.h"
#include "../managers/BLEManager.h"
#include <math.h>

SceneManager SceneMgr;

#ifndef min
#define min(a,b) ((a)<(b)?(a):(b))
#endif

const char* KEYBOARD_CHARS_LOWER = "1234567890-_=qwertyuiop[]asdfghjkl;'\\zxcvbnm,./";
const char* KEYBOARD_CHARS_UPPER = "1234567890-_=QWERTYUIOP[]ASDFGHJKL;\"|ZXCVBNM<>?";
const int KEYBOARD_LEN = strlen(KEYBOARD_CHARS_LOWER);

SceneManager::SceneManager() {}

void SceneManager::begin() {
    DisplayMgr.begin();
    switchScene(SCENE_BOOT);
}

void SceneManager::switchScene(SceneID scene) {
    if (currentScene == SCENE_WIFI_SCAN && scene != SCENE_WIFI_SCAN) {
        WiFi.scanDelete();
        BLEMgr.setScanningEnabled(true);
    }
    if (scene == SCENE_WIFI_SCAN) {
        BLEMgr.setScanningEnabled(false);
    }
    if (scene == SCENE_CALIBRATE) {
        BLEMgr.setScanningEnabled(true);
    }

    currentScene = scene;
    menuIndex = 0;
    menuScrollOffset = 0;
    deviceInfoIndex = 0;
    wifiScanIndex = 0;
    wifiScanCount = -1;
    wifiScanStartedMs = 0;
    wifiScanRetryCount = 0;
    needsRedraw = true;
    if (scene == SCENE_BOOT) {
        bootStartMs = millis();
    }
    if (scene == SCENE_SERVER_CONFIG) {
        serverConfigSyncing = false;
        serverConfigSyncSuccess = false;
        serverConfigSyncDone = false;
    }
    if (scene == SCENE_CALIBRATE) {
        calibrateStep = 0;
        calibrateRoomIndex = 0;
        calibrateScanRound = 0;
        calibrateScanRequested = false;
    }
}

bool SceneManager::isWiFiScanScene() const {
    return currentScene == SCENE_WIFI_SCAN;
}

void SceneManager::startKeyboardInput(const char* title, String* targetStr, int maxLen, SceneID returnScene, KeyboardContext ctx) {
    keyboardTarget = targetStr;
    keyboardMaxLen = min((int)sizeof(keyboardBuffer), maxLen);
    lastScene = returnScene;
    keyboardReturnContext = ctx;
    
    memset(keyboardBuffer, 0, sizeof(keyboardBuffer));
    if (targetStr) {
        strncpy(keyboardBuffer, targetStr->c_str(), sizeof(keyboardBuffer) - 1);
        keyboardBuffer[sizeof(keyboardBuffer) - 1] = 0;
    }
    if (!title) title = "Input";
    snprintf(keyboardTitle, sizeof(keyboardTitle), "%s", title);
    
    keyboardCursorIndex = strlen(keyboardBuffer);
    keyboardCharIndex = 0;
    keyboardActionIndex = 0;
    keyboardCaps = false;
    keyboardSelectAction = false;
    needsRedraw = true;
    
    DisplayMgr.clear();
    currentScene = SCENE_KEYBOARD;
}

void SceneManager::update() {
    switch(currentScene) {
        case SCENE_BOOT: updateBoot(); break;
        case SCENE_DASHBOARD: updateDashboard(); break;
        case SCENE_MAIN_MENU: updateMainMenu(); break;
        case SCENE_WIFI_SCAN: updateWiFiScan(); break;
        case SCENE_KEYBOARD: updateKeyboard(); break;
        case SCENE_MQTT_CONFIG: updateMQTTConfig(); break;
        case SCENE_DEVICE_INFO:
            if (needsRedraw || (millis() - lastDrawMs) >= 500) {
                DisplayMgr.clear();
                DisplayMgr.drawHeader("Device Info");
                SensorData& data = SensorMgr.getData();
                auto& g = DisplayMgr.getGfx();
                g.setTextDatum(TL_DATUM);
                g.setTextColor(COLOR_TEXT);

                const int rowH = 16;
                int y = 34;

                bool selName = (deviceInfoIndex == 0);
                bool selRadius = (deviceInfoIndex == 1);

                g.fillRoundRect(4, y - 2, g.width() - 8, rowH - 1, 3, selName ? COLOR_PRIMARY : 0x1082);
                g.setTextColor(selName ? COLOR_BG : COLOR_TEXT);
                g.drawString("Name: " + ConfigMgr.getConfig().deviceName, 8, y);
                y += rowH;

                g.fillRoundRect(4, y - 2, g.width() - 8, rowH - 1, 3, selRadius ? COLOR_PRIMARY : 0x1082);
                g.setTextColor(selRadius ? COLOR_BG : COLOR_TEXT);
                g.drawString("Wheel R(m): " + String(ConfigMgr.getConfig().wheelRadiusM, 3), 8, y);
                y += rowH;

                g.setTextColor(COLOR_TEXT);
                g.drawString("IP: " + NetworkMgr.getIP(), 8, y); y += rowH;
                g.drawString("WiFi Retry: " + String(NetworkMgr.getWiFiReconnectAttempts()), 8, y); y += rowH;
                g.drawString("MQTT Retry: " + String(NetworkMgr.getMQTTReconnectAttempts()), 8, y); y += rowH;
                g.drawString("Battery: " + String(data.batPercentage) + "%", 8, y); y += rowH;
                g.drawString("FW: " + String(FIRMWARE_VERSION), 8, y);

                needsRedraw = false;
                lastDrawMs = millis();
            }
            if (InputMgr.wasPressed(BTN_B)) {
                deviceInfoIndex = (deviceInfoIndex + 1) % 2;
                needsRedraw = true;
            }
            if (InputMgr.wasPressed(BTN_A)) {
                if (deviceInfoIndex == 0) {
                    startKeyboardInput("Device Name", &ConfigMgr.getConfig().deviceName, 20, SCENE_DEVICE_INFO, KBD_CTX_DEVICE_NAME);
                } else {
                    keyboardScratch = String(ConfigMgr.getConfig().wheelRadiusM, 3);
                    startKeyboardInput("Wheel Radius (m)", &keyboardScratch, 8, SCENE_DEVICE_INFO, KBD_CTX_WHEEL_RADIUS);
                }
            }
            if (InputMgr.wasPressed(BTN_C)) {
                switchScene(SCENE_MAIN_MENU);
                return;
            }
            break;
        case SCENE_SERVER_CONFIG: updateServerConfig(); break;
        case SCENE_CALIBRATE: updateCalibrate(); break;
    }
    DisplayMgr.present();
}

void SceneManager::updateBoot() {
    const unsigned long now = millis();
    const int w = DisplayMgr.getGfx().width();
    const int h = DisplayMgr.getGfx().height();
    const int cx = w / 2;

    if (!needsRedraw && (now - lastDrawMs) < 33) {
        if (now - bootStartMs >= BOOT_DURATION_MS) {
            switchScene(SCENE_DASHBOARD);
        }
        return;
    }

    float progress = (float)(now - bootStartMs) / (float)BOOT_DURATION_MS;
    if (progress > 1.0f) progress = 1.0f;
    float spinTurns = 8.0f;
    float angle = progress * spinTurns * 2.0f * PI;

    DisplayMgr.clear();

    int rearX = cx - 28;
    int frontX = cx + 26;
    int baseY = h / 2 - 18;

    DisplayMgr.getGfx().fillRoundRect(12, 30, w - 24, h - 55, 12, 0x1082);
    DisplayMgr.getGfx().drawRoundRect(12, 30, w - 24, h - 55, 12, 0x2965);

    for (int i = 0; i < 3; i++) {
        int r0 = 18 + i * 9;
        int r1 = r0 + 3;
        DisplayMgr.getGfx().fillArc(rearX - 5, baseY - 16, r0, r1, 105.0f, 175.0f, 0x07FF);
    }

    DisplayMgr.getGfx().fillCircle(rearX, baseY, 18, 0x39C7);
    DisplayMgr.getGfx().fillCircle(rearX, baseY, 13, 0x1082);
    DisplayMgr.getGfx().drawCircle(rearX, baseY, 18, 0xC618);

    for (int spoke = 0; spoke < 6; spoke++) {
        float a = angle + (2.0f * PI * spoke / 6.0f);
        int x2 = rearX + (int)(cosf(a) * 12.0f);
        int y2 = baseY + (int)(sinf(a) * 12.0f);
        DisplayMgr.getGfx().drawLine(rearX, baseY, x2, y2, COLOR_PRIMARY);
    }

    DisplayMgr.getGfx().fillCircle(frontX, baseY + 5, 8, 0xBDF7);
    DisplayMgr.getGfx().fillCircle(frontX, baseY + 5, 5, 0x1082);
    DisplayMgr.getGfx().drawCircle(frontX, baseY + 5, 8, 0xC618);

    DisplayMgr.getGfx().fillRoundRect(cx - 24, baseY - 15, 36, 12, 4, 0xE71C);
    DisplayMgr.getGfx().fillRect(cx - 26, baseY - 25, 5, 15, 0xE71C);
    DisplayMgr.getGfx().fillRect(cx + 8, baseY - 10, 20, 4, 0xE71C);
    DisplayMgr.getGfx().fillCircle(cx - 10, baseY - 23, 6, COLOR_TEXT);
    DisplayMgr.getGfx().fillRect(cx - 16, baseY - 16, 12, 7, COLOR_TEXT);
    DisplayMgr.getGfx().drawLine(cx - 8, baseY - 15, rearX + 5, baseY - 2, COLOR_TEXT);

    DisplayMgr.getGfx().setTextDatum(MC_DATUM);
    DisplayMgr.getGfx().setTextColor(COLOR_TEXT);
    DisplayMgr.getGfx().setTextSize(2);
    DisplayMgr.getGfx().drawString("WheelSense", cx, h - 52);
    DisplayMgr.getGfx().setTextSize(1);
    DisplayMgr.getGfx().setTextColor(0xC618);
    DisplayMgr.getGfx().drawString("Smart Mobility Gateway", cx, h - 34);

    int barW = w - 40;
    int fillW = (int)(barW * progress);
    DisplayMgr.getGfx().drawRoundRect(20, h - 22, barW, 10, 5, 0x7BEF);
    DisplayMgr.getGfx().fillRoundRect(21, h - 21, fillW > 2 ? fillW - 2 : 0, 8, 4, COLOR_PRIMARY);

    needsRedraw = false;
    lastDrawMs = now;

    if (now - bootStartMs >= BOOT_DURATION_MS) {
        switchScene(SCENE_DASHBOARD);
    }
}

void SceneManager::updateDashboard() {
    const unsigned long now = millis();
    const bool dataRefresh = (now - lastDrawMs >= DISPLAY_UPDATE_INTERVAL);
    
    if (needsRedraw || dataRefresh) {
        drawDashboard();
        needsRedraw = false;
        lastDrawMs = now;
    }
    
    if (InputMgr.wasPressed(BTN_B)) {
        dashboardPage = (dashboardPage + 1) % 3;
        needsRedraw = true;
    }
    if (InputMgr.wasPressed(BTN_A) || InputMgr.wasPressed(BTN_C)) {
        switchScene(SCENE_MAIN_MENU);
        return;
    }
}

void SceneManager::drawDashboard() {
    DisplayMgr.clear();
    DisplayMgr.drawHeader("Dashboard");
    
    SensorData& data = SensorMgr.getData();
    AppConfig& config = ConfigMgr.getConfig();
    BLENode nodes[MAX_BLE_NODES];
    int nodeCount = BLEMgr.copyNodes(nodes, MAX_BLE_NODES);

    int strongestIdx = -1;
    int strongestRssi = -127;
    int strongestNodeId = 0;
    for (int i = 0; i < nodeCount; i++) {
        if (nodes[i].rssi > strongestRssi) {
            strongestRssi = nodes[i].rssi;
            strongestIdx = i;
            strongestNodeId = nodes[i].id;
        }
    }
    int nearbyCount = nodeCount > 0 ? (nodeCount - 1) : 0;

    String currentRoom = "Unknown";
    if (nodeCount > 0 && FingerprintMgr.getFingerprintCount() > 0) {
        int nodeIds[MAX_BLE_NODES];
        int8_t rssis[MAX_BLE_NODES];
        for (int i = 0; i < nodeCount; i++) {
            nodeIds[i] = nodes[i].id;
            rssis[i] = (int8_t)nodes[i].rssi;
        }
        currentRoom = FingerprintMgr.matchRoom(nodeIds, rssis, nodeCount);
    }

    String statusShort = SensorMgr.getWheelchairStatusShort();
    String motionShort = SensorMgr.getMotionShort();
    auto& g = DisplayMgr.getGfx();
    const int w = g.width();
    g.setTextSize(1);

    if (dashboardPage == 0) {
        g.setTextDatum(TL_DATUM);
        g.fillRoundRect(8, 30, 108, 14, 4, NetworkMgr.isWiFiConnected() ? 0x0480 : 0x6000);
        g.fillRoundRect(w - 116, 30, 108, 14, 4, NetworkMgr.isMQTTConnected() ? 0x0480 : 0x6000);
        g.setTextColor(COLOR_TEXT);
        g.drawString(String("WiFi ") + (NetworkMgr.isWiFiConnected() ? "OK" : "NO"), 14, 34);
        g.drawString(String("MQTT ") + (NetworkMgr.isMQTTConnected() ? "OK" : "NO"), w - 110, 34);

        g.fillRoundRect(8, 48, 108, 62, 6, 0x1082);
        g.drawRoundRect(8, 48, 108, 62, 6, 0x2965);
        g.setTextColor(COLOR_TEXT);
        g.drawString(config.deviceName, 14, 52);
        g.setTextDatum(MC_DATUM);
        g.setTextSize(2);
        g.setTextColor(COLOR_PRIMARY);
        g.drawString(String(data.speedMps, 2), 62, 76);
        g.setTextSize(1);
        g.setTextColor(COLOR_TEXT);
        g.drawString("m/s", 62, 90);
        g.setTextDatum(TL_DATUM);
        g.drawString(String("Dist ") + String(data.distanceM, 2) + " m", 14, 94);

        g.setTextDatum(TL_DATUM);
        g.fillRoundRect(w - 116, 48, 108, 62, 6, 0x1082);
        g.drawRoundRect(w - 116, 48, 108, 62, 6, 0x2965);
        g.setTextColor(COLOR_TEXT);
        g.drawString("Node & Room", w - 110, 52);
        if (strongestIdx >= 0) {
            g.setTextColor(COLOR_PRIMARY);
            g.drawString("N" + String(strongestNodeId) + "  " + String(strongestRssi) + "dBm", w - 110, 68);
        } else {
            g.setTextColor(COLOR_WARNING);
            g.drawString("No Node", w - 110, 68);
        }
        g.setTextColor(COLOR_TEXT);
        g.drawString("Nearby " + String(max(nearbyCount, 0)), w - 110, 82);
        String roomShort = currentRoom;
        if (roomShort.length() > 10) roomShort = roomShort.substring(0, 10) + "..";
        g.drawString("Room " + roomShort, w - 110, 96);

        g.fillRoundRect(8, 114, w - 16, 14, 4, 0x18E3);
        g.setTextColor((data.wheelchairStatusBits == 0) ? COLOR_PRIMARY : COLOR_ERROR);
        g.drawString(
            statusShort + "  Bat " + String(data.batPercentage) + "%  M:" + motionShort,
            12, 118
        );
    } else if (dashboardPage == 1) {
        g.setTextDatum(TL_DATUM);
        g.setTextColor(COLOR_TEXT);
        g.fillRoundRect(8, 30, w - 16, 98, 6, 0x1082);
        g.drawRoundRect(8, 30, w - 16, 98, 6, 0x2965);

        const int xL = 14;
        const int xR = w / 2 + 4;
        int y0 = 38;
        g.drawString("AX " + String(data.accelX, 2), xL, y0);
        g.drawString("AY " + String(data.accelY, 2), xR, y0);
        y0 += 16;
        g.drawString("AZ " + String(data.accelZ, 2), xL, y0);
        g.drawString("GX " + String(data.gyroX, 1), xR, y0);
        y0 += 16;
        g.drawString("GY " + String(data.gyroY, 1), xL, y0);
        g.drawString("GZ " + String(data.gyroZ, 1), xR, y0);
        y0 += 16;
        g.drawString("Status " + statusShort, xL, y0);
        g.drawString("Broker " + String(config.useLocalBroker ? "LOCAL" : "PUBLIC"), xR, y0);
        y0 += 16;
        g.drawString("IP " + NetworkMgr.getIP(), xL, y0);
    } else {
        g.setTextDatum(MC_DATUM);
        g.fillRoundRect(8, 30, w - 16, 98, 8, 0x1082);
        g.drawRoundRect(8, 30, w - 16, 98, 8, 0x2965);

        g.setTextColor(COLOR_PRIMARY);
        g.setTextSize(3);
        g.drawString(String(data.speedMps, 2), w / 2, 58);
        g.setTextSize(1);
        g.setTextColor(COLOR_TEXT);
        g.drawString("m/s", w / 2, 82);

        g.setTextSize(2);
        g.setTextColor(COLOR_CYAN);
        g.drawString(String(data.distanceM, 2) + " m", w / 2, 102);
        g.setTextSize(1);
        g.setTextColor((data.wheelchairStatusBits == 0) ? COLOR_PRIMARY : COLOR_ERROR);
        g.drawString(statusShort, w / 2, 120);
    }
    
    DisplayMgr.getGfx().setTextSize(1);
    DisplayMgr.drawFooter("A:MENU", "B:PAGE", "C:MENU");
}

void SceneManager::updateMainMenu() {
    const char* items[] = {"Config from Server", "Calibrate", "WiFi Settings", "MQTT Config", "Device Info", "Exit"};
    int count = 6;
    
    if (InputMgr.wasPressed(BTN_B)) {
        menuIndex = (menuIndex + 1) % count;
        needsRedraw = true;
        BuzzerMgr.beepButton();
    }
    if (InputMgr.wasPressed(BTN_A)) {
        BuzzerMgr.beepButton();
        if (menuIndex == 0) {
            switchScene(SCENE_SERVER_CONFIG);
            return;
        } else if (menuIndex == 1) {
            switchScene(SCENE_CALIBRATE);
            return;
        } else if (menuIndex == 2) {
            isScanning = false;
            scanFailed = false;
            switchScene(SCENE_WIFI_SCAN);
            return;
        } else if (menuIndex == 3) {
            switchScene(SCENE_MQTT_CONFIG);
            return;
        } else if (menuIndex == 4) {
            switchScene(SCENE_DEVICE_INFO);
            return;
        } else if (menuIndex == 5) {
            switchScene(SCENE_DASHBOARD);
            return;
        }
    }
    if (InputMgr.wasPressed(BTN_C)) {
        switchScene(SCENE_DASHBOARD);
        return;
    }
    
    if (needsRedraw) {
        DisplayMgr.drawMenu("Main Menu", items, count, menuIndex, false);
        needsRedraw = false;
        lastDrawMs = millis();
    }
}

void SceneManager::updateWiFiScan() {
    if (wifiScanCount < 0 && !scanFailed && !isScanning) {
        if (needsRedraw) {
            DisplayMgr.drawMessage("WiFi", "Scanning...");
            DisplayMgr.present(true);
            needsRedraw = false;
            lastDrawMs = millis();
        }

        isScanning = true;
        WiFi.scanDelete();
        WiFi.mode(WIFI_STA);
        WiFi.disconnect(false, false);
        delay(50);

        int count = WiFi.scanNetworks(false, true);
        if (count == WIFI_SCAN_FAILED) {
            WiFi.mode(WIFI_STA);
            WiFi.disconnect(false, false);
            delay(100);
            count = WiFi.scanNetworks(false, true);
        }

        isScanning = false;
        if (count == WIFI_SCAN_FAILED) {
            scanFailed = true;
            needsRedraw = true;
            return;
        }

        wifiScanCount = count;
        wifiScanIndex = 0;
        needsRedraw = true;
        return;
    }

    if (scanFailed) {
        if (needsRedraw) {
            DisplayMgr.drawMessage("WiFi", "Scan failed\nA=Retry C=Back", COLOR_ERROR);
            needsRedraw = false;
            lastDrawMs = millis();
        }
        if (InputMgr.wasPressed(BTN_A)) {
            scanFailed = false;
            wifiScanCount = -1;
            needsRedraw = true;
        }
        if (InputMgr.wasPressed(BTN_C)) switchScene(SCENE_MAIN_MENU);
        return;
    }

    const int count = wifiScanCount;
    if (count <= 0) {
        if (needsRedraw) {
            DisplayMgr.drawMessage("WiFi", "No Networks\nA=Rescan C=Back", COLOR_WARNING);
            needsRedraw = false;
            lastDrawMs = millis();
        }
        if (InputMgr.wasPressed(BTN_A)) {
            wifiScanCount = -1;
            needsRedraw = true;
        }
        if (InputMgr.wasPressed(BTN_C)) switchScene(SCENE_MAIN_MENU);
        return;
    }

    if (InputMgr.wasPressed(BTN_B)) {
        wifiScanIndex = (wifiScanIndex + 1) % count;
        needsRedraw = true;
    }
    if (InputMgr.wasPressed(BTN_A)) {
        if (wifiScanIndex >= 0 && wifiScanIndex < count) {
            String ssidTarget = NetworkMgr.getSSID(wifiScanIndex);
            if (ssidTarget.length() > 0) {
                ConfigMgr.getConfig().wifiSSID = ssidTarget;
                WiFi.scanDelete();
                startKeyboardInput("WiFi Pass", &ConfigMgr.getConfig().wifiPass, 32, SCENE_MAIN_MENU, KBD_CTX_WIFI_PASS);
                return;
            }
        }
    }
    if (InputMgr.wasPressed(BTN_C)) {
        WiFi.scanDelete();
        switchScene(SCENE_MAIN_MENU);
        return;
    }

    if (needsRedraw) {
        DisplayMgr.clear();
        DisplayMgr.drawHeader("Select WiFi");
        int startY = 30;
        int itemH = 20;
        int maxItems = 7;
        int startIdx = (wifiScanIndex / maxItems) * maxItems;

        for (int i = 0; i < min(count - startIdx, maxItems); i++) {
            int idx = startIdx + i;
            int y = startY + (i * itemH);

            if (idx == wifiScanIndex) {
                DisplayMgr.getGfx().fillRect(0, y, DisplayMgr.getGfx().width(), itemH, COLOR_PRIMARY);
                DisplayMgr.getGfx().setTextColor(COLOR_BG);
            } else {
                DisplayMgr.getGfx().setTextColor(COLOR_TEXT);
            }

            String ssid = NetworkMgr.getSSID(idx);
            if (ssid.length() == 0) ssid = "<hidden>";
            if (ssid.length() > 15) ssid = ssid.substring(0, 15) + "..";

            DisplayMgr.getGfx().setTextDatum(ML_DATUM);
            DisplayMgr.getGfx().drawString(ssid, 10, y + itemH / 2);

            DisplayMgr.getGfx().setTextDatum(MR_DATUM);
            DisplayMgr.getGfx().drawString(String(NetworkMgr.getRSSI(idx)), DisplayMgr.getGfx().width() - 5, y + itemH / 2);
        }

        needsRedraw = false;
        lastDrawMs = millis();
    }
}

void SceneManager::updateServerConfig() {
    if (!serverConfigSyncDone && !serverConfigSyncing) {
        if (needsRedraw) {
            DisplayMgr.clear();
            DisplayMgr.drawHeader("Config from Server");
            DisplayMgr.getGfx().setTextDatum(TL_DATUM);
            DisplayMgr.getGfx().setTextColor(COLOR_TEXT);
            DisplayMgr.getGfx().drawString("Sync configuration", 5, 40);
            DisplayMgr.getGfx().drawString("from backend server", 5, 58);
            DisplayMgr.drawFooter("A:Sync Now", "", "C:Back");
            needsRedraw = false;
        }
        if (InputMgr.wasPressed(BTN_A)) {
            BuzzerMgr.beepButton();
            serverConfigSyncing = true;
            serverConfigSyncSuccess = NetworkMgr.syncConfigFromServer();
            serverConfigSyncDone = true;
            if (serverConfigSyncSuccess) BuzzerMgr.beepSuccess();
            else BuzzerMgr.beepError();
            needsRedraw = true;
        }
        if (InputMgr.wasPressed(BTN_C)) {
            BuzzerMgr.beepButton();
            switchScene(SCENE_MAIN_MENU);
            return;
        }
        return;
    }
    
    if (needsRedraw) {
        DisplayMgr.clear();
        DisplayMgr.drawHeader("Config from Server");
        DisplayMgr.getGfx().setTextDatum(TL_DATUM);
        if (serverConfigSyncSuccess) {
            DisplayMgr.getGfx().setTextColor(COLOR_PRIMARY);
            DisplayMgr.getGfx().drawString("Synced!", 5, 40);
            DisplayMgr.getGfx().setTextColor(COLOR_TEXT);
            int rc = ConfigMgr.getCachedRoomCount();
            DisplayMgr.getGfx().drawString("Rooms: " + String(rc), 5, 60);
            DisplayMgr.getGfx().drawString("You can Calibrate now", 5, 80);
        } else {
            DisplayMgr.getGfx().setTextColor(COLOR_ERROR);
            DisplayMgr.getGfx().drawString("Sync failed", 5, 40);
            DisplayMgr.getGfx().setTextColor(COLOR_TEXT);
            DisplayMgr.getGfx().drawString("Check WiFi/Backend URL", 5, 60);
            DisplayMgr.getGfx().drawString("Using cached (if any)", 5, 80);
        }
        DisplayMgr.drawFooter("A:Retry", "", "C:Back");
        needsRedraw = false;
    }
    if (InputMgr.wasPressed(BTN_A)) {
        BuzzerMgr.beepButton();
        serverConfigSyncDone = false;
        serverConfigSyncing = false;
        needsRedraw = true;
    }
    if (InputMgr.wasPressed(BTN_C)) {
        BuzzerMgr.beepButton();
        switchScene(SCENE_MAIN_MENU);
    }
}

void SceneManager::updateCalibrate() {
    int rc = ConfigMgr.getCachedRoomCount();
    RoomInfo* rooms = ConfigMgr.getCachedRooms();
    
    if (rc == 0 && calibrateStep == 0) {
        if (needsRedraw) {
            DisplayMgr.clear();
            DisplayMgr.drawHeader("Calibrate");
            DisplayMgr.getGfx().setTextDatum(TL_DATUM);
            DisplayMgr.getGfx().setTextColor(COLOR_WARNING);
            DisplayMgr.getGfx().drawString("Sync Config first!", 5, 40);
            DisplayMgr.getGfx().setTextColor(COLOR_TEXT);
            DisplayMgr.getGfx().drawString("Go to Config from Server", 5, 60);
            DisplayMgr.drawFooter("", "", "C:Back");
            needsRedraw = false;
        }
        if (InputMgr.wasPressed(BTN_C)) {
            BuzzerMgr.beepButton();
            switchScene(SCENE_MAIN_MENU);
            return;
        }
        return;
    }
    
    if (calibrateStep == 0) {
        if (InputMgr.wasPressed(BTN_B)) {
            calibrateRoomIndex = (calibrateRoomIndex + 1) % rc;
            needsRedraw = true;
            BuzzerMgr.beepButton();
        }
        if (InputMgr.wasPressed(BTN_A)) {
            BuzzerMgr.beepButton();
            calibrateStep = 1;
            needsRedraw = true;
        }
        if (InputMgr.wasPressed(BTN_C)) {
            BuzzerMgr.beepButton();
            switchScene(SCENE_MAIN_MENU);
        }
        if (needsRedraw) {
            DisplayMgr.clear();
            DisplayMgr.drawHeader("Calibrate - Select Room");
            DisplayMgr.getGfx().setTextDatum(TL_DATUM);
            DisplayMgr.getGfx().setTextColor(COLOR_TEXT);
            DisplayMgr.getGfx().drawString("Select room to calibrate:", 5, 35);

            int maxShow = min(rc, 5);
            int startIdx = 0;
            if (calibrateRoomIndex >= maxShow) {
                startIdx = calibrateRoomIndex - maxShow + 1;
            }
            if (startIdx > rc - maxShow) startIdx = rc - maxShow;
            if (startIdx < 0) startIdx = 0;

            for (int i = 0; i < maxShow; i++) {
                int idx = startIdx + i;
                int y = 55 + i * 18;
                if (idx == calibrateRoomIndex) {
                    DisplayMgr.getGfx().setTextColor(COLOR_PRIMARY);
                    DisplayMgr.getGfx().drawString("> ", 5, y);
                }
                DisplayMgr.getGfx().drawString(rooms[idx].name, 20, y);
                if (idx == calibrateRoomIndex) DisplayMgr.getGfx().setTextColor(COLOR_TEXT);
            }
            DisplayMgr.drawFooter("B:Next", "A:Select", "C:Back");
            needsRedraw = false;
        }
        return;
    }
    
    if (calibrateStep == 1) {
        if (InputMgr.wasPressed(BTN_A)) {
            BuzzerMgr.beepButton();
            BuzzerMgr.beepCalibrating();
            calibrateStep = 2;
            calibrateScanRound = 0;
            calibrateScanStartMs = millis();
            calibrateScanRequested = false;
            needsRedraw = true;
        }
        if (InputMgr.wasPressed(BTN_C)) {
            BuzzerMgr.beepButton();
            calibrateStep = 0;
            needsRedraw = true;
        }
        if (needsRedraw) {
            DisplayMgr.clear();
            { String h = "Calibrate: " + rooms[calibrateRoomIndex].name; DisplayMgr.drawHeader(h.c_str()); }
            DisplayMgr.getGfx().setTextDatum(TL_DATUM);
            DisplayMgr.getGfx().setTextColor(COLOR_TEXT);
            DisplayMgr.getGfx().drawString("Step 1/3", 5, 35);
            DisplayMgr.getGfx().drawString("Place M5 in center of", 5, 55);
            DisplayMgr.getGfx().drawString(rooms[calibrateRoomIndex].name, 5, 70);
            DisplayMgr.getGfx().drawString("Stay still, then [A]", 5, 95);
            DisplayMgr.drawFooter("A:Ready", "", "C:Cancel");
            needsRedraw = false;
        }
        return;
    }
    
    if (calibrateStep == 2) {
        if (!calibrateScanRequested) {
            calibrateScanRequested = BLEMgr.requestFingerprintScan(CALIBRATE_SCAN_ROUNDS);
            if (!calibrateScanRequested) {
                calibrateStep = 1;
                BuzzerMgr.beepError();
                needsRedraw = true;
                return;
            }
        }

        if (BLEMgr.isFingerprintScanDone()) {
            int8_t outRSSI[MAX_BLE_NODES];
            int outIds[MAX_BLE_NODES];
            int outCount = 0;
            BLEMgr.takeFingerprintScanResult(outRSSI, outIds, MAX_BLE_NODES, outCount);

            RSSIFingerprint fp;
            fp.roomName = rooms[calibrateRoomIndex].name;
            fp.nodeCount = 0;
            for (int j = 0; j < MAX_FINGERPRINT_NODES; j++) fp.nodeRSSI[j] = 0;
            for (int i = 0; i < outCount && outIds[i] >= 1 && outIds[i] <= MAX_FINGERPRINT_NODES; i++) {
                fp.nodeRSSI[outIds[i] - 1] = outRSSI[i];
                fp.nodeCount++;
            }
            fp.timestamp = millis();
            FingerprintMgr.addFingerprint(fp);
            ConfigMgr.saveFingerprints();

            calibrateScanRequested = false;
            calibrateStep = 3;
            BuzzerMgr.beepSuccess();
            needsRedraw = true;
        }

        const unsigned long now = millis();
        if (needsRedraw || (now - lastDrawMs) >= DISPLAY_UPDATE_INTERVAL) {
            DisplayMgr.clear();
            { String h = "Calibrate: " + rooms[calibrateRoomIndex].name; DisplayMgr.drawHeader(h.c_str()); }
            DisplayMgr.getGfx().setTextDatum(TL_DATUM);
            DisplayMgr.getGfx().setTextColor(COLOR_TEXT);
            DisplayMgr.getGfx().drawString("Step 2/3 - Scanning BLE", 5, 35);
            DisplayMgr.getGfx().drawString("Do not move", 5, 52);
            DisplayMgr.getGfx().drawString("Collecting signal profile...", 5, 68);

            uint8_t progress = BLEMgr.getFingerprintScanProgress();
            int barW = DisplayMgr.getGfx().width() - 20;
            int fillW = (barW * progress) / 100;
            DisplayMgr.getGfx().drawRoundRect(10, 90, barW, 14, 6, COLOR_TEXT);
            DisplayMgr.getGfx().fillRoundRect(11, 91, fillW > 2 ? fillW - 2 : 0, 12, 5, COLOR_PRIMARY);
            DisplayMgr.getGfx().setTextDatum(MC_DATUM);
            DisplayMgr.getGfx().drawString(String(progress) + "%", DisplayMgr.getGfx().width() / 2, 114);

            DisplayMgr.drawFooter("", "Scanning...", "");
            needsRedraw = false;
            lastDrawMs = now;
        }
        return;
    }
    
    if (calibrateStep == 3) {
        if (needsRedraw) {
            DisplayMgr.clear();
            { String h = "Calibrate: " + rooms[calibrateRoomIndex].name; DisplayMgr.drawHeader(h.c_str()); }
            DisplayMgr.getGfx().setTextDatum(TL_DATUM);
            DisplayMgr.getGfx().setTextColor(COLOR_PRIMARY);
            DisplayMgr.getGfx().drawString("Calibration OK!", 5, 45);
            DisplayMgr.getGfx().setTextColor(COLOR_TEXT);
            DisplayMgr.getGfx().drawString("Saved fingerprint for", 5, 65);
            DisplayMgr.getGfx().drawString(rooms[calibrateRoomIndex].name, 5, 80);
            DisplayMgr.drawFooter("A:More", "", "C:Menu");
            needsRedraw = false;
        }
        if (InputMgr.wasPressed(BTN_A)) {
            BuzzerMgr.beepButton();
            calibrateStep = 0;
            needsRedraw = true;
        }
        if (InputMgr.wasPressed(BTN_C)) {
            BuzzerMgr.beepButton();
            switchScene(SCENE_MAIN_MENU);
            return;
        }
    }
}

void SceneManager::updateMQTTConfig() {
    AppConfig& cfg = ConfigMgr.getConfig();
    
    if (InputMgr.wasPressed(BTN_B)) {
        menuIndex = (menuIndex + 1) % 7;
        needsRedraw = true;
        BuzzerMgr.beepButton();
    }
    if (InputMgr.wasPressed(BTN_A)) {
        BuzzerMgr.beepButton();
        if (menuIndex == 0) {
            startKeyboardInput("Broker Host", &cfg.mqttBroker, 64, SCENE_MQTT_CONFIG, KBD_CTX_MQTT_BROKER);
            return;
        }
        else if (menuIndex == 1) {
            keyboardScratch = String(cfg.mqttPort);
            startKeyboardInput("MQTT Port", &keyboardScratch, 6, SCENE_MQTT_CONFIG, KBD_CTX_MQTT_PORT);
            return;
        }
        else if (menuIndex == 2) {
            startKeyboardInput("MQTT User", &cfg.mqttUser, 32, SCENE_MQTT_CONFIG, KBD_CTX_MQTT_USER);
            return;
        }
        else if (menuIndex == 3) {
            startKeyboardInput("MQTT Pass", &cfg.mqttPass, 32, SCENE_MQTT_CONFIG, KBD_CTX_MQTT_PASS);
            return;
        }
        else if (menuIndex == 4) {
            cfg.useLocalBroker = !cfg.useLocalBroker;
            needsRedraw = true;
        }
        else if (menuIndex == 5) {
            startKeyboardInput("Backend URL", &cfg.backendUrl, 63, SCENE_MQTT_CONFIG, KBD_CTX_BACKEND_URL);
            return;
        }
        else if (menuIndex == 6) {
            ConfigMgr.saveConfig();
            BuzzerMgr.beepSuccess();
            switchScene(SCENE_MAIN_MENU);
            return;
        }
    }
    if (InputMgr.wasPressed(BTN_C)) {
        BuzzerMgr.beepButton();
        switchScene(SCENE_MAIN_MENU);
        return;
    }
    
    if (needsRedraw) {
        snprintf(mqttMenuBrokerStr, sizeof(mqttMenuBrokerStr), "Host: %s", cfg.mqttBroker.c_str());
        snprintf(mqttMenuPortStr, sizeof(mqttMenuPortStr), "Port: %d", cfg.mqttPort);
        snprintf(mqttMenuUserStr, sizeof(mqttMenuUserStr), "User: %s", cfg.mqttUser.length() > 0 ? "*" : "-");
        snprintf(mqttMenuPassStr, sizeof(mqttMenuPassStr), "Pass: %s", cfg.mqttPass.length() > 0 ? "*" : "-");
        snprintf(mqttMenuModeStr, sizeof(mqttMenuModeStr), "Mode: %s", cfg.useLocalBroker ? "LOCAL" : "PUBLIC");
        char backendStr[48];
        snprintf(backendStr, sizeof(backendStr), "Backend: %s", cfg.backendUrl.length() > 0 ? cfg.backendUrl.substring(0, 15).c_str() : "-");
        const char* menuItems[] = {mqttMenuBrokerStr, mqttMenuPortStr, mqttMenuUserStr, mqttMenuPassStr, mqttMenuModeStr, backendStr, "Save & Exit"};
        DisplayMgr.drawMenu("MQTT Config", menuItems, 7, menuIndex);
        needsRedraw = false;
        lastDrawMs = millis();
    }
}

void SceneManager::updateKeyboard() {
    const unsigned long now = millis();
    const bool keyRefresh = (now - lastDrawMs >= DISPLAY_UPDATE_INTERVAL);
    
    if (needsRedraw || keyRefresh) {
        drawKeyboard();
        needsRedraw = false;
        lastDrawMs = now;
    }

    const int charCount = getKeyboardCharCount();

    // B = move cursor / action
    if (InputMgr.wasPressed(BTN_B)) {
        if (keyboardSelectAction) {
            keyboardActionIndex = (keyboardActionIndex + 1) % 4;
        } else {
            keyboardCharIndex = (keyboardCharIndex + 1) % charCount;
        }
        needsRedraw = true;
    }

    if (InputMgr.wasLongPressed(BTN_B)) {
        if (!keyboardSelectAction) {
            keyboardSelectAction = true;
            keyboardActionIndex = 0;
            needsRedraw = true;
        }
    }
    if (InputMgr.wasLongPressed(BTN_C)) {
        keyboardReturnContext = KBD_CTX_NONE;
        switchScene(lastScene);
        return;
    }

    // C = move to previous keyboard char (no delete)
    if (InputMgr.wasPressed(BTN_C)) {
        if (keyboardSelectAction) {
            keyboardSelectAction = false;
            keyboardCharIndex = (keyboardCharIndex - 1 + charCount) % charCount;
            needsRedraw = true;
        } else {
            keyboardCharIndex = (keyboardCharIndex - 1 + charCount) % charCount;
            needsRedraw = true;
        }
    }

    // A = select char / execute action
    if (InputMgr.wasPressed(BTN_A)) {
        if (keyboardSelectAction) {
            if (keyboardActionIndex == 0) { // OK
                bool valid = true;
                String value = String(keyboardBuffer);
                if (keyboardReturnContext == KBD_CTX_MQTT_PORT) {
                    int parsed = value.toInt();
                    if (parsed < 1 || parsed > 65535) {
                        valid = false;
                        BuzzerMgr.beepError();
                    } else {
                        ConfigMgr.getConfig().mqttPort = parsed;
                    }
                } else if (keyboardReturnContext == KBD_CTX_WHEEL_RADIUS) {
                    float parsed = value.toFloat();
                    if (parsed < 0.05f || parsed > 1.0f) {
                        valid = false;
                        BuzzerMgr.beepError();
                    } else {
                        ConfigMgr.getConfig().wheelRadiusM = parsed;
                    }
                } else {
                    if (keyboardTarget) *keyboardTarget = value;
                }

                if (valid) {
                    ConfigMgr.saveConfig();
                    if (keyboardReturnContext == KBD_CTX_DEVICE_NAME) {
                        DisplayMgr.drawMessage("Reboot", "Applying new device name...");
                        DisplayMgr.present(true);
                        delay(350);
                        ESP.restart();
                        return;
                    }
                    if (keyboardReturnContext == KBD_CTX_WIFI_PASS) {
                        NetworkMgr.connect(ConfigMgr.getConfig().wifiSSID.c_str(), keyboardBuffer);
                    }
                    keyboardReturnContext = KBD_CTX_NONE;
                    switchScene(lastScene);
                }
            } else if (keyboardActionIndex == 1) { // CAP
                keyboardCaps = !keyboardCaps;
                needsRedraw = true;
            } else if (keyboardActionIndex == 2) { // DEL
                int len = strlen(keyboardBuffer);
                if (len > 0) {
                    keyboardBuffer[len - 1] = 0;
                    needsRedraw = true;
                }
            } else if (keyboardActionIndex == 3) { // SPACE
                appendKeyboardChar(' ');
                needsRedraw = true;
            }
        } else {
            appendKeyboardChar(getKeyboardCharAt(keyboardCharIndex));
            needsRedraw = true;
        }
    }
}

void SceneManager::drawKeyboard() {
    DisplayMgr.clear();
    DisplayMgr.getGfx().setTextSize(1);
    DisplayMgr.getGfx().setTextDatum(TL_DATUM);

    DisplayMgr.getGfx().fillRoundRect(4, 4, DisplayMgr.getGfx().width() - 8, 18, 5, 0x18E3);
    DisplayMgr.getGfx().setTextColor(COLOR_TEXT);
    DisplayMgr.getGfx().setTextDatum(ML_DATUM);
    DisplayMgr.getGfx().drawString(keyboardTitle, 8, 13);

    const char* actions[4] = {"OK", "CAP", "DEL", "SPACE"};
    int x = 4;
    for (int i = 0; i < 4; i++) {
        int w = (i == 3) ? 50 : 24;
        bool selected = keyboardSelectAction && keyboardActionIndex == i;
        uint16_t fill = selected ? COLOR_PRIMARY : 0x1082;
        uint16_t text = selected ? COLOR_BG : COLOR_TEXT;
        DisplayMgr.getGfx().fillRoundRect(x, 26, w, 14, 3, fill);
        DisplayMgr.getGfx().drawRoundRect(x, 26, w, 14, 3, 0xBDF7);
        DisplayMgr.getGfx().setTextColor(text);
        DisplayMgr.getGfx().setTextDatum(MC_DATUM);
        DisplayMgr.getGfx().drawString(actions[i], x + (w / 2), 33);
        x += w + 3;
    }

    DisplayMgr.getGfx().drawRoundRect(4, 44, DisplayMgr.getGfx().width() - 8, 18, 4, 0xBDF7);
    DisplayMgr.getGfx().setTextColor(WHITE);
    DisplayMgr.getGfx().setTextDatum(TL_DATUM);
    String shown = String(keyboardBuffer);
    if (shown.length() > 19) shown = shown.substring(shown.length() - 19);
    DisplayMgr.getGfx().drawString(shown, 8, 48);

    int baseY = 66;
    const int cols[4] = {13, 12, 11, 11};
    const char* chars = keyboardCaps ? KEYBOARD_CHARS_UPPER : KEYBOARD_CHARS_LOWER;
    int idx = 0;
    for (int row = 0; row < 4; row++) {
        for (int col = 0; col < cols[row]; col++) {
            int cx = 5 + (col * 11);
            int cy = baseY + (row * 14);
            bool selected = (!keyboardSelectAction && keyboardCharIndex == idx);
            if (selected) {
                DisplayMgr.getGfx().fillRoundRect(cx - 2, cy - 1, 10, 12, 2, COLOR_PRIMARY);
                DisplayMgr.getGfx().setTextColor(COLOR_BG);
            } else {
                DisplayMgr.getGfx().setTextColor(COLOR_TEXT);
            }

            char c[2] = {chars[idx], 0};
            DisplayMgr.getGfx().setTextDatum(TL_DATUM);
            DisplayMgr.getGfx().drawString(c, cx, cy);
            idx++;
        }
    }

    DisplayMgr.drawFooter("A:SEL", "B:NEXT/LONG", "C:BACK");
}

int SceneManager::getKeyboardCharCount() {
    return KEYBOARD_LEN;
}

char SceneManager::getKeyboardCharAt(int index) {
    if (index < 0) index = 0;
    if (index >= KEYBOARD_LEN) index = KEYBOARD_LEN - 1;
    const char* chars = keyboardCaps ? KEYBOARD_CHARS_UPPER : KEYBOARD_CHARS_LOWER;
    return chars[index];
}

void SceneManager::appendKeyboardChar(char c) {
    int len = strlen(keyboardBuffer);
    if (len < keyboardMaxLen - 1 && len < (int)sizeof(keyboardBuffer) - 1) {
        keyboardBuffer[len] = c;
        keyboardBuffer[len + 1] = 0;
    }
}
