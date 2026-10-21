import {
  REMOTE_POST_LOOKUP_MAX_DOCUMENT_BYTES,
  remotePostLookupWorkflow,
} from '@kosmo/core/temporal/workflows';
import {
  ApplicationFailure,
  patched,
  proxyActivities,
  WorkflowIdReusePolicy,
} from '@temporalio/workflow';
import { workflowActivityOptions } from './activity-options';
import { runChildWorkflow } from './child';
import type {
  RemotePostLookupResult,
  RemoteProfileFeaturedSyncInput,
} from '@kosmo/core/temporal/workflows';
import type * as activities from '../activities';

export type { RemoteProfileFeaturedSyncInput } from '@kosmo/core/temporal/workflows';

const {
  collectRemoteFeaturedActivity,
  collectRemoteFeaturedItemsActivity,
  replaceRemoteFeaturedActivity,
} = proxyActivities<typeof activities>(workflowActivityOptions);

export async function remoteProfileFeaturedWorkflow(
  input: RemoteProfileFeaturedSyncInput,
): Promise<void> {
  if (!patched('remote-profile-featured-post-lookup-v1')) {
    const postIds = await collectRemoteFeaturedActivity(input);
    if (postIds !== null) {
      await replaceRemoteFeaturedActivity({ profileId: input.profileId, postIds });
    }
    return;
  }

  const collection = await collectRemoteFeaturedItemsActivity(input);
  if (collection === null) {
    return;
  }

  let remainingDocumentBytes = REMOTE_POST_LOOKUP_MAX_DOCUMENT_BYTES - collection.documentBytes;
  const postIds: string[] = [];
  for (const objectUri of collection.itemUris) {
    const result: RemotePostLookupResult = await runChildWorkflow(remotePostLookupWorkflow, {
      mode: 'execute',
      args: [
        {
          objectUri,
          advertisingActorUri: input.actorUri,
          maxDocumentBytes: remainingDocumentBytes,
          ...(collection.signingProfileId === undefined
            ? {}
            : { signingProfileId: collection.signingProfileId }),
        },
      ],
      workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
    });
    if (result.status === 'rejected') {
      throw ApplicationFailure.nonRetryable(
        `Featured Note rejected: ${result.reason}`,
        'RemoteFeaturedNoteRejected',
      );
    }
    if (result.authorProfileId !== input.profileId) {
      throw ApplicationFailure.nonRetryable(
        'Featured Note rejected: existing post belongs to another profile',
        'RemoteFeaturedPostOwnerMismatch',
      );
    }
    remainingDocumentBytes -= result.documentBytes;
    postIds.push(result.postId);
  }

  await replaceRemoteFeaturedActivity({ profileId: input.profileId, postIds });
}
