import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  NotificationKind,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
  SessionState,
} from '@kosmo/core/enums';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { normalizeHandle } from '@kosmo/core/utils';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { encodeGlobalId as globalId } from '../../../src/graphql/global-id';
import type * as CoreDb from '@kosmo/core/db';
import type { Env } from '../../../src/context';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let Notifications: typeof CoreDb.Notifications;
let pg: typeof CoreDb.pg;
let PostContents: typeof CoreDb.PostContents;
let Posts: typeof CoreDb.Posts;
let Profiles: typeof CoreDb.Profiles;
let Sessions: typeof CoreDb.Sessions;
let app: Hono<Env>;
let localInstanceId: string;

describe('GraphQL Repost', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_ORIGIN = publicOrigin;

    ({
      AccountProfiles,
      Accounts,
      db,
      firstOrThrow,
      Instances,
      Notifications,
      pg,
      PostContents,
      Posts,
      Profiles,
      Sessions,
    } = await import('@kosmo/core/db'));
    const { seedDatabase } = await import('@kosmo/core/db/seed');

    await truncateDatabase();
    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;

    const { deriveContext } = await import('../../../src/context');
    const { yoga } = await import('../../../src/graphql');
    app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('context', await deriveContext(c));
      return next();
    });
    app.route('/graphql', yoga);
  });

  beforeEach(async () => {
    await resetFixtures();
  });

  after(async () => {
    await pg.end();
  });

  test('반복·동시 repostPost가 같은 Repost Post payload를 반환한다', async () => {
    const auth = await createAuthenticatedSession();
    const source = await createContentPost(auth.profile.id);

    const first = await requestRepost(source.id, auth.token);
    const repeated = await requestRepost(source.id, auth.token);
    const concurrent = await Promise.all(
      Array.from({ length: 4 }, () => requestRepost(source.id, auth.token)),
    );

    assertNoGraphQLErrors(first);
    assertNoGraphQLErrors(repeated);
    concurrent.forEach(assertNoGraphQLErrors);
    assert.deepEqual(repeated.data?.repostPost.repost, first.data?.repostPost.repost);
    assert.deepEqual(
      concurrent.map((result) => result.data?.repostPost.repost.id),
      Array.from({ length: 4 }, () => first.data?.repostPost.repost.id),
    );

    const stored = await db.select().from(Posts).where(eq(Posts.repostSourceId, source.id));
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.currentContentId, null);
    assert.equal(stored[0]?.replyParentId, null);
    assert.equal(stored[0]?.profileId, auth.profile.id);
    assert.deepEqual(first.data?.repostPost.repost, {
      __typename: 'Post',
      id: globalId('Post', stored[0]!.id),
      state: 'ACTIVE',
      visibility: 'UNLISTED',
    });
    assert.equal(await db.$count(Notifications), 0);
  });

  test('새 Repost는 Source Post Author에게 source-only Notification을 한 번 생성한다', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('notification-recipient');
    const source = await createContentPost(recipient.id);

    const first = await requestRepost(source.id, auth.token);
    const repeated = await requestRepost(source.id, auth.token);
    const concurrent = await Promise.all(
      Array.from({ length: 3 }, () => requestRepost(source.id, auth.token)),
    );

    assertNoGraphQLErrors(first);
    assertNoGraphQLErrors(repeated);
    concurrent.forEach(assertNoGraphQLErrors);
    const repostId = first.data?.repostPost.repost.id;
    assert.equal(repeated.data?.repostPost.repost.id, repostId);
    assert.ok(repostId);

    const [repost] = await db.select().from(Posts).where(eq(Posts.repostSourceId, source.id));
    assert.ok(repost);
    const notifications = await db.select().from(Notifications);
    assert.equal(notifications.length, 1);
    assert.deepEqual(
      {
        data: notifications[0]?.data,
        kind: notifications[0]?.kind,
        recipientProfileId: notifications[0]?.recipientProfileId,
        sourceId: notifications[0]?.sourceId,
      },
      {
        data: {},
        kind: NotificationKind.REPOST,
        recipientProfileId: recipient.id,
        sourceId: repost.id,
      },
    );
  });

  test('Remote Source Author에게는 Local inbox Notification을 만들지 않는다', async () => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await db
      .insert(Instances)
      .values({
        domain: `${crypto.randomUUID()}.remote.example`,
        kind: InstanceKind.ACTIVITYPUB,
      })
      .returning()
      .then(firstOrThrow);
    const remoteRecipient = await createProfile('remote-notification-recipient', {
      instanceId: remoteInstance.id,
    });
    const source = await createContentPost(remoteRecipient.id);

    const result = await requestRepost(source.id, auth.token);

    assertNoGraphQLErrors(result);
    assert.equal(await db.$count(Notifications), 0);
  });

  test('Notification 저장 실패는 Repost 성공을 rollback하지 않는다', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('failed-notification-recipient');
    const source = await createContentPost(recipient.id);

    await pg.unsafe(`
      CREATE FUNCTION fail_repost_notification_insert() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.kind = 'REPOST' THEN RAISE EXCEPTION 'forced notification failure'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER fail_repost_notification_insert
      BEFORE INSERT ON notification
      FOR EACH ROW EXECUTE FUNCTION fail_repost_notification_insert();
    `);

    try {
      const result = await requestRepost(source.id, auth.token);
      assertNoGraphQLErrors(result);
      assert.equal(
        await db
          .select()
          .from(Posts)
          .where(eq(Posts.repostSourceId, source.id))
          .then((rows) => rows.length),
        1,
      );
      assert.equal(await db.$count(Notifications), 0);
    } finally {
      await pg.unsafe(`
        DROP TRIGGER IF EXISTS fail_repost_notification_insert ON notification;
        DROP FUNCTION IF EXISTS fail_repost_notification_insert();
      `);
    }
  });

  test('Owner·Admin·Member가 선택한 Local Active Profile로 Repost할 수 있다', async () => {
    const sourceAuthor = await createProfile('member-source-author');
    const source = await createContentPost(sourceAuthor.id);

    for (const role of [
      AccountProfileRole.OWNER,
      AccountProfileRole.ADMIN,
      AccountProfileRole.MEMBER,
    ]) {
      const auth = await createAuthenticatedSession({ role });
      const result = await requestRepost(source.id, auth.token);

      assertNoGraphQLErrors(result);
      assert.ok(result.data?.repostPost.repost.id);
    }
  });

  test('조회 가능한 허용 불가 Source는 VALIDATION sourceId로 거부한다', async () => {
    const auth = await createAuthenticatedSession();
    const contentSource = await createContentPost(auth.profile.id);
    const contentlessSource = await db
      .insert(Posts)
      .values({
        profileId: auth.profile.id,
        repostSourceId: contentSource.id,
        state: PostState.ACTIVE,
        visibility: PostVisibility.UNLISTED,
      })
      .returning()
      .then(firstOrThrow);

    const result = await requestRepost(contentlessSource.id, auth.token);

    assert.equal(result.errors?.[0]?.extensions?.code, 'VALIDATION');
    assert.equal(result.errors?.[0]?.extensions?.field, 'sourceId');
    assert.equal(
      await db
        .select()
        .from(Posts)
        .where(eq(Posts.repostSourceId, contentlessSource.id))
        .then((rows) => rows.length),
      0,
    );
  });

  test('누락되거나 조회할 수 없는 Source는 같은 NOT_FOUND로 숨긴다', async () => {
    const auth = await createAuthenticatedSession();
    const author = await createProfile('hidden-author');
    const hiddenSource = await createContentPost(author.id, PostVisibility.FOLLOWERS);

    for (const sourceId of [hiddenSource.id, crypto.randomUUID()]) {
      const result = await requestRepost(sourceId, auth.token);
      assert.equal(result.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    }
  });

  test('비로그인·active Profile 부재·비활성 Account를 거부한다', async () => {
    const sourceAuthor = await createProfile('unauthorized-source-author');
    const source = await createContentPost(sourceAuthor.id);
    const noActiveProfile = await createAuthenticatedSession({ activeProfile: false });
    const disabledAccount = await createAuthenticatedSession({
      accountState: AccountState.DISABLED,
    });

    for (const token of [undefined, noActiveProfile.token, disabledAccount.token]) {
      const result = await requestRepost(source.id, token);
      assert.equal(result.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
    }
  });

  test('membership 부재·비활성 Profile을 거부한다', async () => {
    const sourceAuthor = await createProfile('membership-source-author');
    const source = await createContentPost(sourceAuthor.id);
    const missingMembership = await createAuthenticatedSession();
    const disabledProfile = await createAuthenticatedSession({
      profileState: ProfileState.DISABLED,
    });

    await db
      .delete(AccountProfiles)
      .where(eq(AccountProfiles.accountId, missingMembership.account.id));

    for (const token of [missingMembership.token, disabledProfile.token]) {
      const result = await requestRepost(source.id, token);
      assert.equal(result.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
    }
  });

  test('Post가 아닌 concrete global ID를 sourceId에서 거부한다', async () => {
    const auth = await createAuthenticatedSession();
    const result = await requestGraphQL<{ repostPost: { repost: PostNode } }>(
      `mutation RepostPost($input: RepostPostInput!) {
        repostPost(input: $input) { repost { id } }
      }`,
      { input: { sourceId: globalId('Profile', auth.profile.id) } },
      auth.token,
    );

    assert.ok(result.errors?.[0]);
  });

  test('deletePost는 GraphQL 경로에서 Repost를 Tombstone 처리하고 상태를 갱신한다', async () => {
    const auth = await createAuthenticatedSession();
    const source = await createContentPost(auth.profile.id);
    await requestRepost(source.id, auth.token);
    const repost = await db
      .select()
      .from(Posts)
      .where(and(eq(Posts.profileId, auth.profile.id), eq(Posts.repostSourceId, source.id)))
      .then(firstOrThrow);

    const first = await requestDelete(repost.id, auth.token);
    assertNoGraphQLErrors(first);
    assert.deepEqual(first.data?.deletePost, { postId: globalId('Post', repost.id) });

    const deleted = await db
      .select({ deletedAt: Posts.deletedAt, state: Posts.state })
      .from(Posts)
      .where(eq(Posts.id, repost.id))
      .then(firstOrThrow);
    assert.equal(deleted.state, PostState.DELETED);
    assert.ok(deleted.deletedAt);

    const sourceState = await requestGraphQL<{
      nodes: Array<{
        id: string;
        repostCount: number;
        viewerRepost: { id: string } | null;
      } | null>;
    }>(
      `query RepostState($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Post {
            id
            repostCount
            viewerRepost { id }
          }
        }
      }`,
      { ids: [globalId('Post', source.id)] },
      auth.token,
    );
    assertNoGraphQLErrors(sourceState);
    assert.deepEqual(sourceState.data?.nodes[0], {
      id: globalId('Post', source.id),
      repostCount: 0,
      viewerRepost: null,
    });
  });

  test('deletePost는 비Author와 비로그인 요청을 거부한다', async () => {
    const author = await createAuthenticatedSession();
    const other = await createAuthenticatedSession();
    const source = await createContentPost(author.profile.id);
    await requestRepost(source.id, author.token);
    const repost = await db
      .select()
      .from(Posts)
      .where(and(eq(Posts.profileId, author.profile.id), eq(Posts.repostSourceId, source.id)))
      .then(firstOrThrow);

    for (const token of [other.token, undefined]) {
      const result = await requestDelete(repost.id, token);
      assert.equal(result.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
    }

    const stored = await db
      .select({ state: Posts.state })
      .from(Posts)
      .where(eq(Posts.id, repost.id))
      .then(firstOrThrow);
    assert.equal(stored.state, PostState.ACTIVE);
  });

  test('deletePost는 Post가 아닌 concrete global ID를 거부한다', async () => {
    const auth = await createAuthenticatedSession();
    const result = await requestGraphQL<{ deletePost: { postId: string } }>(
      `mutation DeletePost($input: DeletePostInput!) {
        deletePost(input: $input) { postId }
      }`,
      { input: { id: globalId('Profile', auth.profile.id) } },
      auth.token,
    );

    assert.ok(result.errors?.[0]);
  });
});

type PostNode = {
  __typename: 'Post';
  id: string;
  state: string;
  visibility: string;
};

type GraphQLResult<TData> = {
  data?: TData;
  errors?: Array<{
    extensions?: { code?: string; field?: string };
    message: string;
  }>;
};

const requestRepost = (sourceId: string, token?: string) =>
  requestGraphQL<{ repostPost: { repost: PostNode } }>(
    `mutation RepostPost($input: RepostPostInput!) {
      repostPost(input: $input) {
        repost { __typename id visibility state }
      }
    }`,
    { input: { sourceId: globalId('Post', sourceId) } },
    token,
  );

const requestDelete = (postId: string, token?: string) =>
  requestGraphQL<{ deletePost: { postId: string } }>(
    `mutation DeletePost($input: DeletePostInput!) {
      deletePost(input: $input) { postId }
    }`,
    { input: { id: globalId('Post', postId) } },
    token,
  );

const requestGraphQL = async <TData>(
  query: string,
  variables: Record<string, unknown>,
  token?: string,
): Promise<GraphQLResult<TData>> => {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }
  const response = await app.request('/graphql', {
    body: JSON.stringify({ query, variables }),
    headers,
    method: 'POST',
  });
  assert.equal(response.status, 200);
  return (await response.json()) as GraphQLResult<TData>;
};

const assertNoGraphQLErrors = (result: GraphQLResult<unknown>) => {
  assert.equal(result.errors, undefined, JSON.stringify(result.errors));
};

const createProfile = (
  handle: string,
  {
    instanceId = localInstanceId,
    state = ProfileState.ACTIVE,
  }: { instanceId?: string; state?: ProfileState } = {},
) =>
  db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId,
      normalizedHandle: normalizeHandle(handle),
      state,
    })
    .returning()
    .then(firstOrThrow);

