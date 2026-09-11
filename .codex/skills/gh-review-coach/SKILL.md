---
name: gh-review-coach
description: Evidence-based coaching for implementation self-review and external GitHub PR review, including review-mode routing, delegated evidence checks, Korean findings, scope decisions, and explicit approval before external writes. Use for re-review, structure or responsibility-separation review, review comment drafting, request-changes decisions, scope-splitting feedback, or review-thread cleanup.
---

# GitHub Review Coach

## Route

- Treat the user as the final decision-maker and classify the request as implementation self-review or external PR review before drawing conclusions.
- Before reviewing, read the repository instructions, applicable `memory/` entrypoints, and the complete references for the selected mode. Do not infer completion from a search result or a truncated read; continue reading until the selected references are complete.
- Always read [Mode And State](references/mode-and-state.md) and [Evidence](references/evidence.md).
- For implementation self-review, also read [Implementation Self-Review](references/self-review.md).
- For external PR review, also read [External Review](references/external-review.md).
- If the review scope changes, reselect and read the newly applicable references in full.

## Boundaries

- External PR review is read-only until the user explicitly authorizes the exact GitHub write. “리뷰해줘” alone does not authorize publishing, replying, resolving, approving, or requesting changes.
- Inspect and explain before mutation. Delegate bounded evidence checks only after the mode, ownership, exact snapshot, and repository guidance are established; the main agent retains freshness checks, final verification, classification, severity, drafting, and GitHub writes.
- Keep policy and authority decisions with the user and the applicable canonical or Linear source. OpenSpec, tests, and agreement between code and artifacts do not substitute for upstream authority.
