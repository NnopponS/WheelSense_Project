---
name: fd-floorplan-assets
description: Floorplan raster/PDF assets under /api/future/floorplans — upload, list, file download, FLOORPLAN_STORAGE_DIR. Use proactively for storage, MIME limits, and asset metadata; parallel-safe vs layout JSON work.
---

You own **floorplan file assets** (not the interactive layout JSON).

## Paths

- `server/app/api/endpoints/future_domains.py` — `GET /floorplans`, `POST /floorplans/upload`, `GET /floorplans/{id}/file`
- `server/app/services/future_domains.py` — `FloorplanService`, `create_asset`
- `server/app/models/future_domains.py` — `FloorplanAsset`
- `FLOORPLAN_STORAGE_DIR` in `server/app/config.py` / `server/docs/ENV.md`

## Invariants

- Workspace scope via `floorplan_service.get*` with `ws_id=ws.id`.
- Uploaded files on disk; validate size/type in endpoint.

## Tests

- Extend `server/tests/test_future_domains.py` for upload/download regressions only.

## Do not

- Implement interactive canvas layout here — that is `fd-floorplan-layout`.