const createContentPost = async (
  profileId: string,
  visibility: PostVisibility = PostVisibility.PUBLIC,
) => {
  const post = await db
    .insert(Posts)
    .values({ profileId, state: PostState.ACTIVE, visibility })
    .returning()
    .then(firstOrThrow);
  const content = await db
    .insert(PostContents)
    .values({
      document: postContentDocumentFromText(crypto.randomUUID()),
      postId: post.id,
    })
    .returning()
    .then(firstOrThrow);

  return db
    .update(Posts)
    .set({ currentContentId: content.id })
    .where(eq(Posts.id, post.id))
    .returning()
    .then(firstOrThrow);
};

const createAuthenticatedSession = async ({
  activeProfile = true,
  accountState = AccountState.ACTIVE,
  profileState = ProfileState.ACTIVE,
  role = AccountProfileRole.OWNER,
}: {
  activeProfile?: boolean;
  accountState?: AccountState;
  profileState?: ProfileState;
  role?: AccountProfileRole;
} = {}) => {
  const suffix = crypto.randomUUID();
  const account = await db
    .insert(Accounts)
    .values({ displayName: suffix, oidcSubject: suffix, state: accountState })
    .returning()
    .then(firstOrThrow);
  const profile = await createProfile(`viewer-${suffix}`, {
    instanceId: localInstanceId,
    state: profileState,
  });
  await db.insert(AccountProfiles).values({
    accountId: account.id,
    profileId: profile.id,
    role,
  });
  const token = `token-${suffix}`;
  await db.insert(Sessions).values({
    accountId: account.id,
    activeProfileId: activeProfile ? profile.id : null,
    state: SessionState.ACTIVE,
    token,
  });

  return { account, profile, token };
};

const resetFixtures = async () => {
  await db.delete(Notifications);
  await db.update(Posts).set({ currentContentId: null });
  await db.delete(PostContents);
  await db.delete(Posts);
  await db.delete(Sessions);
  await db.delete(AccountProfiles);
  await db.delete(Accounts);
  await db.delete(Profiles);
};

const truncateDatabase = async () => {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  assert.ok(['127.0.0.1', '[::1]', 'localhost'].includes(databaseUrl.hostname));
  assert.match(decodeURIComponent(databaseUrl.pathname.slice(1)), /^kosmo_test(?:_[a-z0-9_]+)?$/);
  await pg.unsafe(`
    DO $$
    DECLARE truncate_statement text;
    BEGIN
      SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' CASCADE'
      INTO truncate_statement FROM pg_tables WHERE schemaname = 'public';
      IF truncate_statement IS NOT NULL THEN EXECUTE truncate_statement; END IF;
    END $$;
  `);
};
