---
name: Thesis Ch2-4 Revision
overview: เพิ่มเนื้อหาบทที่ 2 (hardware/software/protocol detail), ปรับโครงสร้าง+ชื่อหัวข้อบทที่ 3 ให้เป็นทางการพร้อม TikZ flowchart และ data schema, และเพิ่ม subsection บทที่ 4 ให้ตรงกับโครงสร้าง 3.2–3.6
todos:
  - id: ch2-hw
    content: "chapter2.tex: ขยาย sec:ch2_hw_spec — เพิ่ม RPi5 spec, BLE beacon spec, ขยาย M5StickC Plus2 และ Polar GATT UUID ในตาราง"
    status: pending
  - id: ch2-firmware
    content: "chapter2.tex: ขยาย sec:ch2_firmware_stack — เพิ่มตาราง PlatformIO libraries+version, อธิบาย platformio.ini, firmware main loop flow"
    status: pending
  - id: ch2-server
    content: "chapter2.tex: ขยาย sec:ch2_server_stack — เพิ่ม Mosquitto ACL/LWT detail, Uvicorn vs Gunicorn, Docker service list"
    status: pending
  - id: ch2-ai
    content: "chapter2.tex: ขยาย sec:ch2_ai_stack — เปลี่ยนจาก 'under consideration' เป็นระบุ model ที่เลือก + ตาราง model comparison"
    status: pending
  - id: ch2-hmi
    content: "chapter2.tex: ขยาย sec:ch2_hmi_stack — เพิ่ม subsection React Native+Expo (routing, state, BLE, push notification, offline queue, OTA update)"
    status: pending
  - id: ch2-protocol
    content: "chapter2.tex: ขยาย sec:ch2_protocols — เพิ่มแถว WebSocket, SSE/Streamable HTTP, HTTPS/TLS, ขยาย BLE GATT characteristic detail"
    status: pending
  - id: ch3-rename
    content: "chapter3.tex: ปรับชื่อ \\section และ \\subsection ทั้งหมดให้เป็นชื่อทางการตามตารางในแผน พร้อมอัปเดต \\label ที่สอดคล้อง"
    status: pending
  - id: ch3-fw-flowchart
    content: "chapter3.tex: เพิ่ม TikZ flowchart Firmware Loop (3.2.1) — แสดง setup→init→loop→IMU read→BLE scan→MQTT publish→delay"
    status: pending
  - id: ch3-server-flowchart
    content: "chapter3.tex: เพิ่ม TikZ flowchart Server Ingestion Pipeline (3.4.1) — แสดง MQTT→validate→DB→event detect→alert→WebSocket"
    status: pending
  - id: ch3-ai-flowchart
    content: "chapter3.tex: ปรับ/ขยาย TikZ flowchart AI Pipeline (3.5.1) ให้ละเอียดขึ้น — เพิ่ม embedding router, context assembly, propose/confirm branch"
    status: pending
  - id: ch3-schema
    content: "chapter3.tex: เพิ่ม data schema ใน 3.4.3 — ตาราง entities หลัก (workspaces, users, residents, devices, rooms, telemetry_records, location_events, alert_events, audit_logs) พร้อม FK relationships"
    status: pending
  - id: ch4-restructure
    content: "chapter4.tex: เพิ่ม section 4.1 intro, แบ่ง subsection ทุก section (4.2–4.6) ให้ตรงกับ 3.2–3.6, ผสาน E2E เดิมเข้า 4.7 พร้อม paragraph อภิปราย"
    status: pending
isProject: false
---

# แผนแก้ไขบทที่ 2, 3, 4

## ไฟล์ที่จะเปลี่ยน
- [`Thesis/latex/content/chapters/chapter2.tex`](Thesis/latex/content/chapters/chapter2.tex)
- [`Thesis/latex/content/chapters/chapter3.tex`](Thesis/latex/content/chapters/chapter3.tex)
- [`Thesis/latex/content/chapters/chapter4.tex`](Thesis/latex/content/chapters/chapter4.tex)

---

## บทที่ 2 — เพิ่มเนื้อหา (ไม่เปลี่ยนโครงสร้างเดิม เพิ่มเฉพาะส่วนที่ขาด)

