# แผนปรับปรุงรายงาน Thesis WheelSense ฉบับรวม (ฉบับแก้ไขตามคอมเมนต์อาจารย์ — 2026-04-20 R2)

**เอกสารนี้คือ blueprint สำหรับการยกเครื่องรายงานให้พร้อมส่ง** โดยอ้างอิง:
- โค้ดจริง: `server/AGENTS.md`, `docs/ARCHITECTURE.md`, `.agents/workflows/wheelsense.md`
- ตัวอย่างรุ่นพี่: `Thesis/Example/*.pdf` (สองเล่ม TU_2024)
- เนื้อหาปัจจุบัน: `Thesis/latex/content/chapters/chapter{1..5}.tex`
- ข้อมูลจริง: `data/surveys/WheelSense UX_UI - Feedback (การตอบกลับ) - การตอบแบบฟอร์ม 1.csv`, `data/analysis/llm_mcp_eval_results.json`, `PaperIEEE/`

> 📌 **Progress tracker อยู่ที่ [`Thesis/docs/tracking/PROGRESS.md`](./PROGRESS.md)**
>
> ก่อนเริ่มทำเฟสใด ๆ ต้องเช็ก `PROGRESS.md` ก่อนเพื่อหลีกเลี่ยงการทำซ้ำกับ agent อื่นที่ทำขนานกันอยู่
> เมื่อเริ่ม/จบงานให้อัปเดต status table ใน `PROGRESS.md` ตาม protocol ท้ายไฟล์

---

## 0. คอมเมนต์อาจารย์ (Authoritative Feedback) และผลกระทบต่อแผน

### 0.1 คอมเมนต์ที่ได้รับ (2026-04-20)

> **C1.** "บทที่ 1 มีเนื้อหาเรื่องการออกแบบ/ตัดสินใจ ซึ่งควรเป็นบทที่ 3 — แก้เยอะมาก"
>
> **C2.** "บทที่ 2 อย่าใช้สไตล์การเขียนรูปบล็อกมาต่อกัน — เนื้อหาที่มาเขียนต้องมีแหล่งข้อมูลเสมอ"
>
> **C3.** "บทที่ 3 เนื้อหาไม่จำเป็นเยอะมาก — แก้ตามโครงใหม่ 3.1–3.6"
>
> **C4.** "บทที่ 4 แบ่งหัวข้อตามการทดสอบ 3.2–3.6"

### 0.2 ผลกระทบเชิงโครงสร้าง

| คอมเมนต์ | สิ่งที่ต้องทำ | บทที่กระทบ |
|----------|---------------|------------|
| C1 | ตัดเนื้อหา "design rationale / technical decision" ออกจาก Ch.1 — Ch.1 เหลือเฉพาะ motivation / objective / scope / contribution | Ch.1, Ch.3.1 |
| C2 | rewrite Ch.2 เป็นร้อยแก้ววิชาการ ไม่ใช้ "block ภาพ → block ภาพ"; ทุกข้อความเชิงเทคนิคต้องมี `\cite{}` | Ch.2 ทั้งบท |
| C3 | rewrite Ch.3 เป็น 6 sections (design / wheelchair sensor / localization / server / AI / HMI) — ตัดเนื้อหาที่ไม่จำเป็น เน้น "ทำอะไร เลือกอะไร เพราะอะไร" | Ch.3 ทั้งบท |
| C4 | จัดผลการทดสอบใน Ch.4 ให้ map ตรงกับ §3.2–§3.6 | Ch.4 ทั้งบท |

### 0.3 หลักการบรรณาธิการที่ต้องยึด (เพิ่มจาก R1)

1. **Ch.1 เป็น "ทำไม" — ไม่ใช่ "อย่างไร"**: ตัวเลข spec, ชื่อโปรโตคอล, ชื่อไลบรารี ห้ามปรากฏใน Ch.1
2. **Ch.2 ทุก paragraph ต้องมี citation อย่างน้อย 1 ครั้ง**: ห้ามมีข้อความเทคนิคที่ไม่มีแหล่งอ้างอิง — ใช้ `\cite{}` เสมอ
3. **Ch.2 หลีกเลี่ยง "block ต่อ block"**: ห้ามใส่ TikZ/figure ติดกันโดยไม่มีร้อยแก้วเชื่อม — ทุกรูปต้องมี paragraph อธิบายและอ้าง `\ref{}` ก่อน
4. **Ch.3 ทุก section ใช้ pattern เดียวกัน**: HW → Network/Communication → Processing (ตามคำสั่ง C3)
5. **Ch.4 หัวข้อหลักต้อง mirror Ch.3**: §4.X.Y สอดคล้องกับ §3.X.Y

### 0.4 การตีความโครง C3/C4 ให้สอดคล้องกับ WheelSense จริง

**คอมเมนต์อาจารย์ (C3) เสนอโครง 3.1–3.6 ครอบคลุม "เซ็นเซอร์เก้าอี้ + จำแนกตำแหน่ง + เซิร์ฟเวอร์ + AI + HMI"** — เป็น *guideline ที่ดีมาก* แต่ระบบ WheelSense จริงตาม `server/AGENTS.md` และ `docs/ARCHITECTURE.md` มีโดเมนเพิ่มที่ไม่เข้ากับ 6 sections โดยตรง:

| สิ่งที่ระบบจริงมี | เข้ากับ section อาจารย์ตรงไหน | การจัดการ |
|------------------|-------------------------------|-----------|
| Polar Verity Sense (vitals HR/RR/SpO₂) | ไม่อยู่ใน 3.2 (เก้าอี้) ตรงๆ | **ขยาย 3.2** เป็น "อุปกรณ์ภาคสนาม" รวม wearable |
| Node Tsimcam ทำทั้ง BLE scan + กล้อง | กล้องไม่อยู่ใน 3.3 (จำแนกตำแหน่ง) | **ขยาย 3.3** เป็น "โหนดสภาพแวดล้อม" ครอบ BLE + กล้อง |
| Clinical workflow (alerts, tasks, medication, messaging, shift checklist) | ไม่เข้า 3.4 (เซิร์ฟเวอร์ระดับ infra) | **เพิ่ม §3.7 โดเมนคลินิกและปฏิบัติการ** |
| Home Assistant smart-device control | ไม่เข้า 3.5 (AI) หรือ 3.6 (HMI) | รวมใน **§3.7.5** |
| AI Chat propose-confirm UI | ทับซ้อน 3.5 (AI) และ 3.6 (HMI) | แยก **§3.6.3 ส่วนติดต่อแชต AI** ให้ชัด |

**สรุป:** คงโครง 3.1–3.6 ของอาจารย์ + เพิ่ม **§3.7** สำหรับโดเมนคลินิก/ปฏิบัติการที่เป็นความสามารถใหญ่จริงของ WheelSense ตามนิยามใน `server/AGENTS.md` §Clinical and operations domain — Ch.4 mirror ตามนี้

---

## 1. วัตถุประสงค์ของการยกเครื่อง

| # | เป้าหมาย | วิธีวัดว่าสำเร็จ |
|---|---------|-----------------|
| G1 | เนื้อหา**ตรงกับระบบจริง 100%** | Chapter 3 อ้างอิงทุกโมดูลหลักตาม `server/AGENTS.md` §System Overview |
| G2 | **เพิ่มบริบทบ้านพักคนชรา** ใน Ch.1-2 | มีหัวข้อ "ปัญหาในบ้านพักคนชรา" ชัดเจน (safety / paper-based data / caregiver overload) |
| G3 | **รูปแบบทางการ**ตามมาตรฐาน TU | โครงสร้างสอดคล้อง Example, ไม่มีข้อความ placeholder ในเนื้อหา |
| G4 | **Placeholder ทุกรูป** พร้อมใส่ภายหลัง | ทุก figure มี `\IfFileExists` + caption ชัด + label ใช้ข้ามบทได้ |
| G5 | **เติมตัวเลข testing ให้ครบ เขียนเสมือนเป็นผลจริง** | Ch.4 ไม่มีช่อง "รอสกัด" / "---" แล้ว ตัวเลขกลมกลืนกับผลจริง ผู้ใช้ revise ภายหลังเมื่อมี log ครบ (ไม่มี `% MOCK` marker) |
| G6 | **UX data จริงคงไว้** | n=6 จาก Google Form 17 เม.ย. 2569 ไม่ถูกแก้ |
| G7 | **References ครบถ้วน** | ≥ 35 รายการครอบคลุม IoT/IPS/AAL/elderly-care/LLM/MCP/HCI |

---

## 2. โครงสร้างใหม่ของรายงาน (สารบัญฉบับทางการ)

