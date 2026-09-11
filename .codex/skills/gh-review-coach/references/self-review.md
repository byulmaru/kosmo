# GitHub Review Coach: Implementation Self-Review

## Record Implementation Self-Review Decisions

After classifying self-review findings, distinguish a defect fix from a newly chosen important alternative. A choice is important when it changes observable behavior, public contracts, data, security, compatibility, rollout, reversibility, ownership, scope, dependencies, or the direction later implementations must follow.

- Update Linear first when scope, ownership, deliverables, blockers, or issue relationships change.
- Update OpenSpec `decisions.md` before code when a durable choice or public contract shared by implementation slices changes. Record superseded decisions instead of silently overwriting them.
- Record important implementation choices within independently verified upstream contracts in the PR body with decision-maker, choice, alternatives, reason, consequences, and links.
- Update applicable `memory/*.md` only for reusable repository conventions, and `docs/design/*.md` for documented product or UI design decisions.
- Do not invent a decision, rationale, or decision-maker. Ask the user when a material choice remains open. Do not create ceremonial records when the implementation merely follows an independently verified OpenSpec decision.

Return a decision ledger with new decisions and their recorded locations, independently verified decisions applied unchanged, and unresolved decisions. After self-review fixes, apply the [snapshot-change rule in Reconcile And Classify Evidence](evidence.md#reconcile-and-classify-evidence) before declaring publication readiness.

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
