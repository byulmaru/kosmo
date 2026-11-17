# KOSMO Review: Implementation Self-Review

## Record real decisions only

Distinguish a defect fix from a new material choice. A choice is material when it changes observable behavior, public contracts, data, security, compatibility, rollout, reversibility, ownership, scope, dependencies, or the direction of later implementations.

- Follow current user instructions, canonical requirements, and Linear scope. Update canonical documents and Linear when a new durable business requirement, public guarantee, security boundary, rollout policy, or delivery scope is decided.
- Record an implementation choice in the PR only when it is material and not already settled upstream. Include the decision-maker, selected approach, considered alternatives, reason, and consequence.
- Do not invent a decision, rationale, or decision-maker. Ask the user when a material choice remains unresolved. Do not create a decision record when the implementation applies an existing requirement without choosing a new alternative.

## Findings and outcome

After fixing a finding, recheck the changed snapshot and any evidence affected by the fix. Self-review may fix findings within the user's authorized scope, but never approves the author's own PR.

Report the exact snapshot, confirmed findings and fixes, relevant checks and their limits, unresolved questions, and whether the change is ready for review. Mention a new decision and where it was recorded only when one exists; do not produce a decision ledger or fixed-length report by default.