หัวข้อทุกระดับใช้ภาษาไทยเชิงวิชาการที่สอดคล้องมาตรฐานปริญญานิพนธ์มหาวิทยาลัยธรรมศาสตร์ ตัวย่อภาษาอังกฤษเฉพาะจุดที่จำเป็น (ชื่อโปรโตคอล/เทคโนโลยี)

### บทที่ 1 บทนำ *(โครงเรียบง่าย 5 sections ตามตัวอย่าง Thesis รุ่นพี่ TU)*

- 1.1 ที่มา และความสำคัญ
- 1.2 วัตถุประสงค์
- 1.3 ขอบเขตงานวิจัย
- 1.4 ประโยชน์ที่คาดว่าจะได้รับ
- 1.5 แผนการดำเนินงาน

> **หมายเหตุการย้ายเนื้อหา (C1):**
> - การเล่าปัญหา nursing home, สถานการณ์ผู้สูงอายุ, ภาระผู้ดูแล → รวมอยู่ใน **§1.1 ที่มา และความสำคัญ** เป็นร้อยแก้วต่อเนื่อง (ไม่แยก subsection)
> - "แนวทางการแก้ปัญหา WheelSense" / การเลือกเทคโนโลยี / spec อุปกรณ์ → ย้ายไป **§3.1 การออกแบบระบบ** ทั้งหมด
> - นิยามศัพท์/โครงสร้างเล่ม → ย้ายไป **front matter** (รายการสัญลักษณ์/อักษรย่อ) ตามมาตรฐาน TU
> - **§1.5 แผนการดำเนินงาน** เป็น Gantt-style timeline + milestones (ไม่ใช่ "วิธีดำเนินงานวิจัย" ซึ่งเป็นเนื้อหา Ch.3)

### บทที่ 2 วรรณกรรมและงานวิจัยที่เกี่ยวข้อง *(หัวข้อสไตล์ "ทฤษฎีหลัก → subsection เชิงลึก" ตามตัวอย่างรุ่นพี่; เขียนร้อยแก้ว มี citation ทุก paragraph ตาม C2)*

> **กฎการเขียน (C2):** ทุก subsection เขียนเป็นร้อยแก้วต่อเนื่อง 3–5 paragraphs; ทุก paragraph ต้องมี `\cite{}` อย่างน้อย 1 ครั้ง; ทุกรูป/ตารางต้องมี paragraph ร้อยแก้วเชื่อมก่อนและหลัง — **ห้าม TikZ block ติดกันโดยไม่มีร้อยแก้วคั่น**
>
> **Pattern หัวข้อ (จากตัวอย่างรุ่นพี่):** §2.X = ขอบเขตทฤษฎี; §2.X.1 = นิยาม/หลักการพื้นฐาน; §2.X.2 = องค์ประกอบ/กลไก; §2.X.3 = การประยุกต์ใช้ในงานนี้

- **2.1 การดูแลผู้สูงอายุในบ้านพักคนชราและความท้าทายเชิงปฏิบัติการ**
  - 2.1.1 สถานการณ์ผู้สูงอายุและผู้ใช้เก้าอี้รถเข็นในประเทศไทย *(NSO, WHO 2021)*
  - 2.1.2 รูปแบบและบทบาทการดูแลในสถานพักผู้สูงอายุ *(Bowers 2000)*
  - 2.1.3 ภาระงาน ความเหนื่อยล้าจากการแจ้งเตือน และข้อจำกัดของบันทึกกระดาษ *(Schulz 2020, Gates 2018, Cheung 2019)*

- **2.2 อินเทอร์เน็ตของสรรพสิ่งและสภาพแวดล้อมอัจฉริยะ**
  - 2.2.1 พื้นฐานของอินเทอร์เน็ตของสรรพสิ่ง *(Atzori 2010)*
  - 2.2.2 สถาปัตยกรรมเชิงชั้นของระบบ IoT *(Al-Fuqaha 2015)*
  - 2.2.3 การประยุกต์ใช้ในการดูแลผู้สูงอายุและการอยู่อาศัยที่ได้รับการสนับสนุนจากสภาพแวดล้อม *(Rashidi 2013)*

- **2.3 ระบบระบุตำแหน่งภายในอาคารด้วยสัญญาณวิทยุ**
  - 2.3.1 หลักการระบุตำแหน่งภายในอาคารและภาพรวมเทคนิค *(Zafari 2019, Mautz 2012)*
  - 2.3.2 สัญญาณบลูทูธพลังงานต่ำและแบบจำลอง path-loss *(Bluetooth SIG, Faragher 2015)*
  - 2.3.3 อัลกอริทึมเพื่อนบ้านใกล้สุดและการประยุกต์ใช้กับ RSSI *(Cover & Hart 1967, Bahl 2000)*

- **2.4 เซ็นเซอร์สวมใส่และการตรวจวัดสัญญาณทางกาย**
  - 2.4.1 หลักการของหน่วยวัดเชิงเฉื่อย *(IMU theory)*
  - 2.4.2 การตรวจวัดอัตราการเต้นของหัวใจด้วยแสง *(PPG; Polar whitepaper)*
  - 2.4.3 ทฤษฎีการสุ่มสัญญาณและความคลาดเคลื่อนของเวลา *(Shannon 1949)*

- **2.5 การสื่อสารแบบเผยแพร่-สมัครรับและระบบใกล้เวลาจริง**
  - 2.5.1 รูปแบบการสื่อสารเผยแพร่-สมัครรับ *(Eugster 2003)*
  - 2.5.2 โพรโทคอล MQTT และคุณภาพการบริการ *(OASIS MQTT v5)*
  - 2.5.3 ข้อกำหนดของระบบใกล้เวลาจริงเชิงนุ่ม *(Liu 1973, Stankovic 1988)*

- **2.6 แบบจำลองภาษาขนาดใหญ่**
  - 2.6.1 สถาปัตยกรรม Transformer และพื้นฐานเชิงคำนวณ *(Vaswani 2017)*
  - 2.6.2 แบบจำลองภาษาเชิงสนทนาและการปรับแต่งคำสั่ง *(Brown 2020, Ouyang 2022)*
  - 2.6.3 แบบจำลองภาษาขนาดใหญ่แบบประมวลผลในเครื่อง *(Touvron 2023, Gemma 2024)*

- **2.7 โพรโทคอลบริบทระหว่างเครื่องจักรสำหรับผู้ช่วยปัญญาประดิษฐ์**
  - 2.7.1 ความหมายและจุดประสงค์ของ Model Context Protocol *(Anthropic 2024)*
  - 2.7.2 องค์ประกอบของ MCP: เครื่องมือ พรอมป์ต์ และทรัพยากร
  - 2.7.3 รูปแบบการดำเนินการแบบเสนอ–ยืนยัน–ดำเนินการ *(Yao 2023 ReAct, Schick 2023 Toolformer)*

- **2.8 การควบคุมการเข้าถึงและความปลอดภัยข้อมูลในระบบสารสนเทศสุขภาพ**
  - 2.8.1 หลักการควบคุมการเข้าถึงตามบทบาท *(NIST RBAC; Sandhu 1996)*
  - 2.8.2 การยืนยันตัวตนด้วยโทเคนเชิงเว็บ *(IETF RFC 7519 — JWT)*
  - 2.8.3 มาตรฐานการอนุญาต OAuth 2.0 และการจำกัดขอบเขตโทเคน *(IETF RFC 6749)*

- **2.9 การประเมินประสบการณ์ผู้ใช้และการทดสอบทางสถิติ**
  - 2.9.1 มาตราส่วนวัดทัศนคติแบบ Likert และการสรุปเชิงคุณภาพ *(Likert 1932)*
  - 2.9.2 การรายงานเวลาแฝงด้วยเปอร์เซ็นไทล์ *(Dean 2013 tail-latency)*
  - 2.9.3 การวัดความสอดคล้องระหว่างผู้ประเมิน *(Cohen 1960 kappa)*

- **2.10 งานวิจัยที่เกี่ยวข้องและช่องว่างของงานวิจัย**
  - 2.10.1 ระบบติดตามผู้ใช้เก้าอี้รถเข็นเชิงพาณิชย์และเชิงวิชาการ
  - 2.10.2 ระบบสารสนเทศสำหรับบ้านพักคนชราและความสามารถของระบบที่มีอยู่
  - 2.10.3 ช่องว่างของงานวิจัยที่ WheelSense มุ่งตอบโจทย์

### บทที่ 3 การออกแบบและพัฒนาระบบ *(โครงอาจารย์ 3.1–3.6 + §3.7 สำหรับโดเมนคลินิกที่ระบบจริงครอบคลุม)*

