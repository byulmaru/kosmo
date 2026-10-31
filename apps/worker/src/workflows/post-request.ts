import { PostVisibility } from '@kosmo/core/enums';
import { mediaUploadWorkflow } from '@kosmo/core/temporal/media-upload';
import { postCreateWorkflowV2 } from '@kosmo/core/temporal/post-create';
import {
  POST_REQUEST_CANCEL_UPDATE,
  POST_REQUEST_SEARCH_ATTRIBUTES,
  POST_REQUEST_STATE_QUERY,
  PostRequestStatus,
} from '@kosmo/core/temporal/post-request';
import {
  ApplicationFailure,
  CancellationScope,
  ChildWorkflowCancellationType,
  createNexusServiceClient,
  defineQuery,
  defineUpdate,
  NexusOperationCancellationType,
  ParentClosePolicy,
  patched,
  proxyActivities,
  setHandler,
  sleep,
  upsertSearchAttributes,
  WorkflowIdReusePolicy,
  workflowInfo,
} from '@temporalio/workflow';
import { z } from 'zod';
import { mediaUploadService } from '../nexus/media-upload-service';
import { workflowActivityOptions } from './activity-options';
import { runChildWorkflow } from './child';
import { startPostCreateEffects } from './post-create';
import type { ErrorCode } from '@kosmo/core/error';
import type { PostCreateWorkflowResult } from '@kosmo/core/temporal/post-create';
import type {
  PostRequestSnapshot,
  PostRequestState,
  PostRequestWorkflowArgs,
} from '@kosmo/core/temporal/post-request';
import type * as activities from '../activities';

const workflowArgsSchema = z
  .object({
    analyticsPlatform: z.enum(['web', 'native']).optional(),
    input: z.object({
      accountId: z.uuid(),
      bodyText: z.string(),
      contentWarning: z.string().nullable().optional(),
      media: z
        .array(
          z.object({
            altText: z.string().nullable(),
            applyNightshade: z.boolean().optional(),
            mediaId: z.uuid(),
          }),
        )
        .optional(),
      mentions: z
        .array(
          z.object({
            end: z.number().int(),
            handle: z.string(),
            profileId: z.uuid(),
            relativeHandle: z.string(),
            start: z.number().int(),
          }),
        )
        .optional(),
      origin: z.literal('LOCAL'),
      profileId: z.uuid(),
      replyParentId: z.uuid().optional(),
      repostSourceId: z.uuid().optional(),
      sensitiveMedia: z.boolean().optional(),
      visibility: z.enum(PostVisibility),
    }),
    mediaProcessing: z
      .array(
        z.object({
          applyNightshade: z.boolean(),
          mediaId: z.uuid(),
        }),
      )
      .optional(),
    postId: z.uuid().optional(),
    requestId: z.uuid(),
    submissionFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    submittedAt: z.iso.datetime(),
  })
  .superRefine(({ input, mediaProcessing }, context) => {
    const inputMedia = input.media ?? [];
    const inputMediaIds = inputMedia.map(({ mediaId }) => mediaId);
    if (mediaProcessing !== undefined) {
      const processingMediaIds = mediaProcessing.map(({ mediaId }) => mediaId);
      if (
        inputMediaIds.length !== processingMediaIds.length ||
        new Set(inputMediaIds).size !== inputMediaIds.length ||
        new Set(processingMediaIds).size !== processingMediaIds.length ||
        inputMediaIds.some((mediaId) => !processingMediaIds.includes(mediaId))
      ) {
        context.addIssue({
          code: 'custom',
          path: ['mediaProcessing'],
          message: 'Post request media processing must match its media snapshot',
        });
      }
      return;
    }

    if (new Set(inputMediaIds).size !== inputMediaIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['input', 'media'],
        message: 'Post request media processing must match its media snapshot',
      });
    }
    if (inputMedia.some(({ applyNightshade }) => applyNightshade === undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['input', 'media'],
        message: 'Post request media must include processing settings',
      });
    }
  });

