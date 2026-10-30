# Pending local Post requests

## Temporal namespace setup

The Argo CD `PreSync` namespace Job creates or reconciles the configured Temporal namespace, then registers `KosmoPostRequestOwnerAccountId`, `KosmoPostRequestProfileId`, and `KosmoPostRequestStatus` as `Keyword` Search Attributes in that same namespace. The pinned Temporal CLI treats a matching existing type as already provisioned; a type mismatch or other Temporal error fails the Job and blocks the sync.

The chart configures 3-day retention for `kosmo-dev` and 30-day retention for `kosmo-prod`. These are repository values; this change did not inspect or modify live namespace settings.

## Worker and client rollout

Make the Worker build that registers `postRequestWorkflow`, `postCreateWorkflowV2`, and `createPostActivityV2` available on every active poller before exposing pending-request creation through the API or clients. The V2 workflow and Activity names alias the shared Post-create implementation so request identity and authorization checks remain in the write path. Keep these aliases when changing workflow or Activity registrations.

The Worker is a rolling Deployment with no Temporal SDK version routing. API, Web, and Worker workloads currently share Argo CD sync wave `2`, so a single sync does not guarantee Worker-first availability. Stage rollout availability so no old Worker poller can receive new pending-request work; wait for the Worker rollout to complete before making the API/client capability available. This guidance does not require changing the Worker Deployment strategy.

## GraphQL request projection

The GraphQL request projection follows the [Post domain contract](../domain/objects/post.md); it does not restore the
rest of the immutable request snapshot or public error details. Unavailable Media items are nullable. A `createPost`
selection containing only `request` acknowledges the existing request without waiting for publication. Selecting its
non-null `post` waits up to the existing 30-second API deadline on that request's Workflow, then loads the published
Post under the original author Profile. An API result-wait deadline expiry or Workflow failure remains a GraphQL
error; expiry ends only this caller's wait and does not cancel the Workflow. Because `post` is non-null, selected-Post
errors can null the payload. Request-only acknowledgement is unaffected.
