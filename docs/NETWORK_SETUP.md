# WheelSense — Network & IP Configuration Guide

## 1. TSIM Camera IP Address

### AP Setup Mode (before connecting to Wi-Fi)

- **SSID:** `WheelSense-TSIM_001`
- **Password:** `12345678`
- **Web Setup URL:** http://192.168.4.1

### Connected Mode (after connecting to hotspot / Wi-Fi)

- **TSIM IP:** assigned dynamically by the hotspot DHCP (e.g. `10.4.12.xxx` or `192.168.43.xxx`)
- **Web Status:** http://wheelsense-camera.local
- You can also check connected devices on your phone/PC hotspot screen.

## 2. What is "Server IP / LAN" in the Setup Webpage?

- It is the IP address of your **computer / laptop** running the WheelSense Docker backend.
- It is **NOT** the TSIM's IP and **NOT** the router/hotspot IP.
- Current host PC Wi-Fi IP command:

  ```powershell
  Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi*'
  ```

## 3. Automatic Connection (no need to type IP)

You can leave "Server IP" completely **empty**. The firmware will automatically:

1. Probe the Default Gateway (if using Windows Mobile Hotspot)
2. Send UDP broadcast on both global and local subnet
3. Auto-scan candidate IPs on the hotspot for port `8765`

When you run `start_all.bat`, it automatically passes your host IP to Docker.
