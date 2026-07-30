import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { graphql } from 'graphql';
import { schema } from './schema';

test('rejects legacy raw UUID and unknown typename Node IDs', async () => {
  for (const id of [
    '00000000-0000-8006-8000-000000000001',
    encodeGlobalId('Unknown', '00000000-0000-8006-8000-000000000001'),
  ]) {
    const result = await graphql({
      schema,
      source: `query Node($id: ID!) { node(id: $id) { id } }`,
      variableValues: { id },
      contextValue: {},
    });

    assert.equal(result.data?.node, null);
    assert.ok(result.errors?.[0]);
  }
});
