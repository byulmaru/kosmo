# Pending local Post requests

## Temporal namespace setup

The Argo CD `PreSync` namespace Job creates or reconciles the configured Temporal namespace, then registers `KosmoPostRequestOwnerAccountId`, `KosmoPostRequestProfileId`, and `KosmoPostRequestStatus` as `Keyword` Search Attributes in that same namespace. The pinned Temporal CLI treats a matching existing type as already provisioned; a type mismatch or other Temporal error fails the Job and blocks the sync.

The chart configures 3-day retention for `kosmo-dev` and 30-day retention for `kosmo-prod`. These are repository values; this change did not inspect or modify live namespace settings.

## Worker and client rollout

Make the Worker build that registers `postRequestWorkflow`, `postCreateWorkflowV2`, and `createPostActivityV2` available on every active poller before exposing pending-request creation through the API or clients. The V2 workflow and Activity names alias the shared Post-create implementation so request identity and authorization checks remain in the write path. Keep these aliases when changing workflow or Activity registrations.

The Worker is a rolling Deployment with no Temporal SDK version routing. API, Web, and Worker workloads currently share Argo CD sync wave `2`, so a single sync does not guarantee Worker-first availability. Stage rollout availability so no old Worker poller can receive new pending-request work; wait for the Worker rollout to complete before making the API/client capability available. This guidance does not require changing the Worker Deployment strategy.
