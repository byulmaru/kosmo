import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { graphql } from 'graphql';
import { schema } from '@/graphql/schema';

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
