import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '@kosmo/core/db';
import { AccountProfileRole } from '@kosmo/core/enums';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { graphql } from 'graphql';
import { builder } from '@/graphql/builder';
import type { UserContext } from '@/context';

const selectedProfileId = '00000000-0000-8000-8000-000000000001';
const sessionId = '00000000-0000-8000-8000-000000000002';

test('selectProfile updates the request identity before the next mutation field', async (t) => {
  const { schema } = await import('@/graphql/schema');
  assert.ok(schema.getMutationType()?.getFields().selectProfile);
  builder.mutationField('selectProfileObservedProfileRole', (t) =>
    t.withAuth({ profileRole: AccountProfileRole.MEMBER }).field({
      type: 'String',
      resolve: (_source, _args, context) => context.session.profileRole,
    }),
  );
  builder.mutationField('selectProfileObservedOwnerRole', (t) =>
    t.withAuth({ profileRole: AccountProfileRole.OWNER }).field({
      type: 'String',
      resolve: (_source, _args, context) => context.session.profileRole,
    }),
  );
  const testSchema = builder.toSchema();

  let transactionCount = 0;
  let queryMode: 'select' | 'update' = 'select';
  const selectedProfile = { id: selectedProfileId, profileRole: AccountProfileRole.MEMBER };
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
    session: { id: sessionId, accountId: 'account-id', profileId: null, profileRole: null },
  } as unknown as UserContext;

  const result = await graphql({
    schema: testSchema,
    source: `
      mutation {
        selectProfile(input: { id: "${encodeGlobalId('Profile', selectedProfileId)}" }) {
          profile { id }
        }
        selectProfileObservedProfileRole
      }
    `,
    contextValue: context,
  });

  assert.equal(result.errors, undefined, JSON.stringify(result.errors));
  const data = result.data as {
    selectProfile?: { profile?: { id?: string } };
    selectProfileObservedProfileRole?: string;
  } | null;
  assert.equal(data?.selectProfile?.profile?.id, encodeGlobalId('Profile', selectedProfileId));
  assert.equal(data?.selectProfileObservedProfileRole, AccountProfileRole.MEMBER);
  assert.equal(transactionCount, 1);
  assert.ok(context.session);
  assert.equal(context.session.profileId, selectedProfileId);
  assert.equal(context.session.profileRole, AccountProfileRole.MEMBER);

  const ownerResult = await graphql({
    schema: testSchema,
    source: 'mutation { selectProfileObservedOwnerRole }',
    contextValue: context,
  });

  assert.equal(ownerResult.data, null);
  assert.match(ownerResult.errors?.[0]?.message ?? '', /Not authorized/);

  const ownerContext = {
    ...context,
    session: { ...context.session, profileRole: AccountProfileRole.OWNER },
  };
  const ownerAsMemberResult = await graphql({
    schema: testSchema,
    source: 'mutation { selectProfileObservedProfileRole }',
    contextValue: ownerContext,
  });

  assert.equal(ownerAsMemberResult.errors, undefined, JSON.stringify(ownerAsMemberResult.errors));
  assert.equal(
    ownerAsMemberResult.data?.selectProfileObservedProfileRole,
    AccountProfileRole.OWNER,
  );

  const noProfileResult = await graphql({
    schema: testSchema,
    source: 'mutation { selectProfileObservedProfileRole }',
    contextValue: {
      ...context,
      session: { ...context.session, profileId: null, profileRole: null },
    },
  });

  assert.equal(noProfileResult.data, null);
  assert.match(noProfileResult.errors?.[0]?.message ?? '', /Not authorized/);
});
