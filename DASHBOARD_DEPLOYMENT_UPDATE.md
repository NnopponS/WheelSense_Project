# 🎯 WheelSense NewSystem - Dashboard Deployment Update

## 📢 ประกาศอัปเดตสำคัญ

Dashboard ของระบบ WheelSense ได้ถูก**แยกออกจาก Docker**และปรับให้พร้อมสำหรับการ**Deploy บน Vercel**แล้ว! ✅

---

## 🔄 สิ่งที่เปลี่ยนแปลง

### ระบบเดิม (Monolithic)
```
Docker Compose
├── Dashboard (React + Nginx) - Port 80
├── FastAPI Server - Port 8000
└── MQTT Collector
```
👉 ทุกอย่างรันใน Docker

### ระบบใหม่ (Separated)
```
Vercel Cloud
└── Dashboard (React + Vite)
    └── CDN distributed globally

Docker Compose
├── FastAPI Server - Port 8000
└── MQTT Collector
```
👉 Dashboard deploy แยกบน Vercel, Backend ยังคงใน Docker

---

## 📂 โครงสร้างโปรเจค

```
New_System/
├── WheelSense-Server/
│   ├── WheelSense-Dashboard/          ⬅️ UPDATED
│   │   ├── src/                        # Source code
│   │   ├── public/                     # Static assets
│   │   ├── vercel.json                 # ✨ Vercel config
│   │   ├── .vercelignore              # ✨ Ignore files
│   │   ├── env.example                 # ✨ Env template
│   │   ├── .gitignore                  # ✨ Updated
│   │   ├── package.json                # ✨ Updated scripts
│   │   ├── VERCEL_DEPLOYMENT.md        # ✨ Deploy guide
│   │   ├── STANDALONE_SETUP.md         # ✨ Setup guide
│   │   ├── QUICK_DEPLOY.md             # ✨ Quick reference
│   │   └── README.md                   # ✨ Updated
│   │
│   ├── api/                            # FastAPI Backend
│   ├── mqtt_collector/                 # MQTT Collector
│   ├── docker-compose.yml              # ✨ UPDATED - Dashboard removed
│   ├── Dockerfile.api                  # API Docker config
│   ├── Dockerfile.collector            # Collector Docker config
│   ├── DOCKER_INSTRUCTIONS.md          # ✨ UPDATED
│   └── DASHBOARD_SEPARATION_SUMMARY.md # ✨ NEW - Summary
│
├── ID_Wheel_M5StickC/                  # M5 Stick C firmware
├── Node_Advertise_esp32s3/             # Node firmware
└── DASHBOARD_DEPLOYMENT_UPDATE.md      # ✨ NEW - This file
```

**✨ = ไฟล์ใหม่หรืออัปเดต**

---

## 🚀 วิธีการใช้งาน

### สำหรับ Development

#### 1. รัน Backend (Docker)
```bash
cd New_System/WheelSense-Server
./start-docker.sh  # Linux/Mac
# หรือ
start-docker.bat   # Windows
```
Backend จะรันที่: `http://localhost:8000`

#### 2. รัน Dashboard (Vite)
```bash
cd WheelSense-Dashboard
cp env.example .env.local
npm install
npm run dev
```
Dashboard จะรันที่: `http://localhost:3000`

---

### สำหรับ Production

#### Option A: Quick Deploy (Vercel CLI)
```bash
cd WheelSense-Dashboard
npm install -g vercel
vercel login
vercel --prod
```

#### Option B: GitHub Integration
1. Push Dashboard ขึ้น GitHub
2. Import ใน Vercel Dashboard
3. Configure และ Deploy

**อ่านรายละเอียดเพิ่มเติม**: `WheelSense-Server/WheelSense-Dashboard/QUICK_DEPLOY.md`

---

## 📚 เอกสารที่เกี่ยวข้อง

### Quick Reference
1. **`WheelSense-Dashboard/QUICK_DEPLOY.md`** ⚡
   - คู่มือสั้นสำหรับ deploy อย่างรวดเร็ว
   - ขั้นตอนชัดเจน ใช้งานง่าย

### Detailed Guides
2. **`WheelSense-Dashboard/VERCEL_DEPLOYMENT.md`** 📖
   - คู่มือ deploy แบบละเอียด
   - Troubleshooting และ debugging
   - Custom domain setup
   - Monitoring และ analytics

3. **`WheelSense-Dashboard/STANDALONE_SETUP.md`** 🔧
   - การตั้งค่าและใช้งาน standalone
   - Architecture diagram
   - Development workflow
   - Environment configuration

4. **`WheelSense-Server/DASHBOARD_SEPARATION_SUMMARY.md`** 📊
   - สรุปการเปลี่ยนแปลงทั้งหมด
   - เหตุผลและประโยชน์
   - Checklist การ deploy

