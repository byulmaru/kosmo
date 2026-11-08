import { randomUUID } from 'node:crypto';
import {
  db,
  first,
  Instances,
  Media as MediaTable,
  Profiles,
  withPrimaryDatabase,
} from '@kosmo/core/db';
import { MediaSource, MediaState } from '@kosmo/core/enums';
import { ValidationError } from '@kosmo/core/error';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { isValidMediaPublicationRights } from '@kosmo/core/media-metadata';
import { headNexusMediaUploadSource, isNexusMediaUpload } from '@kosmo/core/media-upload';
import { runWorkflow, temporalClient } from '@kosmo/core/temporal/client';
import {
  mediaUploadWithMetadataWorkflow,
  mediaUploadWorkflow,
} from '@kosmo/core/temporal/media-upload';
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
import { formatRelativeHandle } from '@/profile/identity';
import { rethrowPostWorkflowFailure } from '../../post/mutation/errors';
import { prepareLocalPostInput } from '../../post/mutation/prepare-local-input';
import type { MediaPublicationMetadata, MediaPublicationRights } from '@kosmo/core/media-metadata';
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
  readonly rights?: MediaPublicationRights;
};

type VerifiedAttachedMedia = SubmittedPostMedia & {
  readonly publicationMetadata: MediaPublicationMetadata | null;
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

const samePublicationRights = (
  left: MediaPublicationRights | undefined,
  right: MediaPublicationRights | undefined,
): boolean =>
  left === undefined
    ? right === undefined
    : right !== undefined &&
      left.personal === right.personal &&
      left.noncommercial === right.noncommercial &&
      left.commercial === right.commercial;

type PublicationAuthor = {
  readonly attributionName: string;
  readonly attributionUrl: string;
};

const getPublicationAuthor = async (profileId: string): Promise<PublicationAuthor> => {
  const configuredLocalInstance = await resolveConfiguredLocalInstance();
  const profile = await withPrimaryDatabase(async () =>
    db
      .select({
        displayName: Profiles.displayName,
        domain: Instances.domain,
        handle: Profiles.handle,
        instanceId: Profiles.instanceId,
        joinedInstanceId: Instances.id,
      })
      .from(Profiles)
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(eq(Profiles.id, profileId))
      .limit(1)
      .then(first),
  );
  if (!profile || profile.instanceId !== profile.joinedInstanceId) {
    throw new ValidationError('Post author Profile is unavailable', { field: 'actorProfileId' });
  }

  const relativeHandle = formatRelativeHandle(
    { handle: profile.handle, instanceId: profile.instanceId },
    {
      configuredLocalInstance,
      profileInstance: { domain: profile.domain, id: profile.joinedInstanceId },
    },
  );
  const profileSegment = encodeURIComponent(relativeHandle).replace(/%40/gi, '@');
  return {
    attributionName: profile.displayName.trim() || relativeHandle,
    attributionUrl: new URL(profileSegment, `${configuredLocalInstance.canonicalOrigin}/`).href,
  };
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
        publicationMetadata: MediaTable.publicationMetadata,
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
      verified.push({
        ...mediaInput,
        publicationMetadata: media.publicationMetadata,
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
      publicationMetadata: media.publicationMetadata,
      state: media.state,
      storageReference: media.storageReference,
    });
  }

  return verified;
};

