---
name: antimirror-implement-slice
description: Implement or continue one AntiMirror WXT extension slice from docs/antimirror, with tests, cleanup, and progress handoff. Use for this repository's implementation tasks; do not use for unrelated projects or independent review.
---

# AntiMirror slice implementation

Read root AGENTS.md, docs/antimirror/09_PROGRESS.md and 11_HANDOFF.md.
Read docs/antimirror/ai/WORKFLOW.md and the current slice listed in slices/README.md.
Inspect existing code and git status before writes. Preserve user changes and existing license.

Implement the current slice instead of producing a replacement grand plan. Keep the product
manual-only, per-tab, single-video, reversible and locally processed. Do not inherit old
allowlist/autostart behavior. Use native browser capabilities and verify actual WXT manifests.

Load only the specification sections needed for this slice. Verify implementation with the
required test level: DOM mocks cannot prove closed-root extension access or Firefox behavior.
If a gate is blocked, complete available work and report exactly what remains unverified.

Review the diff for stale async results, unsafe transforms, unbounded discovery and resource
leaks. Update progress, handoff, concrete tech debt and any changed decisions/instructions.
Report exact commands/results and the next action. Do not publish or push without instruction.
