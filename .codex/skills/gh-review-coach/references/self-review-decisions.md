Read when linked from SKILL.md. Repository paths and command working directories retain their original meaning.

The snapshot-change rule referenced below is in [step 5 of SKILL.md](../SKILL.md#5-reconcile-and-classify-evidence).

### 7. Record implementation self-review decisions

After classifying self-review findings, distinguish a defect fix from a newly chosen important alternative. A choice is important when it changes observable behavior, public contracts, data, security, compatibility, rollout, reversibility, ownership, scope, dependencies, or the direction later implementations must follow.

- Update Linear first when scope, ownership, deliverables, blockers, or issue relationships change.
- Update OpenSpec `decisions.md` before code when a durable choice or public contract shared by implementation slices changes. Record superseded decisions instead of silently overwriting them.
- Record important implementation choices within independently verified upstream contracts in the PR body with decision-maker, choice, alternatives, reason, consequences, and links.
- Update applicable `memory/*.md` only for reusable repository conventions, and `docs/design/*.md` for documented product or UI design decisions.
- Do not invent a decision, rationale, or decision-maker. Ask the user when a material choice remains open. Do not create ceremonial records when the implementation merely follows an independently verified OpenSpec decision.

Return a decision ledger with new decisions and their recorded locations, independently verified decisions applied unchanged, and unresolved decisions. After self-review fixes, apply the snapshot-change rule above before declaring publication readiness.