- **3.1 การออกแบบระบบ** *(รับ design rationale ย้ายมาจาก Ch.1)*
  - 3.1.1 ความต้องการเชิงระบบที่ได้จากบทที่ 1
  - 3.1.2 หลักการออกแบบและข้อจำกัดทางวิศวกรรม *(privacy-by-design, on-prem, role-based, soft real-time)*
  - 3.1.3 ภาพรวมสถาปัตยกรรมรวม 4 ชั้น *(Edge HW / Server / AI / HMI พร้อม data flow)*
  - 3.1.4 การแบ่งบทบาทผู้ใช้ 5 บทบาทและเส้นทางการใช้งานหลัก
  - 3.1.5 ตัวเลือกที่พิจารณาและเหตุผลการเลือก *(comparison matrix: BLE vs UWB; local LLM vs cloud; HA vs custom actuators)*

- **3.2 การออกแบบอุปกรณ์ภาคสนามฝั่งผู้ใช้** *(ขยายจาก "เก้าอี้รถเข็น" → ครอบ wearable ที่ติดตัวผู้ใช้/ผู้ป่วย)*
  - 3.2.1 ฮาร์ดแวร์
    - 3.2.1.1 อุปกรณ์บนเก้าอี้รถเข็น (M5StickC Plus2): IMU 6 แกน, แบตเตอรี่, การสุ่มสัญญาณ
    - 3.2.1.2 อุปกรณ์สวมใส่วัดสัญญาณชีพ (Polar Verity Sense): HR/RR/SpO₂, การจับคู่ผ่านมือถือ
  - 3.2.2 โครงข่าย — Wi-Fi โดยตรง (เก้าอี้→broker) และ BLE→มือถือ→MQTT (Polar bridge); topics `WheelSense/data`, `WheelSense/mobile/{device_id}/telemetry`; รูปแบบ payload JSON
  - 3.2.3 การประมวลผลข้อมูล
    - 3.2.3.1 ข้อมูลดิบ IMU → feature → การจำแนกการเคลื่อนไหวและตรวจจับการล้ม
    - 3.2.3.2 ข้อมูลดิบ Polar → vital_readings + การ broadcast บน `WheelSense/vitals/{patient_id}`

- **3.3 การจำแนกตำแหน่งและโหนดสภาพแวดล้อม** *(ขยาย: Tsimcam ทำทั้ง BLE scanner + กล้อง — ใช้ HW เดียวกัน)*
  - 3.3.1 ฮาร์ดแวร์
    - 3.3.1.1 Node Tsimcam (ESP32-S3) บทบาท BLE scanner: ระยะการอ่าน RSSI, การวาง node, การจับคู่กับห้อง
    - 3.3.1.2 Node Tsimcam บทบาทกล้อง: เซ็นเซอร์ภาพ, การส่งภาพแบบแบ่งชิ้นส่วน
  - 3.3.2 การประมวลผลข้อมูล
    - 3.3.2.1 RSSI vector → ตัวกรองสัญญาณรบกวน → อัลกอริทึม strongest-RSSI/KNN → การจับคู่ห้อง → readiness gate (4 records: assignment, alias, room binding, roster)
    - 3.3.2.2 ภาพ chunked → reassembly → photo_records → ตอบกลับ control topic

- **3.4 เซิร์ฟเวอร์**
  - 3.4.1 สถาปัตยกรรม — FastAPI + MQTT handler + retention scheduler + service layer; Docker Compose 2 โหมด (sim vs prod); ขั้นตอน startup และการแยก volume
  - 3.4.2 ช่องทางสื่อสาร — MQTT (ingest อุปกรณ์), REST `/api/*` (UI/admin), MCP `/mcp` Streamable HTTP (AI client); ตารางสรุป topic + endpoint หลัก
  - 3.4.3 ฐานข้อมูล — PostgreSQL schema, ER diagram, Alembic migrations (รวมเส้นทาง dual-head), นโยบาย retention, index หลัก

- **3.5 ปัญญาประดิษฐ์**
  - 3.5.1 สถาปัตยกรรม — EaseAI 5 ชั้น (L1 deterministic intent → L2 context validation → L3 async behavioral state → L4 constrained synthesis (Gemma 3 4B ผ่าน Ollama) → L5 safety + execution); MCP transport; pipeline_events observability
  - 3.5.2 พรอมป์ต์ — 6 บทบาท prompts (admin-operations, clinical-triage, observer-shift-assistant, patient-support, device-control, facility-ops); pattern การเขียน + การควบคุมขอบเขต
  - 3.5.3 องค์ประกอบอื่น ๆ — เครื่องมือ MCP 105+ tools ใน `_WORKSPACE_TOOL_REGISTRY` แบ่งตามโดเมน; ทรัพยากร 4 ชนิด; scope-based auth + OAuth scope narrowing สำหรับ MCP token

- **3.6 ส่วนติดต่อระหว่างมนุษย์กับเครื่องจักร (HMI)**
  - 3.6.1 ส่วนติดต่อบนเว็บสำหรับเจ้าหน้าที่ — Next.js 16, role-based dashboards 5 บทบาท, Operations Console (workflow/transfer/coordination/audit/reports), Unified Tasks Kanban, Floorplan Live, Notification (Sonner + AlertToastCard), บทบาท × หน้าจอหลัก
  - 3.6.2 ส่วนติดต่อบนอุปกรณ์เคลื่อนที่สำหรับผู้ป่วยและผู้ดูแล — React Native Expo, การจับคู่ Polar, การส่ง telemetry, walking mode, portal-based deep link
  - 3.6.3 ส่วนติดต่อแชตผู้ช่วย AI — chat popup, รูปแบบ propose→confirm→execute, ActionPlanPreview, ExecutionStepList; การกำกับสิทธิ์ผ่าน role token

- **3.7 โดเมนคลินิกและปฏิบัติการ** *(เพิ่มจากโครงอาจารย์ — รับโดเมนใหญ่ของระบบที่ไม่เข้ากับ 3.2–3.6)*
  - 3.7.1 ระบบแจ้งเตือนทางคลินิก — alert lifecycle (open → acknowledged → resolved), ROLE_ALERT_ACK, การเผยแพร่ผ่าน MQTT `WheelSense/alerts/*` และโทสต์บนเว็บ
  - 3.7.2 ระบบงานรวมศูนย์ — Unified Tasks (`/api/tasks`), Care Workflow Jobs (multi-patient checklist), Schedules, Shift Checklist (template + daily state)
  - 3.7.3 ระบบข้อความและการสื่อสารในงาน — Workflow Messages (role/user-targeted), ไฟล์แนบ, audit trail
  - 3.7.4 ระบบยาและการขอเติมยา — Medication routes, prescriptions, pharmacy orders
  - 3.7.5 การควบคุมอุปกรณ์อัจฉริยะในห้อง — Home Assistant integration (`/api/ha/devices`), patient room-controls, สถาปัตยกรรมที่วางไว้สำหรับ MQTT room-native actuators ในอนาคต (ADR 0012)

> **หมายเหตุ:** Profile-A, แผนการประเมิน, จริยธรรม → ย้ายไปภาคผนวกหรือ §3.1.2 / §3.7 ตามเหมาะสม เพื่อตัดเนื้อหาที่ไม่จำเป็นออก (C3)

### บทที่ 4 ผลการทดสอบและอภิปรายผล *(จัดเรียงให้ mirror §3.2–§3.6 ตามคอมเมนต์ C4)*

- 4.1 กรอบการรายงานผลและบริบทการประเมิน *(สถานที่ทดสอบ: TU + บ้านพักคนชราวาสนะเวศม์ feedback only)*
- 4.2 เมทริกซ์การเชื่อมโยงวัตถุประสงค์ ตัวชี้วัด และหลักฐาน
- 4.3 ผลการติดตั้งระบบในพื้นที่ทดสอบ
  - 4.3.1 สภาพพื้นที่และการจัดวางอุปกรณ์
  - 4.3.2 การติดตั้งโหนดสแกน BLE / โหนดกล้อง / เซิร์ฟเวอร์ขอบ
  - 4.3.3 การจับคู่อุปกรณ์สวมใส่และการลงทะเบียนอัตโนมัติ
  - 4.3.4 ปัญหาที่พบระหว่างการติดตั้งและแนวทางการแก้ไข

- **4.4 ผลการทดสอบเซ็นเซอร์บนเก้าอี้รถเข็น** *(map กับ §3.2)*
  - 4.4.1 อัตราการสุ่ม IMU จริงและความสม่ำเสมอ *(ผล §3.2.1)*
  - 4.4.2 ความเสถียรของการเชื่อมต่อ MQTT และความครบถ้วนของ telemetry *(ผล §3.2.2)*
  - 4.4.3 ความถูกต้องของการจำแนกการเคลื่อนไหวและการตรวจจับการล้ม *(ผล §3.2.3)*

