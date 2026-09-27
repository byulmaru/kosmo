## Session Work

- [x] 1.1 Reconfirmed PROD-942's accepted Unicode type set and common controller. Added validated kind and key fields to the existing two Reaction events.
- [x] 1.2 Added behavior tests for the complete allowlist, non-collision, sequence variants, and unmapped values.
- [x] 1.3 Added behavior tests for success, missing payload, failure, late Account response, Profile switch, and PostHog identity mismatch.
- [x] 1.4 Documented metric definitions, Asia/Seoul half-open date windows, unverified exclusions, and two reproducible HogQL query templates. Cloud execution remains pending deployment of the new key.
- [ ] 1.5 Updated the event allowlist and documented Reaction-key scope, non-anonymization, and Web/history limits. The current public privacy policy took effect on 2026-10-13 and remains unchanged in this PR. Decide before production deployment whether the new key needs an additional notice; if so, publish the dated notice first.
- [ ] 1.6 After the parent PRs merged, align this PR to latest main and revalidate the upstream interface and implementation.

## Verification Evidence

- Result: Latest-main integration and current-head validation are in progress. Earlier CI runs do not validate the rebased tree.
- Checks: Record exact current-head CI results in the PR and portable review handoff after this integration.
- Limits: Parent PRs #1023, #1051, and #1025 are merged. No PostHog Cloud settings, Insight, production deployment of the new key, or query execution was performed. No verified internal/test Account or bot exclusion rule was found.

## Progress

- Status: Review repair in progress; keep PR Draft.
- Completed: 1.1–1.4 were implemented before latest-main integration; current-head verification remains pending.
- Next: Finish 1.6. Determine whether the 2026-10-13 policy covers the new key and publish an additional dated notice before deployment if needed.
- Last updated: 2026-10-30