Section `\section{ซอฟต์แวร์ แพลตฟอร์ม และโปรโตคอลที่เกี่ยวข้อง}` มีอยู่แล้วแต่ขาดความละเอียด งานที่ต้องทำ:

**2.1 `sec:ch2_hw_spec` — ปรับฮาร์ดแวร์เป็นหัวข้อย่อย (ยกเลิกตาราง `tab:ch2_hw_spec`)**
- ใช้ `\subsubsection` หรือรายการหัวข้อ สำหรับแต่ละอุปกรณ์แทนตาราง:
  - M5StickC Plus2: เพิ่ม BLE 4.2 spec, Flash/PSRAM ชัดเจน, power draw
  - Polar Verity Sense: เพิ่ม BLE GATT services รายการ UUID ครบ (Heart Rate 0x180D, Battery 0x180F)
  - Node\_Tsimcam (ESP32-S3): กล้อง OV2640 (2 MP), 8 MB PSRAM
  - Mobile Phone (Android/iOS): ทำหน้าที่ BLE scanner, companion UI
  - Raspberry Pi 5: (ใหม่) เพิ่ม spec ครบ (Cortex-A76 4-core, 8 GB RAM, 40-pin GPIO, Gigabit LAN)
  - BLE Beacon (iBeacon/Eddystone): (ใหม่) เพิ่ม UUID, TX Power, advertising interval

**2.2 `sec:ch2_firmware_stack` — C/C++ + PlatformIO**
- เพิ่มเนื้อหาอธิบาย library (เป็นหัวข้อย่อยแทนตาราง): M5Unified, NimBLE-Arduino, PubSubClient/AsyncMqttClient, ArduinoJson พร้อม version
- อธิบาย `platformio.ini` structure (board, framework, lib_deps, build_flags)
- อธิบาย firmware main loop: setup → BLE scan → IMU read → JSON serialize → MQTT publish → sleep/yield

**2.3 `sec:ch2_server_stack` — ปรับ Server เป็นหัวข้อย่อย**
- เพิ่มความละเอียดและนำเสนอเป็นหัวข้อย่อย:
  - Mosquitto: version, ACL config, QoS policy, LWT behavior
  - FastAPI: Uvicorn (development) vs Gunicorn+UvicornWorker (production), worker count
  - Docker Compose service list: ระบุ container แต่ละตัวในรูปแบบหัวข้อย่อย

**2.4 `sec:ch2_ai_stack` — ปรับเป็นหัวข้อย่อย (ยกเลิกแผนที่จะเพิ่มตารางเปรียบเทียบ)**
- เปลี่ยนจาก "โมเดลที่นำมาพิจารณา" เป็น "โมเดลที่เลือกใช้": ระบุ Gemma 3 4B (หรือ Llama 3.2 3B) + เหตุผล (tool calling support, license, edge hardware RAM fit)
- นำเสนอ model comparison เป็นหัวข้อย่อย: (Gemma / Llama 3.2 / Qwen 2.5) เทียบ RAM, tool calling, latency on Pi 5

**2.5 `sec:ch2_hmi_stack` — ขยาย React Native + Expo**
- เพิ่ม subsection ใหม่: สถาปัตยกรรมแอปพลิเคชันพกพา
  - Expo SDK version, target platform (Android-first, iOS-compatible)
  - Navigation: `expo-router` (file-based routing)
  - State: TanStack Query + Zustand (หรือ Context ตามจริง)
  - BLE: `react-native-ble-plx` หรือ Expo BLE API
  - Push notification: `expo-notifications` + FCM
  - Offline queue: `expo-sqlite` หรือ MMKV สำหรับ local cache
  - OTA update: EAS Update

**2.6 `sec:ch2_protocols` — ปรับโปรโตคอลเป็นหัวข้อย่อย (ยกเลิกตาราง `tab:ch2_protocols`)**
- อธิบายแต่ละโปรโตคอลด้วยหัวข้อย่อยแทนตาราง และเพิ่มโปรโตคอลที่ขาด:
  - MQTT 3.1.1 / 5.0
  - REST over HTTPS
  - MCP (JSON-RPC)
  - BLE GATT: ขยาย characteristic properties (Notify/Indicate), descriptor 0x2902
  - BLE advertising
  - WebSocket: (ใหม่) สำหรับ real-time dashboard push
  - SSE / Streamable HTTP: (ใหม่) (MCP transport)
  - HTTPS/TLS: (ใหม่) (REST API security layer)

