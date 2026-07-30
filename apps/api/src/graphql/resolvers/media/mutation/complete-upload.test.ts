import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { graphql } from 'graphql';
import { schema } from '@/graphql/schema';

test('requires an authenticated selected Profile', async () => {
  const mediaId = encodeGlobalId('Media', '00000000-0000-8000-8000-000000000001');

  for (const contextValue of [
    {},
    { session: { id: 'session', accountId: 'account', profileId: null } },
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
