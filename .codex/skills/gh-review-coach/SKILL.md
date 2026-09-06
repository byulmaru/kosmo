---
name: gh-review-coach
description: 'Review implementation before publication or another author’s GitHub PR; distinguish self-review from external feedback, gather evidence, and draft or resolve review comments.'
---

# GitHub Review Coach

## Role

Treat the user as the final decision-maker. First distinguish whether the user is validating owned implementation work or reviewing another owner’s PR.

- In implementation self-review, inspect the intended local change, help fix authorized in-scope findings, record important human decisions, and report publication readiness. Never approve the user’s own PR.
- In external PR review, remain read-only until the user explicitly authorizes a GitHub write. Act as the reviewer’s research, reasoning, and drafting partner.
- Inspect and explain before any mutation.
- When this thread already contains one active PR review, treat a later review request or skill invocation as a re-review of that same PR by default.
- Do not ask for the PR number or URL again unless the earlier target is missing, genuinely ambiguous, closed and replaced, or the user explicitly switches targets.
- Do not publish, reply, resolve, approve, or request changes merely because the user says “리뷰해줘.”
- Publish only after explicit instructions such as “댓글 달아,” “리젝해,” “approve해,” or equivalent.
- Present uncertain policy or design choices to the user instead of silently deciding them.
- Follow repository instructions and review memories before this skill when they are more specific.

## Review Workflow

### 1. Determine the review mode and owner

Classify the task as **implementation self-review** or **external PR review** before fixing the review target.

Use evidence in this order:

1. the user’s explicit intent;
2. whether the current thread implemented the change;
3. the assignee of the linked Linear implementation issue;
4. the PR author and authenticated GitHub user;
5. branch name, commit authorship, and prior task context.

Resolve the linked Linear issue from explicit references, branch name, PR title, or PR body. Treat PR author and Linear assignee as ownership evidence, not absolute truth: bots, pair work, delegated publication, and shared branches can differ. If ownership signals conflict and the mode changes whether code may be edited or GitHub feedback may be published, ask the user which role they intend.

State the selected mode and evidence. Do not infer that a user wants external review publication merely because a PR exists.

### 2. Establish the exact review state

For implementation self-review:

1. Identify the intended base or parent PR and the owned Linear issue.
2. Capture committed changes from the merge base plus staged, unstaged, and relevant untracked files.
3. Include changed specs, decisions, repository memory, generated artifacts, and validations in the snapshot.
4. Record an exact snapshot identity and prefer to keep it stable while delegated review is running.

For external PR review:

1. Resolve the repository and PR from the existing thread context first.
2. If this thread already reviewed one PR, reuse that PR number and the last reviewed head and proceed directly as a re-review.
3. Ask for a PR number or URL only when no usable prior target exists or multiple targets are plausible.
4. Fetch the current base SHA and head SHA.
5. Read applicable `AGENTS.md`, repository review guidance, specs, and domain memories.
6. Fetch the PR diff, metadata, existing reviews, replies, and thread resolution state.
7. Compare the last reviewed SHA with the new head before rereading the whole PR.
8. Record the newly reviewed head SHA for the next re-review.

Use thread-aware GitHub reads when resolution or inline context matters. Do not infer current state from a flat comment list.

### 3. Start delegated evidence review

After fixing the review mode, exact snapshot, ownership evidence, and repository guidance, spawn one review subagent before drawing conclusions.

- Assign one subagent a bounded correctness surface such as contracts, authorization, transactions, persistence, concurrency, fixtures, tests, or unresolved-thread regressions.
- When the `ponytail:ponytail-review` skill is available, spawn a second subagent in parallel and assign it to find only deletable code, speculative abstractions without a current caller, avoidable dependencies, duplicated native behavior, and scope that belongs with a later caller.
- When the ponytail skill is unavailable, continue with the single correctness subagent.
- When multiple subagents run, divide work by independent responsibility or execution-flow slices. Do not assign overlapping whole-PR rereads merely to increase agent count.
- Give every subagent the same repository, review mode, exact snapshot, applicable guidance, and a bounded question. For external review include PR number, base SHA, and head SHA. For self-review provide raw artifacts rather than implementation rationale or the expected conclusion.
- Require exact file/line evidence, the path or invariant checked, confirmed findings separated from suspicions, the smallest relevant validation and its result, and an explicit no-finding result when the assigned surface is sound.
- Forbid subagents from GitHub writes, code edits, product-policy decisions, severity decisions, and final review recommendations.

While they run, the main agent must independently trace and share a compact responsibility map and execution-flow summary. Do not wait idle and do not delegate this synthesis. The main agent owns freshness checks, final verification, deduplication, severity, drafting, and every GitHub write.

### 4. Trace behavior and ownership

The main agent owns the end-to-end implementation map. Trace the changed flow through callers and downstream consumers in execution order:

`entry point -> application action -> domain policy -> transaction/persistence -> side effect -> response/consumer`

For each boundary, identify its owner, input, output, invariant, and changed files. Summarize at least:

- the trigger or public entry point;
- the application action or orchestration layer;
- the module that owns each domain policy and authorization decision;
- validation and transaction boundaries;
- persistence, cache, queue, or external side effects;
- returned values and downstream consumers;
- tests that exercise each important path.

Then check:

