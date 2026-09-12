---
name: 'OPSX: Archive'
description: Archive a fully completed OpenSpec change
category: Workflow
tags: [workflow, archive, experimental]
---

# `/opsx:archive [change]`

Archive through the shared [archive workflow](../../../.codex/skills/openspec-archive-change/SKILL.md).

The optional `change` argument follows `/opsx:archive <change>`, for example `/opsx:archive add-auth`. When present, pass it through; otherwise let the shared workflow resolve the target from conversation context or ambiguity. The shared workflow is a hard completion gate: incomplete artifacts, tasks, declared scope, integration verification, authority, or required spec sync stop archival.

Use the normal `openspec archive "<name>"` path with validation enabled, then run the required post-archive validation and report its result.
