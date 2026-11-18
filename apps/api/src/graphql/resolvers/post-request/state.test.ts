import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { temporalClient } from '@kosmo/core/temporal/client';
import { postQuoteRequestWorkflowId } from '@kosmo/core/temporal/post-request';
import { WorkflowNotFoundError } from '@temporalio/client';
import { loadPostRequestStateForAccount } from './state';
import type { PostRequestState } from '@kosmo/core/temporal/post-request';

test('Quote request lookup preserves Account and Profile isolation for the shared attempt identity', async (t) => {
  const requestId = randomUUID();
  const accountId = randomUUID();
  const profileId = randomUUID();
  const state: PostRequestState = {
    snapshot: {
      input: {
        accountId,
        admissionId: `${Date.now()}:${randomUUID()}`,
        bodyText: 'Quote',
        origin: 'LOCAL',
        profileId,
        repostSourceId: randomUUID(),
        visibility: 'PUBLIC',
      },
      requestId,
      submittedAt: new Date().toISOString(),
    },
    status: 'PROCESSING',
  };
  t.mock.method(
    temporalClient.workflow,
    'getHandle',
    (workflowId: string) =>
      ({
        query: async () => {
          if (workflowId !== postQuoteRequestWorkflowId(requestId)) {
            throw new WorkflowNotFoundError('Workflow not found', workflowId, undefined);
          }
          return state;
        },
      }) as never,
  );
  assert.equal(await loadPostRequestStateForAccount({ accountId, profileId, requestId }), state);
  assert.equal(await loadPostRequestStateForAccount({ accountId: randomUUID(), requestId }), null);
  assert.equal(
    await loadPostRequestStateForAccount({ accountId, profileId: randomUUID(), requestId }),
    null,
  );
});
