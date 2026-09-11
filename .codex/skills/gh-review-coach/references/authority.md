# GitHub Review Coach: OpenSpec Authority

## Audit OpenSpec Authority Independently

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
