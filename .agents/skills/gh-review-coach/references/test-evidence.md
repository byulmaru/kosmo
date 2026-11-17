# KOSMO Review: Test Evidence

When changed tests or runtime behavior are in scope, inspect the tests that cover the changed contract. If behavior changed but relevant tests are absent, report the specific coverage gap rather than calling test evidence inapplicable.

For the reviewed behavior, check:

- Would the test fail if the behavior were broken? Look for vacuous or skipped conditional assertions, unawaited async assertions or completion, and swallowed errors; do not flag valid returned promises.
- Do mocks and stubs leave the system under test's policy and state transformation in the test? A mock may replace an external boundary, but not the policy or transformation being claimed.
- Does the test cover relevant failure or boundary states and verify the resulting state and required side effects?
- Are ordering, shared state, time, randomness, and completion controlled deterministically rather than by arbitrary sleeps or timing assumptions?
- Are fixtures realistic, and are expected values derived independently rather than computed by the same system under test?

## Audit assertion targets

Trace each assertion's input and observed target; do not judge it by `.toBe` or `.toEqual` syntax alone. Check for tests that only inspect source-file strings, compare imported config or metadata with hard-coded values, or pin internal DOM structure or SVG node counts without exercising behavior. Equality against a config object does not prove user behavior.

Preserve tests that exercise real behavior with meaningful inputs and observe outputs, state transitions, callback wiring, accessibility behavior, or rendered geometry, including user interaction where applicable. For a weak test, recommend the smallest suitable remedy: delete it if it adds no meaningful behavioral coverage, or replace it with the smallest behavior check needed for the contract. Ground the choice in the test location, affected behavior, and coverage remaining after deletion. Do not add tests that merely mirror this guidance.

Use the narrowest meaningful check. Do not require mutation testing, broad suites, 100% coverage, or added tests solely to satisfy this checklist. Report each concrete missed regression or failure mode, its smallest fix, and the meaningful coverage that remains.
