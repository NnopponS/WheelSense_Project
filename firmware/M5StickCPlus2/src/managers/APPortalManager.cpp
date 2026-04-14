#include "APPortalManager.h"
#include "NetworkManager.h"

APPortalManager APPortalMgr;

// Minimal White / Blue Theme HTML
const char APPortalManager::PAGE_HTML[] PROGMEM = R"rawhtml(
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>WheelSense Config</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#f4f7f6;color:#333;padding:16px}
h1{color:#0052cc;font-size:1.5em;margin-bottom:6px;font-weight:700}
.sub{color:#666;font-size:.9em;margin-bottom:20px}
.card{background:#fff;border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:0 2px 8px rgba(0,0,0,0.04);border:1px solid #e1e4e8}
.card h2{color:#0052cc;font-size:1.1em;margin-bottom:12px;border-bottom:1px solid #eee;padding-bottom:8px}
label{display:block;color:#555;font-size:.85em;font-weight:600;margin-bottom:4px;margin-top:12px}
input,select{width:100%;padding:10px 12px;border-radius:8px;border:1px solid #ccc;background:#fafbfc;color:#333;font-size:.95em;transition:border-color .2s}
input:focus,select:focus{outline:none;border-color:#0052cc;background:#fff}
.help{font-size:0.75em;color:#888;margin-top:4px}
.btn{width:100%;padding:14px;border:none;border-radius:10px;background:#0052cc;color:#fff;font-size:1.05em;font-weight:700;cursor:pointer;margin-top:20px;box-shadow:0 4px 12px rgba(0,82,204,0.3);transition:transform .1s,background .2s}
.btn:active{transform:scale(.98);background:#0043a8}
.foot{text-align:center;color:#888;font-size:.75em;margin-top:20px}
</style>
<script>
function toggleSSID() {
  var sel = document.getElementById("ssid_sel");
  var txt = document.getElementById("ssid_txt");
  if (sel.value === "__MANUAL__") {
    txt.style.display = "block";
    txt.required = true;
    txt.name = "wifi_ssid";
    sel.name = "";
  } else {
    txt.style.display = "none";
    txt.required = false;
    txt.name = "";
    sel.name = "wifi_ssid";
  }
}
</script>
</head>
<body onload="toggleSSID()">
<h1>&#x1F6DE; WheelSense Config</h1>
<p class="sub">Configure your device settings</p>
<form method="POST" action="/save">

<div class="card">
<h2>&#x1F4E1; WiFi Settings</h2>
<label>Network (SSID)</label>
<select id="ssid_sel" onchange="toggleSSID()">
%WIFI_OPTIONS%
</select>
<input id="ssid_txt" style="display:none;margin-top:8px;" placeholder="Type SSID Manually..." value="%WIFI_SSID%" maxlength="32">
<label>Password</label>
<input name="wifi_pass" type="password" value="%WIFI_PASS%" maxlength="63">
</div>

<div class="card">
<h2>&#x1F4E8; MQTT Setup</h2>
<label>Broker URL / IP</label>
<input name="mqtt_broker" value="%MQTT_BROKER%" maxlength="40">
<label>Port</label>
<input name="mqtt_port" type="number" value="%MQTT_PORT%" min="1" max="65535">
<label>Username</label>
<input name="mqtt_user" value="%MQTT_USER%" maxlength="24">
<label>Password</label>
<input name="mqtt_pass" type="password" value="%MQTT_PASS%" maxlength="24">
</div>

<div class="card">
<h2>&#x2699;&#xFE0F; Device Info</h2>
<label>Device Name</label>
<input name="device_name" value="%DEVICE_NAME%" maxlength="20">
<p class="help">Must match the pre-registered backend device_id. Also used for BLE broadcasting and MQTT client ID.</p>
<label>Wheel Radius (m)</label>
<input name="wheel_radius" type="number" step="0.001" value="%WHEEL_RADIUS%" min="0.01" max="2.0">
</div>

<button class="btn" type="submit">&#x1F4BE; Save &amp; Apply</button>
</form>
<p class="foot">Firmware v%FW_VER% &bull; Save, then exit AP mode to reconnect with the new settings.</p>
</body>
</html>
)rawhtml";

const char APPortalManager::SAVED_HTML[] PROGMEM = R"rawhtml(
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Saved!</title>
<style>
body{font-family:-apple-system,sans-serif;background:#f4f7f6;color:#333;display:flex;justify-content:center;align-items:center;min-height:100vh}
.box{text-align:center;background:#fff;padding:32px 24px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.05);border:1px solid #e1e4e8}
h1{color:#10b981;font-size:1.6em;margin-bottom:8px}
p{color:#555;line-height:1.5}
a{color:#0052cc;text-decoration:none;display:inline-block;margin-top:20px;padding:10px 24px;border:1px solid #0052cc;border-radius:8px;font-weight:600;transition:all .2s}
a:hover{background:#0052cc;color:#fff}
</style>
</head>
<body>
<div class="box">
<h1>&#x2705; Configuration Saved</h1>
<p>Press the <b>A Button</b> (front button) on<br>the device to exit AP mode.</p>
<p style="margin-top:12px;font-size:0.9em;color:#888">The device will reconnect to WiFi automatically.</p>
<a href="/">&#x2190; Edit Again</a>
</div>
</body>
</html>
)rawhtml";

APPortalManager::APPortalManager() {}

void APPortalManager::start() {
    if (running) return;

    AppConfig& config = ConfigMgr.getConfig();
    apSSID = String(AP_PORTAL_SSID_PREFIX) + config.deviceName;

    // Scan WiFi first
    Serial.println("[AP] Scanning WiFi networks...");
    WiFi.disconnect(true);
    delay(100);
    WiFi.mode(WIFI_STA);
    int n = WiFi.scanNetworks();
    
    wifiOptions = "";
    bool currentFound = false;
    if (n > 0) {
        for (int i = 0; i < n; ++i) {
            String ssid = WiFi.SSID(i);
            if (ssid.length() == 0) continue;
            
            String selected = "";
            if (ssid == config.wifiSSID && !currentFound) {
                selected = " selected";
                currentFound = true;
            }
            wifiOptions += "<option value=\"" + ssid + "\"" + selected + ">" + ssid + " (" + String(WiFi.RSSI(i)) + " dBm)</option>\n";
        }
    }
    
    if (!currentFound && config.wifiSSID.length() > 0) {
        wifiOptions += "<option value=\"" + config.wifiSSID + "\" selected>" + config.wifiSSID + " (Saved)</option>\n";
    }
    wifiOptions += "<option value=\"__MANUAL__\">-- Enter manually --</option>\n";
    
    WiFi.scanDelete();

    // Now start the AP
    WiFi.mode(WIFI_AP);
    WiFi.softAP(apSSID.c_str());
    delay(200);

    Serial.printf("[AP] Started SSID=%s IP=%s\n",
                  apSSID.c_str(), WiFi.softAPIP().toString().c_str());

    server = new WebServer(AP_PORTAL_PORT);
    server->on("/", HTTP_GET, [this]() { handleRoot(); });
    server->on("/save", HTTP_POST, [this]() { handleSave(); });
    server->onNotFound([this]() { handleNotFound(); });
    server->begin();

    running = true;
}

void APPortalManager::stop() {
    if (!running) return;

    if (server) {
        server->stop();
        delete server;
        server = nullptr;
    }

    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_STA);
    delay(100);

    NetworkMgr.reconfigureFromConfig(true);

    running = false;
    Serial.println("[AP] Stopped, switching back to STA");
}

void APPortalManager::update() {
    if (running && server) {
        server->handleClient();
    }
}

bool APPortalManager::isRunning() const {
    return running;
}

String APPortalManager::getAPSSID() const {
    return apSSID;
}

void APPortalManager::handleRoot() {
    AppConfig& config = ConfigMgr.getConfig();

    String page = FPSTR(PAGE_HTML);
    page.replace("%WIFI_OPTIONS%", wifiOptions);
    page.replace("%WIFI_SSID%", config.wifiSSID);
    page.replace("%WIFI_PASS%", config.wifiPass);
    page.replace("%MQTT_BROKER%", config.mqttBroker);
    page.replace("%MQTT_PORT%", String(config.mqttPort));
    page.replace("%MQTT_USER%", config.mqttUser);
    page.replace("%MQTT_PASS%", config.mqttPass);
    page.replace("%DEVICE_NAME%", config.deviceName);
    page.replace("%WHEEL_RADIUS%", String(config.wheelRadiusM, 3));
    page.replace("%FW_VER%", FIRMWARE_VERSION);

    server->send(200, "text/html", page);
}

void APPortalManager::handleSave() {
    AppConfig& config = ConfigMgr.getConfig();

    if (server->hasArg("wifi_ssid")) {
        String ssid = server->arg("wifi_ssid");
        // If manual entry was used but left blank, do not override
        if (ssid != "__MANUAL__" && ssid.length() > 0) {
            config.wifiSSID = ssid;
        }
    }
    if (server->hasArg("wifi_pass"))    config.wifiPass = server->arg("wifi_pass");
    if (server->hasArg("mqtt_broker"))  config.mqttBroker = server->arg("mqtt_broker");
    if (server->hasArg("mqtt_port"))    config.mqttPort = server->arg("mqtt_port").toInt();
    if (server->hasArg("mqtt_user"))    config.mqttUser = server->arg("mqtt_user");
    if (server->hasArg("mqtt_pass"))    config.mqttPass = server->arg("mqtt_pass");
    if (server->hasArg("device_name"))  config.deviceName = server->arg("device_name");
    if (server->hasArg("wheel_radius")) config.wheelRadiusM = server->arg("wheel_radius").toFloat();

    ConfigMgr.saveConfig();

    String page = FPSTR(SAVED_HTML);
    server->send(200, "text/html", page);

    Serial.println("[AP] Config saved via web portal");
}

void APPortalManager::handleNotFound() {
    server->sendHeader("Location", "/", true);
    server->send(302, "text/plain", "Redirecting...");
}
