import '@kosmo/core/polyfill';

import {
  ActivityPubPosts,
  db,
  first,
  getDatabaseConnection,
  Media,
  PostContents,
  Posts,
  withPrimaryDatabase,
} from '@kosmo/core/db';
import { MediaSource, MediaState } from '@kosmo/core/enums';
import { temporalClient } from '@kosmo/core/temporal/client';
import { mediaUploadWorkflow } from '@kosmo/core/temporal/media-upload';
import { ApplicationFailure, Context } from '@temporalio/activity';
import {
  WorkflowContinuedAsNewError,
  WorkflowFailedError,
  WorkflowNotFoundError,
} from '@temporalio/client';
import { and, eq, inArray } from 'drizzle-orm';
import type { MediaUploadWorkflowInput } from '@kosmo/core/temporal/media-upload';

export type GetPostRequestMediaStateActivityInput = {
  readonly accountId: string;
  readonly mediaIds: readonly string[];
};

export type GetPostRequestMediaStateActivityResult = {
  readonly readyMediaIds: readonly string[];
};

const invalidPostRequestMedia = () =>
  ApplicationFailure.nonRetryable(
    'Post request media is missing, changed, or not owned by this Account',
    'PostRequestMediaInvalid',
  );

export const getPostRequestMediaStateActivity = async ({
  accountId,
  mediaIds,
}: GetPostRequestMediaStateActivityInput): Promise<GetPostRequestMediaStateActivityResult> => {
  if (mediaIds.length === 0) {
    return { readyMediaIds: [] };
  }

  if (new Set(mediaIds).size !== mediaIds.length) {
    throw invalidPostRequestMedia();
  }

  const media = await withPrimaryDatabase(() =>
    getDatabaseConnection()
      .select({ id: Media.id, source: Media.source, state: Media.state })
      .from(Media)
      .where(and(eq(Media.accountId, accountId), inArray(Media.id, mediaIds))),
  );

  if (
    media.length !== mediaIds.length ||
    media.some(
      ({ source, state }) =>
        source !== MediaSource.LOCAL ||
        (state !== MediaState.UPLOADING && state !== MediaState.READY),
    )
  ) {
    throw invalidPostRequestMedia();
  }

  const readyMediaIds = new Set(
    media.filter(({ state }) => state === MediaState.READY).map(({ id }) => id),
  );
  return { readyMediaIds: mediaIds.filter((mediaId) => readyMediaIds.has(mediaId)) };
};

const MEDIA_UPLOAD_WORKFLOW_WAIT_MS = 76 * 60 * 60 * 1000;
const MEDIA_UPLOAD_WORKFLOW_PROBE_TIMEOUT_MS = 5_000;

export type WaitForPostRequestMediaUploadActivityInput = Pick<
  MediaUploadWorkflowInput,
  'accountId' | 'mediaId'
>;

export const waitForPostRequestMediaUploadActivity = async ({
  accountId,
  mediaId,
}: WaitForPostRequestMediaUploadActivityInput): Promise<void> => {
  const state = await getPostRequestMediaStateActivity({ accountId, mediaIds: [mediaId] });
  if (state.readyMediaIds.includes(mediaId)) {
    return;
  }

  const context = Context.current();
  const heartbeat = setInterval(() => {
    try {
      context.heartbeat();
    } catch {
      // Cancellation is reported through the Activity cancellation signal below.
    }
  }, 20_000);

  try {
    await Promise.race([
      temporalClient.withDeadline(Date.now() + MEDIA_UPLOAD_WORKFLOW_WAIT_MS, () =>
        temporalClient.withAbortSignal(context.cancellationSignal, () =>
          temporalClient.workflow
            .getHandle(mediaUploadWorkflow.workflowIdFromArgs({ accountId, mediaId }))
            .result(),
        ),
      ),
      context.cancelled,
    ]);
  } finally {
    clearInterval(heartbeat);
  }
};