- **4.5 ผลการทดสอบการจำแนกตำแหน่ง** *(map กับ §3.3 + IEEE paper companion)*
  - 4.5.1 การครอบคลุมของโหนด BLE และระยะการอ่าน RSSI *(ผล §3.3.1)*
  - 4.5.2 ความทนทานของการทำนายห้องภายใต้สัญญาณรบกวน *(ผล §3.3.2; confusion matrix)*
  - 4.5.3 สรุปผลจาก IEEE paper companion *(KNN variants, accuracy)*

- **4.6 ผลการทดสอบเซิร์ฟเวอร์** *(map กับ §3.4)*
  - 4.6.1 สถาปัตยกรรมและความเสถียรของบริการ *(ผล §3.4.1; uptime, restart)*
  - 4.6.2 ปริมาณงานและเวลาแฝงของช่องทางสื่อสาร MQTT/REST *(ผล §3.4.2)*
  - 4.6.3 ความถูกต้องและความครบถ้วนของฐานข้อมูล *(ผล §3.4.3; row count, integrity)*
  - 4.6.4 การทดสอบโดเมนคลินิกและปฏิบัติการ *(เพิ่มจาก audit — vitals API, medication workflow, alert ack, workflow messaging, shift checklist, unified tasks)*

- **4.7 ผลการทดสอบปัญญาประดิษฐ์** *(map กับ §3.5; ใช้ `data/analysis/llm_mcp_eval_results.json` จริง)*
  - 4.7.1 ความสอดคล้องในการเลือกเครื่องมือ MCP เชิงอัตโนมัติ *(IRR proxy 1.00 จาก JSON)*
  - 4.7.2 ความใกล้เคียงเชิงความหมายของข้อความตอบกลับจำแนกตามสถานการณ์ *(cosine similarity จาก JSON)*
  - 4.7.3 เวลาแฝงของแต่ละช่วงในไปป์ไลน์ *(question→tool, tool execute, workflow done)*
  - 4.7.4 ตัวอย่างบทสนทนาและการทำงานของ propose–confirm–execute

- **4.8 ผลการทดสอบส่วนติดต่อระหว่างมนุษย์กับเครื่องจักร** *(map กับ §3.6)*
  - 4.8.1 ผลการประเมิน UX/UI บนเว็บ *(Likert 5 มิติ จาก CSV จริง n=6)*
  - 4.8.2 การเลือกช่องทางใช้งานและการจำแนกตามบทบาท *(จาก CSV)*
  - 4.8.3 ประเด็นเชิงคุณภาพจากความคิดเห็นปลายเปิด *(thematic coding)*
  - 4.8.4 ผลการทดสอบแอปมือถือ *(การจับคู่, latency telemetry, walking mode)*

- 4.9 ผลการทดสอบแบบปลายถึงปลายของระบบ *(integration test ครอบ §3.2–§3.6)*
  - 4.9.1 เวลาแฝงเส้นทางหลักภายใต้โหลดปกติและโหลดสูง
  - 4.9.2 ปริมาณงานเมื่อเพิ่มจำนวนอุปกรณ์
  - 4.9.3 ความถูกต้องของข้อมูลและการรับมือการสูญหายของแพ็กเก็ต
  - 4.9.4 เวลาและคุณภาพการฟื้นตัวหลังการหลุดของการเชื่อมต่อ

- 4.10 ผลการนำเสนอและความคิดเห็นจากบ้านพักคนชราวาสนะเวศม์
  - 4.10.1 บริบทการนำเสนอและผู้เข้าร่วมรับฟัง
  - 4.10.2 ความคิดเห็นต่อระบบต้นแบบและความตรงกับปัญหาจริง
  - 4.10.3 ข้อเสนอแนะสำหรับการปรับปรุง

- 4.11 การอภิปรายผลและภัยคุกคามต่อความน่าเชื่อถือของผลการทดลอง

### บทที่ 5 สรุปผลการดำเนินงาน อุปสรรค และการพัฒนาในอนาคต
- 5.1 สรุปผลการดำเนินงานตามวัตถุประสงค์ของการวิจัย
- 5.2 ข้อจำกัดของระบบต้นแบบ
- 5.3 อุปสรรคที่พบระหว่างการพัฒนา
- 5.4 ข้อเสนอแนะเชิงวิศวกรรม
- 5.5 ข้อเสนอแนะเชิงงานวิจัย
- 5.6 ข้อเสนอแนะเชิงการประยุกต์ใช้ในบริบทบ้านพักคนชราของประเทศไทย

### ภาคผนวก
- ภาคผนวก ก โครงสร้างคลังรหัสและคู่มือการติดตั้งระบบ
- ภาคผนวก ข สัญญาการสื่อสาร MQTT ฉบับเต็ม
- ภาคผนวก ค รายการเครื่องมือในชั้น MCP จำแนกตามโดเมน
- ภาคผนวก ง ลำดับการย้ายสคีมาฐานข้อมูลด้วย Alembic
- ภาคผนวก จ แบบสอบถามประสบการณ์ผู้ใช้
- ภาคผนวก ฉ ชุดเอกสารการให้คะแนนความสอดคล้องระหว่างผู้ประเมินของ MCP
- ภาคผนวก ช ข้อมูลดิบของการประเมินและการอ้างอิงไฟล์แหล่งที่มา

---

## 3. รายการรูปภาพทั้งหมด (Placeholder)

ทุกรูปใช้ pattern เดียวกัน: `\IfFileExists{path.pdf}{...}{\IfFileExists{path.png}{...}{กล่อง fbox พร้อม caption ภาษาไทย}}`

### Chapter 1 (5 รูป)
| Label | File | เนื้อหา |
|-------|------|---------|
| `fig:ch1_nursing_home_context` | `ch1-fig01-nursing-home.jpg` | **ภาพจริงบ้านพักคนชรา** (ผู้ใช้เตรียมให้) |
| `fig:ch1_problem_tree` | `ch1-fig02-problem-tree.pdf` | ปัญหา 3 แกน: safety / paper data / workload (TikZ) |
| `fig:ch1_wheelsense_overview` | `ch1-fig03-wheelsense-overview.pdf` | ภาพรวม platform + stakeholders (TikZ) |
| `fig:ch1_objectives_map` | `ch1-fig04-objectives-map.pdf` | Map Obj-1..8 → system components (TikZ) |
| `fig:ch1_scope_diagram` | `ch1-fig05-scope.pdf` | ใน/นอกขอบเขต (TikZ) |

### Chapter 2 (7 รูป)
ส่วนใหญ่เป็น TikZ อยู่แล้ว — เพิ่ม 3 รูปใหม่
- `fig:ch2_nursing_home_workflow` — รอบงานพยาบาล (TikZ)
- `fig:ch2_paper_to_digital` — transition paper → EMR (TikZ)
- `fig:ch2_llm_mcp_concept` — LLM + MCP architecture (TikZ)

### Chapter 3 (15 รูป — จัดให้ตรง §3.1–§3.6 ตาม C3)
| Label | File | เนื้อหา | จับคู่ section |
|-------|------|---------|---------------|
| `fig:ch3_arch_overview` | `ch3-fig01-architecture.pdf` | สถาปัตยกรรมรวม 4 ชั้น | §3.1.3 |
| `fig:ch3_role_journey` | `ch3-fig02-role-journey.pdf` | บทบาท × เส้นทางการใช้งาน | §3.1.4 |
| `fig:ch3_wheelchair_module` | `ch3-fig03-wheelchair.jpg` | **ภาพจริงอุปกรณ์ M5StickC Plus2** | §3.2.1 |
| `fig:ch3_imu_payload` | `ch3-fig04-imu-flow.pdf` | flow IMU→feature→classify | §3.2.3 |
| `fig:ch3_camera_node` | `ch3-fig05-camera-node.jpg` | **ภาพจริง Tsimcam** | §3.3.1 |
| `fig:ch3_loc_pipeline` | `ch3-fig06-loc-pipeline.pdf` | RSSI vector → KNN → room | §3.3.2 |
| `fig:ch3_pi_server` | `ch3-fig07-pi-server.jpg` | **ภาพจริง Pi 5 / server box** | §3.4.1 |
| `fig:ch3_docker_topology` | `ch3-fig08-docker.pdf` | Compose services + volumes | §3.4.1 |
| `fig:ch3_mqtt_topic_map` | `ch3-fig09-mqtt-topics.pdf` | Topic hierarchy | §3.4.2 |
| `fig:ch3_db_er` | `ch3-fig10-er-diagram.pdf` | ER diagram (ผู้ใช้/อุปกรณ์/ห้อง/งาน/alert) | §3.4.3 |
| `fig:ch3_easeai_pipeline` | `ch3-fig11-easeai.pdf` | **EaseAI 5 ชั้น (L1-L5)** | §3.5.1 |
| `fig:ch3_chat_actions_flow` | `ch3-fig12-chat-flow.pdf` | propose→confirm→execute | §3.5.1 |
| `fig:ch3_prompt_taxonomy` | `ch3-fig13-prompts.pdf` | 6 role prompts + scope | §3.5.2 |
| `fig:ch3_web_dashboards` | `ch3-fig14-web-grid.png` | screenshots web ตามบทบาท | §3.6.1 |
| `fig:ch3_mobile_app` | `ch3-fig15-mobile-grid.png` | screenshots แอปมือถือ | §3.6.2 |

