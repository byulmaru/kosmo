## Session Work

- [x] 1.1 Reconfirmed PROD-942's accepted Unicode type set and common controller. Added validated kind and key fields to the existing two Reaction events.
- [x] 1.2 Added and ran behavior tests for the complete allowlist, non-collision, sequence variants, and unmapped values in the current-head App CI.
- [x] 1.3 Added and ran behavior tests for success, missing payload, failure, late Account response, Profile switch, and PostHog identity mismatch in the current-head App CI.
- [x] 1.4 Documented metric definitions, Asia/Seoul half-open date windows, unverified exclusions, and two reproducible HogQL query templates. Cloud execution remains pending deployment of the new key.
- [ ] 1.5 Updated the event allowlist and documented Reaction-key scope, non-anonymization, and Web/history limits. The public privacy notice remains at its 2026-09-09 version per user decision; its amendment date and publication are pending before production deployment.
- [ ] 1.6 After parent PRs merge, align the Stack to latest main and revalidate the upstream interface and implementation.

## Verification Evidence

- Result: Current-head GitHub CI passed; privacy notice amendment and publication remain pending before production deployment.
- Checks: GitHub Test, Lint, Semgrep, and Web E2E passed for e1a6bf8. Review repair validation is recorded separately after its new head.
- Limits: PR #1023 and PR #1025 remain Draft. No PostHog Cloud settings, Insight, production deployment of the new key, or query execution was performed. No verified internal/test Account or bot exclusion rule was found.

## Progress

- Status: Review repair in progress; keep PR Draft.
- Completed: 1.1–1.4 for current head. Privacy notice portion of 1.5 remains pending.
- Next: Set the privacy amendment effective date and publish its notice before production deployment. After the parent Stack merges, complete 1.6.
- Last updated: 2026-09-27