const isClosedMediaUploadStatus = (status: string): boolean =>
  status === 'COMPLETED' ||
  status === 'FAILED' ||
  status === 'CANCELLED' ||
  status === 'TERMINATED' ||
  status === 'TIMED_OUT';

const pendingPostRequestMediaUpload = (): ApplicationFailure =>
  ApplicationFailure.create({
    category: 'BENIGN',
    message: 'Media upload is still running',
    nonRetryable: false,
    type: 'PostRequestMediaUploadPending',
  });

const failedPostRequestMediaUpload = (error: Error): ApplicationFailure =>
  ApplicationFailure.create({
    cause: error,
    message: error.message,
    nonRetryable: true,
    type: error.name,
  });

export const checkPostRequestMediaUploadActivity = async ({
  accountId,
  mediaId,
}: WaitForPostRequestMediaUploadActivityInput): Promise<void> => {
  const initialState = await getPostRequestMediaStateActivity({ accountId, mediaIds: [mediaId] });
  if (initialState.readyMediaIds.includes(mediaId)) {
    return;
  }

  const context = Context.current();
  const workflowId = mediaUploadWorkflow.workflowIdFromArgs({ accountId, mediaId });
  try {
    await temporalClient.withDeadline(Date.now() + MEDIA_UPLOAD_WORKFLOW_PROBE_TIMEOUT_MS, () =>
      temporalClient.withAbortSignal(context.cancellationSignal, async () => {
        const description = await temporalClient.workflow.getHandle(workflowId).describe();
        if (!isClosedMediaUploadStatus(description.status.name)) {
          throw pendingPostRequestMediaUpload();
        }

        try {
          await temporalClient.workflow
            .getHandle(workflowId, description.runId)
            .result({ followRuns: false });
        } catch (error) {
          if (error instanceof WorkflowContinuedAsNewError) {
            throw pendingPostRequestMediaUpload();
          }
          if (error instanceof WorkflowFailedError) {
            throw failedPostRequestMediaUpload(error);
          }
          throw error;
        }
      }),
    );
  } catch (error) {
    if (error instanceof WorkflowNotFoundError) {
      throw failedPostRequestMediaUpload(error);
    }
    throw error;
  }

  const completedState = await getPostRequestMediaStateActivity({ accountId, mediaIds: [mediaId] });
  if (!completedState.readyMediaIds.includes(mediaId)) {
    throw ApplicationFailure.nonRetryable(
      'Media upload completed without making the Media ready',
      'PostRequestMediaUploadInvalidResult',
    );
  }
};

export type ReconcilePostRequestActivityInput = {
  readonly accountId: string;
  readonly postId: string;
  readonly profileId: string;
};

export type ReconcilePostRequestActivityResult =
  | { readonly status: 'ABSENT' }
  | { readonly status: 'CONFLICT' }
  | { readonly postId: string; readonly status: 'PUBLISHED' };

export const reconcilePostRequestActivity = async ({
  accountId,
  postId,
  profileId,
}: ReconcilePostRequestActivityInput): Promise<ReconcilePostRequestActivityResult> => {
  const existing = await db
    .select({
      actorAccountId: Posts.actorAccountId,
      contentPostId: PostContents.postId,
      currentContentId: Posts.currentContentId,
      id: Posts.id,
      mappedUri: ActivityPubPosts.uri,
      profileId: Posts.profileId,
    })
    .from(Posts)
    .leftJoin(PostContents, eq(PostContents.id, Posts.currentContentId))
    .leftJoin(ActivityPubPosts, eq(ActivityPubPosts.postId, Posts.id))
    .where(eq(Posts.id, postId))
    .limit(1)
    .then(first);

  if (!existing) {
    return { status: 'ABSENT' };
  }

  if (
    existing.actorAccountId !== accountId ||
    existing.contentPostId !== existing.id ||
    existing.currentContentId === null ||
    existing.mappedUri !== null ||
    existing.profileId !== profileId
  ) {
    return { status: 'CONFLICT' };
  }

  return { postId: existing.id, status: 'PUBLISHED' };
};
