# WheelSense Platform

IoT + clinical workflow platform for wheelchair patient monitoring (WheelSense).

## Documentation

- **Backend (FastAPI, MQTT, DB, APIs):** [`server/AGENTS.md`](server/AGENTS.md)  
- **Frontend (Next.js):** [`frontend/README.md`](frontend/README.md)  
- **Phase 12 implementation plan:** [`docs/plans/phase12-implementation-plan.md`](docs/plans/phase12-implementation-plan.md)

## Quick start (development)

1. Configure `server/.env` (see `server/.env.example` and `server/docs/ENV.md`).
2. Run the API: `cd server` → Docker Compose or `uvicorn` as described in `server/AGENTS.md`.
3. Run the web app: `cd frontend` → `npm install` → `npm run dev`.

## License

See project files for license terms.
