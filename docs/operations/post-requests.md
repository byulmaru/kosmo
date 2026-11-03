# Pending local Post requests

## Temporal namespace setup

The Argo CD `PreSync` namespace Job creates or reconciles the configured Temporal namespace, then registers `KosmoPostRequestOwnerAccountId`, `KosmoPostRequestProfileId`, and `KosmoPostRequestStatus` as `Keyword` Search Attributes in that same namespace. It also creates or reconciles the `<namespace>-media-upload` Nexus Endpoint to target that namespace's `kosmo` Task Queue, where the Kosmo Worker handles Media Upload operations. The pinned Temporal CLI treats a matching existing Search Attribute type as already provisioned; a type mismatch or other Temporal error fails the Job and blocks the sync.

The chart configures 3-day retention for `kosmo-dev` and 30-day retention for `kosmo-prod`, with endpoints named `kosmo-dev-media-upload` and `kosmo-prod-media-upload`. These are repository values; the live retention settings were not changed or verified here. As checked on 2026-10-31, the Temporal server was 1.31.2 and reported Nexus enabled, which provides the documented baseline for system completion callbacks and Use-Existing. This is read-only version and capability evidence; it does not include a live callback smoke test.

## Worker and client rollout

Make the Worker build that registers `postRequestWorkflow`, `mediaUploadWorkflow`, `postCreateWorkflowV2`, `createPostActivityV2`, and the internal Media Upload Nexus service available on every active poller before exposing this API behavior through clients. Make sure the Media service also exposes `publishUploadV2` before the new Worker uses it. The V2 Post-create workflow and Activity names alias the shared implementation so request identity and authorization checks remain in the write path. Keep these aliases when changing workflow or Activity registrations.

New Post Request histories join an existing Media Upload Workflow through the namespace's Media Upload Nexus Endpoint. The operation uses the stable `media-upload:${mediaId}` Workflow ID and `USE_EXISTING`, so concurrent callers attach to the same upload and receive its result without an Activity polling loop. A Post Request cancellation detaches that caller from the shared operation; it does not cancel the upload. READY Media is rechecked through the primary database and reused without reprocessing. The API compares a submitted filter with a retained completed result when available; it rejects a mismatch and rejects a new filter request when the result cannot establish that selection.

The API admits each UPLOADING Media through `mediaUploadWorkflow` Update-with-Start on the same stable Workflow ID, using `USE_EXISTING` conflict and `REJECT_DUPLICATE` reuse policies. The Update input explicitly carries `applyAiProhibitFilter`; the Workflow calls Media's workflow-backed `publishUploadV2` operation. The returned status reports the actual Media outcome: `completed` includes its published URL and media type, while `processing` means the filter selection was durably accepted and Media work is still running. Kosmo finalizes the Media row as READY before it returns a `completed` Update. For `processing`, the Update returns promptly while the Workflow keeps waiting for the existing `startUpload` result and finalizes READY later. New Kosmo uploads use `applyAiProhibitFilter`; legacy histories keep their `applyNightshade` input, `applyHope`, and `publishUpload({id})` acknowledgement command. A new Update joining an active legacy run does not call Media again: it rejects a different selection, returns `processing` for a matching unfinished filtered run, and waits for the actual finalized result for a matching unfiltered run.

Keep the legacy polling Activity and the old-history patch branches registered until pre-Nexus Post Request histories drain. New histories use the Nexus operation; old histories retain their original Activity sequence.

The Worker is a rolling Deployment with no Temporal SDK version routing. API, Web, and Worker workloads currently share Argo CD sync wave `2`, so a single sync does not guarantee Worker-first availability. Stage rollout availability so no old Worker poller can receive new pending-request work; wait for the Worker rollout to complete before making the API/client capability available. This guidance does not require changing the Worker Deployment strategy.

Roll out Media's `publishUploadV2` on every Media poller before the new Kosmo Worker, and roll out the Worker Update-with-Start handler on every Kosmo poller before the API change. Ship clients that accept either a direct `post` or a `request` before deploying the API. The new client remains compatible with the older request-only API; an older request-only client can show a failure and retain the draft after a direct Post has committed. This is compatible with the existing nullable payload schema, not a schema break.

## GraphQL request projection

The GraphQL request projection follows the [Post domain contract](../domain/objects/post.md); it does not restore the rest
of the immutable request snapshot or public error details. Unavailable Media items are nullable. `createPost` first
validates caller, input, and Media ownership, then requests publication for each uploaded Media through the existing
`mediaUploadWorkflow` ID. Admission does not depend on GraphQL field selection or infer processing from the submitted
`applyAiProhibitFilter` value. When no Media is attached, or every publication returns `completed`, the API executes the
canonical `postCreateWorkflow` with commit-time authorization revalidation and returns the actual Post with
`request=null`. If any publication returns `processing`, the API starts a `postRequestWorkflow` and immediately returns
`post=null` plus that request state. The PostRequest workflow joins each already-started Media upload through the existing
workflow-backed Nexus operation and continues publication after processing completes.

The nullable `post` field is the Post created by the direct PostCreate result; the API scopes its lookup to the prepared
author Profile. A PostRequest response does not wait again or look up a Post, even if the Workflow later publishes.
Publication or Workflow failure uses the existing GraphQL error mapping. A caller wait deadline only ends that caller's
wait; it does not cancel an already-started Media or Post Workflow.
