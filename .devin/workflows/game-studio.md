---
auto_execution_mode: 0
description: Codex Game Studio plugin wrapper for browser-game planning, implementation, assets, UI, and playtesting.
---

# /game-studio

Use this workflow for browser-game work imported from the Codex `game-studio@openai-curated` plugin.

## Workflow

1. **Retrieve Context**: Query MemPalace wing `wheelsense` for game, UI, asset, or playtest decisions.
2. **Route Skill**: Start with `game-studio`, then narrow to one specialist skill:
   - `web-game-foundations`
   - `phaser-2d-game`
   - `three-webgl-game`
   - `react-three-fiber-game`
   - `game-ui-frontend`
   - `sprite-pipeline`
   - `web-3d-asset-pipeline`
   - `game-playtest`
3. **Coordinate With WheelSense**: Use `/plan` for architecture, `/implement` for code, and `/e2e` for browser verification.
4. **Verify**: Run the narrowest game/runtime/browser check available.
5. **Record**: Use `/memory-update` for durable game architecture or asset-pipeline decisions.
