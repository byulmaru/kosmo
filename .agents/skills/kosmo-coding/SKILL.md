---
name: kosmo-coding
description: Route Kosmo repository implementation, refactoring, tests, and review work to the applicable coding guidance, requiring complete reads of the common principles and selected topic references.
---

# Kosmo Coding

## Read And Route

- Before repository work, read the governing `AGENTS.md` files and the complete [coding-style entrypoint](../../../memory/coding-style.md).
- Always read [Core Principles](../../../memory/coding/principles.md) in full. Select only the `tests`, `api-contracts`, `core-services`, `spec-policy`, and `runtime` topics that apply to the current work, then read every selected file from beginning to end.
- For a domain-specific task, select the applicable memory entrypoint (`memory/graphql-style.md`, `memory/temporal-workflows.md`, `memory/frontend-react-native.md`, `memory/database-design.md`, `memory/database-migrations.md`, or `memory/script.md`) and follow its topic links. Read the selected topic files in full before acting.
- When delegating work, include the selected document paths and the reason each applies in the worker brief so the worker can read the same complete guidance.
- Apply the repository's existing design, OpenSpec, review, and tooling instructions through their own entrypoints. This skill routes those instructions and does not replace them.

## Reading Discipline

- Use search to locate relevant files, not to replace reading them. If command output is truncated, continue with bounded reads until the selected file is complete.
- When the task scope, affected package, runtime, contract, or validation path changes, reselect the applicable topics and read any newly relevant files in full before continuing.
