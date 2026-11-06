import { randomUUID } from 'node:crypto';
import { db, first, Media as MediaTable, withPrimaryDatabase } from '@kosmo/core/db';
import { MediaSource, MediaState } from '@kosmo/core/enums';
import { ValidationError } from '@kosmo/core/error';
import { headNexusMediaUploadSource, isNexusMediaUpload } from '@kosmo/core/media-upload';
import { runWorkflow, temporalClient } from '@kosmo/core/temporal/client';
import { mediaUploadWorkflow } from '@kosmo/core/temporal/media-upload';
import { postCreateWorkflow } from '@kosmo/core/temporal/post-create';
import {
  POST_REQUEST_SEARCH_ATTRIBUTES,
  PostRequestStatus,
  postRequestWorkflow,
} from '@kosmo/core/temporal/post-request';
import {
  ApplicationFailure,
  WorkflowExecutionAlreadyStartedError,
  WorkflowNotFoundError,
} from '@temporalio/client';
import { and, eq, inArray } from 'drizzle-orm';
import { rethrowPostWorkflowFailure } from '../../post/mutation/errors';
import { prepareLocalPostInput } from '../../post/mutation/prepare-local-input';
import type {
  MediaUploadWorkflowInput,
  MediaUploadWorkflowResult,
} from '@kosmo/core/temporal/media-upload';
import type {
  PostAnalyticsPlatform,
  PostCreateWorkflowArgs,
} from '@kosmo/core/temporal/post-create';
import type { PostRequestSnapshot, PostRequestState } from '@kosmo/core/temporal/post-request';
import type { Workflow, WorkflowStartOptions } from '@temporalio/client';
import type { SessionContext } from '@/context';
import type { LocalPostMutationInput } from '../../post/mutation/prepare-local-input';

const unusableMedia = (index: number, message = '이미지를 다시 첨부해 주세요') =>
  new ValidationError(message, { field: `media.${index}` });

type SubmittedPostMedia = {
  readonly altText: string | null;
  readonly applyAiProhibitFilter: boolean;
  readonly mediaId: string;
};

type VerifiedAttachedMedia = SubmittedPostMedia & {
  readonly generateAltText: boolean;
  readonly state: MediaState;
  readonly storageReference: string | null;
};

type MediaUploadWorkflow = (input: MediaUploadWorkflowInput) => Promise<MediaUploadWorkflowResult>;

export type LocalPostSubmission =
  | {
      readonly postId: string;
      readonly profileId: string;
      readonly request: null;
    }
  | {
      readonly postId: null;
      readonly profileId: null;
      readonly request: PostRequestState;
    };

const getRetainedMediaUploadResult = async (
  mediaId: string,
  accountId: string,
): Promise<MediaUploadWorkflowResult | null> => {
  try {
    return await temporalClient.withDeadline(
      Date.now() + (mediaUploadWorkflow.timeoutMs ?? 30_000),
      () =>
        temporalClient.workflow
          .getHandle<MediaUploadWorkflow>(
            mediaUploadWorkflow.workflowIdFromArgs({ mediaId, accountId }),
          )
          .result(),
    );
  } catch (error) {
    if (error instanceof WorkflowNotFoundError) {
      return null;
    }
    throw error;
  }
};

const hasCompatibleMediaUploadFilter = (
  result: MediaUploadWorkflowResult | null,
  requestedFilter: boolean,
): boolean => {
  const appliedFilter = result?.applyAiProhibitFilter;
  return (
    (appliedFilter === undefined || appliedFilter === requestedFilter) &&
    (!requestedFilter || appliedFilter === true)
  );
};