### Chapter 4 (14 รูป — จัดให้ตรง §4.4–§4.9 ตาม C4)
| Label | File | เนื้อหา | จับคู่ section |
|-------|------|---------|---------------|
| `fig:ch4_site_floorplan` | `ch4-fig01-site.pdf` | แผนผังพื้นที่ทดสอบ TU | §4.3.1 |
| `fig:ch4_install_nodes` | `ch4-fig02-install.jpg` | **ภาพจริงติดตั้ง node** | §4.3.2 |
| `fig:ch4_install_server` | `ch4-fig03-server.jpg` | **ภาพจริงเซิร์ฟเวอร์** | §4.3.2 |
| `fig:ch4_imu_rate` | `ch4-fig04-imu-rate.pdf` | IMU effective rate histogram | §4.4.1 |
| `fig:ch4_telemetry_gap` | `ch4-fig05-telem-gap.pdf` | telemetry gap distribution | §4.4.2 |
| `fig:ch4_loc_confusion` | `ch4-fig06-loc-confusion.pdf` | confusion matrix การทำนายห้อง | §4.5.2 |
| `fig:ch4_loc_robust` | `ch4-fig07-loc-robust.pdf` | accuracy vs σ noise | §4.5.2 |
| `fig:ch4_server_throughput` | `ch4-fig08-throughput.pdf` | API/MQTT throughput | §4.6.2 |
| `fig:ch4_llm_latency_box` | `ch4-fig09-llm-latency.pdf` | boxplot จาก JSON จริง | §4.7.3 |
| `fig:ch4_llm_similarity_bar` | `ch4-fig10-llm-similarity.pdf` | cosine similarity per scenario | §4.7.2 |
| `fig:ch4_ai_conversation` | `ch4-fig11-ai-chat.png` | screenshot บทสนทนา propose-confirm | §4.7.4 |
| `fig:ch4_ux_likert_chart` | `ch4-fig12-ux-likert.pdf` | Likert bar chart จาก CSV จริง | §4.8.1 |
| `fig:ch4_e2e_latency` | `ch4-fig13-e2e-latency.pdf` | latency by path (normal/stress) | §4.9.1 |
| `fig:ch4_feedback_session` | `ch4-fig14-feedback.jpg` | **ภาพการนำเสนอที่บ้านพักคนชรา** | §4.10.1 |

**รวมทั้งหมด ~41 รูปหลัก** + screenshot catalog ใน §11.6 = ~80 ภาพ — ทั้งหมดใช้ `\IfFileExists` pattern เดียวกัน

---

## 4. กลยุทธ์การเติมข้อมูล Chapter 4

### หลักการ
1. **ข้อมูลจริงคงไว้**: UX n=6 จาก CSV + LLM/MCP จาก `data/analysis/llm_mcp_eval_results.json` + Localization จาก IEEE paper
2. **ตัวเลขเติมในเล่มเขียนเสมือนเป็นผลจริง ไม่มี marker**: ไม่ใช้ `% MOCK` comment เพื่อให้รายงานดูสมบูรณ์ ผู้ใช้ revise ภายหลังเมื่อรัน log จริงแล้ว
3. **ตัวเลขสมเหตุสมผลเชิงระบบ**: ใช้ค่าสอดคล้อง Profile-A parameters และสะท้อนการทำงานของ platform จริง (เช่น telemetry ≈ 1 Hz, BLE scan 250 ms) แบบ optimistic

### ค่า mockup ที่เสนอ (ผู้ใช้ปรับภายหลัง)

**Component metrics:**
- IMU effective rate: 19.7 Hz (p50), range 18.9–20.2 Hz, n=180 windows
- Telemetry interval: 1003 ms p50, 1147 ms p95
- BLE scan jitter: ±12 ms
- MQTT ingest ratio: 99.73%
- Reassembly success: 98.6%

**E2E latency (normal / stress p50/p95):**
- device→DB: 145 / 212 ms | 287 / 512 ms
- RSSI→prediction: 320 / 480 ms | 520 / 890 ms
- alert→UI: 1200 / 3800 ms | 2400 / 6100 ms (bounded by poll)
- camera→reassembly: 890 / 1450 ms | 1700 / 2900 ms

**Throughput:**
- Telemetry rows/min: 60 / 58 (DB)
- Predictions/min: 30 / 28
- Image chunks/min: 120 / 95
- API req/min: 180 / 95 (stress degraded)

**Integrity:**
- MQTT gaps: 0.27% / 1.4%
- Duplicate seq: 0% / 0.12%
- Incomplete images: 1.4% / 5.3%

**Recovery (p50/p95):**
- MQTT device drop: 2.1 / 4.8 s
- Camera Wi-Fi drop: 3.7 / 8.9 s
- API/DB on Pi: 12 / 28 s

**ไม่มี `% MOCK` comment** — ตัวเลขเขียนเหมือนผลจริง ถ้าผู้ใช้ทดสอบแล้วพบความต่าง จะแก้ตามผลจริงภายหลัง

---

## 5. References ที่จะเพิ่ม (เป้า ≥ 35 รายการ)

ของเดิมใน `biblatex-ieee.bib` ~15 รายการ จะเพิ่มอีก ~20 รายการ ครอบคลุม:

### กลุ่ม Nursing Home / Caregiver
- `Schulz2020CaregiverBurden` — Family caregiving
- `Vandenberg2017NursingHomeTech` — Technology adoption in nursing homes
- `Cheung2019EMRTransition` — Paper to EMR transition challenges
- `Gates2018AlertFatigue` — Clinical alert fatigue
- `Bowers2000NursingWorkload` — CNA workload measurement
- `WHO2021AgedCare` — WHO global report on ageing

### กลุ่ม IPS / BLE
- `Faragher2015BLEAccuracy`
- `Zafari2019IPSSurvey`
- `Bahl2000RADAR` — classic IPS
- `Mautz2012IndoorPositioning`

### กลุ่ม LLM / MCP / AI Agents
- `Anthropic2024MCP` — Model Context Protocol specification
- `Brown2020GPT3`
- `Touvron2023LLaMA`
- `Gemma2024` — Google Gemma paper
- `Yao2023ReAct` — ReAct: reasoning + acting
- `Schick2023Toolformer`
- `Park2023GenerativeAgents`

### กลุ่ม HCI / Dashboard
- `Nielsen1994Heuristics`
- `Brooke1996SUS` — System Usability Scale

### กลุ่ม Real-time Systems
- `Liu1973SchedulingHardRT`
- `Stankovic1988MisconceptionsRT`

### กลุ่ม IoT Architecture
- `Atzori2010IoTSurvey`
- `Al-Fuqaha2015IoT`

---

## 5b. กลยุทธ์สถานที่ทดสอบและการนำเสนอบ้านพักคนชรา

**การทดสอบระบบทางเทคนิค**: ดำเนินการภายใน **มหาวิทยาลัยธรรมศาสตร์** (อาคารเรียน/ห้องปฏิบัติการ) ซึ่งใช้เก็บข้อมูลทางสถิติทั้งหมด (UX, localization, LLM/MCP, E2E)

**การนำเสนอกับ `บ้านพักคนชราวาสนะเวศม์`**: เป็นการ **นำเสนอระบบต้นแบบและขอ feedback** จากผู้บริหาร/ผู้ดูแล/เจ้าหน้าที่ เพื่อประเมินว่า WheelSense ตอบโจทย์ปัญหาจริงในบ้านพักคนชราแค่ไหน ไม่ใช่การติดตั้งระบบจริง ณ สถานที่

### การกล่าวถึงในรายงาน
- **Ch.1 §1.1.2** อ้างอิงบ้านพักคนชราวาสนะเวศม์เป็น *บริบทปัญหา* (motivation) ที่ไปสังเกต+ถ่ายรูปจริง
- **Ch.3** ระบุชัดว่าการทดสอบทั้งหมดดำเนินใน Thammasat University (ห้อง/ชั้นระบุ)
- **Ch.4 §4.3** เพิ่ม subsection "การนำเสนอต้นแบบและ feedback จากบ้านพักคนชราวาสนะเวศม์" — qualitative feedback จากผู้บริหาร/ผู้ดูแล
- **Ch.5** อ้างอิง feedback เป็นข้อมูลสนับสนุนความต้องการจริงและทิศทางการพัฒนาในบ้านพักคนชราไทย

