# GitHub Review Coach: Evidence

## Independent evidence checks

After fixing the review mode, exact snapshot, ownership evidence, and repository guidance, decide whether an independent evidence check adds coverage. Use a bounded correctness check for a new implementation, changed head, or uncertain execution path. When changed tests or changed runtime behavior are in scope, read [Test Evidence](test-evidence.md) and add a separate test-evidence check. Skip these checks for an unchanged, already-established finding draft, an authorized comment publication, thread-state cleanup, or another action with no new review surface.

- Keep each check on one non-overlapping responsibility slice such as contracts, authorization, transactions, persistence, concurrency, test behavior, or unresolved-thread regressions. A minimality check is useful only when the diff introduces abstractions, dependencies, or scope with a concrete current cost.
- Give every check the same repository, review mode, exact snapshot, applicable guidance, and a bounded question. For external review include PR number, base SHA, and head SHA. For self-review provide raw artifacts rather than implementation rationale or the expected conclusion.
- Require exact file/line evidence, the path or invariant checked, confirmed findings separated from suspicions, the smallest relevant validation and its result, and an explicit no-finding result when the assigned surface is sound.
- Independent checks do not publish GitHub feedback, edit code, decide product policy or severity, or make the final review recommendation.

When independent checks run, the main reviewer independently traces and shares a compact responsibility map and execution-flow summary instead of waiting idle. The main reviewer owns freshness checks, final verification, deduplication, severity, drafting, and every GitHub write.

## Trace Behavior And Ownership

For a new implementation review or changed head, the main reviewer owns the end-to-end implementation map. Trace the changed flow through callers and downstream consumers in execution order. For a targeted follow-up on an unchanged snapshot, trace only the affected line, thread, or state transition:

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

### Audit Public Contracts And Test Seams

List every new or widened function parameter, callback, interface, evaluator, options object, factory, and exported type. For each one, identify:

- current production and test-only callers, plus default and injected execution paths;
- whether multiple concrete runtime implementations and a current replacement requirement exist now;
- which invariant a caller can bypass by passing a no-op, forced allow/deny, or replacement implementation.

Do not treat a future issue or an OpenSpec mention as a current caller. Prefer changing the owning function when concrete policy arrives over adding a speculative port, strategy, evaluator, default-allow function, or callback now. Add an abstraction with its real caller and exact composition requirements.

Tests must validate the exported default production wiring. A test that injects a fake callback proves only the behavior of that injected path unless the same composition boundary exists in production. Flag states, failures, or policy results that tests can create but production cannot reach. Keep fault injection in test fixtures, test-side mocking, or a non-public internal boundary rather than widening a public application action solely for test convenience.

Treat a mandatory application lifecycle exposed as an optional or replaceable callback as an ownership defect. If `action(input, noop)` can skip a MUST side effect or `create(source, forcedAllow)` can bypass centrally owned policy, the public contract contradicts the invariant it claims to enforce.

Prefer the smallest relevant check that can disprove or confirm a concern. Do not run broad test suites merely to appear thorough.

## Reconcile And Classify Evidence

Treat subagent reports as evidence, not conclusions. Verify their cited lines against the exact reviewed snapshot; in external review, this includes the shared head SHA. Merge duplicates only when they have the same root cause and requested fix, and preserve independently actionable fixes. A ponytail observation is not a blocker without a concrete current cost, absent caller, duplicated behavior, or scope/verification mismatch.

If the snapshot changes, record the delta, preserve evidence for unaffected responsibility slices, and rerun only checks whose files, callers, invariants, or decisions changed. Restart the whole review only when the base, review mode, ownership, or a broad rewrite makes prior evidence unreliable. Never reuse evidence against a changed snapshot without this verification.

Separate the review into four groups:

1. **Addressed feedback**: the requested behavior is actually present in the current code.
2. **Confirmed findings**: code, spec, test, or reproducible behavior proves the problem.
3. **Suspicions and decisions**: the concern depends on product policy, intended layering, or acceptable scope.
4. **Scope concerns**: independent changes should move to separate PRs.

Show this classification to the user before posting. Ask concise questions for every decision that materially changes the requested fix.

When code and spec disagree, do not assume the spec is correct. Code and spec may also agree on a premature abstraction or test-only escape hatch; agreement alone does not prove the design is necessary. Explain the consequence of changing each and ask which contract the user wants.

- When a PR adds, changes, or relies on OpenSpec, also read [OpenSpec Authority](authority.md) before drawing conclusions.
