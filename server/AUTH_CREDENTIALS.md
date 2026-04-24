# WheelSense Authentication Credentials

## Production Mode

**Login:** admin / wheelsense2026

### Starting Production Mode
```bash
cd server
docker compose down
docker compose up -d --build
```

### Database
- Database: wheelsense_prod
- Port: 5433
- Volume: pgdata_prod

### Notes
- Clean database (no demo data)
- Bootstrap admin creates initial admin user
- Other users must be created through Admin UI

---

## Simulator Mode

### Login Credentials

| Username | Password | Role | Name |
|----------|----------|------|------|
| admin | demo1234 | admin | System Admin |
| sarah.j | demo1234 | head_nurse | Sarah Johnson |
| michael.s | demo1234 | supervisor | Michael Smith |
| jennifer.l | demo1234 | observer | Jennifer Lee |
| david.k | demo1234 | observer | David Kim |
| emika.c | demo1234 | patient | Emika Charoenpho |
| somchai.r | demo1234 | patient | Somchai Raksadee |
| rattana.s | demo1234 | patient | Rattana Srisuwan |
| krit.w | demo1234 | patient | Krit Wongwattana |
| wichai.p | demo1234 | patient | Wichai Phattharaphong |

### Patient Details

1. **Emika Charoenpho** (emika.c)
   - Age: 45 Years (DOB: August 12, 1978)
   - Gender: Female
   - Condition: Spinal Cord Injury (T12, 2018)
   - Mobility: Wheelchair User
   - Room: Room401

2. **Somchai Raksadee** (somchai.r)
   - Age: 62 Years (DOB: November 3, 1961)
   - Gender: Male
   - Condition: Type 2 Diabetes, Peripheral Artery Disease, Amputee
   - Mobility: Wheelchair User
   - Room: Room402

3. **Rattana Srisuwan** (rattana.s)
   - Age: 78 Years (DOB: February 25, 1948)
   - Gender: Female
   - Condition: Alzheimer's Disease, Osteoarthritis
   - Mobility: Wheelchair User
   - Room: Room403

4. **Krit Wongwattana** (krit.w)
   - Age: 55 Years (DOB: July 8, 1968)
   - Gender: Male
   - Condition: Mild Hypertension, Hyperlipidemia
   - Mobility: Ambulatory / Normal
   - Room: Room404

5. **Wichai Phattharaphong** (wichai.p)
   - Age: 84 Years (DOB: December 12, 1939)
   - Gender: Male
   - Condition: Ischemic Stroke, Advanced Dementia, Dysphagia
   - Mobility: Bedridden
   - Room: Room405

### Starting Simulator Mode
```bash
cd server
docker compose -f docker-compose.sim.yml down
docker compose -f docker-compose.sim.yml up -d --build
```

### Database
- Database: wheelsense_sim
- Port: 5432
- Volume: pgdata_sim
- Workspace: WheelSense Simulation

### Notes
- Pre-populated with demo data
- Includes MQTT simulator
- Reset capability via API: `POST /api/demo/simulator/reset`
- Bootstrap admin attaches to demo workspace automatically

---

## Testing Login

### Test Matrix

#### Production Mode
```bash
# Start production
cd server
docker compose up -d --build

# Test login
# Username: admin
# Password: wheelsense2026
# Expected: ✅ Login success, admin dashboard
```

#### Simulator Mode
```bash
# Start simulator
cd server
docker compose -f docker-compose.sim.yml up -d --build

# Test logins
# 1. admin / demo1234 → ✅ Admin dashboard
# 2. sarah.j / demo1234 → ✅ Head Nurse dashboard
# 3. michael.s / demo1234 → ✅ Supervisor dashboard
# 4. jennifer.l / demo1234 → ✅ Observer dashboard
# 5. david.k / demo1234 → ✅ Observer dashboard
# 6. emika.c / demo1234 → ✅ Patient portal
# 7. somchai.r / demo1234 → ✅ Patient portal
# 8. rattana.s / demo1234 → ✅ Patient portal
# 9. krit.w / demo1234 → ✅ Patient portal
# 10. wichai.p / demo1234 → ✅ Patient portal
```

### Reset Simulator Data
```bash
# Via API
curl -X POST http://localhost:8000/api/demo/simulator/reset \
  -H "Authorization: Bearer <admin_token>"

# Via Docker (force re-seed)
docker compose -f docker-compose.sim.yml down
docker volume rm wheelsense-platform_pgdata_sim
docker compose -f docker-compose.sim.yml up -d --build
```

---

## Environment Files

### .env.production
- ENV_MODE=production
- BOOTSTRAP_ADMIN_PASSWORD=wheelsense2026
- BOOTSTRAP_ADMIN_ATTACH_DEMO_WORKSPACE=false

### .env.simulator
- ENV_MODE=simulator
- BOOTSTRAP_ADMIN_PASSWORD=demo1234
- BOOTSTRAP_ADMIN_ATTACH_DEMO_WORKSPACE=true
- BOOTSTRAP_DEMO_WORKSPACE_NAME=WheelSense Simulation

---

## Troubleshooting

### Login Fails with "Invalid credentials"
1. Check which mode is running: `docker compose ps`
2. Verify correct credentials for that mode
3. Check logs: `docker compose logs wheelsense-platform-server`
4. Reset database if needed (see above)

### Bootstrap Admin Not Created
1. Check BOOTSTRAP_ADMIN_ENABLED is true in .env
2. Check BOOTSTRAP_ADMIN_PASSWORD is set
3. Check logs for bootstrap errors
4. Force password sync: Set BOOTSTRAP_ADMIN_SYNC_PASSWORD=true

### Demo Users Not Available in Sim Mode
1. Verify simulator container is running: `docker compose ps wheelsense-simulator`
2. Check seed script ran successfully in logs
3. Force re-seed: Set SIM_FORCE_SEED=1 in docker-compose.data-sim.yml
4. Reset simulator: `POST /api/demo/simulator/reset`
