---
name: openspec-apply-change
description: Apply pending tasks in an existing OpenSpec change. Use when the user asks to implement or continue an existing change.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: '1.0'
  generatedBy: '1.3.1'
---

# Apply an OpenSpec change

Follow the shared [OpenSpec apply workflow](../../../.codex/skills/openspec-apply-change/SKILL.md). It owns target selection, schema and context routing, independent authority checks, task completion, recoverable-failure handling, and completion reporting.

Claude invocation passes an optional change name from `/opsx:apply <change>`. Preserve the command's target and schema arguments while using the shared workflow for all other behavior.
