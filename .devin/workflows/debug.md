---
auto_execution_mode: 0
description: "Systematic debugging and troubleshooting workflow for build errors, crashes, or logical bugs."
---

# /debug

Use this to reproduce, diagnose, and fix reported issues.

## Workflow
1. **Retrieve Context**: Query MemPalace wing `wheelsense`, then read `.agents/core/source-of-truth.md`.
2. **Select Skill**: Use `debugging-and-error-recovery`; add `browser-testing-with-devtools` for browser-only failures.
3. **Reproduction**: Create or identify a minimal test, command, or user flow that reliably triggers the failure.
4. **Diagnosis**: Inspect logs, stack traces, network requests, and relevant state.
5. **Hypothesis**: Formulate a root-cause fix based on evidence.
6. **Fix & Verify**: Apply the fix and confirm the reproduction test now passes.
7. **Regression Check**: Run the focused test suite for the affected module.

## Core Principle
"If you can't reproduce it, you haven't fixed it."
Always prioritize empirical evidence over speculative patches.
