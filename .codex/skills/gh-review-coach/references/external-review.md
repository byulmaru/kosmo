# GitHub Review Coach: External Review

## Recommend PR Splits When Scope Expands

Recommend splitting when the PR combines changes that have different:

- business reasons;
- responsibility owners;
- rollback risks;
- test strategies;
- delivery dependencies.

Propose concrete slices rather than saying only “this PR is too large.” State what files, behaviors, specs, and tests belong to each slice.

## Draft Junior-Friendly External Review Comments

Write in Korean when the repository or user prefers Korean. Use the following order:

1. **Priority and short title**
2. **What the current code does**
3. **Why that causes a problem**
4. **A concrete example or execution order**
5. **What to change**
6. **Whether it blocks this PR or may move to a follow-up**

Explain unfamiliar terms in plain language. Use `transaction`, `loader`, `fixture`, or `idempotency` only when useful, and immediately connect the term to the observable behavior.

Anchor comments to the tightest changed line. Avoid preference-only feedback. Combine comments that share one root cause, but keep independently actionable fixes separate.

Use repository priority rules when available. Otherwise:

- `P1`: merge-blocking behavior, security, data, or API contract defect. This includes a public API that makes the PR’s mandatory invariant optional or bypassable, or a test-only input that can disable a required lifecycle in production.
- `P2`: structural or correctness risk that should be fixed now but may be split with explicit ownership;
- `P3`: lower-risk design or maintainability improvement;
- `P5`: trivial cleanup.

## Get Explicit Approval Before Publishing External Feedback

Before a GitHub write:

1. Show the proposed findings and open questions.
2. Incorporate the user’s policy decisions.
3. Re-fetch the PR head.
4. If the head changed, stop and re-check the affected lines before publishing.
5. State the exact PR and intended action.

Decide the review body before submission. A submitted empty review body may not be editable later.

- Use an empty body when inline comments are sufficient and repository rules prefer it.
- Include a detailed body in the initial submission when requesting a PR split or explaining an overarching blocker.

## Clean Up External Review Threads Accurately

- Resolve only feedback whose requested behavior is actually reflected in the current code or conclusively answered.
- Do not resolve a thread merely because the author replied or moved code.
- Keep new and unaddressed findings unresolved.
- After publishing, verify the review state, inline comment count, body, resolved/unresolved thread state, and clean local workspace.

## Output Before External Review Publishing

Return:

1. the reviewed base SHA and head SHA, plus the head-to-head change summary;
2. the implementation summary by responsibility and ordered execution flow;
3. subagent coverage, relevant validations, and any disagreements or no-finding reports;
4. which previous feedback is addressed;
5. confirmed findings ordered by severity;
6. suspicions and questions for the user;
7. proposed inline comments and review body;
8. the recommended review action: approve, comment, or request changes.

## Output After External Review Publishing

Return:

- the review state and link;
- the number of inline comments;
- which earlier threads were resolved;
- which findings remain open;
- whether any local files or git state changed.
