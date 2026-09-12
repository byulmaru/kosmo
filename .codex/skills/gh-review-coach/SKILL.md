---
name: gh-review-coach
description: Review owned changes or external GitHub PRs with evidence. Use for findings, review-state decisions, or thread cleanup.
---

# GitHub Review Coach

Classify the task as implementation self-review or external PR review, then load only the references for that mode.

## Route

- Read repository instructions and applicable memory entrypoints.
- Read [Mode And State](references/mode-and-state.md). For a new implementation review, changed-head re-review, or unresolved behavior, add [Evidence](references/evidence.md); then add [Implementation Self-Review](references/self-review.md), [External Review](references/external-review.md), [Test Evidence](references/test-evidence.md), or [OpenSpec Authority](references/authority.md) only when that surface is in scope. For an unchanged, already-scoped finding draft or authorized thread action, read only the mode and thread references needed for that action.
- Establish the exact local snapshot or PR base/head before drawing conclusions. Trace changed behavior through its callers, owners, side effects, and tests.
- Keep confirmed findings separate from suspicions, scope concerns, and decisions. Use Korean findings when repository guidance calls for it.
- If the scope or snapshot changes, reread affected evidence.

## Write boundary and completion

- External PR review stays read-only until the user authorizes the exact GitHub action. A review request alone does not authorize publishing, replying, resolving, approving, or requesting changes.
- Self-review may fix authorized in-scope findings but never approves the author's own PR.
- Keep policy and authority decisions with the user and applicable canonical or Linear source; tests and agreement between code and artifacts do not substitute for upstream authority.
- Finish the requested review by covering the relevant evidence, presenting the findings and proposed action, and carrying out only the action that is authorized.
