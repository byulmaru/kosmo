import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '@kosmo/core/db';
import { AccountProfileRole, MediaState } from '@kosmo/core/enums';
import { ConflictError } from '@kosmo/core/error';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { graphql } from 'graphql';
import { schema } from '@/graphql/schema';
import type { ExecutionResult } from 'graphql';

test('requires an authenticated selected Profile', async () => {
  const mediaId = encodeGlobalId('Media', '00000000-0000-8000-8000-000000000001');

  for (const contextValue of [
    {},
    { session: { id: 'session', accountId: 'account', profile: null } },
  ]) {
    const result = await graphql({
      schema,
      source: `mutation { completeMediaUpload(input: { id: "${mediaId}" }) { media { id } } }`,
      contextValue,
    });

    assert.equal(result.data, null);
    assert.match(result.errors?.[0]?.message ?? '', /Not authorized/);
  }
});

test('rejects the legacy media processing alias', async () => {
  const mediaId = encodeGlobalId('Media', '00000000-0000-8000-8000-000000000001');
  const result = await graphql({
    schema,
    source: `
      mutation {
        completeMediaUpload(input: { id: "${mediaId}", applyNightshade: true }) {
          media { id }
        }
      }
    `,
    contextValue: {
      session: {
        accountId: '00000000-0000-0000-0000-000000000001',
        profile: { id: '00000000-0000-0000-0000-000000000002', role: 'MEMBER' },
      },
    },
  });

  assert.equal(result.data, undefined);
  assert.match(result.errors?.[0]?.message ?? '', /applyNightshade/);
});

test('requires reattachment for a pre-Nexus upload that is still uploading', async (t) => {
  const id = '00000000-0000-8000-8000-000000000001';
  const mediaId = encodeGlobalId('Media', id);
  const storedMedia: { id: string; state: MediaState; storageReference: string } = {
    id,
    state: MediaState.UPLOADING,
    storageReference: 'u_legacy',
  };
  t.mock.method(
    db,
    'select',
    () => ({ from: () => ({ where: () => ({ limit: async () => [storedMedia] }) }) }) as never,
  );

  const complete = () =>
    graphql({
      schema,
      source: `
        mutation CompleteMediaUpload($id: ID!) {
          completeMediaUpload(input: { id: $id }) { media { id state } }
        }
      `,
      variableValues: { id: mediaId },
      contextValue: {
        session: {
          accountId: '00000000-0000-8000-8000-000000000002',
          profile: {
            id: '00000000-0000-8000-8000-000000000003',
            role: AccountProfileRole.MEMBER,
          },
        },
      },
    }) as Promise<
      ExecutionResult<{ completeMediaUpload: { media: { id: string; state: MediaState } } }>
    >;

  const result = await complete();
  assert.equal(result.data, null);
  assert.equal(result.errors?.length, 1);
  assert.deepEqual(result.errors?.[0]?.path, ['completeMediaUpload']);
  assert.ok(result.errors?.[0]?.originalError instanceof ConflictError);

  storedMedia.state = MediaState.READY;
  const repeated = await complete();
  assert.equal(repeated.errors, undefined);
  assert.equal(repeated.data?.completeMediaUpload?.media.id, mediaId);
  assert.equal(repeated.data?.completeMediaUpload?.media.state, MediaState.READY);
});
