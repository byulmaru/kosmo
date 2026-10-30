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
const mediaId = '00000000-0000-4000-8000-000000000004';

const requestState = (
  overrides: Partial<PostRequestState['snapshot']['input']> = {},
  accountIdValue = ownerAccountId,
): PostRequestState => ({
  snapshot: {
    input: {
      accountId: accountIdValue,
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
      ...overrides,
    },
    requestId,
    submittedAt: '2026-10-29T00:00:00.000Z',
  },
  status: 'QUEUED',
});

const requestQuery = async (requestedProfileId: string, accountId = ownerAccountId) => {
  const requestContext = await deriveContext({
    req: { header: () => undefined },
  } as unknown as ServerContext);

  return graphql({
    schema,
    source: `
      query PostRequest($profileId: ID!, $requestId: String!) {
        postRequest(profileId: $profileId, requestId: $requestId) {
          id
          requestId
          status
          bodyText
          contentWarning
          sensitiveMedia
          media { id altText }
        }
      }
    `,
    variableValues: {
      profileId: encodeGlobalId('Profile', requestedProfileId),
      requestId,
    },
    contextValue: { ...requestContext, session: { accountId, profile: null } },
  });
};

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

test('postRequest exposes its thin summary and a nullable unavailable Media node', async (t) => {
  const state = requestState();
  t.mock.method(temporalClient.workflow, 'getHandle', (workflowId: string) => {
    assert.equal(workflowId, postRequestWorkflowId(ownerAccountId, requestId));
    return {
      query: async (queryName: string) => {
        assert.equal(queryName, POST_REQUEST_STATE_QUERY);
        return state;
      },
    } as never;
  });
  t.mock.method(db, 'select', () => emptySelectChain() as never);

  const result = await requestQuery(profileId);
  assert.deepEqual(result.errors, undefined);
  const request = result.data?.postRequest as {
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
});

test('postRequest allows owner history reads without current profile membership and scopes by profile and account', async (t) => {
  let current: PostRequestState | null = requestState();
  const workflowIds: string[] = [];
  t.mock.method(temporalClient.workflow, 'getHandle', (workflowId: string) => {
    workflowIds.push(workflowId);
    return {
      query: async () => current,
    } as never;
  });
  t.mock.method(db, 'select', () => emptySelectChain() as never);

  const ownerResult = await requestQuery(profileId);
  assert.deepEqual(ownerResult.errors, undefined);
  assert.equal((ownerResult.data?.postRequest as { requestId: string }).requestId, requestId);

  const profileMismatch = await requestQuery('00000000-0000-4000-8000-000000000008');
  assert.deepEqual(profileMismatch.errors, undefined);
  assert.equal(profileMismatch.data?.postRequest, null);

  current = requestState({}, '00000000-0000-4000-8000-000000000009');
  const ownerMismatch = await requestQuery(profileId);
  assert.deepEqual(ownerMismatch.errors, undefined);
  assert.equal(ownerMismatch.data?.postRequest, null);

  assert.deepEqual(workflowIds, [
    postRequestWorkflowId(ownerAccountId, requestId),
    postRequestWorkflowId(ownerAccountId, requestId),
    postRequestWorkflowId(ownerAccountId, requestId),
  ]);
});

test('PostRequest Node requires the owning account and hides missing states', async (t) => {
  const state = requestState();
  const workflowIds: string[] = [];
  t.mock.method(temporalClient.workflow, 'getHandle', (workflowId: string) => {
    workflowIds.push(workflowId);
    return {
      query: async (queryName: string) => {
        assert.equal(queryName, POST_REQUEST_STATE_QUERY);
        return workflowId === postRequestWorkflowId(ownerAccountId, requestId) ? state : null;
      },
    } as never;
  });
  const execute = (accountId: string | null) =>
    graphql({
      schema,
      source: `
        query PostRequestNode($id: ID!) {
          node(id: $id) { ... on PostRequest { id requestId } }
        }
      `,
      variableValues: { id: encodeGlobalId('PostRequest', requestId) },
      contextValue: accountId ? { session: { accountId, profile: null } } : {},
    });

  const ownerResult = await execute(ownerAccountId);
  assert.deepEqual(ownerResult.errors, undefined);
  const node = ownerResult.data?.node as { id: string; requestId: string };
  assert.equal(node.id, encodeGlobalId('PostRequest', requestId));
  assert.equal(node.requestId, requestId);

  const nonOwnerResult = await execute(nonOwnerAccountId);
  assert.deepEqual(nonOwnerResult.errors, undefined);
  assert.equal(nonOwnerResult.data?.node, null);

  const unauthenticatedResult = await execute(null);
  assert.deepEqual(unauthenticatedResult.errors, undefined);
  assert.equal(unauthenticatedResult.data?.node, null);
  assert.deepEqual(workflowIds, [
    postRequestWorkflowId(ownerAccountId, requestId),
    postRequestWorkflowId(nonOwnerAccountId, requestId),
  ]);
});