---

## บทที่ 3 — ปรับชื่อหัวข้อ + เพิ่ม flowchart + data schema

### โครงสร้างใหม่ (เทียบกับเดิม)

| เดิม | ใหม่ (ทางการ) |
|---|---|
| 3.1 ภาพรวมและการออกแบบสถาปัตยกรรมระบบ | **3.1 ภาพรวมและสถาปัตยกรรมของระบบต้นแบบ** |
| 3.2 การออกแบบระบบเซ็นเซอร์ติดตามการใช้งานเก้าอี้รถเข็น | **3.2 การออกแบบระบบรับรู้ข้อมูลบนเก้าอี้รถเข็น** |
| 3.2.1 องค์ประกอบฮาร์ดแวร์และการอ่านค่าเซ็นเซอร์ | **3.2.1 ฮาร์ดแวร์และกระบวนการอ่านค่าเซ็นเซอร์** |
| 3.2.2 สถาปัตยกรรมเครือข่ายและเส้นทางข้อมูล | **3.2.2 สถาปัตยกรรมเครือข่ายและเส้นทางการส่งผ่านข้อมูล** |
| 3.2.3 การประมวลผลข้อมูลจากต้นทางถึงผลสรุป | **3.2.3 การประมวลผลข้อมูลตั้งแต่ค่าดิบถึงผลสรุป** |
| 3.3 การจำแนกตำแหน่งภายในอาคารด้วยสัญญาณ BLE | **3.3 การระบุตำแหน่งภายในอาคารด้วยสัญญาณบลูทูธ** |
| 3.3.1 องค์ประกอบฮาร์ดแวร์และการจัดวางจุดอ้างอิง | **3.3.1 ฮาร์ดแวร์และการจัดวางโหนดอ้างอิง** |
| 3.3.2 การประมวลผลข้อมูลและอัลกอริทึมการจำแนก | **3.3.2 อัลกอริทึมการจำแนกตำแหน่งและกระบวนการประมวลผล** |
| 3.4 สถาปัตยกรรมเซิร์ฟเวอร์และบริการส่วนกลาง | ชื่อคงเดิม (formal แล้ว) |
| 3.4.1 สถาปัตยกรรมเชิงบริการ | **3.4.1 องค์ประกอบบริการและสถาปัตยกรรมซอฟต์แวร์** |
| 3.4.2 ช่องทางสื่อสารและรูปแบบข้อมูล | **3.4.2 ช่องทางสื่อสารและโพรโทคอลการส่งผ่านข้อมูล** |
| 3.4.3 ฐานข้อมูลและการจัดเก็บข้อมูล | **3.4.3 โครงสร้างฐานข้อมูลและแผนภาพความสัมพันธ์** |
| 3.5 ระบบผู้ช่วยอัจฉริยะและการประสานงานด้วย MCP | **3.5 ระบบผู้ช่วยอัจฉริยะและการประสานงาน** |
| 3.5.1 สถาปัตยกรรมและการเชื่อมโยงแบบจำลอง | **3.5.1 สถาปัตยกรรมและการเชื่อมต่อกับแบบจำลองภาษา** |
| 3.5.2 การออกแบบ prompt และการจัดกลุ่มคำถาม | **3.5.2 การออกแบบ prompt และการจัดหมวดหมู่คำขอ** |
| 3.5.3 องค์ประกอบสนับสนุนและนโยบายความปลอดภัย | **3.5.3 นโยบายความปลอดภัยและกลไกสนับสนุน** |
| 3.6 ส่วนติดต่อผู้ใช้และการโต้ตอบระหว่างมนุษย์กับระบบ | **3.6 การออกแบบส่วนติดต่อผู้ใช้งาน** |
| 3.6.1 การออกแบบส่วนติดต่อผู้ใช้สำหรับแดชบอร์ดเว็บ | **3.6.1 แดชบอร์ดเว็บสำหรับบุคลากรผู้ดูแล** |
| 3.6.2 การออกแบบส่วนติดต่อผู้ใช้สำหรับอุปกรณ์พกพา... | **3.6.2 แอปพลิเคชันสำหรับอุปกรณ์พกพา** |