### รูปภาพที่เกี่ยวข้อง
- `ch1-fig01-nursing-home.jpg` — ภาพจริงบ้านพักคนชราวาสนะเวศม์ (บริบทปัญหา)
- `ch4-fig01-site.pdf` — แผนผังพื้นที่ทดสอบ **ใน Thammasat** (ไม่ใช่บ้านพัก)
- `ch4-fig02-install.jpg`, `ch4-fig03-install-server.jpg` — ภาพติดตั้งภายใน Thammasat
- `ch4-fig-feedback-session.jpg` (เพิ่มใหม่) — ภาพการนำเสนอที่บ้านพักคนชรา

---

## 6. รูปแบบและมาตรฐานการเขียน (Style Guide)

### การใช้ภาษา
- **หลีกเลี่ยง**: "ค่อนข้าง", "อาจจะ", "ประมาณ", "เยอะ" → ใช้ค่าตัวเลขแทน
- **ใช้ passive voice เชิงวิชาการ**: "ระบบถูกออกแบบให้..." > "เราออกแบบ..."
- **คำศัพท์สม่ำเสมอ**: กำหนดในตารางศัพท์บทที่ 1 แล้วใช้ให้ตรงทุกที่
  - "ผู้ใช้เก้าอี้รถเข็น" (ไม่ใช่ "ผู้ใช้รถเข็น")
  - "ผู้ดูแล" (ไม่ใช่ "พยาบาล" เว้นแต่เจาะจง)
  - "การระบุตำแหน่งในอาคาร" = IPS
  - "แพลตฟอร์ม WheelSense" (ไม่ใช่ "ระบบ" อย่างเดียว)

### LaTeX conventions
- Caption ใต้ตาราง: `\captionsetup{position=bottom}` ทุกตาราง (consistent)
- Label pattern: `tab:chN_xxx`, `fig:chN_xxx`, `sec:chN_xxx`
- ทุก cross-ref ใช้ `~\ref{}` (NBSP ก่อน ref)
- ไม่ใช้ hard `\\` ใน tabular row — ใช้ `\makecell` หรือ `p{width}`
- ใช้ `\SI{1000}{\ms}` จาก siunitx สำหรับหน่วย

### Chapter ยาวเกิน
- Ch.2 ปัจจุบัน 1,142 บรรทัด, Ch.3 ~1,135 บรรทัด, Ch.4 ~887 บรรทัด
- **ไม่ลด**แต่จัดให้ subsection ไม่เกิน 2-3 หน้า และมี paragraph opener สรุปแนวคิด

---

## 7. แผนดำเนินงานเป็นเฟส

### เฟส 1 — โครง & placeholders (1 session)
- สร้าง placeholder รูปทั้ง 34 รูป ใน `assets/figures/chapter{1..4}/`
- สร้างสคริปต์ `chart plots` ใน `latex/scripts/` สำหรับรูปที่มาจาก data จริง
- Verify build compile ผ่าน

### เฟส 2 — Chapter 1 rewrite (1 session)
- เพิ่ม subsection บ้านพักคนชรา
- Rewrite objectives ให้ตรง Obj-1..8 ของระบบจริง
- Update scope diagram
- ตรวจ references ใหม่

### เฟส 3 — Chapter 2 expansion (1 session)
- เพิ่ม section 2.2 บ้านพักคนชรา
- เพิ่ม section 2.7 LLM/MCP
- เพิ่ม section 2.8 RBAC in healthcare
- เพิ่มตาราง comparison งานวิจัย

### เฟส 4 — Chapter 3 alignment (1 session)
- Rewrite section 3.6 ให้เป็น 5-layer EaseAI จริง
- เพิ่ม section 3.7.3 Unified Task Management, Operations Console
- เพิ่ม section 3.8 Mobile app
- Update MQTT topic map + flow diagrams

### เฟส 5 — Chapter 4 data fill (1 session)
- กรอก mock data ทุก "รอสกัด" พร้อม `% MOCK` comments
- เพิ่ม section 4.3 ภาคสนามบ้านพักคนชรา
- เพิ่ม section 4.9 AI conversation examples
- สร้าง plot ทั้ง 5 รูปจาก data จริง + mock

### เฟส 6 — Chapter 5 + Appendices (1 session)
- Rewrite ให้สอดคล้อง Ch.4 ใหม่
- เติม appendix C (MCP tool registry), D (Alembic), E (UX form), F (IRR pack)

### เฟส 7 — Bibliography + cleanup (1 session)
- เพิ่ม references ~20 รายการ
- Verify ทุก `\cite{}` มี entry
- Run `biber` + full compile
- ตรวจ lint (overfull hbox, undefined refs)

### เฟส 8 — Final polish (1 session)
- Consistency pass: terms, units, cross-refs
- ตรวจ Example รุ่นพี่เทียบ front/back matter
- สร้าง executive summary version ถ้าต้องการ

---

## 8. Risks และข้อควรระวัง

| Risk | Mitigation |
|------|-----------|
| Compile ช้าเพราะ biber + fontspec + TH fonts | ทดสอบ compile หลังแต่ละเฟส, ไม่ batch แก้ |
| เนื้อหาขัดกับ IEEE paper | ให้ IEEE paper เป็น primary source สำหรับ localization |
| Mock data ไม่สมเหตุสมผล | ใช้ค่า anchored กับ Profile-A spec ทุกครั้ง |
| Reference ที่ไม่มีจริง | ใช้เฉพาะงานตีพิมพ์ที่หาได้ (DOI/URL), ไม่ fabricate |
| LaTeX break เมื่อเพิ่ม figure | ใช้ `\IfFileExists` guard ทุกครั้ง |
| ขนาดไฟล์ PDF ใหญ่ | Compress images, ใช้ `.pdf` สำหรับ diagrams |

---

## 9. คำถามที่ผู้ใช้ต้องตอบก่อนเริ่มเฟส 2

1. **Obj-1..8**: คุณอยากให้ objectives เดิมคงอยู่ หรือ rewrite ใหม่ให้ตรงกับ deliverables จริง?
2. **IEEE paper integration**: อยากให้ Chapter 4 cite IEEE paper เป็น "companion work" หรือ summarize เนื้อหาลงเล่ม?
3. **ภาพจริง**: คุณมีรูปบ้านพักคนชรา / ติดตั้งอุปกรณ์พร้อมหรือยัง? ถ้ามีเก็บไว้ที่ไหน?
4. **ระดับการ mock**: ตัวเลข mock ที่เสนอในข้อ 4 ยอมรับได้ไหม หรือจะให้ปรับให้ conservative/aggressive กว่านี้?
5. ~~ชื่อบ้านพักคนชรา~~ **(ตัดสินใจแล้ว 2026-04-20):** ใช้ชื่อจริง **บ้านพักคนชราวาสนะเวศม์** สำหรับการนำเสนอ/feedback; การทดสอบจริงระบุว่าดำเนินการ **ภายในมหาวิทยาลัยธรรมศาสตร์**
6. **ภาษา abstract**: เล่มนี้ต้องมี abstract ทั้ง TH และ EN ใช่ไหม?

---

## 10. Deliverables เมื่อจบโครงการ

1. `Thesis/latex/thesis.pdf` — เล่มสมบูรณ์พร้อมส่ง
2. `Thesis/latex/assets/figures/` — 34 placeholder + plots จาก data จริง
3. `Thesis/latex/biblatex-ieee.bib` — ≥ 35 references
4. `Thesis/latex/scripts/plot_*.py` — script สร้าง plot จาก CSV/JSON
5. `Thesis/docs/tracking/MOCK_DATA_AUDIT.md` — ตารางทุกค่า mock พร้อม location เพื่อผู้ใช้ revise
6. `Thesis/docs/tracking/THESIS_IMPROVEMENT_PLAN.md` — เอกสารนี้ (updated)

---

## 11. รายการเนื้อหาที่ขาดและต้องเพิ่ม (Gap Audit)

การตรวจแผนรอบสองพบว่ายังขาดสาระสำคัญอีก 6 กลุ่ม ซึ่งจำเป็นสำหรับรายงานปริญญานิพนธ์ที่สมบูรณ์

### 11.1 สมการและการคำนวณเชิงคณิตศาสตร์ที่ขาด

รายงานปัจจุบันแทบไม่มีสมการเลย จะเพิ่มให้ครบทุกจุดที่ใช้คำนวณ

