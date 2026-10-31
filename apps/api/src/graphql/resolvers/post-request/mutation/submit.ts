import { createHash, randomUUID } from 'node:crypto';
import { db, Media as MediaTable, withPrimaryDatabase } from '@kosmo/core/db';
import { MediaSource, MediaState } from '@kosmo/core/enums';
import { ConflictError, KosmoError, ValidationError } from '@kosmo/core/error';
import { headNexusMediaUploadSource, isNexusMediaUpload } from '@kosmo/core/media-upload';
import { normalizePostContentPlainText } from '@kosmo/core/post-content';
import { runWorkflow, temporalClient } from '@kosmo/core/temporal/client';
import {
  POST_REQUEST_SEARCH_ATTRIBUTES,
  PostRequestStatus,
  postRequestWorkflow,
  postRequestWorkflowId,
} from '@kosmo/core/temporal/post-request';
import { WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { and, eq, inArray } from 'drizzle-orm';
import { rethrowPostWorkflowFailure } from '../../post/mutation/errors';
import { prepareLocalPostInput } from '../../post/mutation/prepare-local-input';
import { loadPostRequestStateForAccount } from '../state';
import type { PostAnalyticsPlatform } from '@kosmo/core/temporal/post-create';
import type { PostRequestSnapshot, PostRequestState } from '@kosmo/core/temporal/post-request';
import type { Workflow, WorkflowStartOptions } from '@temporalio/client';
import type { SessionContext } from '@/context';
import type { LocalPostMutationInput } from '../../post/mutation/prepare-local-input';

const existingSubmission = (
  current: PostRequestState,
  submissionFingerprint: string,
): PostRequestState => {
  if (current.snapshot.submissionFingerprint !== submissionFingerprint) {
    throw new ConflictError({
      message: 'This request ID already belongs to different post content',
      field: 'requestId',
    });
  }
  return current;
};

const unusableMedia = (index: number, message = '이미지를 다시 첨부해 주세요') =>
  new ValidationError(message, { field: `media.${index}` });

const verifyAttachedMedia = async (accountId: string, mediaIds: readonly string[]) => {
  const uniqueMediaIds = [...new Set(mediaIds)];
  if (uniqueMediaIds.length === 0) {
    return false;
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
  let hasUploadingMedia = false;

  for (const [index, mediaId] of mediaIds.entries()) {
    const media = rowsById.get(mediaId);
    if (!media) {
      throw unusableMedia(index, '첨부한 이미지를 다시 선택해 주세요');
    }

    if (media.state === MediaState.READY && media.url) {
      continue;
    }

    if (
      media.state !== MediaState.UPLOADING ||
      media.storageReference === null ||
      !isNexusMediaUpload(media.storageReference)
    ) {
      throw unusableMedia(index);
    }

    hasUploadingMedia = true;
    try {
      await headNexusMediaUploadSource(media.storageReference);
    } catch (error) {
      if (!(error instanceof ValidationError)) {
        throw error;
      }
      throw unusableMedia(index, error.message);
    }
  }

  return hasUploadingMedia;
};

type PostRequestWorkflow = (args: PostRequestSnapshot) => Promise<PostRequestState>;

export async function waitForPostRequestResult(
  accountId: string,
  request: PostRequestState,
): Promise<PostRequestState> {
  const state =
    request.status === PostRequestStatus.PUBLISHED
      ? request
      : await temporalClient
          .withDeadline(Date.now() + 30_000, () =>
            temporalClient.workflow
              .getHandle<PostRequestWorkflow>(
                postRequestWorkflowId(accountId, request.snapshot.requestId),
              )
              .result(),
          )
          .catch(rethrowPostWorkflowFailure);

  if (state.status === PostRequestStatus.PUBLISHED) {
    if (!state.result?.postId) {
      throw new Error('Published Post request has no Post ID');
    }

    return state;
  }

  if (state.status === PostRequestStatus.FAILED) {
    if (state.error && state.error.code !== 'INTERNAL_SERVER_ERROR') {
      throw new KosmoError({ code: state.error.code, message: state.error.message });
    }
    throw new Error(state.error?.message ?? 'Post request failed');
  }

  if (state.status === PostRequestStatus.CANCELLED) {
    throw new ConflictError({ message: 'Post request is already finished' });
  }

  throw new Error(`Post request completed with unexpected status: ${state.status}`);
}

export async function submitPostRequest(
  input: LocalPostMutationInput,
  clientRequestId: string | null | undefined,
  ctx: SessionContext,
  analyticsPlatform?: PostAnalyticsPlatform,
): Promise<PostRequestState> {
  const requestId = clientRequestId ?? randomUUID();
  const submittedMedia = input.media ?? [];
  if (new Set(submittedMedia.map(({ mediaId }) => mediaId.id)).size !== submittedMedia.length) {
    throw new ValidationError('Post request media must be unique', { field: 'media' });
  }

  const media = submittedMedia.map(
    ({ altText, applyAiProhibitFilter, applyNightshade, mediaId }) => ({
      altText: altText ?? null,
      applyNightshade: applyAiProhibitFilter ?? applyNightshade ?? false,
      mediaId: mediaId.id,
    }),
  );
  const actorProfileId = input.actorProfileId?.id ?? ctx.session.profile?.id;
  const submissionFingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        accountId: ctx.session.accountId,
        actorProfileId,
        bodyText: normalizePostContentPlainText(input.bodyText),
        contentWarning: normalizePostContentPlainText(input.contentWarning ?? '') || null,
        media,
        mentions: (input.mentions ?? []).map(({ end, profileId, start }) => ({
          end,
          profileId: profileId.id,
          start,
        })),
        replyParentId: input.replyParentId?.id ?? null,
        repostSourceId: input.repostSourceId?.id ?? null,
        sensitiveMedia: input.sensitiveMedia ?? false,
        visibility: input.visibility,
      }),
    )
    .digest('hex');
  if (clientRequestId != null) {
    const existing = await loadPostRequestStateForAccount({
      accountId: ctx.session.accountId,
      requestId,
    });
    if (existing) {
      return existingSubmission(existing, submissionFingerprint);
    }
  }

  const preparedInput = await prepareLocalPostInput(input, ctx);
  const hasUploadingMedia = await verifyAttachedMedia(
    ctx.session.accountId,
    media.map(({ mediaId }) => mediaId),
  );

  const snapshot: PostRequestSnapshot = {
    input: { ...preparedInput, media },
    requestId,
    submissionFingerprint,
    submittedAt: new Date().toISOString(),
    ...(analyticsPlatform ? { analyticsPlatform } : {}),
  };
  const state: PostRequestState = {
    snapshot,
    status: PostRequestStatus.QUEUED,
  };
  const workflowId = postRequestWorkflowId(ctx.session.accountId, requestId);

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
    if (
      !(error instanceof WorkflowExecutionAlreadyStartedError) ||
      error.workflowId !== workflowId
    ) {
      return rethrowPostWorkflowFailure(error);
    }

    const current = await loadPostRequestStateForAccount({
      accountId: ctx.session.accountId,
      requestId,
    });
    if (!current) {
      throw new Error('Unable to confirm post request status');
    }
    return existingSubmission(current, submissionFingerprint);
  }

  return hasUploadingMedia ? state : waitForPostRequestResult(ctx.session.accountId, state);
}
