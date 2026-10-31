import { ConflictError, NotFoundError } from '@kosmo/core/error';
import { runWorkflow } from '@kosmo/core/temporal/client';
import {
  postRequestCancelUpdateDefinition,
  PostRequestStatus,
} from '@kosmo/core/temporal/post-request';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { rethrowPostWorkflowFailure } from '../../post/mutation/errors';
import { PostRequest } from '../ref';
import { loadPostRequestStateForAccount } from '../state';
import type { PostRequestSnapshot, PostRequestState } from '@kosmo/core/temporal/post-request';

const isPublishingState = (state: PostRequestState) =>
  state.status === PostRequestStatus.PUBLISHING ||
  state.status === PostRequestStatus.CONFIRMING ||
  state.status === PostRequestStatus.PUBLISHED;

const rejectPublishingState = (state: PostRequestState): void => {
  if (isPublishingState(state)) {
    throw new ConflictError({ message: 'Post request can no longer be cancelled' });
  }
};

const isCancellableState = (state: PostRequestState) =>
  state.status === PostRequestStatus.QUEUED || state.status === PostRequestStatus.PROCESSING;

const loadLatestState = (accountId: string, requestId: string) =>
  loadPostRequestStateForAccount({ accountId, requestId });

const postRequestAlreadyFinished = () =>
  new ConflictError({ message: 'Post request is already finished' });

async function cancelRunningRequest(
  accountId: string,
  requestId: string,
  snapshot: PostRequestSnapshot,
): Promise<PostRequestState> {
  let updated: PostRequestState;
  try {
    updated = await runWorkflow(postRequestCancelUpdateDefinition, {
      args: [snapshot],
      mode: 'update',
      updateArgs: [],
      updateId: `cancel:${snapshot.requestId}`,
    });
  } catch (error) {
    const latest = await loadLatestState(accountId, requestId);
    if (latest?.status === PostRequestStatus.CANCELLED) {
      return latest;
    }
    if (latest?.status === PostRequestStatus.FAILED) {
      throw postRequestAlreadyFinished();
    }
    if (latest) {
      rejectPublishingState(latest);
    }
    return rethrowPostWorkflowFailure(error);
  }

  if (updated.status === PostRequestStatus.CANCELLED) {
    return updated;
  }
  if (updated.status === PostRequestStatus.FAILED) {
    throw postRequestAlreadyFinished();
  }
  rejectPublishingState(updated);
  throw new ConflictError({ message: 'Post request could not be cancelled' });
}

builder.mutationField('cancelPostRequest', (t) =>
  t.withAuth({ login: true }).fieldWithInput({
    type: builder.simpleObject('CancelPostRequestPayload', {
      fields: (field) => ({
        request: field.field({ type: PostRequest }),
      }),
    }),
    input: {
      requestId: t.input.string({ validate: z.uuid() }),
    },
    resolve: async (_, { input }, ctx) => {
      const current = await loadLatestState(ctx.session.accountId, input.requestId);
      if (!current) {
        throw new NotFoundError('Post request not found');
      }
      if (current.status === PostRequestStatus.CANCELLED) {
        return { request: current };
      }
      rejectPublishingState(current);
      if (current.status === PostRequestStatus.FAILED || !isCancellableState(current)) {
        throw postRequestAlreadyFinished();
      }

      return {
        request: await cancelRunningRequest(
          ctx.session.accountId,
          input.requestId,
          current.snapshot,
        ),
      };
    },
  }),
);
