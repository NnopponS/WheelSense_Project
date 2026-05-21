---
name: plan
description: "ECC-based planning and architecture workflow for new features or major refactors."
---

# /plan

Use this for requirement analysis, architecture mapping, and step-by-step construction plans.

## Workflow
1. **Retrieve Context**: Query MemPalace wing `wheelsense`, then read `.agents/core/source-of-truth.md`.
2. **Select Skills**: Use `planning-and-task-breakdown`; add `spec-driven-development` for vague requirements, `doubt-driven-development` for high-risk plans, or `documentation-and-adrs` for ADR work.
3. **Architecture Mapping**: Map affected components, API contracts, data flows, and dependency order.
4. **Draft Plan**: Write milestones, acceptance criteria, verification gates, and risks.
5. **Review**: Self-critique for performance, security, complexity, and context size.

## Output
A structured plan with clear milestones and verification gates.