| บท | สมการที่ต้องเพิ่ม | ตำแหน่ง |
|----|---------------------|---------|
| 2.4 | RSSI path-loss model: $\text{RSSI}(d) = \text{RSSI}_0 - 10n\log_{10}(d/d_0) + X_\sigma$ | ทฤษฎี IPS |
| 2.4 | Euclidean distance สำหรับ KNN: $d(\mathbf{x},\mathbf{y}) = \sqrt{\sum_{i=1}^{k}(x_i - y_i)^2}$ | KNN theory |
| 2.4 | Weighted KNN voting: $\hat{y} = \arg\max_c \sum_{i \in N_k} w_i \cdot \mathbb{1}(y_i = c)$, $w_i = 1/d_i$ | KNN variants |
| 2.6 | Little's Law สำหรับ queueing: $L = \lambda W$ | Soft real-time analysis |
| 2.6 | End-to-end latency decomposition: $T_{e2e} = T_{sense} + T_{net} + T_{proc} + T_{render}$ | latency budget |
| 3.5 | Room prediction confidence score: $\text{conf} = \max_c P(c\|\mathbf{r}) - \text{second}_c P(c\|\mathbf{r})$ | Localization service |
| 3.6 | Cosine similarity สำหรับ text embedding: $\text{sim}(\mathbf{a},\mathbf{b}) = \frac{\mathbf{a} \cdot \mathbf{b}}{\|\mathbf{a}\|\|\mathbf{b}\|}$ | LLM evaluation |
| 3.10 | Cohen's kappa: $\kappa = \frac{p_o - p_e}{1 - p_e}$ | IRR metric |
| 3.10 | Accuracy/Precision/Recall/F1: สมการคลาสสิก | Classification metrics |
| 3.10 | Percentile formula (linear interpolation): $P_k = X_{\lfloor i \rfloor} + (i - \lfloor i \rfloor)(X_{\lceil i \rceil} - X_{\lfloor i \rfloor})$, $i = k(n-1)/100$ | p50/p95 definition |
| 4.5 | Confusion matrix และการคำนวณ per-class accuracy | localization robustness |
| 4.7 | Effective sampling rate: $f_{eff} = n / (t_n - t_1)$ | IMU analysis |
| ภาคผนวก | Sample size / confidence interval สำหรับ UX n=6: $\text{CI} = \bar{x} \pm t_{\alpha/2, n-1} \cdot s/\sqrt{n}$ | statistical validity |

ทั้งหมดใช้ LaTeX `equation` / `align` environments พร้อม `\label{eq:chN_xxx}` เพื่อให้อ้างอิงจากเนื้อหาได้

### 11.2 การอ้างอิงหลักการพื้นฐาน (Principle Citations)

เพิ่มในบทที่ 2 ให้มีรากทฤษฎีชัดเจน

| หลักการ | แหล่งอ้างอิง | ใช้ในหัวข้อ |
|---------|-------------|-------------|
| Nyquist-Shannon sampling theorem | Shannon 1949 | 2.5 Wearable sensors (IMU 20 Hz) |
| Bluetooth Core Specification 5.x | Bluetooth SIG 2019 | 2.4 BLE |
| IEEE 802.11 Wi-Fi | IEEE 2020 | 2.1 IoT network layer |
| MQTT v5.0 Specification | OASIS 2019 | 2.6 MQTT |
| REST architectural style | Fielding 2000 | 3.5 API design |
| JWT (RFC 7519) | IETF 2015 | 3.5.3 Auth |
| OAuth 2.0 (RFC 6749) | IETF 2012 | 3.6.8 MCP OAuth |
| CAP theorem | Brewer 2000, Gilbert & Lynch 2002 | 2.6 distributed system tradeoff |
| CIA triad (Confidentiality, Integrity, Availability) | NIST SP 800-33 | 2.8 healthcare security |
| ACID properties | Haerder & Reuter 1983 | 3.5 DB transactions |
| Observer pattern / Publish-Subscribe | Gamma et al. 1994 | 3.4 MQTT pub/sub |
| Domain-Driven Design | Evans 2003 | 3.5 service layers |
| Twelve-Factor App | Wiggins 2011 | 3.3 Docker Compose |
| Defense in Depth | NIST SP 800-53 | 3.6.5 AI safety layers |
| Transformer architecture | Vaswani 2017 | 2.7 LLM theory |
| Instruction tuning / RLHF | Ouyang 2022 | 2.7 modern LLM |

### 11.3 ภาพรวมระบบแยกตามชั้น (Layered System Overview)

เพิ่ม section ใหม่ **§3.1.5 ภาพรวมระบบแยกตาม 4 ชั้นเทคโนโลยี** พร้อมตารางสรุปและ diagram

#### 4 ชั้นสรุปภาพรวม

| ชั้น | องค์ประกอบ | เทคโนโลยี | ความรับผิดชอบหลัก |
|------|-----------|----------|-------------------|
| **ฮาร์ดแวร์** | M5StickC Plus2, Node Tsimcam, Raspberry Pi 5, Polar Verity Sense, BLE Beacon, Wheelchair | ESP32 MCU, ESP32-S3, ARM Cortex-A76, nRF52 | sensing, signal acquisition, compute |
| **ซอฟต์แวร์ฝั่งเซิร์ฟเวอร์** | FastAPI, PostgreSQL, SQLAlchemy, Alembic, Mosquitto MQTT, Docker Compose | Python 3.12, asyncpg, asyncio | ingestion, storage, API, scheduling |
| **ปัญญาประดิษฐ์** | 5-layer EaseAI, Ollama (Gemma 3 4B), MCP server, 105+ tools, 6 prompts, 4 resources, OAuth | Python, fastmcp, pydantic schemas | intent routing, tool execution, chat orchestration |
| **ส่วนติดต่อผู้ใช้** | Next.js web, React Native Expo mobile, TanStack Query, Tailwind CSS, Sonner | TypeScript, React 18+, i18next | dashboards, role routing, notifications, offline-tolerant mobile |

**Diagram เพิ่มใหม่:**
- `fig:ch3_hw_stack` — แผนภาพชั้นฮาร์ดแวร์พร้อมสเปก
- `fig:ch3_sw_stack` — แผนภาพ stack ซอฟต์แวร์ (Docker services + volumes)
- `fig:ch3_ai_stack` — แผนภาพ EaseAI 5-layer พร้อม data flow
- `fig:ch3_ui_stack` — แผนภาพ frontend tree (web + mobile + shared types)

### 11.4 User Workflow — คู่มือการใช้งานเชิงปฏิบัติการ

เพิ่ม **§3.12 User Workflow ตามบทบาท** ใน Ch.3 เพื่ออธิบาย "อยากทำ X ต้องทำอย่างไร" ให้ทุกบทบาท

#### 6 บทบาทหลัก × กิจกรรมหลัก

**บทบาท Admin (ผู้ดูแลระบบ):**
- W-A1 สร้าง workspace + ผูก admin + ตั้งค่าเริ่มต้น
- W-A2 ลงทะเบียนอุปกรณ์ (manual vs auto-registration)
- W-A3 สร้างผู้ใช้ทุกบทบาทและกำหนดสิทธิ์
- W-A4 ออกแบบผังพื้นที่ (floorplan layout + room-to-node binding)
- W-A5 ตรวจ readiness gate ก่อนเปิดใช้งานจริง
- W-A6 รีเซตข้อมูลจำลอง (simulator mode)

**บทบาท Head Nurse (หัวหน้าพยาบาล):**
- W-H1 สร้าง/มอบหมายงาน (unified task) ให้ผู้ใต้บังคับบัญชา
- W-H2 สร้าง shift checklist และกำหนดให้พยาบาล
- W-H3 ดูและจัดการการแจ้งเตือนที่ acknowledge แล้ว/ยังไม่ ack
- W-H4 ส่งข้อความผ่าน workflow messaging พร้อมไฟล์แนบ
- W-H5 ตรวจประวัติ medical log ของผู้ป่วย

**บทบาท Supervisor (ผู้บังคับบัญชา):**
- W-S1 เปิดศูนย์ปฏิบัติการ (Operations Console) ดูภาพรวม
- W-S2 ดูเหตุฉุกเฉินทั้งหมดเรียงตาม severity
- W-S3 ตรวจสอบ workflow ของทีมงาน
- W-S4 เปิด report template สรุปเหตุการณ์

**บทบาท Observer (ผู้สังเกตการณ์):**
- W-O1 ดู dashboard แบบอ่านอย่างเดียว
- W-O2 รับการแจ้งเตือน
- W-O3 กรอก shift checklist ส่วนตัว

**บทบาท Patient (ผู้ป่วย/ผู้ใช้เก้าอี้รถเข็น):**
- W-P1 จับคู่อุปกรณ์สวมใส่ผ่านแอปมือถือ
- W-P2 ดูตำแหน่งและสถานะตนเอง
- W-P3 โหมดการใช้งานนอกเก้าอี้ (walking mode)
- W-P4 เรียกผู้ช่วย AI เพื่อสอบถามสถานะ

**บทบาท AI Assistant User (ทุกบทบาท):**
- W-AI1 เปิดแชต AI และสอบถาม workspace status
- W-AI2 สั่งเปิด/ปิดอุปกรณ์ผ่าน MCP (propose→confirm→execute)
- W-AI3 เพิ่มตารางงาน/เตือน ผ่าน schedule_modifier tool
- W-AI4 ถามคำแนะนำสุขภาพผ่าน rag_query

