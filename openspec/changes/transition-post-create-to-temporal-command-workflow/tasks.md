## 1. Preserve Post creation and add the post-commit start boundary

- [x] 1.1 Keep Local GraphQL and ActivityPub Create on the existing core Post transaction, including caller-owned transaction behavior.
- [x] 1.2 Return a one-shot post-commit lifecycle only for a newly committed Post, carrying the committed Post ID and explicit `LOCAL` or `ACTIVITYPUB` origin.
- [x] 1.3 Execute the lifecycle only after the outer transaction commits; do not start it after rollback, duplicate, or no-op results.
- [x] 1.4 Start the effects Workflow with a deterministic Post-only identity, converge on a running execution, and reject reuse after any closed execution.
- [x] 1.5 Observe and catch start failures while preserving the committed Post, GraphQL response, and ActivityPub acknowledgement.
- [x] 1.6 Add focused tests for top-level and caller-owned commit/rollback, Local and ActivityPub root/reply creation, duplicate/no-op handling, duplicate starts, and start failure isolation.

## 2. Move accepted post-commit effects into Temporal

- [x] 2.1 Implement a deterministic Post Create effects Workflow that uses only serializable input and Activity results.
- [x] 2.2 Move Reply Notification creation into an idempotent Activity that reloads the committed Post and preserves recipient, self-suppression, visibility, and uniqueness rules.
- [x] 2.3 Move Local-origin ActivityPub Create queue handoff into a separate idempotent Activity that reuses canonical Note identity, audience/target rules, and the existing Fedify queue producer.
- [x] 2.4 Suppress outbound Create handoff for `ACTIVITYPUB` origin.
- [x] 2.5 Ensure Notification and federation handoff are attempted independently so a final failure in one does not prevent the other.
- [x] 2.6 Remove the old in-transaction Notification savepoint path and direct post-commit Fedify dispatch after equivalent coverage exists.
- [x] 2.7 Add Workflow and Activity tests for applicability, retry/idempotency, independent failure, ActivityPub echo suppression, and Post-result isolation.

## 3. Activate the singleton Worker runtime

- [x] 3.1 Replace optional or caller-supplied registration with the compile-time production Workflow and Activity registration.
- [x] 3.2 Expose an argument-free singleton startup boundary that owns the health server, Temporal connection, Worker, signal handlers, drain, and shutdown exactly once per process.
- [x] 3.3 Remove missing-registration failure paths and Worker-specific `worker.enabled` configuration while retaining chart-wide `workloads.enabled` bootstrap behavior.
- [x] 3.4 Render the Worker Deployment as a normal application workload without injecting Worker credentials into the API Rollout or adding a Worker-specific database pool/handle.
- [x] 3.5 Add focused runtime and Helm tests for registration, singleton startup, readiness, signal drain, standard database configuration, and dev/production rendering.

## 4. Verify and close the change safely

- [x] 4.1 Run focused unit/integration tests, type checks, formatting, linting, Helm rendering/tests, and strict OpenSpec validation required by the touched packages.
- [ ] 4.2 After merge and dev deployment of the exact revision, verify Worker RUNNING/readiness, Local and ActivityPub Post behavior, accepted-Workflow Activity retry, restart recovery, and graceful drain with concrete evidence.
- [x] 4.3 Confirm production manifests remain unapplied and record that production sync, rollout, cutover, and live verification still require separate user approval.
- [ ] 4.4 The PROD-722 implementation owner synchronizes the active specs and archives this change only after the full scope and required dev integration evidence are complete.
