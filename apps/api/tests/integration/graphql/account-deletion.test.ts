import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
  ProfileState,
  SessionState,
} from '@kosmo/core/enums';
import { eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
process.env.DATABASE_URL = databaseUrl;

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let Profiles: typeof CoreDb.Profiles;
let Sessions: typeof CoreDb.Sessions;
let deriveContext: typeof DeriveContext;
let yoga: typeof YogaRouter;
let app: Hono<Env>;

type GraphQLResult<T> = {
  data?: T;
  errors?: Array<{ extensions?: { code?: string }; message: string }>;
};

type FixtureOptions = {
  readonly accountState?: AccountState;
  readonly profileStates?: ReadonlyArray<ProfileState>;
};

before(async () => {
  process.env.NODE_ENV = 'production';
  ({ AccountProfiles, Accounts, db, firstOrThrow, Instances, pg, Profiles, Sessions } =
    await import('@kosmo/core/db'));
  ({ deriveContext } = await import('../../../src/context'));
  ({ yoga } = await import('../../../src/graphql'));

  app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('context', await deriveContext(c));
    return next();
  });
  app.route('/graphql', yoga);
});

after(async () => {
  await pg.end();
});

const createFixture = async ({
  accountState = AccountState.ACTIVE,
  profileStates = [],
}: FixtureOptions = {}) => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({ domain: `${suffix}.example`, kind: InstanceKind.LOCAL, state: InstanceState.ACTIVE })
    .returning()
    .then(firstOrThrow);
  const profiles = [];
  for (const [index, state] of profileStates.entries()) {
    profiles.push(
      await db
        .insert(Profiles)
        .values({
          displayName: `${suffix}-${index}`,
          followPolicy: ProfileFollowPolicy.OPEN,
          handle: `${suffix}-${index}`,
          instanceId: instance.id,
          normalizedHandle: `${suffix}-${index}`,
          state,
        })
        .returning()
        .then(firstOrThrow),
    );
  }
  const account = await db
    .insert(Accounts)
    .values({ displayName: suffix, oidcSubject: `subject-${suffix}`, state: accountState })
    .returning()
    .then(firstOrThrow);
  if (profiles.length) {
    await db.insert(AccountProfiles).values(
      profiles.map((profile) => ({
        accountId: account.id,
        profileId: profile.id,
        role: AccountProfileRole.OWNER,
      })),
    );
  }
  const session = await db
    .insert(Sessions)
    .values({ accountId: account.id, state: SessionState.ACTIVE, token: `token-${suffix}` })
    .returning()
    .then(firstOrThrow);

  return { account, instance, profiles, session };
};

const cleanup = async (fixture: Awaited<ReturnType<typeof createFixture>>) => {
  await db.delete(Sessions).where(eq(Sessions.accountId, fixture.account.id));
  await db.delete(AccountProfiles).where(eq(AccountProfiles.accountId, fixture.account.id));
  await db.delete(Accounts).where(eq(Accounts.id, fixture.account.id));
  if (fixture.profiles.length) {
    await db.delete(Profiles).where(
      inArray(
        Profiles.id,
        fixture.profiles.map(({ id }) => id),
      ),
    );
  }
  await db.delete(Instances).where(eq(Instances.id, fixture.instance.id));
};

const request = async <T>(query: string, token?: string): Promise<GraphQLResult<T>> => {
  const response = await app.request('/graphql', {
    body: JSON.stringify({ query }),
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    method: 'POST',
  });
  return response.json() as Promise<GraphQLResult<T>>;
};

test('Active Profile이 남으면 eligibility와 탈퇴 mutation이 변경 없이 거부된다', async () => {
  const fixture = await createFixture({ profileStates: [ProfileState.ACTIVE] });

  try {
    const eligibility = await request<{
      accountDeletionEligibility: { activeProfileCount: number; canDelete: boolean };
    }>(
      'query { accountDeletionEligibility { activeProfileCount canDelete } }',
      fixture.session.token,
    );
    assert.deepEqual(eligibility.data, {
      accountDeletionEligibility: { activeProfileCount: 1, canDelete: false },
    });
    const deletion = await request<{
      deleteAccount: { activeProfileCount: number; completed: boolean };
    }>('mutation { deleteAccount { activeProfileCount completed } }', fixture.session.token);
    assert.deepEqual(deletion.data, {
      deleteAccount: { activeProfileCount: 1, completed: false },
    });
    assert.equal(
      (
        await db
          .select({ state: Accounts.state })
          .from(Accounts)
          .where(eq(Accounts.id, fixture.account.id))
      )[0]?.state,
      AccountState.ACTIVE,
    );
    assert.equal(
      (
        await db
          .select({ state: Sessions.state })
          .from(Sessions)
          .where(eq(Sessions.id, fixture.session.id))
      )[0]?.state,
      SessionState.ACTIVE,
    );
  } finally {
    await cleanup(fixture);
  }
});

test('Suspended Account의 비활성 Profile을 보존하며 탈퇴한다', async () => {
  const fixture = await createFixture({
    accountState: AccountState.SUSPENDED,
    profileStates: [ProfileState.DISABLED],
  });

  try {
    const eligibility = await request<{
      accountDeletionEligibility: { activeProfileCount: number; canDelete: boolean };
    }>(
      'query { accountDeletionEligibility { activeProfileCount canDelete } }',
      fixture.session.token,
    );
    assert.deepEqual(eligibility.data, {
      accountDeletionEligibility: { activeProfileCount: 0, canDelete: true },
    });
    const deletion = await request<{
      deleteAccount: { activeProfileCount: number; completed: boolean };
    }>('mutation { deleteAccount { activeProfileCount completed } }', fixture.session.token);
    assert.deepEqual(deletion.data, {
      deleteAccount: { activeProfileCount: 0, completed: true },
    });

    assert.equal(
      (
        await db
          .select({ state: Accounts.state })
          .from(Accounts)
          .where(eq(Accounts.id, fixture.account.id))
      )[0]?.state,
      AccountState.DISABLED,
    );
    assert.equal(
      (
        await db
          .select({ state: Profiles.state })
          .from(Profiles)
          .where(eq(Profiles.id, fixture.profiles[0]!.id))
      )[0]?.state,
      ProfileState.DISABLED,
    );
    assert.equal(
      await db.$count(AccountProfiles, eq(AccountProfiles.accountId, fixture.account.id)),
      1,
    );
    assert.equal(
      (
        await db
          .select({ state: Sessions.state })
          .from(Sessions)
          .where(eq(Sessions.id, fixture.session.id))
      )[0]?.state,
      SessionState.REVOKED,
    );
  } finally {
    await cleanup(fixture);
  }
});

test('Account 탈퇴 API는 인증과 Bearer 형식을 요구한다', async () => {
  const anonymous = await request('query { accountDeletionEligibility { canDelete } }');
  assert.equal(anonymous.data, null);
  assert.equal(anonymous.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');

  const malformed = await app.request('/graphql', {
    body: JSON.stringify({ query: 'mutation { deleteAccount { completed } }' }),
    headers: { authorization: 'Basic invalid', 'content-type': 'application/json' },
    method: 'POST',
  });
  const result = (await malformed.json()) as GraphQLResult<unknown>;
  assert.equal(result.data, null);
  assert.equal(result.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
  assert.match(result.errors?.[0]?.message ?? '', /Bearer/);
});
