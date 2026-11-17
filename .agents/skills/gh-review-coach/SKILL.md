---
name: gh-review-coach
description: Review KOSMO changes and external PRs with Korean findings, exact-snapshot evidence, and explicit authorization for external review actions.
---

# KOSMO Review Coach

Use this skill to review an owned change or another author's KOSMO PR. Follow the repository's `AGENTS.md` and `memory/review-style.md`, then read only the references that match the changed behavior.

## Review criteria

- Establish the exact local snapshot or external PR base and head before drawing conclusions. Trace changed behavior through callers, ownership boundaries, side effects, downstream consumers, and relevant tests.
- Check the user-visible contract against current user decisions, canonical domain documents, accepted ADRs, and Linear scope. `docs/design` supports visual, accessibility, and interaction claims; it does not set product policy. OpenSpec is optional session context, not evidence of authority.
- Separate confirmed defects, scope concerns, unresolved decisions, and validation gaps. Ground each finding in exact changed lines and observable consequences. Write review comments and summaries in Korean.
- Check tests for meaningful inputs, outputs, state changes, and failure paths. Keep implementation details, call counts, and source-text checks out of the contract unless the observable behavior requires them.

## External review boundary

- Reviewing another owner's PR is read-only until the user explicitly authorizes the exact GitHub action. A request to review does not authorize publishing, replying, resolving, approving, or requesting changes.
- Before an external write, show the proposed findings and open questions, refresh the PR head, and state the exact PR and intended action. If the head changed, inspect the affected evidence again before publishing.
- Resolve a thread only when its requested behavior is present or conclusively answered. Keep unaddressed findings open.
- Self-review may fix authorized in-scope findings, but never approve the author's own PR.

## References

- [Review snapshot and action boundary](references/mode-and-state.md)
- [Execution-flow and contract evidence](references/evidence.md)
- [Implementation self-review](references/self-review.md)
- [External review comments](references/external-review.md)
- [Test evidence](references/test-evidence.md)
- [OpenSpec authority](references/authority.md), when a PR adds, changes, or relies on OpenSpec
