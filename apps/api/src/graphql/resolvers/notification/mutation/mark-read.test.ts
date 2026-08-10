import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { graphql } from 'graphql';
import { schema } from '@/graphql/schema';

test('silently excludes a non-Notification global ID', async () => {
  const result = await graphql({
    schema,
    source: `mutation MarkNotificationRead($ids: [ID!]!) {
      markNotificationRead(input: { ids: $ids }) {
        notifications { id }
        recipientProfiles { id }
      }
    }`,
    variableValues: {
      ids: [encodeGlobalId('Profile', '00000000-0000-8006-8000-000000000001')],
    },
    contextValue: { session: { accountId: 'account', id: 'session' } },
  });

  assert.equal(result.errors, undefined, JSON.stringify(result.errors));
  const payload = result.data?.markNotificationRead as
    | { notifications: unknown[]; recipientProfiles: unknown[] }
    | undefined;
  assert.deepEqual(payload?.notifications, []);
  assert.deepEqual(payload?.recipientProfiles, []);
});