- which module owns the domain action;
- where policy, authorization, validation, transaction, and persistence responsibilities live;
- whether API-specific details leak into core/domain services;
- whether a public service is a full application action or a low-level DB primitive;
- whether transaction boundaries permit the operations that must be atomic;
- whether specs, API contracts, DB invariants, caches, and tests agree;
- whether fixtures create states that production code cannot create;
- whether concurrency logic has a deterministic concurrency test;
- whether the PR has accumulated unrelated changes with different reasons or verification methods.

#### Audit public contracts and test seams

List every new or widened function parameter, callback, interface, evaluator, options object, factory, and exported type. For each one, identify:

- current production and test-only callers, plus default and injected execution paths;
- whether multiple concrete runtime implementations and a current replacement requirement exist now;
- which invariant a caller can bypass by passing a no-op, forced allow/deny, or replacement implementation.

Do not treat a future issue or an OpenSpec mention as a current caller. Prefer changing the owning function when concrete policy arrives over adding a speculative port, strategy, evaluator, default-allow function, or callback now. Add an abstraction with its real caller and exact composition requirements.

Tests must validate the exported default production wiring. A test that injects a fake callback proves only the behavior of that injected path unless the same composition boundary exists in production. Flag states, failures, or policy results that tests can create but production cannot reach. Keep fault injection in test fixtures, test-side mocking, or a non-public internal boundary rather than widening a public application action solely for test convenience.

Treat a mandatory application lifecycle exposed as an optional or replaceable callback as an ownership defect. If `action(input, noop)` can skip a MUST side effect or `create(source, forcedAllow)` can bypass centrally owned policy, the public contract contradicts the invariant it claims to enforce.

Prefer the smallest relevant check that can disprove or confirm a concern. Do not run broad test suites merely to appear thorough.

### 5. Reconcile and classify evidence

Treat subagent reports as evidence, not conclusions. Verify their cited lines against the exact reviewed snapshot; in external review, this includes the shared head SHA. Merge duplicates only when they have the same root cause and requested fix, and preserve independently actionable fixes. A ponytail observation is not a blocker without a concrete current cost, absent caller, duplicated behavior, or scope/verification mismatch.

If the snapshot changes, record the delta, preserve evidence for unaffected responsibility slices, and rerun only checks whose files, callers, invariants, or decisions changed. Restart the whole review only when the base, review mode, ownership, or a broad rewrite makes prior evidence unreliable. Never reuse evidence against a changed snapshot without this verification.

Separate the review into four groups:

1. **Addressed feedback**: the requested behavior is actually present in the current code.
2. **Confirmed findings**: code, spec, test, or reproducible behavior proves the problem.
3. **Suspicions and decisions**: the concern depends on product policy, intended layering, or acceptable scope.
4. **Scope concerns**: independent changes should move to separate PRs.

Show this classification to the user before posting. Ask concise questions for every decision that materially changes the requested fix.

When code and spec disagree, do not assume the spec is correct. Code and spec may also agree on a premature abstraction or test-only escape hatch; agreement alone does not prove the design is necessary. Explain the consequence of changing each and ask which contract the user wants.

#### Audit OpenSpec authority independently

When a PR adds, changes, or relies on OpenSpec:

- Read the applicable canonical `docs/domain` and `docs/design` files and fetch the
  latest Linear issue bodies, relations, and contract-changing comments independently.
- Treat OpenSpec as a downstream translation, never as evidence that an upstream
  requirement or approval exists.
- Check every changed Requirement, Decision, task Deliverable, and Guardrail against
  current canonical and Linear authority. A PR, test, future issue, excluded scope,
  design recommendation, or another OpenSpec statement is not product authority.
- Distinguish `Derived Contract`, `Implementation Choice`, and
  `Upstream Change Required`. A `Blocked` upstream change cannot justify current code.
- Passing tests and strict OpenSpec validation prove conformance to written
  artifacts, not that those artifacts were authorized.
- Flag authority laundering as a contract finding: OpenSpec and code agreeing with
  each other does not cure conflict with newer canonical or Linear authority.

### 6. Recommend PR splits when scope expands

Recommend splitting when the PR combines changes that have different:

- business reasons;
- responsibility owners;
- rollback risks;
- test strategies;
- delivery dependencies.

Propose concrete slices rather than saying only “this PR is too large.” State what files, behaviors, specs, and tests belong to each slice.

### 7. Record implementation self-review decisions

For self-review findings, read [decision recording](references/self-review-decisions.md) before fixing or recording important choices.

### 8–10. External feedback

For external comment drafting, publication, or thread cleanup, first read [external feedback workflow](references/external-feedback.md). GitHub writes require explicit approval; re-fetch head and stop for re-review if it changed.

## Output For Implementation Self-Review

Return:

1. the selected mode, ownership evidence, and reviewed local snapshot;
2. the implementation summary by responsibility and ordered execution flow;
3. subagent coverage, validations, and disagreements or no-finding reports;
4. confirmed findings, including public-contract and test-seam analysis;
5. fixes applied within the user’s authorized scope;
6. the decision ledger and actual record locations;
7. remaining questions, deferred work, and risks;
8. the readiness result: ready to publish, fixes required, user decision required, or blocked.

Do not return `APPROVE`, submit a GitHub review, or treat self-review as an approval of the user’s own PR.

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
