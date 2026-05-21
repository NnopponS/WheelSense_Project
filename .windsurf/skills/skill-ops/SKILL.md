---
name: skill-ops

auto_execution_mode: 0
description: Skillshare inventory, manifest drift, and skill synchronization workflow.
---

# /skill-ops

Use this workflow to audit, synchronize, or update the WheelSense agent skill system.

## Sources and Targets

- Source/cache: `.skillshare/agents/`
- Windsurf runtime target: `.windsurf/skills/`
- Copilot target: `.github/skills/`
- Imported plugin resources: `.windsurf/references/`, `.windsurf/scripts/`
- Target config: `.skillshare/config.yaml`
- Coordination docs: `.agents/`

## Workflow

1. **Retrieve Context**: Query MemPalace wing `wheelsense` for recent skill/workflow decisions.
2. **Inventory**: List skill directories and confirm each managed skill has `SKILL.md`.
3. **Manifest Check**: Compare `.windsurf/skills/.skillshare-manifest.json` and `.github/skills/.skillshare-manifest.json` against actual directories.
4. **Drift Check**: Compare source/cache `.skillshare/agents/` with target skill directories.
5. **Resource Check**: For imported plugin skills, confirm referenced files under `references/` and `scripts/` exist.
6. **Sync Proposal**: If drift exists, state the exact sync command or file copy plan before mutating files.
7. **Sync**: Prefer `skillshare sync -p` when the CLI is available and the config is valid.
8. **Verification**: Re-run inventory, manifest, and resource checks after sync.
9. **Memory**: Use `/memory-update` when the skill inventory, routing policy, or sync process changes.

## Safety Rules

- Do not delete skill directories without explicit user approval.
- Do not overwrite repo-local custom skills unless the source and target are confirmed equivalent.
- Do not assume undocumented `skillshare` config keys; inspect schema or existing config first.
- Keep workflow changes lean; link to skills instead of copying whole skill contents into workflows.

## Useful Commands

```powershell
Get-ChildItem .windsurf/skills -Directory | Select-Object Name
Get-ChildItem .skillshare/agents -Directory | Select-Object Name
Get-Content .windsurf/skills/.skillshare-manifest.json
Get-Content .github/skills/.skillshare-manifest.json
skillshare sync -p
```
