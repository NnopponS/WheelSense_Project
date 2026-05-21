---
name: security

auto_execution_mode: 0
description: "ECC-based security audit and vulnerability review workflow."
---

# /security

Use this for code reviews involving sensitive data, auth, or networking, and for running security scans.

## Workflow
1. **Retrieve Context**: Query MemPalace wing `wheelsense`, then read `.agents/core/source-of-truth.md`.
2. **Select Skills**: Use `security-and-hardening`; add `code-review-and-quality` for diff review or `source-driven-development` for external security docs.
3. **Identify Surface**: Map all input points, auth boundaries, PHI/PII data, and data sinks.
4. **Review Checklist**:
    - OWASP Top 10 check.
    - Secret leakage in logs/code.
    - Improper access control (RBAC/ABAC).
    - Unsafe dependency versions.
5. **Automated Scan**: Run available security tools when present.
6. **Remediation**: Fix identified vulnerabilities using the `/implement` workflow.
7. **Memory**: File stable security decisions or recurring hazards via `/memory-update`.

## Priority
Protect PHI/PII and system integrity above all else.
