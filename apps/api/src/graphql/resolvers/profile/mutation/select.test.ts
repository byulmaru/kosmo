import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '@kosmo/core/db';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { graphql } from 'graphql';
import { builder } from '@/graphql/builder';
import type { UserContext } from '@/context';

const selectedProfileId = '00000000-0000-8000-8000-000000000001';
const sessionId = '00000000-0000-8000-8000-000000000002';

test('selectProfile updates the request identity before the next mutation field', async (t) => {
  const { schema } = await import('@/graphql/schema');
  assert.ok(schema.getMutationType()?.getFields().selectProfile);
  builder.mutationField('selectProfileObservedUsingProfile', (t) =>
    t.withAuth({ usingProfile: true }).field({
      type: 'String',
      resolve: (_source, _args, context) => context.session.profileId,
    }),
  );
  const testSchema = builder.toSchema();

  let transactionCount = 0;
  let queryMode: 'select' | 'update' = 'select';
  const selectedProfile = { id: selectedProfileId };
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    limit: () => chain,
    set: () => chain,
    returning: () => chain,
    then: (onFulfilled: (rows: unknown[]) => unknown) =>
      Promise.resolve(queryMode === 'select' ? [selectedProfile] : [{ id: sessionId }]).then(
        onFulfilled,
      ),
  };
  const tx = {
    select: () => {
      queryMode = 'select';
      return chain;
    },
    update: () => {
      queryMode = 'update';
      return chain;
    },
  };
  t.mock.method(db, 'transaction', async (callback: (transaction: typeof tx) => unknown) => {
    transactionCount += 1;
    return callback(tx as never);
  });
  const context = {
    session: { id: sessionId, accountId: 'account-id', profileId: null },
  } as unknown as UserContext;

  const result = await graphql({
    schema: testSchema,
    source: `
      mutation {
        selectProfile(input: { id: "${encodeGlobalId('Profile', selectedProfileId)}" }) {
          profile { id }
        }
        selectProfileObservedUsingProfile
      }
    `,
    contextValue: context,
  });

  assert.equal(result.errors, undefined, JSON.stringify(result.errors));
  const data = result.data as {
    selectProfile?: { profile?: { id?: string } };
    selectProfileObservedUsingProfile?: string;
  } | null;
  assert.equal(data?.selectProfile?.profile?.id, encodeGlobalId('Profile', selectedProfileId));
  assert.equal(data?.selectProfileObservedUsingProfile, selectedProfileId);
  assert.equal(transactionCount, 1);
  assert.ok(context.session);
  assert.equal(context.session.profileId, selectedProfileId);
});
