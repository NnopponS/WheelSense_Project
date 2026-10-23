# graft — repo map

Small markdown nodes summarising this repo. `grep` any term, symbol, or
filename here, or run `graft ask "<task>"`. Each node carries prose plus exact
`file:line`; open a source file only to edit the named span.

The same graph is queryable as MCP tools (`graft_find_code`, `graft_find_all`,
`graft_trace_calls`, `graft_file_api`, `graft_repo_map`) where a host exposes them, and
as the `graft` CLI everywhere else. Edges — who calls what — live only in the
graph, not in these files: `graft callers <symbol>` is the only way to read them.

## Concepts

- [eslint.config](eslint.config.md) — eslint.config
- [jest.config](jest.config.md) — jest.config
- [jest.setup](jest.setup.md) — jest.setup
- [next.config](next.config.md) — next.config
- [postcss.config](postcss.config.md) — postcss.config
- [proxy](proxy.md) — proxy

## Files

320 per-file wiring cards mirror the source tree under `graft/` (278 carry extracted symbols). They are deliberately not enumerated here —
`grep` a symbol or `find`/`ls` a filename under `graft/` to land on the card for that file.
