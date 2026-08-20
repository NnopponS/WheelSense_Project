# WheelSense Agent Loader (Lean Edition)

This file is the repo-local loader for all agents (Codex, Windsurf, Claude, Gemini).

## Scope
- **Repo-local only**. Apply these instructions only inside this repository.
- **Lean Context**: Keep the active skill and context set small.
- **MemPalace First**: Always query MemPalace for project memory.

## Read Order
1. `.agents/core/source-of-truth.md`
2. `.agents/workflows/wheelsense.md` for cross-domain work.
3. Relevant doc set for the task.

## Repository Structure
- **Workflows**: `.windsurf/workflows/` (Primary for Windsurf)
- **Runtime Skills**: `.windsurf/skills/` (Windsurf target managed by `skillshare`)
- **Copilot Skills**: `.github/skills/` (Copilot target managed by `skillshare`)
- **Skill Source Cache**: `.skillshare/agents/`
- **Imported Plugin Resources**: `.windsurf/references/`, `.windsurf/scripts/`
- **Coordination Docs**: `.agents/`
- **Memory**: MemPalace wing `wheelsense`

## Primary Workflows (/...)
- `/which-agent` - Entry point and router.
- `/whichagent` - Codex text alias for `/which-agent` when the UI does not expose custom slash commands.
- `/plan` - Architecture and step-by-step planning.
- `/implement` - Surgical code changes.
- `/debug` - Systematic troubleshooting.
- `/review` - Thorough code review.
- `/tdd` - Test-driven development.
- `/e2e` - Browser and end-to-end testing.
- `/security` - Security audit.
- `/docs-sync` - Documentation maintenance.
- `/memory-update` - Update MemPalace memory.
- `/skill-ops` - Skill inventory, manifest drift, and sync audit.
- `/game-studio` - Imported Codex Game Studio plugin workflow.
- `/build-web-apps` - Imported Codex Build Web Apps plugin workflow.
- `/superpowers` - Imported Codex Superpowers methodology workflow.

Removed compatibility aliases are documented in `.windsurf/README.md`; use the canonical workflow names above.

## Specialized Workflows
- `wheelsense-core`
- `wheelsense-architecture`
- `wheelsense-mobile-app`

## Enforced Tooling

These tools are **mandatory** for this repo. They are not optional skills. Stack: **Next.js 16 + React 19 + shadcn/ui (Radix) + Tailwind + lucide**.

### Ponytail — minimal & anti-overengineering discipline (enforced, all tasks)
- **Active on EVERY response and task**: writing, adding, refactoring, fixing, reviewing, designing code.
- **The Ladder**:
  1. Does this need to exist at all? (YAGNI)
  2. Already in this codebase? Reuse existing helpers/types/patterns.
  3. Stdlib does it? Use standard library.
  4. Native platform feature covers it? Use native HTML/CSS/DB constraints before libraries.
  5. Already-installed dependency solves it? Use existing dependencies, never add new ones needlessly.
  6. Can it be one line? One line.
  7. Minimum code that works.
- **Output Rule**: Code first, followed by at most three short lines naming what was skipped and when to add it. No unrequested boilerplate or essays.
- Default intensity: **full**. Switchable via `/ponytail [lite|full|ultra]`.

### Graft — repo context graph (enforced, all tasks)
- Graphs are built per-project under `frontend/graft/`, `server/graft/`, `firmware/graft/`, `e2e/graft/`, `mobile-app/wheelsense-gateway-flutter/graft/`, and `scripts/graft/`, then merged into root `graft/` via `scripts/merge-graft-graphs.js`. The root graph currently covers 692 indexed files (6087 nodes, 12893 edges).
- **Root build OOMs** on Windows V8 tree-sitter Zone (~4GB limit at ~400 files). Workflow: run `graft build` inside the changed subproject, then `node scripts/merge-graft-graphs.js` from the repo root to refresh the merged graph.
- **Before grepping or opening source files** for any task (understand, locate, scope, edit), query the graph first. Two access paths:
  - **MCP tools** (preferred in Windsurf sessions): `graft_find_code` (query → ranked nodes + code spans), `graft_file_api` (file signatures only), `graft_trace_calls` (caller/callee blast radius), `graft_find_all` (regex over indexed files), `graft_repo_map` (orientation), `graft_check_freshness` (drift check). Registered in `.codeium/windsurf/mcp_config.json` as the `graft` MCP server.
  - **CLI** (fallback / outside Windsurf): `graft ask "<q>" --source`, `graft skeleton <file>`, `graft callers <symbol>`, `graft grep "<literal>"`, `graft map`. Run from the subproject root for subproject-scoped queries, or from the repo root for cross-subproject queries (uses the merged graph).