const { generatePostIdActivity, getPostRequestMediaStateActivity, reconcilePostRequestActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);
const { waitForPostRequestMediaUploadActivity } = proxyActivities<typeof activities>({
  ...workflowActivityOptions,
  heartbeatTimeout: '1 minute',
  scheduleToCloseTimeout: '76 hours',
  startToCloseTimeout: '76 hours',
});
const { checkPostRequestMediaUploadActivity } = proxyActivities<typeof activities>({
  retry: {
    backoffCoefficient: 1,
    initialInterval: '5 seconds',
    maximumAttempts: 0,
    maximumInterval: '5 seconds',
  },
  scheduleToCloseTimeout: '76 hours',
  startToCloseTimeout: '10 seconds',
});

const queryState = defineQuery<PostRequestState>(POST_REQUEST_STATE_QUERY);
const cancelRequest = defineUpdate<PostRequestState>(POST_REQUEST_CANCEL_UPDATE);
const domainErrorCodes: readonly ErrorCode[] = [
  'CONFLICT',
  'NOT_FOUND',
  'PERMISSION_DENIED',
  'PROFILE_LIMIT_EXCEEDED',
  'VALIDATION',
];

const parseInput = (
  value: unknown,
): {
  readonly snapshot: PostRequestSnapshot;
  readonly uploadMediaIds: readonly string[];
} => {
  const parsed = workflowArgsSchema.safeParse(value);
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable(
      parsed.error.issues[0]?.message ?? 'Post request input is invalid',
      'PostRequestInputInvalid',
    );
  }
  const { media: inputMedia, ...inputWithoutMedia } = parsed.data.input;
  const legacyMediaProcessing = parsed.data.mediaProcessing;
  const legacyNightshadeByMediaId = new Map(
    legacyMediaProcessing?.map(({ applyNightshade, mediaId }) => [mediaId, applyNightshade]),
  );
  const snapshot: PostRequestSnapshot = {
    ...(parsed.data.analyticsPlatform === undefined
      ? {}
      : { analyticsPlatform: parsed.data.analyticsPlatform }),
    input: {
      ...inputWithoutMedia,
      ...(inputMedia === undefined
        ? {}
        : {
            media: inputMedia.map(({ altText, applyNightshade, mediaId }) => ({
              altText,
              applyNightshade:
                legacyMediaProcessing === undefined
                  ? (applyNightshade ?? false)
                  : (legacyNightshadeByMediaId.get(mediaId) ?? false),
              mediaId,
            })),
          }),
    },
    ...(parsed.data.postId === undefined ? {} : { postId: parsed.data.postId }),
    requestId: parsed.data.requestId,
    ...(parsed.data.submissionFingerprint === undefined
      ? {}
      : { submissionFingerprint: parsed.data.submissionFingerprint }),
    submittedAt: parsed.data.submittedAt,
  };

  return {
    snapshot,
    uploadMediaIds:
      legacyMediaProcessing?.map(({ mediaId }) => mediaId) ??
      inputMedia?.map(({ mediaId }) => mediaId) ??
      [],
  };
};

const upsertPostRequestSearchAttributes = (
  snapshot: PostRequestSnapshot,
  status: PostRequestState['status'],
): void => {
  upsertSearchAttributes([
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
      value: status,
    },
  ]);
};

const findApplicationFailure = (error: unknown): ApplicationFailure | undefined => {
  let current = error;
  while (current instanceof Error) {
    if (current instanceof ApplicationFailure) {
      return current;
    }
    current = current.cause;
  }
  return undefined;
};

const failureDetails = (
  error: unknown,
): {
  readonly code: ErrorCode | 'INTERNAL_SERVER_ERROR';
  readonly message: string;
} => {
  const applicationFailure = findApplicationFailure(error);
  if (applicationFailure && domainErrorCodes.includes(applicationFailure.type as ErrorCode)) {
    return {
      code: applicationFailure.type as ErrorCode,
      message: applicationFailure.message,
    };
  }
  return {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'The post request could not be completed',
  };
};

const isKnownDomainFailure = (
  failure: ApplicationFailure | undefined,
): failure is ApplicationFailure =>
  failure !== undefined && domainErrorCodes.includes(failure.type as ErrorCode);

