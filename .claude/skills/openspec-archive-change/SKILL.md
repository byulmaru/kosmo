---
name: openspec-archive-change
description: Archive an OpenSpec change after its artifacts, tasks, scope, verification, and spec sync are complete. Use when the user asks to finalize it.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: '1.0'
  generatedBy: '1.3.1'
---

# Archive an OpenSpec change

Follow the shared [OpenSpec archive workflow](../../../.codex/skills/openspec-archive-change/SKILL.md). It owns full-scope completion, authority, integration verification, spec sync, standard archive execution, and post-archive validation.

Claude invocation passes an optional change name from `/opsx:archive <change>`. Preserve the argument when present and let the shared workflow resolve the target from conversation context or ambiguity.
