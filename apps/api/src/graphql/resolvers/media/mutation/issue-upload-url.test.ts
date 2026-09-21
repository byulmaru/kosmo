import assert from 'node:assert/strict';
import test from 'node:test';
import { graphql } from 'graphql';
import { schema } from '@/graphql/schema';

test('requires an authenticated selected Profile', async () => {
  for (const contextValue of [
    {},
    { session: { id: 'session', accountId: 'account', profile: null } },
  ]) {
    for (const [source, variableValues] of [
      ['mutation { issueMediaUploadUrl { uploadUrl } }', undefined],
      [
        'mutation IssueMediaUpload($input: IssueMediaUploadUrlInput) { issueMediaUploadUrl(input: $input) { uploadUrl } }',
        { input: null },
      ],
      [
        'mutation IssueMediaUpload($input: IssueMediaUploadUrlInput) { issueMediaUploadUrl(input: $input) { uploadUrl } }',
        { input: {} },
      ],
    ] as const) {
      const result = await graphql({
        schema,
        source,
        variableValues,
        contextValue,
      });

      assert.equal(result.data, null);
      assert.match(result.errors?.[0]?.message ?? '', /Not authorized/);
    }
  }
});
