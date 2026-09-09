import assert from 'node:assert/strict';
import test from 'node:test';
import { graphql } from 'graphql';
import { schema } from '@/graphql/schema';

test('requires an authenticated selected Profile', async () => {
  for (const contextValue of [
    {},
    { session: { id: 'session', accountId: 'account', profile: null } },
  ]) {
    const result = await graphql({
      schema,
      source: 'mutation { issueMediaUploadUrl { uploadUrl } }',
      contextValue,
    });

    assert.equal(result.data, null);
    assert.match(result.errors?.[0]?.message ?? '', /Not authorized/);
  }
});
