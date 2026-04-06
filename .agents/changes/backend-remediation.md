# Backend Remediation Change Log

Historical change log for the remediation wave completed on 2026-04-03.

## Scope Covered

- moved protected backend flows to `current_user.workspace_id`
- stopped relying on global active workspace state
- hardened Home Assistant workspace scoping
- hardened MQTT ingestion against unknown devices
- aligned patient-device assignment behavior
- aligned container startup with migration-first boot
- aligned CLI behavior with JWT-protected API usage

## Use This File For

- understanding why the remediation wave existed
- tracing the broad category of fixes delivered in that pass

## Do Not Use This File For

- current runtime behavior specification
- current API or ops truth

For current truth, use `server/AGENTS.md`, `server/docs/*`, and the runtime code.