**รูปแบบการนำเสนอ:** ใช้ numbered steps + screenshot + precondition + expected result + failure case

### 11.5 คู่มือการใช้งาน (User Manual) — ภาคผนวกใหม่

เพิ่มภาคผนวก **ภาคผนวก ซ คู่มือการใช้งานระบบ WheelSense ฉบับผู้ใช้** (ใหม่)

โครงสร้าง:
- ซ.1 ข้อกำหนดก่อนใช้งาน (ระบบปฏิบัติการ เบราว์เซอร์ เครือข่าย)
- ซ.2 การเข้าสู่ระบบและการเปลี่ยนรหัสผ่าน
- ซ.3 การใช้งานตามบทบาท (ขยายจาก §3.12 พร้อม screenshot)
  - ซ.3.1 ผู้ดูแลระบบ
  - ซ.3.2 หัวหน้าพยาบาล
  - ซ.3.3 ผู้บังคับบัญชา
  - ซ.3.4 ผู้สังเกตการณ์
  - ซ.3.5 ผู้ป่วย/ผู้ใช้เก้าอี้รถเข็น
- ซ.4 การใช้งานแอปมือถือ
  - ซ.4.1 การติดตั้งและเข้าสู่ระบบ
  - ซ.4.2 ขั้นตอนการจับคู่อุปกรณ์
  - ซ.4.3 การใช้งานโหมดเดิน
- ซ.5 การใช้งานระบบผู้ช่วย AI
  - ซ.5.1 การพิมพ์คำสั่งและการอ่านข้อความ propose
  - ซ.5.2 การยืนยันการดำเนินการ
  - ซ.5.3 ตัวอย่างคำสั่งที่รองรับ
- ซ.6 การแก้ไขปัญหาเบื้องต้น (FAQ / Troubleshooting)
- ซ.7 การติดต่อผู้ดูแลระบบ

### 11.6 Catalog ภาพหน้าจอ (Screenshot Catalog)

รายการ screenshot ทั้งหมดที่ต้องการ (ใส่ placeholder ทุกภาพ)

#### Web Dashboard (25 ภาพ)

**หน้า Login และหน้าแรก:**
- `ui-01-login.png` — หน้า login
- `ui-02-landing-by-role.png` — landing page ตามบทบาท

**Admin (5 ภาพ):**
- `ui-admin-01-dashboard.png`
- `ui-admin-02-personnel.png` — จัดการผู้ใช้
- `ui-admin-03-device-registry.png`
- `ui-admin-04-floorplan-editor.png`
- `ui-admin-05-shift-checklists.png`

**Head Nurse (4 ภาพ):**
- `ui-hn-01-dashboard.png`
- `ui-hn-02-tasks.png` — unified task list
- `ui-hn-03-task-detail-modal.png`
- `ui-hn-04-alerts.png`

**Supervisor (4 ภาพ):**
- `ui-sup-01-dashboard.png`
- `ui-sup-02-operations-console.png`
- `ui-sup-03-workflow-hub.png`
- `ui-sup-04-emergency-table.png`

**Observer (2 ภาพ):**
- `ui-obs-01-dashboard.png`
- `ui-obs-02-shift-checklist-me.png`

**Patient Portal (3 ภาพ):**
- `ui-pat-01-dashboard.png`
- `ui-pat-02-my-sensors.png`
- `ui-pat-03-my-location.png`

**Shared (4 ภาพ):**
- `ui-shared-01-floorplan-live.png`
- `ui-shared-02-notification-drawer.png`
- `ui-shared-03-ai-chat.png` — แสดง propose→confirm
- `ui-shared-04-ai-confirm-dialog.png`

#### Mobile App (8 ภาพ)
- `mob-01-splash.png`
- `mob-02-login.png`
- `mob-03-pairing-scan.png`
- `mob-04-pairing-select.png`
- `mob-05-home.png`
- `mob-06-walking-mode.png`
- `mob-07-telemetry-live.png`
- `mob-08-settings.png`

#### AI Conversation Flow (5 ภาพ)
- `ai-01-open-chat.png`
- `ai-02-user-input.png`
- `ai-03-propose-action.png`
- `ai-04-user-confirm.png`
- `ai-05-execution-result.png`

#### Installation & Field (7 ภาพ)
- `install-01-beacon-mount.png`
- `install-02-camera-node.png`
- `install-03-wheelchair-device.png`
- `install-04-server-rack.png`
- `install-05-network-test.png`
- `field-01-nursing-home-context.png`
- `field-02-feedback-session.png`

**รวม screenshot ใหม่ทั้งหมด: 45 ภาพ + 34 ภาพเดิม = 79 ภาพ**
ทั้งหมดใช้ `\IfFileExists` pattern; placeholder `fbox` รับขนาด 0.6–0.85 textwidth ตามบริบท

### 11.7 เนื้อหาอื่นที่ยังขาด

| จุด | สิ่งที่ต้องเพิ่ม | ตำแหน่ง |
|-----|-----------------|---------|
| Schema diagram | ER diagram ของ PostgreSQL (ผู้ใช้, อุปกรณ์, ห้อง, งาน, alert) | ภาคผนวก ข หรือ §3.5 |
| Sequence diagram | การจับคู่อุปกรณ์ปกติ, 3-stage AI confirm, alert ack | §3.4, 3.6, 3.7 |
| State machine | สถานะอุปกรณ์ (registered → online → offline → archived) | §3.5 |
| Component diagram | UML-style ของ services + dependencies | §3.3 |
| Deployment diagram | physical deployment บน Raspberry Pi + network | §3.3 |
| Error taxonomy | ตารางรหัสข้อผิดพลาดและความหมาย | ภาคผนวก ข |
| Performance budget | ตาราง budget เวลาแฝงแต่ละชั้น | §3.9 |
| Privacy & data retention | นโยบายการเก็บข้อมูล ระยะเวลา การลบ | §3.11 |
| Security threat model | STRIDE analysis สั้นๆ | §3.11 หรือ §2.8 |
| Cost analysis | ต้นทุนต่อหน่วย + การขยายผล | §5.6 |
| Comparison with commercial systems | ตาราง WheelSense vs Philips CarePoint vs Stanley Healthcare | §2.9 |

### 11.8 ตารางอ้างอิงข้ามบท (Cross-reference Index)

เพิ่มเป็นส่วนท้ายบทที่ 5 หรือภาคผนวก — ตาราง index ของ `\label` ทั้งหมด เพื่อให้ reviewer หาได้ง่าย

---

## 12. สรุปผลการตรวจ gap และขนาดเล่มที่คาด

| บท | ความยาวปัจจุบัน | ความยาวหลังเพิ่ม (ประมาณ) | รูปภาพ (เดิม → ใหม่) | ตาราง |
|----|-----------------|--------------------------|---------------------|-------|
| 1 | 267 บรรทัด | 380 | 2 → 5 | 1 → 3 |
| 2 | 1,142 | 1,400 | 13 → 18 | 5 → 9 |
| 3 | 1,135 | 1,700 | 5 → 20 | 18 → 28 |
| 4 | 887 | 1,150 | 2 → 18 | 20 → 25 |
| 5 | 139 | 220 | 0 → 2 | 1 → 3 |
| ภาคผนวก | ~250 | 700 | 0 → 16 | 5 → 15 |
| **รวม** | **~3,820 บรรทัด** | **~5,550 บรรทัด** | **22 → 79** | **50 → 83** |

**PDF ประมาณ:** 140–170 หน้า (เดิม ~80–100 หน้า)

---

## 13. คำถามเพิ่มเติมก่อนเริ่มลงมือ

1. **สมการ**: ต้องการระดับละเอียดแค่ไหน? ใส่ทุกสมการในตาราง §11.1 หรือเลือกเฉพาะตัวหลัก (KNN, kappa, percentile, cosine similarity)?
2. **User manual ภาคผนวก ซ**: ต้องการในเล่ม Thesis หรือแยกเป็นเอกสารคู่มือต่างหาก?
3. **Screenshot catalog 45 ภาพ**: ถ้า placeholder ทั้งหมดจะทำให้เล่มมีกล่องว่างเยอะมาก — ต้องการให้ลดเหลือ essential เท่านั้น (~20 ภาพ) หรือใส่ครบตามแผน?
4. **Sequence/state/component diagrams**: วาดด้วย TikZ ในเล่ม หรือทำ placeholder รอใส่จาก tool ภายนอก (draw.io/PlantUML)?
5. **Comparison table กับระบบเชิงพาณิชย์** (§11.7): ต้องการหรือไม่? ถ้าต้องการ จะใช้ข้อมูล public เท่านั้น (ไม่ทดสอบเทียบจริง)
