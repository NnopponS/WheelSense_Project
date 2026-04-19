---
auto_execution_mode: 0
description: ECC compatibility workflow for security review and vulnerability discovery
---

Treat this as the Windsurf-native wrapper for the ECC `/security-scan` entrypoint.

Always:
1. Read `.agents/core/source-of-truth.md` first.
2. Read only the smallest relevant code and docs needed for the surface under review.
3. Route through the `security-reviewer` agent behavior.

Prioritize:
- Auth and session safety.
- Secrets handling.
- Authorization gaps.
- Injection, unsafe shelling, and insecure external calls.
- Sensitive data exposure and destructive actions.

Report only concrete, defensible issues.
