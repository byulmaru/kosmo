# GitHub Review Coach: Test Evidence

## Test-Evidence Subagent

- When applicable, assign the dedicated test-evidence subagent to inspect changed tests and tests covering changed behavior. When neither changed tests nor changed runtime behavior is in scope, explicitly report test evidence not applicable; when runtime behavior changed but relevant tests are absent, report the contract-specific coverage gap instead of treating it as not applicable, and do not invent work.
- The test-evidence subagent assesses test evidence for the reviewed behavior using these criteria:
  - Would the test fail if the changed behavior were broken? Check for vacuous or skipped conditional assertions, async assertions or completion that are neither awaited nor returned, and swallowed errors; do not flag valid returned promises.
  - Do mocks and stubs leave the system under test's policy and state transformation in the test? A mock may replace an external boundary, but must not replace the policy or transformation being claimed.
  - Does the test cover relevant failure or boundary states and verify the resulting post-state and required side effects?
  - Are ordering, shared state, time, randomness, and completion controlled deterministically rather than by arbitrary sleeps or timing assumptions?
  - Are fixtures realistic, and are expected values derived independently rather than computed by the same system under test?
- Apply `Audit Assertion Targets` as part of this pass.
- The test-evidence pass does not require mutation testing, mandate broad suites or 100% coverage, or add tests solely to satisfy this checklist; use the narrowest meaningful check.
- Require the test-evidence report to name each concrete missed regression or failure mode and state the smallest fix and the meaningful coverage that remains.

### Audit Assertion Targets

For tests in the review scope, always trace each assertion's input and observed target; do not judge it by `.toBe` or `.toEqual` syntax alone. Check for tests that only inspect source-file strings, compare an imported config or meta object with hard-coded expected values, or pin internal DOM structure or SVG node counts without exercising the behavior. The existence of config acceptance does not make equality against the config object a user-behavior test.

Preserve tests that exercise real behavior with meaningful inputs and observe outputs, state transitions, callback wiring, accessibility behavior, or rendered geometry, including user interaction where applicable. For a weak test, recommend the smallest suitable remedy: delete it if it adds no meaningful behavioral coverage, or replace it with the smallest behavior check needed for the contract. Ground that choice in the test's location, affected behavior, and coverage remaining after deletion. Do not add tests that merely mirror this guidance.