5. **`WheelSense-Server/DOCKER_INSTRUCTIONS.md`** 🐳
   - คู่มือการใช้งาน Docker (อัปเดตแล้ว)
   - Backend services only
   - Development workflow

---

## 🎯 ประโยชน์ที่ได้รับ

### 1. ⚡ Performance
- Dashboard รันบน Vercel Edge Network (CDN)
- โหลดเร็วกว่าเดิม
- Auto scaling

### 2. 🔄 CI/CD
- Auto deploy เมื่อ push code
- Preview deployments สำหรับ PRs
- Rollback ง่าย

### 3. 💰 Cost
- Vercel free tier เพียงพอสำหรับ development
- ไม่ต้องจัดการ server

### 4. 🛠️ Developer Experience
- Hot reload ใน development
- Instant deployments
- Easy environment management

### 5. 🔒 Security
- HTTPS by default
- DDoS protection
- Automatic SSL

---

## ✅ ขั้นตอนถัดไป

### สำหรับผู้พัฒนา

1. **อ่านเอกสาร**
   - [ ] อ่าน `QUICK_DEPLOY.md` สำหรับภาพรวม
   - [ ] อ่าน `VERCEL_DEPLOYMENT.md` สำหรับรายละเอียด

2. **ทดสอบ Local Development**
   - [ ] รัน Backend ใน Docker
   - [ ] รัน Dashboard แยกด้วย Vite
   - [ ] ทดสอบการทำงาน

3. **Deploy**
   - [ ] Push code ขึ้น GitHub
   - [ ] Deploy Dashboard บน Vercel
   - [ ] Configure environment variables
   - [ ] อัปเดต CORS ใน Backend

4. **Production**
   - [ ] Deploy Backend (Railway/Render/DigitalOcean)
   - [ ] เชื่อมต่อ Dashboard กับ Backend
   - [ ] ตั้งค่า Custom Domain (optional)
   - [ ] เปิดใช้งาน Monitoring

---

## 🔗 URLs สำคัญ

### Development
- **Dashboard**: `http://localhost:3000`
- **Backend API**: `http://localhost:8000`
- **API Docs**: `http://localhost:8000/docs`

### Production (ตัวอย่าง)
- **Dashboard**: `https://wheelsense-dashboard.vercel.app`
- **Backend API**: `https://your-api.railway.app`

---

## 🚨 สิ่งที่ต้องทำหลัง Deploy Dashboard

### 1. อัปเดต CORS ใน Backend

แก้ไข `WheelSense-Server/api/main.py`:

```python
origins = [
    "http://localhost:3000",
    "https://wheelsense-dashboard.vercel.app",  # ⬅️ เพิ่ม production URL
    "https://*.vercel.app",  # สำหรับ preview deployments
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 2. Restart Backend
```bash
docker-compose restart api
```

---

## 💡 Tips & Best Practices

### Environment Variables
- ใช้ `VITE_` prefix สำหรับ environment variables
- ตั้งค่าแยกสำหรับแต่ละ environment (dev/preview/prod)
- ไม่ commit `.env.local` ขึ้น git

### Git Workflow
- `main` branch → Production deployment
- Feature branches → Preview deployments
- ใช้ Pull Requests เพื่อ review ก่อน merge

### Monitoring
- เปิดใช้งาน Vercel Analytics
- ติดตาม deployment logs
- ตรวจสอบ error logs เป็นระยะ

### Security
- ใช้ environment variables สำหรับ sensitive data
- อัปเดต dependencies เป็นระยะ
- ตั้งค่า CORS ให้ถูกต้อง

---

## 📞 Support & Resources

### Documentation
- **Vercel Docs**: [vercel.com/docs](https://vercel.com/docs)
- **Vite Docs**: [vitejs.dev](https://vitejs.dev)
- **React Docs**: [react.dev](https://react.dev)
- **FastAPI Docs**: [fastapi.tiangolo.com](https://fastapi.tiangolo.com)

### Project Docs
- อ่านเอกสารใน `WheelSense-Dashboard/` สำหรับรายละเอียด
- ดู `QUICK_START_NEW_SYSTEM.md` สำหรับภาพรวมระบบ

---

## 🎉 สรุป

การแยก Dashboard ออกจาก Docker เสร็จสมบูรณ์! ตอนนี้ระบบมีความยืดหยุ่นและ scalable มากขึ้น

**What's Changed:**
- ✅ Dashboard → Vercel (Separated)
- ✅ Backend → Docker (Same as before)
- ✅ Documentation → Complete

**Next Steps:**
1. อ่าน `QUICK_DEPLOY.md`
2. Deploy บน Vercel
3. เริ่มใช้งาน!

**Happy Deploying! 🚀**

---

**เวอร์ชัน**: 1.0.0  
**วันที่**: November 5, 2025  
**สถานะ**: ✅ Production Ready