const verifyReadyMediaUploadFilter = async (
  accountId: string,
  media: readonly VerifiedAttachedMedia[],
): Promise<void> => {
  for (const [index, item] of media.entries()) {
    if (item.state !== MediaState.READY) {
      continue;
    }

    const workflowArgs = { mediaId: item.mediaId, accountId };
    try {
      await runWorkflow(mediaUploadWorkflow, {
        args: [workflowArgs],
        updateArgs: [{ applyAiProhibitFilter: item.applyAiProhibitFilter }],
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
      const result = await getRetainedMediaUploadResult(item.mediaId, accountId);
      if (!hasCompatibleMediaUploadFilter(result, item.applyAiProhibitFilter)) {
        throw unusableMedia(index);
      }
    }
  }
};

const createPublicationMetadata = (
  author: PublicationAuthor,
  rights: MediaPublicationRights | undefined,
): MediaPublicationMetadata => ({
  attributionName: author.attributionName,
  attributionUrl: author.attributionUrl,
  ...(rights === undefined ? {} : { rights }),
});

const verifyStoredPublicationRights = async (
  accountId: string,
  mediaId: string,
  expectedRights: MediaPublicationRights | undefined,
  index: number,
): Promise<void> => {
  const stored = await withPrimaryDatabase(async () =>
    db
      .select({ publicationMetadata: MediaTable.publicationMetadata })
      .from(MediaTable)
      .where(
        and(
          eq(MediaTable.id, mediaId),
          eq(MediaTable.accountId, accountId),
          eq(MediaTable.source, MediaSource.LOCAL),
        ),
      )
      .limit(1)
      .then(first),
  );
  if (
    !stored?.publicationMetadata ||
    !samePublicationRights(stored.publicationMetadata.rights, expectedRights)
  ) {
    throw unusableMedia(index);
  }
};

const publishUploadingMedia = async (
  accountId: string,
  media: readonly VerifiedAttachedMedia[],
  publicationMetadataByMediaId: ReadonlyMap<string, MediaPublicationMetadata>,
): Promise<readonly { readonly status: 'completed' | 'processing' }[]> =>
  Promise.all(
    media.flatMap((item, index) => {
      if (item.state !== MediaState.UPLOADING) {
        return [];
      }

      const publicationMetadata = publicationMetadataByMediaId.get(item.mediaId)!;
      const workflowInput = {
        mediaId: item.mediaId,
        accountId,
        applyAiProhibitFilter: item.applyAiProhibitFilter,
        publicationMetadata,
      };
      const workflowId = mediaUploadWithMetadataWorkflow.workflowIdFromArgs(workflowInput);

      return [
        runWorkflow(mediaUploadWithMetadataWorkflow, {
          args: [workflowInput],
          updateArgs: [{ applyAiProhibitFilter: item.applyAiProhibitFilter }],
          mode: 'update-with-start',
          workflowIdConflictPolicy: 'USE_EXISTING',
          workflowIdReusePolicy: 'REJECT_DUPLICATE',
        })
          .catch(async (error: unknown) => {
            if (
              error instanceof ApplicationFailure &&
              (error.type === 'MediaUploadSelectionConflict' ||
                error.type === 'MediaUploadMetadataConflict')
            ) {
              throw unusableMedia(index);
            }
            if (
              !(
                error instanceof WorkflowExecutionAlreadyStartedError &&
                error.workflowId === workflowId &&
                error.workflowType === mediaUploadWithMetadataWorkflow.workflow
              )
            ) {
              throw error;
            }

            const readyMedia = await withPrimaryDatabase(async () =>
              db
                .select({
                  publicationMetadata: MediaTable.publicationMetadata,
                  state: MediaTable.state,
                  url: MediaTable.url,
                })
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
          })
          .then(async (result) => {
            await verifyStoredPublicationRights(accountId, item.mediaId, item.rights, index);
            return result;
          }),
      ];
    }),
  );

const startPostRequest = async (
  preparedInput: Awaited<ReturnType<typeof prepareLocalPostInput>>,
  submittedMedia: readonly SubmittedPostMedia[],
  analyticsPlatform?: PostAnalyticsPlatform,
): Promise<PostRequestState> => {
  const requestId = randomUUID();
  const snapshot: PostRequestSnapshot = {
    input: {
      ...preparedInput,
      media: submittedMedia.map(({ altText, applyAiProhibitFilter, mediaId }) => ({
        altText,
        applyNightshade: applyAiProhibitFilter,
        mediaId,
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

  for (const [index, media] of submittedInputMedia.entries()) {
    if (media.rights && !isValidMediaPublicationRights(media.rights)) {
      throw new ValidationError('Media use permissions are invalid', {
        field: `media.${index}.rights`,
      });
    }
  }

  const submittedMedia = submittedInputMedia.map(
    ({ altText, applyAiProhibitFilter, mediaId, rights }): SubmittedPostMedia => ({
      altText: altText ?? null,
      applyAiProhibitFilter: applyAiProhibitFilter ?? false,
      mediaId: mediaId.id,
      ...(rights == null ? {} : { rights }),
    }),
  );

  const preparedInput = await prepareLocalPostInput(input, ctx);
  const media = await verifyAttachedMedia(ctx.session.accountId, submittedMedia);
  const hasUploadingMedia = media.some(({ state }) => state === MediaState.UPLOADING);
  const author = hasUploadingMedia ? await getPublicationAuthor(preparedInput.profileId) : null;
  const publicationMetadataByMediaId = new Map<string, MediaPublicationMetadata>();
  for (const [index, item] of media.entries()) {
    if (item.state !== MediaState.UPLOADING) {
      continue;
    }

    if (item.publicationMetadata !== null) {
      if (!samePublicationRights(item.publicationMetadata.rights, item.rights)) {
        throw unusableMedia(index);
      }
      publicationMetadataByMediaId.set(item.mediaId, item.publicationMetadata);
      continue;
    }

    if (author === null) {
      throw new Error('Uploading Media requires a publication author');
    }
    publicationMetadataByMediaId.set(item.mediaId, createPublicationMetadata(author, item.rights));
  }

  await verifyReadyMediaUploadFilter(ctx.session.accountId, media);
  const publications = await publishUploadingMedia(
    ctx.session.accountId,
    media,
    publicationMetadataByMediaId,
  );

  if (publications.some(({ status }) => status === 'processing')) {
    return {
      postId: null,
      profileId: null,
      request: await startPostRequest(preparedInput, submittedMedia, analyticsPlatform),
    };
  }

  const args: PostCreateWorkflowArgs = {
    input: preparedInput,
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
      profileId: preparedInput.profileId,
      request: null,
    };
  } catch (error) {
    return rethrowPostWorkflowFailure(error);
  }
}
