import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '@kosmo/core/db';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { temporalClient } from '@kosmo/core/temporal/client';
import { POST_REQUEST_STATE_QUERY, postRequestWorkflowId } from '@kosmo/core/temporal/post-request';
import { graphql } from 'graphql';
import { deriveContext } from '@/context';
import { schema } from '@/graphql/schema';
import type { PostRequestState } from '@kosmo/core/temporal/post-request';
import type { ServerContext } from '@/context';

const ownerAccountId = '00000000-0000-4000-8000-000000000001';
const nonOwnerAccountId = '00000000-0000-4000-8000-000000000010';
const profileId = '00000000-0000-4000-8000-000000000002';
const requestId = '00000000-0000-4000-8000-000000000003';
const missingRequestId = '00000000-0000-4000-8000-000000000005';
const mediaId = '00000000-0000-4000-8000-000000000004';

const requestState = (requestedId: string): PostRequestState => ({
  snapshot: {
    input: {
      accountId: ownerAccountId,
      bodyText: 'draft body',
      contentWarning: 'Spoiler',
      media: [
        {
          altText: 'alt text',
          applyNightshade: true,
          mediaId,
        },
      ],
      origin: 'LOCAL',
      profileId,
      sensitiveMedia: true,
      visibility: 'UNLISTED',
    },
    requestId: requestedId,
    submittedAt: '2026-10-29T00:00:00.000Z',
  },
  status: 'QUEUED',
});

type EmptySelectChain = {
  from: (...args: unknown[]) => EmptySelectChain;
  innerJoin: (...args: unknown[]) => EmptySelectChain;
  leftJoin: (...args: unknown[]) => EmptySelectChain;
  where: (...args: unknown[]) => Promise<never[]>;
};

const emptySelectChain = (): EmptySelectChain => {
  const chain: EmptySelectChain = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: async () => [],
  };
  return chain;
};

const requestNode = async (requestedId: string, accountId: string | null) => {
  const requestContext = await deriveContext({
    req: { header: () => undefined },
  } as unknown as ServerContext);

  return graphql({
    schema,
    source: `
      query PostRequestNode($id: ID!) {
        node(id: $id) {
          ... on PostRequest {
            id
            requestId
            status
            bodyText
            contentWarning
            sensitiveMedia
            media { id altText }
          }
        }
      }
    `,
    variableValues: { id: encodeGlobalId('PostRequest', requestedId) },
    contextValue:
      accountId === null
        ? requestContext
        : { ...requestContext, session: { accountId, profile: null } },
  });
};

test('PostRequest Node exposes its summary and is scoped to its owning account', async (t) => {
  const state = requestState(requestId);
  const workflowIds: string[] = [];
  t.mock.method(db, 'select', () => emptySelectChain() as never);
  t.mock.method(temporalClient.workflow, 'getHandle', (workflowId: string) => {
    workflowIds.push(workflowId);
    return {
      query: async (queryName: string) => {
        assert.equal(queryName, POST_REQUEST_STATE_QUERY);
        return workflowId === postRequestWorkflowId(ownerAccountId, requestId) ? state : null;
      },
    } as never;
  });

  const ownerResult = await requestNode(requestId, ownerAccountId);
  assert.deepEqual(ownerResult.errors, undefined);
  const request = ownerResult.data?.node as {
    id: string;
    requestId: string;
    status: string;
    bodyText: string;
    contentWarning: string;
    sensitiveMedia: boolean;
    media: ({ id: string; altText: string | null } | null)[];
  };
  assert.equal(request.id, encodeGlobalId('PostRequest', requestId));
  assert.equal(request.requestId, requestId);
  assert.equal(request.status, 'QUEUED');
  assert.equal(request.bodyText, 'draft body');
  assert.equal(request.contentWarning, 'Spoiler');
  assert.equal(request.sensitiveMedia, true);
  assert.deepEqual(request.media, [null]);

  const nonOwnerResult = await requestNode(requestId, nonOwnerAccountId);
  assert.deepEqual(nonOwnerResult.errors, undefined);
  assert.equal(nonOwnerResult.data?.node, null);

  const missingResult = await requestNode(missingRequestId, ownerAccountId);
  assert.deepEqual(missingResult.errors, undefined);
  assert.equal(missingResult.data?.node, null);

  const unauthenticatedResult = await requestNode(requestId, null);
  assert.deepEqual(unauthenticatedResult.errors, undefined);
  assert.equal(unauthenticatedResult.data?.node, null);

  assert.deepEqual(workflowIds, [
    postRequestWorkflowId(ownerAccountId, requestId),
    postRequestWorkflowId(nonOwnerAccountId, requestId),
    postRequestWorkflowId(ownerAccountId, missingRequestId),
  ]);
});
