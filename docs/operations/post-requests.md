# Pending local Post requests

## Temporal namespace setup

The Argo CD `PreSync` namespace Job creates or reconciles the configured Temporal namespace, then registers `KosmoPostRequestOwnerAccountId`, `KosmoPostRequestProfileId`, and `KosmoPostRequestStatus` as `Keyword` Search Attributes in that same namespace. It also creates or reconciles the `<namespace>-media-upload` Nexus Endpoint to target that namespace's `kosmo` Task Queue, where the Kosmo Worker handles Media Upload operations. The pinned Temporal CLI treats a matching existing Search Attribute type as already provisioned; a type mismatch or other Temporal error fails the Job and blocks the sync.

The chart configures 3-day retention for `kosmo-dev` and 30-day retention for `kosmo-prod`, with endpoints named `kosmo-dev-media-upload` and `kosmo-prod-media-upload`. These are repository values; the live retention settings were not changed or verified here. As checked on 2026-10-31, the Temporal server was 1.31.2 and reported Nexus enabled, which provides the documented baseline for system completion callbacks and Use-Existing. This is read-only version and capability evidence; it does not include a live callback smoke test.

## Worker and client rollout

Make the Worker build that registers `postRequestWorkflow`, `postCreateWorkflowV2`, `createPostActivityV2`, and the internal Media Upload Nexus service available on every active poller before exposing pending-request creation through the API or clients. The V2 workflow and Activity names alias the shared Post-create implementation so request identity and authorization checks remain in the write path. Keep these aliases when changing workflow or Activity registrations.

New Post Request histories join an existing Media Upload Workflow through the namespace's Media Upload Nexus Endpoint. The operation uses the stable `media-upload:${mediaId}` Workflow ID and `USE_EXISTING`, so concurrent callers attach to the same upload and receive its result without an Activity polling loop. A Post Request cancellation detaches that caller from the shared operation; it does not cancel the upload. READY Media is rechecked through the primary database and reused under the existing immutable READY contract, regardless of a later processing selection.

Keep the legacy polling Activity and the old-history patch branches registered until pre-Nexus Post Request histories drain. New histories use the Nexus operation; old histories retain their original Activity sequence.

The Worker is a rolling Deployment with no Temporal SDK version routing. API, Web, and Worker workloads currently share Argo CD sync wave `2`, so a single sync does not guarantee Worker-first availability. Stage rollout availability so no old Worker poller can receive new pending-request work; wait for the Worker rollout to complete before making the API/client capability available. This guidance does not require changing the Worker Deployment strategy.

## GraphQL request projection

The GraphQL request projection follows the [Post domain contract](../domain/objects/post.md); it does not restore the
rest of the immutable request snapshot or public error details. Unavailable Media items are nullable. A `createPost`
selection containing only `request` acknowledges the existing request without waiting for publication. Selecting its
non-null `post` waits up to the existing 30-second API deadline on that request's Workflow, then loads the published
Post under the original author Profile. An API result-wait deadline expiry or Workflow failure remains a GraphQL
error; expiry ends only this caller's wait and does not cancel the Workflow. Because `post` is non-null, selected-Post
errors can null the payload. Request-only acknowledgement is unaffected.
