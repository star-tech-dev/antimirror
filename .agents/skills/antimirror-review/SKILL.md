---
name: antimirror-review
description: Independently review AntiMirror extension changes against manual activation, per-tab state, deep DOM and frame discovery, MV3 recovery, reversible transforms, and resource limits. Use for review or release gate checks, not implementation.
---

# AntiMirror independent review

Read AGENTS.md and the relevant canonical contract in docs/antimirror. Inspect the actual
diff, source, tests and claimed evidence before accepting progress status.

Prioritize unintended enable, cross-tab mutations, stale frame/document ACKs, pending apply
leaks, worker restart divergence, transform clobbering, closed-root blind spots, hidden iframe
selection and global observers left running in OFF. Check production manifests for test APIs,
excess permissions, MV2 Firefox output and unused dependencies.

Report concrete findings with severity, path, reproduction and an appropriate regression test.
Distinguish bugs, known declared limitations and missing verification. Do not invent findings
or call an unexecuted browser gate PASS. Do not implement broad rewrites unless explicitly asked.