const verifyAttachedMedia = async (
  accountId: string,
  submittedMedia: readonly SubmittedPostMedia[],
): Promise<readonly VerifiedAttachedMedia[]> => {
  const uniqueMediaIds = [...new Set(submittedMedia.map(({ mediaId }) => mediaId))];
  if (uniqueMediaIds.length === 0) {
    return [];
  }

  const rows = await withPrimaryDatabase(async () =>
    db
      .select({
        id: MediaTable.id,
        state: MediaTable.state,
        storageReference: MediaTable.storageReference,
        url: MediaTable.url,
      })
      .from(MediaTable)
      .where(
        and(
          inArray(MediaTable.id, uniqueMediaIds),
          eq(MediaTable.accountId, accountId),
          eq(MediaTable.source, MediaSource.LOCAL),
        ),
      ),
  );
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const verified: VerifiedAttachedMedia[] = [];

  for (const [index, mediaInput] of submittedMedia.entries()) {
    const media = rowsById.get(mediaInput.mediaId);
    if (!media) {
      throw unusableMedia(index, '첨부한 이미지를 다시 선택해 주세요');
    }

    if (media.state === MediaState.READY && media.url) {
      const workflowArgs = { mediaId: media.id, accountId };
      try {
        await runWorkflow(mediaUploadWorkflow, {
          args: [workflowArgs],
          updateArgs: [{ applyAiProhibitFilter: mediaInput.applyAiProhibitFilter }],
          mode: 'update',
        });
      } catch (error) {
        if (error instanceof ApplicationFailure && error.type === 'MediaUploadSelectionConflict') {
          throw unusableMedia(index);
        }
        if (
          !(error instanceof WorkflowNotFoundError) ||
          error.workflowId !== mediaUploadWorkflow.workflowIdFromArgs(workflowArgs)
        ) {
          throw error;
        }
        const result = await getRetainedMediaUploadResult(media.id, accountId);
        if (!hasCompatibleMediaUploadFilter(result, mediaInput.applyAiProhibitFilter)) {
          throw unusableMedia(index);
        }
      }
      verified.push({
        ...mediaInput,
        generateAltText: false,
        state: media.state,
        storageReference: media.storageReference,
      });
      continue;
    }

    if (
      media.state !== MediaState.UPLOADING ||
      media.storageReference === null ||
      !isNexusMediaUpload(media.storageReference)
    ) {
      throw unusableMedia(index);
    }

    try {
      await headNexusMediaUploadSource(media.storageReference);
    } catch (error) {
      if (!(error instanceof ValidationError)) {
        throw error;
      }
      throw unusableMedia(index, error.message);
    }

    verified.push({
      ...mediaInput,
      generateAltText: mediaInput.altText === null || mediaInput.altText.trim().length === 0,
      state: media.state,
      storageReference: media.storageReference,
    });
  }

  return verified;
};

const publishUploadingMedia = async (
  accountId: string,
  media: readonly VerifiedAttachedMedia[],
): Promise<readonly { readonly status: 'completed' | 'processing' }[]> =>
  Promise.all(
    media.flatMap((item, index) =>
      item.state === MediaState.UPLOADING
        ? [
            runWorkflow(mediaUploadWorkflow, {
              args: [
                {
                  mediaId: item.mediaId,
                  accountId,
                  applyAiProhibitFilter: item.applyAiProhibitFilter,
                  ...(item.generateAltText ? { generateAltText: true } : {}),
                },
              ],
              updateArgs: [{ applyAiProhibitFilter: item.applyAiProhibitFilter }],
              mode: 'update-with-start',
              workflowIdConflictPolicy: 'USE_EXISTING',
              workflowIdReusePolicy: 'REJECT_DUPLICATE',
            }).catch(async (error: unknown) => {
              if (
                error instanceof ApplicationFailure &&
                error.type === 'MediaUploadSelectionConflict'
              ) {
                throw unusableMedia(index);
              }
              const workflowArgs = { mediaId: item.mediaId, accountId };
              if (
                !(
                  error instanceof WorkflowExecutionAlreadyStartedError &&
                  error.workflowId === mediaUploadWorkflow.workflowIdFromArgs(workflowArgs) &&
                  error.workflowType === mediaUploadWorkflow.workflow
                )
              ) {
                throw error;
              }

              const readyMedia = await withPrimaryDatabase(async () =>
                db
                  .select({ state: MediaTable.state, url: MediaTable.url })
                  .from(MediaTable)
                  .where(
                    and(
                      eq(MediaTable.id, item.mediaId),
                      eq(MediaTable.accountId, accountId),
                      eq(MediaTable.source, MediaSource.LOCAL),
                    ),
                  )
                  .then(first),
              );
              if (!readyMedia || readyMedia.state !== MediaState.READY || !readyMedia.url) {
                throw error;
              }

              const result = await getRetainedMediaUploadResult(item.mediaId, accountId);
              if (!hasCompatibleMediaUploadFilter(result, item.applyAiProhibitFilter)) {
                throw unusableMedia(index);
              }
              return { status: 'completed' as const };
            }),
          ]
        : [],
    ),
  );