### TikZ Flowchart ที่จะเพิ่ม

**Flowchart 1 — Firmware Loop (3.2.1)**
แสดง: `setup()` → init BLE scan → init MQTT → `loop()` → อ่าน IMU → สแกน BLE → สร้าง JSON payload → publish MQTT → delay → กลับ loop (TikZ แนวตั้ง ใช้ decision diamond สำหรับ WiFi reconnect)

**Flowchart 2 — Server Ingestion Pipeline (3.4.1)**
แสดง: MQTT message arrives → Paho subscriber → Pydantic validate → write PostgreSQL → detect event → [if event] publish alert → WebSocket push to dashboard

**Flowchart 3 — AI Pipeline (3.5.1)**
แสดง: User input → intent classifier (embedding router) → [query/summarize/action] → context assembly → Ollama LLM → [if action: propose → await confirm] → [if confirmed] MCP tool call → audit log → return response

### Data Schema (3.4.3)
เพิ่มตาราง entities หลักพร้อมความสัมพันธ์ในรูปแบบ TikZ ERD diagram (หรือ tabular ถ้า ERD ซับซ้อนเกิน):
- `workspaces`, `users`, `residents`, `devices`, `rooms`, `telemetry_records`, `location_events`, `alert_events`, `workflow_actions`, `audit_logs`
- แสดง FK relationships สำคัญ

---

## บทที่ 4 — เพิ่ม subsection ให้ครบ (เนื้อหาเดิมยังอยู่ ย้ายเข้า subsection)

```
4.1 ภาพรวมการทดสอบและเกณฑ์ประเมินผล  [ใหม่ — intro section]
4.2 ผลการทดสอบระบบรับรู้ข้อมูลบนเก้าอี้รถเข็น
    4.2.1 ผลการทดสอบฮาร์ดแวร์และการอ่านค่าเซ็นเซอร์
    4.2.2 ผลการทดสอบเครือข่ายและการส่งผ่านข้อมูล
    4.2.3 ผลการทดสอบการประมวลผลข้อมูล
4.3 ผลการทดสอบระบบระบุตำแหน่งภายในอาคาร
    4.3.1 ผลการทดสอบการจัดวางโหนดและฮาร์ดแวร์
    4.3.2 ผลการทดสอบอัลกอริทึมการจำแนกตำแหน่ง
4.4 ผลการทดสอบเซิร์ฟเวอร์และบริการส่วนกลาง
    4.4.1 ผลการทดสอบความพร้อมใช้งานและสถาปัตยกรรมบริการ
    4.4.2 ผลการทดสอบช่องทางสื่อสาร
    4.4.3 ผลการทดสอบฐานข้อมูล
4.5 ผลการทดสอบระบบผู้ช่วยอัจฉริยะ
    4.5.1 ผลการทดสอบสถาปัตยกรรมและการเชื่อมต่อ
    4.5.2 ผลการทดสอบ prompt และการจัดหมวดหมู่
    4.5.3 ผลการทดสอบนโยบายและกลไกยืนยัน
4.6 ผลการทดสอบส่วนติดต่อผู้ใช้งาน
    4.6.1 ผลการทดสอบแดชบอร์ดเว็บ
    4.6.2 ผลการทดสอบแอปพลิเคชันพกพา
4.7 การทดสอบแบบปลายถึงปลายและการอภิปรายผล  [ผสาน E2E เดิม + อภิปราย]
```

เนื้อหาตารางผลเดิมทั้งหมดยังอยู่ เพียงย้ายเข้า subsection ที่ถูกต้อง และเพิ่ม paragraph สรุปย่อยใต้แต่ละ subsection

---

## หลักการเขียน (ตาม TU guideline)

- คำอธิบายตารางอยู่ด้านบน (`\caption` ก่อน `\label`) — เดิมถูกต้องแล้ว
- คำอธิบายรูปอยู่ด้านล่าง — เดิมถูกต้องแล้ว  
- ไม่เกิน 3 ระดับหัวข้อ (x.y.z) — แผนนี้ไม่มีระดับที่ 4
- ทุกสมการมีหมายเลข (x.y) — จะตรวจสอบสมการใหม่ให้ครบ
- ทุกรูป/ตารางต้องอ้างอิงในเนื้อหา
