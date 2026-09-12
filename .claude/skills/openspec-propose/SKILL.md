---
name: openspec-propose
description: Create an authority-backed OpenSpec proposal with requirements, design, decisions, and tasks. Use when the user asks to plan a new change.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: '1.0'
  generatedBy: '1.3.1'
---

# Propose an OpenSpec change

Follow the shared [OpenSpec proposal workflow](../../../.codex/skills/openspec-propose/SKILL.md). It owns authority and gate checks, active-schema artifact routing, dependency order, apply readiness, and scope boundaries.

Claude invocation accepts a kebab-case change name or a description after `/opsx:propose`. Preserve that input when creating the change and use the shared workflow to decide whether one focused question is needed before writing artifacts.