const isWorkflowAlreadyStarted = (error: unknown): boolean => {
  let current = error;
  while (current instanceof Error) {
    if (current.name === 'WorkflowExecutionAlreadyStartedError') {
      return true;
    }
    current = current.cause;
  }
  return false;
};

const isTerminalStatus = (status: PostRequestState['status']): boolean =>
  status === PostRequestStatus.CANCELLED ||
  status === PostRequestStatus.FAILED ||
  status === PostRequestStatus.PUBLISHED;

const uploadMedia = async (
  snapshot: PostRequestSnapshot,
  uploadMediaIds: readonly string[],
  isCancelled: () => boolean,
  setCancellationScope: (scope: CancellationScope | undefined) => void,
): Promise<void> => {
  if (uploadMediaIds.length === 0) {
    return;
  }

  const mediaById = new Map(
    (snapshot.input.media ?? []).map((media) => [media.mediaId, media] as const),
  );
  const ready = await getPostRequestMediaStateActivity({
    accountId: snapshot.input.accountId,
    mediaIds: uploadMediaIds,
  });
  for (const mediaId of uploadMediaIds) {
    if (isCancelled()) {
      return;
    }
    if (ready.readyMediaIds.includes(mediaId)) {
      continue;
    }

    const media = mediaById.get(mediaId)!;
    const childArgs = {
      accountId: snapshot.input.accountId,
      applyNightshade: media.applyNightshade,
      mediaId,
    };
    const cancellationScope = new CancellationScope();
    setCancellationScope(cancellationScope);
    try {
      if (patched('post-request-media-nexus-v1')) {
        const client = createNexusServiceClient({
          endpoint: `${workflowInfo().namespace}-media-upload`,
          service: mediaUploadService,
        });
        await cancellationScope.run(() =>
          client.executeOperation('processUpload', childArgs, {
            cancellationType: NexusOperationCancellationType.ABANDON,
            scheduleToCloseTimeout: '76 hours',
          }),
        );
      } else {
        try {
          await cancellationScope.run(() =>
            runChildWorkflow(mediaUploadWorkflow, {
              args: [childArgs],
              cancellationType: ChildWorkflowCancellationType.ABANDON,
              mode: 'execute',
              parentClosePolicy: ParentClosePolicy.ABANDON,
              workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
            }),
          );
        } catch (error) {
          if (!isWorkflowAlreadyStarted(error)) {
            throw error;
          }
          if (patched('post-request-media-retry-poll-v1')) {
            await cancellationScope.run(() =>
              checkPostRequestMediaUploadActivity({
                accountId: snapshot.input.accountId,
                mediaId,
              }),
            );
          } else {
            await cancellationScope.run(() =>
              waitForPostRequestMediaUploadActivity({
                accountId: snapshot.input.accountId,
                mediaId,
              }),
            );
          }
        }
      }
    } catch (error) {
      if (!patched('post-request-media-ready-recovery-v1') || isCancelled()) {
        throw error;
      }

      let mediaIsReady = false;
      try {
        const currentMedia = await cancellationScope.run(() =>
          getPostRequestMediaStateActivity({
            accountId: snapshot.input.accountId,
            mediaIds: [mediaId],
          }),
        );
        mediaIsReady = currentMedia.readyMediaIds.includes(mediaId);
      } catch {
        // Keep the original child or join failure if the readiness recheck fails.
      }
      if (!mediaIsReady) {
        throw error;
      }
    } finally {
      setCancellationScope(undefined);
    }
    if (isCancelled()) {
      return;
    }
  }
};

const createPost = async (
  snapshot: PostRequestSnapshot & { readonly postId: string },
): Promise<PostCreateWorkflowResult> => {
  const { media } = snapshot.input;
  return runChildWorkflow(postCreateWorkflowV2, {
    args: [
      {
        input: {
          ...snapshot.input,
          ...(media === undefined
            ? {}
            : { media: media.map(({ altText, mediaId }) => ({ altText, mediaId })) }),
        },
        ...(snapshot.analyticsPlatform !== undefined &&
        patched('post-request-create-analytics-platform-v1')
          ? { analyticsPlatform: snapshot.analyticsPlatform }
          : {}),
        postId: snapshot.postId,
        revalidateAuthorization: true,
        requestId: workflowInfo().runId,
      },
    ],
    mode: 'execute',
    workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
  });
};

