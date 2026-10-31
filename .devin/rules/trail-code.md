---
description: "Mandatory use of Trail-Code context graph for every task in this repo"
trigger: always_on
---

# Trail-Code is REQUIRED on every task

This repo is indexed by Trail-Code: the graft map in `.trail/cache/` (every file,
function, and caller) plus team learnings in `.trail/learnings/`. Using it is
mandatory, not optional. Full usage details are in `AGENTS.md`.

## Running trail on this machine

- Try `trail <command>` first. If the shell reports `command not found`, use the
  absolute path: `"C:\Users\Asus\AppData\Roaming\npm\trail.cmd"` (npm's global
  bin dir was missing from PATH when trail was installed).

## Required workflow

1. **Start of every task** — orient with the graph before grepping or opening
   files. If new to the repo run `trail map`, then `trail ask "<question>" --source`
   to jump to the exact file:line spans.
2. **Before editing a symbol** — run `trail callers <symbol> --depth 2` to see the
   blast radius, and check `.trail/learnings/` for decisions touching that code.
3. **Exhaustive searches** — use `trail grep "<literal>"` instead of recursive
   grep over the repo (top-N `trail ask` results are not exhaustive).
4. **After finishing work** — run `trail note` to save what the session worked
   out (decisions, things ruled out, gotchas) as a learning in `.trail/learnings/`,
   and commit it with the change it came from.
5. **After significant code changes** — run `trail build` to refresh the graph.
6. **Before committing or opening a PR** — run `trail check` to flag conflicts
   with recorded team decisions.

Only fall back to plain grep/glob/read when trail errors or the file is
unindexed. Never re-read whole files when a graph node already gives the span.
