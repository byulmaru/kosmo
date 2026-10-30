import { createHash } from 'node:crypto';
import { db, Media as MediaTable } from '@kosmo/core/db';
import { MediaSource, MediaState } from '@kosmo/core/enums';
import { ConflictError, ValidationError } from '@kosmo/core/error';
import { headNexusMediaUploadSource, isNexusMediaUpload } from '@kosmo/core/media-upload';
import { normalizePostContentPlainText } from '@kosmo/core/post-content';
import { runWorkflow } from '@kosmo/core/temporal/client';
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
    return;
  }

  const rows = await db
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
    );
  const rowsById = new Map(rows.map((row) => [row.id, row]));

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

    try {
      await headNexusMediaUploadSource(media.storageReference);
    } catch (error) {
      if (!(error instanceof ValidationError)) {
        throw error;
      }
      throw unusableMedia(index, error.message);
    }
  }
};

export async function submitPostRequest(
  input: LocalPostMutationInput,
  requestId: string,
  ctx: SessionContext,
): Promise<PostRequestState> {
  const submittedMedia = input.media ?? [];
  if (new Set(submittedMedia.map(({ mediaId }) => mediaId.id)).size !== submittedMedia.length) {
    throw new ValidationError('Post request media must be unique', { field: 'media' });
  }

  const actorProfileId = input.actorProfileId?.id ?? ctx.session.profile?.id;
  const submissionFingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        accountId: ctx.session.accountId,
        actorProfileId,
        bodyText: normalizePostContentPlainText(input.bodyText),
        contentWarning: normalizePostContentPlainText(input.contentWarning ?? '') || null,
        media: submittedMedia.map(({ altText, applyNightshade, mediaId }) => ({
          altText: altText ?? null,
          applyNightshade: applyNightshade ?? false,
          mediaId: mediaId.id,
        })),
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
  const existing = await loadPostRequestStateForAccount({
    accountId: ctx.session.accountId,
    requestId,
  });
  if (existing) {
    return existingSubmission(existing, submissionFingerprint);
  }

  const preparedInput = await prepareLocalPostInput(input, ctx);
  const media = submittedMedia.map(({ altText, applyNightshade, mediaId }) => ({
    altText: altText ?? null,
    applyNightshade: applyNightshade ?? false,
    mediaId: mediaId.id,
  }));
  await verifyAttachedMedia(
    ctx.session.accountId,
    media.map(({ mediaId }) => mediaId),
  );

  const snapshot: PostRequestSnapshot = {
    input: { ...preparedInput, media },
    requestId,
    submissionFingerprint,
    submittedAt: new Date().toISOString(),
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
    return state;
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
}
