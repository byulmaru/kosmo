# Authority And Record Boundaries

- Explicit current user instructions and decisions settle the current task. Questions, examples, suggestions, and model inferences do not approve a product or operational contract.
- `docs/domain` and accepted ADRs own product behavior, permissions, state transitions, security, compatibility, and rollout requirements. `docs/design` owns visual structure, presentation, accessibility, and interaction design; it does not redefine product policy or server behavior.
- Linear records the problem, value, delivery scope, and outcome-level completion conditions. Code, tests, and PRs record implementation choices and verification evidence.
- OpenSpec is an optional, mutable session aid. It may summarize approved requirements and current work, but it does not create authority, add requirements, override settled decisions, or impose implementation, PR, or archive gates.
- If a material choice about observable behavior, public contracts, security, rollout, ownership, or completion scope remains unresolved, ask the user before implementing it. Record durable requirements and their reasons in the applicable canonical documents, and update Linear scope and outcomes when an issue exists. Keep implementation details in code and PR context.
