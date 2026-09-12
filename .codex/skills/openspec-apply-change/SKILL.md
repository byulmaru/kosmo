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

Use this skill only when implementation of an existing change is requested.

## Route

1. Resolve the target change from the conversation. If it is absent and exactly one active change exists, use it; if several changes are plausible or the target is ambiguous, inspect `openspec list --json` and ask the user to choose. Do not guess.
2. Read `openspec status --change "<name>" --json`, then `openspec instructions apply --change "<name>" --json`. Use the reported schema, context files, task list, and state rather than assuming artifact names.
3. Read every file listed by `contextFiles`. Use those artifacts to locate canonical documents and Linear issues, but do not treat OpenSpec text as upstream authority.
4. Independently re-read the referenced canonical `docs/domain` and `docs/design` documents and the current Linear issue bodies, relations, and contract-changing comments before relying on a requirement or decision.
5. Implement pending tasks in dependency order, keeping each change within its declared scope. Mark a task complete when its implementation and relevant verification are complete, then continue through all actionable tasks.

## Stop conditions

Stop and report the concrete blocker when an artifact is missing, upstream authority is absent or conflicts, a pending requirement or task depends on an unresolved decision (`Blocked` or a non-superseded `Upstream Change Required` decision), a task is materially unclear, or a failure cannot be repaired within the authorized scope. For a recoverable command failure, fix its cause and rerun the affected check. Do not turn an OpenSpec-only product behavior into implementation. Align canonical → Linear → OpenSpec before continuing when upstream changes are needed.

If the change is already `all_done`, report that status and suggest the archive workflow. Otherwise, keep working until the tasks are complete or one of the stop conditions applies.

## Completion report

Report the schema, completed and remaining tasks, changed scope, and actual checks run with their results. Include the overall `N/M` progress. When all tasks and required verification are complete, state that the change is ready for archive.
