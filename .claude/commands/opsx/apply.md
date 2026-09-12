---
name: 'OPSX: Apply'
description: Apply pending tasks in an existing OpenSpec change
category: Workflow
tags: [workflow, artifacts, experimental]
---

# `/opsx:apply [change]`

Apply an existing OpenSpec change through the shared [apply workflow](../../../.codex/skills/openspec-apply-change/SKILL.md).

The optional `change` argument is the OpenSpec change name, for example `/opsx:apply add-auth`. If it is omitted, use the conversation target or the only active change; if multiple changes are plausible, ask the user to choose. Preserve the exact argument when passing it to the workflow.

The workflow reports schema, task progress, completed checks, and any unresolved authority or implementation blocker. Continue through all actionable tasks and recoverable checks before returning.
