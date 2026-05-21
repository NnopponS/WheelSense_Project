#ifndef AP_PORTAL_MANAGER_H
#define AP_PORTAL_MANAGER_H

#include <WiFi.h>
#include <WebServer.h>
#include "ConfigManager.h"
#include "Config.h"

class APPortalManager {
public:
    APPortalManager();
    void start();
    void stop();
    void update();
    bool isRunning() const;
    String getAPSSID() const;

private:
    WebServer* server = nullptr;
    bool running = false;
    String apSSID;
    String wifiOptions;

    void handleRoot();
    void handleSave();
    void handleNotFound();

    static const char PAGE_HTML[];
    static const char SAVED_HTML[];
};

extern APPortalManager APPortalMgr;

#endif
