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

Archive only a fully completed change. Follow the repository's [OpenSpec completion gate](../../../AGENTS.md#pull-request-completion): the proposal's entire declared scope, every implementation slice, assigned integration verification, required checks, and applicable delta-spec sync must have completion evidence. Archival is a completion gate, not a way to bypass unfinished work.

## Route

1. Resolve the change name from the conversation. If it is missing or ambiguous, inspect `openspec list --json` and ask the user to choose an active change; do not guess.
2. Run `openspec status --change "<name>" --json`. Require every required artifact to be `done`, then read the existing proposal, specs, design, decisions, and tasks files named by the artifact graph.
3. Require every task to be checked off and compare the result with the proposal's full declared scope and assigned integration verification. If any artifact, task, scope item, integration check, or completion evidence is missing, stop with the exact remaining items; do not offer a confirmation that overrides the completion gate.
4. Independently re-read applicable canonical `docs/domain` and `docs/design` documents and current Linear issue bodies, relations, and contract-changing comments. Check every requirement, active or legacy accepted decision, task Deliverable, and Guardrail against that authority. A missing or conflicting authority, unresolved `Blocked` decision, or non-superseded `Upstream Change Required` decision stops archival.
5. If `openspec/changes/<name>/specs/` contains delta specs, compare them with the corresponding main specs and confirm the required sync plan. Use the normal archive command so its validation and spec update run; if a required sync cannot be completed, stop and report it.
6. Run `openspec archive "<name>"` without `--no-validate`. Use `--skip-specs` only when the change has no applicable spec update and that exception is part of its declared scope. Ensure the date-qualified archive destination does not already exist and preserve `.openspec.yaml`.
7. After the move, run `openspec validate --all --strict`, verify the archive directory, `.openspec.yaml`, and every declared artifact are readable, and confirm the active change is no longer listed. Report those post-archive checks separately.

## Completion report

Report the change name, schema, archive path, artifact and task completion, delta-spec sync result, and any verification limits. State clearly if archival was blocked and list the condition that must be resolved.
