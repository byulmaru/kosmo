---
name: 'OPSX: Propose'
description: Create an authority-backed OpenSpec proposal for a new change
category: Workflow
tags: [workflow, artifacts, experimental]
---

# `/opsx:propose [name-or-description]`

Create a proposal through the shared [OpenSpec proposal workflow](../../../.codex/skills/openspec-propose/SKILL.md).

The argument may be a kebab-case change name or a description of the requested result. If it is absent or too vague to identify the result, ask one focused question. Use the active schema and its `apply.requires` artifacts, preserve upstream authority checks, and finish when the change is apply-ready.

When ready to implement, continue with `/opsx:apply <change>`.
