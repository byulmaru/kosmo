import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { graphql } from 'graphql';
import { schema } from '@/graphql/schema';

test('rejects a non-Notification global ID', async () => {
  const result = await graphql({
    schema,
    source: `mutation MarkNotificationRead($id: ID!) {
      markNotificationRead(input: { id: $id }) { notification { id } }
    }`,
    variableValues: {
      id: encodeGlobalId('Profile', '00000000-0000-8006-8000-000000000001'),
    },
    contextValue: { session: { accountId: 'account', id: 'session' } },
  });

  assert.equal(result.data, null);
  assert.match(result.errors?.[0]?.message ?? '', /Notification not found/);
});