const startPostRequest = async (
  preparedInput: Awaited<ReturnType<typeof prepareLocalPostInput>>,
  submittedMedia: readonly VerifiedAttachedMedia[],
  analyticsPlatform?: PostAnalyticsPlatform,
): Promise<PostRequestState> => {
  const requestId = randomUUID();
  const snapshot: PostRequestSnapshot = {
    input: {
      ...preparedInput,
      media: submittedMedia.map(({ altText, applyAiProhibitFilter, generateAltText, mediaId }) => ({
        altText,
        applyNightshade: applyAiProhibitFilter,
        mediaId,
        ...(generateAltText ? { generateAltText: true } : {}),
      })),
    },
    requestId,
    submittedAt: new Date().toISOString(),
    ...(analyticsPlatform ? { analyticsPlatform } : {}),
  };
  const state: PostRequestState = {
    snapshot,
    status: PostRequestStatus.QUEUED,
  };

  try {
    await runWorkflow(postRequestWorkflow, {
      args: [snapshot],
      mode: 'start',
      workflowIdConflictPolicy: 'FAIL',
      workflowIdReusePolicy: 'REJECT_DUPLICATE',
      typedSearchAttributes: [
        {
          key: { name: POST_REQUEST_SEARCH_ATTRIBUTES.ownerAccountId, type: 'KEYWORD' },
          value: snapshot.input.accountId,
        },
        {
          key: { name: POST_REQUEST_SEARCH_ATTRIBUTES.profileId, type: 'KEYWORD' },
          value: snapshot.input.profileId,
        },
        {
          key: { name: POST_REQUEST_SEARCH_ATTRIBUTES.status, type: 'KEYWORD' },
          value: state.status,
        },
      ] satisfies NonNullable<WorkflowStartOptions<Workflow>['typedSearchAttributes']>,
    });
  } catch (error) {
    return rethrowPostWorkflowFailure(error);
  }

  return state;
};

export async function submitLocalPost(
  input: LocalPostMutationInput,
  ctx: SessionContext,
  analyticsPlatform?: PostAnalyticsPlatform,
): Promise<LocalPostSubmission> {
  const submittedInputMedia = input.media ?? [];
  if (
    new Set(submittedInputMedia.map(({ mediaId }) => mediaId.id)).size !==
    submittedInputMedia.length
  ) {
    throw new ValidationError('Post request media must be unique', { field: 'media' });
  }

  const submittedMedia = submittedInputMedia.map(
    ({ altText, applyAiProhibitFilter, mediaId }): SubmittedPostMedia => ({
      altText: altText ?? null,
      applyAiProhibitFilter: applyAiProhibitFilter ?? false,
      mediaId: mediaId.id,
    }),
  );

  const preparedInput = await prepareLocalPostInput(input, ctx);
  const media = await verifyAttachedMedia(ctx.session.accountId, submittedMedia);
  const publications = await publishUploadingMedia(ctx.session.accountId, media);
  const postInput = {
    ...preparedInput,
    media: media.map(({ altText, generateAltText, mediaId }) => ({
      altText,
      mediaId,
      ...(generateAltText ? { generateAltText: true } : {}),
    })),
  };

  if (publications.some(({ status }) => status === 'processing')) {
    return {
      postId: null,
      profileId: null,
      request: await startPostRequest(postInput, media, analyticsPlatform),
    };
  }

  const args: PostCreateWorkflowArgs = {
    input: postInput,
    revalidateAuthorization: true,
    requestId: randomUUID(),
    ...(analyticsPlatform ? { analyticsPlatform } : {}),
  };
  try {
    const result = await runWorkflow(postCreateWorkflow, {
      args: [args],
      mode: 'execute',
      workflowIdConflictPolicy: 'USE_EXISTING',
      workflowIdReusePolicy: 'REJECT_DUPLICATE',
    });
    if (result.status === 'rejected') {
      throw new Error('Local Post creation returned an unexpected rejection');
    }
    return {
      postId: result.postId,
      profileId: postInput.profileId,
      request: null,
    };
  } catch (error) {
    return rethrowPostWorkflowFailure(error);
  }
}
