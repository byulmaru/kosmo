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
  defineQuery,
  defineUpdate,
  ParentClosePolicy,
  proxyActivities,
  setHandler,
  sleep,
  upsertSearchAttributes,
  WorkflowIdReusePolicy,
  workflowInfo,
} from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import { runChildWorkflow } from './child';
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
    input: z.object({
      accountId: z.uuid(),
      bodyText: z.string(),
      contentWarning: z.string().nullable().optional(),
      media: z
        .array(
          z.object({
            altText: z.string().nullable(),
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
    mediaProcessing: z.array(
      z.object({
        applyNightshade: z.boolean(),
        mediaId: z.uuid(),
      }),
    ),
    postId: z.uuid(),
    requestId: z.uuid(),
    submissionFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    submittedAt: z.iso.datetime(),
  })
  .superRefine(({ input, mediaProcessing }, context) => {
    const inputMediaIds = (input.media ?? []).map(({ mediaId }) => mediaId);
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
  });

const { getPostRequestMediaStateActivity, reconcilePostRequestActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);
const { waitForPostRequestMediaUploadActivity } = proxyActivities<typeof activities>({
  ...workflowActivityOptions,
  heartbeatTimeout: '1 minute',
  scheduleToCloseTimeout: '76 hours',
  startToCloseTimeout: '76 hours',
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

const parseInput = (value: unknown): PostRequestWorkflowArgs => {
  const parsed = workflowArgsSchema.safeParse(value);
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable(
      parsed.error.issues[0]?.message ?? 'Post request input is invalid',
      'PostRequestInputInvalid',
    );
  }
  return parsed.data;
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
  isCancelled: () => boolean,
  setCancellationScope: (scope: CancellationScope | undefined) => void,
): Promise<void> => {
  if (snapshot.mediaProcessing.length === 0) {
    return;
  }

  const ready = await getPostRequestMediaStateActivity({
    accountId: snapshot.input.accountId,
    mediaIds: snapshot.mediaProcessing.map(({ mediaId }) => mediaId),
  });
  for (const media of snapshot.mediaProcessing) {
    if (isCancelled()) {
      return;
    }
    if (ready.readyMediaIds.includes(media.mediaId)) {
      continue;
    }

    const childArgs = {
      accountId: snapshot.input.accountId,
      applyNightshade: media.applyNightshade,
      mediaId: media.mediaId,
    };
    const cancellationScope = new CancellationScope();
    setCancellationScope(cancellationScope);
    try {
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
        await cancellationScope.run(() =>
          waitForPostRequestMediaUploadActivity({
            accountId: snapshot.input.accountId,
            mediaId: media.mediaId,
          }),
        );
      }
    } finally {
      setCancellationScope(undefined);
    }
    if (isCancelled()) {
      return;
    }
  }
};

const createPost = async (snapshot: PostRequestSnapshot): Promise<PostCreateWorkflowResult> =>
  runChildWorkflow(postCreateWorkflowV2, {
    args: [
      {
        input: snapshot.input,
        postId: snapshot.postId,
        revalidateAuthorization: true,
        requestId: workflowInfo().runId,
      },
    ],
    mode: 'execute',
    workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
  });

export async function postRequestWorkflow(
  input: PostRequestWorkflowArgs,
): Promise<PostRequestState> {
  const parsed = parseInput(input);
  const snapshot = parsed;
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
  let ambiguousPostFailure = false;
  while (true) {
    try {
      const result = await createPost(snapshot);
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
          accountId: snapshot.input.accountId,
          postId: snapshot.postId,
          profileId: snapshot.input.profileId,
        });
      } catch {
        await sleep('5 seconds');
        continue;
      }

      if (reconciliation.status === 'PUBLISHED') {
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