export async function postRequestWorkflow(
  input: PostRequestWorkflowArgs,
): Promise<PostRequestState> {
  const { snapshot: parsedSnapshot, uploadMediaIds } = parseInput(input);
  let snapshot = parsedSnapshot;
  let state: PostRequestState = { snapshot, status: PostRequestStatus.QUEUED };
  let activeMediaCancellationScope: CancellationScope | undefined;
  const setStatus = (
    status: PostRequestState['status'],
    details: Pick<PostRequestState, 'error' | 'result'> = {},
  ): void => {
    state = { snapshot, status, ...details };
    upsertPostRequestSearchAttributes(snapshot, status);
  };

  setHandler(queryState, () => state);
  setHandler(cancelRequest, () => {
    if (
      state.status === PostRequestStatus.PUBLISHING ||
      state.status === PostRequestStatus.CONFIRMING ||
      isTerminalStatus(state.status)
    ) {
      return state;
    }
    setStatus(PostRequestStatus.CANCELLED);
    activeMediaCancellationScope?.cancel();
    return state;
  });
  upsertPostRequestSearchAttributes(snapshot, state.status);

  setStatus(PostRequestStatus.PROCESSING);
  try {
    await uploadMedia(
      snapshot,
      uploadMediaIds,
      () => state.status === PostRequestStatus.CANCELLED,
      (scope) => {
        activeMediaCancellationScope = scope;
      },
    );
  } catch (error) {
    if (state.status === PostRequestStatus.CANCELLED) {
      return state;
    }
    setStatus(PostRequestStatus.FAILED, { error: failureDetails(error) });
    return state;
  }

  if (state.status === PostRequestStatus.CANCELLED) {
    return state;
  }

  setStatus(PostRequestStatus.PUBLISHING);
  let publishSnapshot: PostRequestSnapshot & { readonly postId: string };
  try {
    publishSnapshot = {
      ...snapshot,
      postId: snapshot.postId ?? (await generatePostIdActivity()),
    };
  } catch (error) {
    setStatus(PostRequestStatus.FAILED, { error: failureDetails(error) });
    return state;
  }
  snapshot = publishSnapshot;
  state = { ...state, snapshot };

  let ambiguousPostFailure = false;
  while (true) {
    try {
      const result = await createPost(publishSnapshot);
      if (result.status === 'rejected') {
        setStatus(PostRequestStatus.FAILED, {
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'The post request could not be completed',
          },
        });
        return state;
      }
      setStatus(PostRequestStatus.PUBLISHED, { result: { postId: result.postId } });
      return state;
    } catch (error) {
      const applicationFailure = findApplicationFailure(error);
      if (!ambiguousPostFailure && isKnownDomainFailure(applicationFailure)) {
        setStatus(PostRequestStatus.FAILED, { error: failureDetails(applicationFailure) });
        return state;
      }
      ambiguousPostFailure = true;
      setStatus(PostRequestStatus.CONFIRMING);
      let reconciliation: Awaited<ReturnType<typeof reconcilePostRequestActivity>>;
      try {
        reconciliation = await reconcilePostRequestActivity({
          accountId: publishSnapshot.input.accountId,
          postId: publishSnapshot.postId,
          profileId: publishSnapshot.input.profileId,
        });
      } catch {
        await sleep('5 seconds');
        continue;
      }

      if (reconciliation.status === 'PUBLISHED') {
        if (patched('post-request-reconcile-post-create-effects-v1')) {
          await startPostCreateEffects('LOCAL', reconciliation.postId, snapshot.analyticsPlatform);
        }
        setStatus(PostRequestStatus.PUBLISHED, {
          result: { postId: reconciliation.postId },
        });
        return state;
      }
      if (reconciliation.status === 'CONFLICT') {
        setStatus(PostRequestStatus.FAILED, {
          error: {
            code: 'CONFLICT',
            message: 'The post request conflicts with an existing Post',
          },
        });
        return state;
      }

      await sleep('1 second');
    }
  }
}
