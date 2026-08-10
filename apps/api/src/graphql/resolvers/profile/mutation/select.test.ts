import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { sql } from 'drizzle-orm';
import { graphql, GraphQLObjectType, GraphQLSchema, GraphQLString } from 'graphql';
import { schema } from '@/graphql/schema';
import type { UserContext } from '@/context';

const selectedProfileId = '00000000-0000-8000-8000-000000000001';
const sessionId = '00000000-0000-8000-8000-000000000002';

test('selectProfile updates the actor setting before the next mutation field', async () => {
  const selectProfileField = schema.getMutationType()?.getFields().selectProfile;
  assert.ok(selectProfileField);
  const observedType = new GraphQLObjectType({
    name: 'SelectProfileObservedActor',
    fields: {
      accountSetting: { type: GraphQLString },
      contextProfile: { type: GraphQLString },
      settingProfile: { type: GraphQLString },
    },
  });

  const selectProfileMutation = new GraphQLObjectType({
    name: 'SelectProfileRegressionMutation',
    fields: {
      selectProfile: {
        type: selectProfileField.type,
        args: Object.fromEntries(selectProfileField.args.map(({ name, type }) => [name, { type }])),
        resolve: selectProfileField.resolve,
      },
      observed: {
        type: observedType,
        resolve: async (_source, _args, context: UserContext) => {
          const rows = await context.db.execute(sql`
            select
              public.kosmo_current_account_id(),
              public.kosmo_current_profile_id()
          `);
          const actor = (rows as unknown as { accountId: string; profileId: string }[])[0];
          return {
            accountSetting: actor?.accountId ?? null,
            contextProfile: context.session?.profileId,
            settingProfile: actor?.profileId ?? null,
          };
        },
      },
    },
  });
  const testSchema = new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'SelectProfileRegressionQuery',
      fields: { probe: { type: GraphQLString, resolve: () => 'ok' } },
    }),
    mutation: selectProfileMutation,
  });

  const setConfigQueries: unknown[] = [];
  const observedSettingQueries: unknown[] = [];
  let currentProfileSetting = 'old-profile-id';
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
    execute: async (query: unknown) => {
      setConfigQueries.push(query);
      const profileId = (query as { queryChunks: unknown[] }).queryChunks.find(
        (chunk): chunk is string => typeof chunk === 'string',
      );
      if (profileId) {
        currentProfileSetting = profileId;
      }
      return [];
    },
  };
  const context = {
    db: {
      transaction: async (callback: (transaction: typeof tx) => unknown) => {
        transactionCount += 1;
        return callback(tx);
      },
      execute: async (query: unknown) => {
        observedSettingQueries.push(query);
        return [{ accountId: 'account-id', profileId: currentProfileSetting }];
      },
    },
    session: { id: sessionId, accountId: 'account-id', profileId: 'old-profile-id' },
  } as unknown as UserContext;

  const result = await graphql({
    schema: testSchema,
    source: `
      mutation {
        selectProfile(input: { id: "${encodeGlobalId('Profile', selectedProfileId)}" }) {
          profile { id }
        }
        observed { accountSetting contextProfile settingProfile }
      }
    `,
    contextValue: context,
  });

  assert.equal(result.errors, undefined, JSON.stringify(result.errors));
  const data = result.data as {
    selectProfile?: { profile?: { id?: string } };
    observed?: { accountSetting?: string; contextProfile?: string; settingProfile?: string };
  } | null;
  assert.equal(data?.selectProfile?.profile?.id, encodeGlobalId('Profile', selectedProfileId));
  assert.equal(data?.observed?.accountSetting, 'account-id');
  assert.equal(data?.observed?.contextProfile, selectedProfileId);
  assert.equal(data?.observed?.settingProfile, selectedProfileId);
  assert.equal(transactionCount, 1);
  assert.ok(context.session);
  assert.equal(context.session.profileId, selectedProfileId);
  assert.equal(setConfigQueries.length, 1);
  assert.equal(observedSettingQueries.length, 1);

  const setConfigQuery = setConfigQueries[0] as { queryChunks: unknown[] };
  const observedSettingQuery = observedSettingQueries[0] as { queryChunks: unknown[] };
  assert.deepEqual(
    setConfigQuery.queryChunks.filter((chunk): chunk is string => typeof chunk === 'string'),
    [selectedProfileId],
  );
  assert.match(
    setConfigQuery.queryChunks
      .filter((chunk): chunk is { value: string[] } => typeof chunk === 'object' && chunk !== null)
      .flatMap(({ value }) => value)
      .join(''),
    /set_config\('kosmo\.profile_id', .+false\)/,
  );
  const observedSettingSql = observedSettingQuery.queryChunks
    .filter((chunk): chunk is { value: string[] } => typeof chunk === 'object' && chunk !== null)
    .flatMap(({ value }) => value)
    .join('');
  assert.match(observedSettingSql, /kosmo_current_account_id/);
  assert.match(observedSettingSql, /kosmo_current_profile_id/);
});