- After big code changes: `graft build` in the changed subproject, then `node scripts/merge-graft-graphs.js` to refresh the root graph.
- Rule file: `.windsurf/rules/graft.md` (graft-owned, do not hand-edit).

### Frontend UI core set (enforced for any frontend work)

The frontend has an existing UI and a fixed stack. These five skills are the working set — invoke them in this order per task. They are not interchangeable; each one owns a distinct phase.

1. **`hallmark`** — design phase. Invoke **before writing markup/CSS** for new pages, landing pages, redesigns, or visual QA. Hallmark runs 57 anti-AI-slop gates, picks the macrostructure + theme, and refuses on-distribution defaults. Verbs: default (build), `hallmark audit <target>`, `hallmark redesign <target>`, `hallmark study <screenshot | URL>`. Do NOT hand-roll hero sections, theme palettes, or macrostructures when Hallmark covers the brief.
2. **`shadcn-best-practices`** — component phase. Invoke **every time you touch a component** (add, fix, style, compose). Project has `components.json` with `style: default`, `baseColor: slate`, `cssVariables: true`, `iconLibrary: lucide`. Use this skill for registry ops, styling, and composition — never hand-roll a component that shadcn already ships.
3. **`react-best-practices`** + **`react-patterns`** — implementation phase. Invoke when writing or reviewing React/Next.js code. `react-best-practices` owns performance (waterfalls, bundle, server/client fetching, re-render); `react-patterns` owns hooks discipline, server/client boundaries, Suspense + error boundaries, form actions. React 19 is in use — prefer its idioms over 18-era patterns.
4. **`impeccable`** — audit phase. Invoke **after implementing**, before claiming done. Covers UX review, visual hierarchy, information architecture, cognitive load, accessibility, responsive behavior, theming, typography, motion, micro-interactions, and edge cases. Use it on existing UI too — wheelsense has UI already; audit before redesigning blindly.
5. **`frontend-testing-debugging`** — verify phase. Invoke **every time you ship a UI change**. Dev server, UI regressions, interaction bugs, console errors, responsive layout, visual QA. Prefer the Browser plugin when available; otherwise Playwright.

### On-demand frontend skills (invoke when the task fits)

| Skill | When |
|-------|------|
| `frontend-app-builder` | Greenfield app/landing/hero from image-generated concept |
| `frontend-ui-engineering` | Production-quality UI build beyond what hallmark+shadcn cover |
| `build-web-apps` | Stripe/Supabase integration guidance (Codex plugin wrapper) |
| `react-performance` | Deep perf work — 70+ Vercel rules across 8 categories |
| `motion-ui` / `motion-foundations` / `motion-patterns` / `motion-advanced` | Animation work (use foundations first, then patterns/advanced) |
| `design-system` | Create/audit the design system, check visual consistency |
| `ui-ux-pro-max` | UI/UX best-practice lookup with searchable database |
| `browser-testing-with-devtools` | Real-browser DOM/network/perf inspection |
| `react-testing` | React Testing Library + Vitest/Jest + MSW + axe unit tests |
| `e2e` | Playwright E2E (repo has `e2e/` already) |
| `ui-demo` | Record a UI demo/walkthrough video with Playwright |

### Deciding between skills — `council`

When a frontend decision has multiple credible paths and no obvious winner (redesign vs audit first, which hallmark theme, ship now vs hold for polish), invoke **`council`** to convene four advisors (Claude + Skeptic + Pragmatist + Critic) for structured disagreement before choosing. Council is for decision-making under ambiguity — not for code review, implementation planning, or verification (use `review` / `plan` / `verification-before-completion` for those).

## Maintenance
- Use `skillshare sync -p` to synchronize skills across tools.
- Use `/skill-ops` to audit skill inventory, manifests, and sync drift.
- Use `mempalace_diary_write` after each session.

## Git Commit Rules
- **NEVER** add `Generated with [Devin](https://devin.ai)` or `Co-Authored-By: Devin` lines to commit messages.
- Commit messages should be concise and focus on "why" not "what".
- Do not add any AI tool attribution or co-author lines to commits.

## Codex Invocation Notes
- Codex does not expose repo-local workflows as native slash commands in the command palette.
- If a user sends `/whichagent` or `/which-agent` as text, treat it as `Use $which-agent`.
- If a user sends any listed `/...` workflow name as text, route to the matching skill under `.agents/skills/<name>/SKILL.md`.

<!-- graft:start -->
## Graft — repo context graph

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->
