import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  AccountProfileRole,
  AccountState,
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
  SessionState,
} from '@kosmo/core/enums';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { normalizeHandle } from '@kosmo/core/utils';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const webhookUrl = 'https://hooks.slack.com/services/T000/B000/report';

process.env.DATABASE_URL = databaseUrl;
process.env.NODE_ENV = 'production';
process.env.PUBLIC_ORIGIN = publicOrigin;
process.env.SLACK_FEEDBACK_WEBHOOK_URL = webhookUrl;

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let ActivityPubPosts: typeof CoreDb.ActivityPubPosts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let PostContents: typeof CoreDb.PostContents;
let ProfileBlocks: typeof CoreDb.ProfileBlocks;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Posts: typeof CoreDb.Posts;
let Profiles: typeof CoreDb.Profiles;
let Sessions: typeof CoreDb.Sessions;
let seedDatabase: typeof CoreSeed.seedDatabase;
let deriveContext: typeof DeriveContext;
let yoga: typeof YogaRouter;
let app: Hono<Env>;
let localInstanceId: string;

type GraphQLResult<TData> = {
  data?: TData;
  errors?: Array<{ extensions?: { code?: string }; message: string }>;
};

const mutation = `
  mutation SubmitContentReport($input: SubmitContentReportInput!) {
    submitContentReport(input: $input) {
      status
    }
  }
`;

before(async () => {
  ({
    AccountProfiles,
    Accounts,
    ActivityPubActors,
    ActivityPubPosts,
    db,
    firstOrThrow,
    Instances,
    pg,
    PostContents,
    ProfileBlocks,
    ProfileFollows,
    Posts,
    Profiles,
    Sessions,
  } = await import('@kosmo/core/db'));
  ({ seedDatabase } = await import('@kosmo/core/db/seed'));
  ({ deriveContext } = await import('../../../src/context'));
  ({ yoga } = await import('../../../src/graphql'));

  await truncateDatabase();
  localInstanceId = (await seedDatabase({ publicOrigin })).localInstance.id;

  app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('context', await deriveContext(c));
    return next();
  });
  app.route('/graphql', yoga);
});

after(async () => {
  delete process.env.SLACK_FEEDBACK_WEBHOOK_URL;
  delete process.env.SLACK_CONTENT_REPORT_WEBHOOK_URL;
  await pg.end();
});

test('Profile report sends a plain-text confirmed target payload and returns delivered', async (t) => {
  const auth = await createAuthenticatedSession();
  const requests: Request[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return new Response('ok', { status: 200 });
  });

  const result = await requestGraphQL<{
    submitContentReport: { status: string };
  }>(
    mutation,
    {
      input: {
        details: '  신고 사유의 추가 정보  ',
        reason: 'OTHER',
        targetId: encodeGlobalId('Profile', auth.profile.id),
        targetType: 'PROFILE',
      },
    },
    auth.token,
  );

  assert.deepEqual(result, { data: { submitContentReport: { status: 'DELIVERED' } } });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, webhookUrl);

  const payload = await requests[0]?.json();
  assert.deepEqual(payload, {
    blocks: [
      {
        text: { text: '새 콘텐츠 신고', type: 'plain_text' },
        type: 'header',
      },
      {
        fields: [
          { text: '대상 종류: PROFILE', type: 'plain_text' },
          { text: `대상 ID: ${auth.profile.id}`, type: 'plain_text' },
          { text: `Kosmo URL: ${publicOrigin}/@${auth.handle}`, type: 'plain_text' },
          { text: 'Remote URI: 없음', type: 'plain_text' },
          { text: '신고 사유: OTHER', type: 'plain_text' },
        ],
        type: 'section',
      },
      {
        text: { text: '상세 내용: 신고 사유의 추가 정보', type: 'plain_text' },
        type: 'section',
      },
    ],
    text: '새 콘텐츠 신고',
    unfurl_links: false,
    unfurl_media: false,
  });
  assert.equal(JSON.stringify(payload).includes(auth.account.id), false);
  assert.equal(JSON.stringify(payload).includes(auth.account.oidcSubject), false);
});

test('Stored Profile Block does not change an otherwise eligible Profile report', async (t) => {
  const reporter = await createAuthenticatedSession();
  const target = await createAuthenticatedSession();
  await db.insert(ProfileBlocks).values({
    ownerProfileId: reporter.profile.id,
    targetProfileId: target.profile.id,
  });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response('ok', { status: 200 });
  });

  assert.deepEqual(await submitReport(target.profile.id, 'PROFILE', reporter.token), {
    data: { submitContentReport: { status: 'DELIVERED' } },
  });
  assert.equal(calls, 1);
});

test('Report without the shared Feedback webhook configuration is rejected before Slack', async (t) => {
  const auth = await createAuthenticatedSession();
  const configuredWebhookUrl = process.env.SLACK_FEEDBACK_WEBHOOK_URL;
  delete process.env.SLACK_FEEDBACK_WEBHOOK_URL;
  process.env.SLACK_CONTENT_REPORT_WEBHOOK_URL = webhookUrl;
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response('ok', { status: 200 });
  });

  try {
    const result = await requestGraphQL<{
      submitContentReport: { status: string };
    }>(
      mutation,
      {
        input: {
          reason: 'SPAM_FRAUD',
          targetId: encodeGlobalId('Profile', auth.profile.id),
          targetType: 'PROFILE',
        },
      },
      auth.token,
    );

    assert.deepEqual(result, { data: { submitContentReport: { status: 'REJECTED' } } });
    assert.equal(calls, 0);
  } finally {
    delete process.env.SLACK_CONTENT_REPORT_WEBHOOK_URL;
    if (configuredWebhookUrl === undefined) {
      delete process.env.SLACK_FEEDBACK_WEBHOOK_URL;
    } else {
      process.env.SLACK_FEEDBACK_WEBHOOK_URL = configuredWebhookUrl;
    }
  }
});

test('Account without a selected Profile can report a public Post', async (t) => {
  const auth = await createAuthenticatedSession({ selectProfile: false });
  const post = await createPost(auth.profile.id, PostVisibility.PUBLIC);
  const targetId = encodeGlobalId('Post', post.id);
  const requests: Request[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return new Response('ok', { status: 200 });
  });

  const result = await requestGraphQL<{
    submitContentReport: { status: string };
  }>(
    mutation,
    {
      input: {
        reason: 'HARMFUL_CONTENT',
        targetId,
        targetType: 'POST',
      },
    },
    auth.token,
  );

  assert.deepEqual(result, { data: { submitContentReport: { status: 'DELIVERED' } } });
  assert.equal(requests.length, 1);

  const payload = (await requests[0]?.json()) as {
    blocks: Array<{ fields?: Array<{ text: string }> }>;
  };
  const targetFields = payload.blocks[1]?.fields;
  assert.ok(targetFields);
  assert.ok(targetFields.some(({ text }) => text === `대상 ID: ${post.id}`));
  const kosmoUrlText = targetFields.find(({ text }) => text.startsWith('Kosmo URL: '))?.text;
  assert.ok(kosmoUrlText);
  const pathSegment = new URL(kosmoUrlText.slice('Kosmo URL: '.length)).pathname.split('/').at(-1);
  assert.ok(pathSegment);
  assert.equal(pathSegment, targetId);
});

test('Nullable details are accepted by a valid GraphQL report', async (t) => {
  const auth = await createAuthenticatedSession();
  const requests: Request[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return new Response('ok', { status: 200 });
  });

  const result = await requestGraphQL<{
    submitContentReport: { status: string };
  }>(
    mutation,
    {
      input: {
        details: null,
        reason: 'SPAM_FRAUD',
        targetId: encodeGlobalId('Profile', auth.profile.id),
        targetType: 'PROFILE',
      },
    },
    auth.token,
  );

  assert.deepEqual(result, { data: { submitContentReport: { status: 'DELIVERED' } } });
  assert.equal(requests.length, 1);
  assert.equal(JSON.stringify(await requests[0]?.json()).includes('상세 내용: 없음'), true);
});

test('Anonymous report requests are rejected before target lookup or Slack', async (t) => {
  const auth = await createAuthenticatedSession();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response('ok', { status: 200 });
  });

  const result = await requestGraphQL(mutation, {
    input: {
      reason: 'SPAM_FRAUD',
      targetId: encodeGlobalId('Profile', auth.profile.id),
      targetType: 'PROFILE',
    },
  });

  assert.equal(result.data, null);
  assert.equal(result.errors?.length, 1);
  assert.equal(calls, 0);
});

test('Post report uses submit-time access and rejects an inaccessible target without Slack', async (t) => {
  const auth = await createAuthenticatedSession();
  const post = await createPost(auth.profile.id, PostVisibility.PUBLIC);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response('ok', { status: 200 });
  });

  const delivered = await requestGraphQL<{
    submitContentReport: { status: string };
  }>(
    mutation,
    {
      input: {
        reason: 'SPAM_FRAUD',
        targetId: encodeGlobalId('Post', post.id),
        targetType: 'POST',
      },
    },
    auth.token,
  );
  assert.deepEqual(delivered, { data: { submitContentReport: { status: 'DELIVERED' } } });

  await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, post.id));
  const rejected = await requestGraphQL<{
    submitContentReport: { status: string };
  }>(
    mutation,
    {
      input: {
        reason: 'SPAM_FRAUD',
        targetId: encodeGlobalId('Post', post.id),
        targetType: 'POST',
      },
    },
    auth.token,
  );

  assert.deepEqual(rejected, { data: { submitContentReport: { status: 'REJECTED' } } });
  assert.equal(calls, 1);
});

test('Stored Block direction does not change otherwise eligible Post reports', async (t) => {
  const blocker = await createAuthenticatedSession();
  const blocked = await createAuthenticatedSession();
  const blockedPost = await createPost(blocked.profile.id, PostVisibility.PUBLIC);
  const blockerPost = await createPost(blocker.profile.id, PostVisibility.PUBLIC);
  await db.insert(ProfileBlocks).values({
    ownerProfileId: blocker.profile.id,
    targetProfileId: blocked.profile.id,
  });

  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response('ok', { status: 200 });
  });

  const delivered = await requestGraphQL<{
    submitContentReport: { status: string };
  }>(
    mutation,
    {
      input: {
        reason: 'SPAM_FRAUD',
        targetId: encodeGlobalId('Post', blockedPost.id),
        targetType: 'POST',
      },
    },
    blocker.token,
  );
  assert.deepEqual(delivered, { data: { submitContentReport: { status: 'DELIVERED' } } });
  assert.equal(calls, 1);
  calls = 0;

  const reverse = await requestGraphQL<{
    submitContentReport: { status: string };
  }>(
    mutation,
    {
      input: {
        reason: 'SPAM_FRAUD',
        targetId: encodeGlobalId('Post', blockerPost.id),
        targetType: 'POST',
      },
    },
    blocked.token,
  );
  assert.deepEqual(reverse, { data: { submitContentReport: { status: 'DELIVERED' } } });
  assert.equal(calls, 1);
});

test('Report FOLLOWERS eligibility uses the stored Follow independently of Block', async (t) => {
  const blocker = await createAuthenticatedSession();
  const blocked = await createAuthenticatedSession();
  const post = await createPost(blocked.profile.id, PostVisibility.FOLLOWERS);
  await db.insert(ProfileBlocks).values({
    ownerProfileId: blocker.profile.id,
    targetProfileId: blocked.profile.id,
  });
  await db.insert(ProfileFollows).values({
    followerProfileId: blocker.profile.id,
    followeeProfileId: blocked.profile.id,
  });

  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response('ok', { status: 200 });
  });

  const result = await requestGraphQL<{
    submitContentReport: { status: string };
  }>(
    mutation,
    {
      input: {
        reason: 'SPAM_FRAUD',
        targetId: encodeGlobalId('Post', post.id),
        targetType: 'POST',
      },
    },
    blocker.token,
  );

  assert.deepEqual(result, { data: { submitContentReport: { status: 'DELIVERED' } } });
  assert.equal(calls, 1);
});

test('Mutual Blocks do not add a report eligibility condition', async (t) => {
  const first = await createAuthenticatedSession();
  const second = await createAuthenticatedSession();
  const firstPost = await createPost(first.profile.id, PostVisibility.PUBLIC);
  const secondPost = await createPost(second.profile.id, PostVisibility.PUBLIC);
  await db.insert(ProfileBlocks).values([
    { ownerProfileId: first.profile.id, targetProfileId: second.profile.id },
    { ownerProfileId: second.profile.id, targetProfileId: first.profile.id },
  ]);

  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response('ok', { status: 200 });
  });

  const firstReport = await requestGraphQL<{
    submitContentReport: { status: string };
  }>(
    mutation,
    {
      input: {
        reason: 'SPAM_FRAUD',
        targetId: encodeGlobalId('Post', secondPost.id),
        targetType: 'POST',
      },
    },
    first.token,
  );
  const secondReport = await requestGraphQL<{
    submitContentReport: { status: string };
  }>(
    mutation,
    {
      input: {
        reason: 'SPAM_FRAUD',
        targetId: encodeGlobalId('Post', firstPost.id),
        targetType: 'POST',
      },
    },
    second.token,
  );

  assert.deepEqual(firstReport, { data: { submitContentReport: { status: 'DELIVERED' } } });
  assert.deepEqual(secondReport, { data: { submitContentReport: { status: 'DELIVERED' } } });
  assert.equal(calls, 2);
});

test('Other without details is rejected before target lookup and Slack', async (t) => {
  const auth = await createAuthenticatedSession();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response('ok', { status: 200 });
  });

  const result = await requestGraphQL(
    mutation,
    {
      input: {
        details: '   ',
        reason: 'OTHER',
        targetId: encodeGlobalId('Profile', auth.profile.id),
        targetType: 'PROFILE',
      },
    },
    auth.token,
  );

  assert.equal(result.data, null);
  assert.equal(result.errors?.length, 1);
  assert.equal(result.errors?.[0]?.extensions?.code, 'VALIDATION');
  assert.equal(calls, 0);
});

test('Report eligibility preserves each stored Post visibility and the selected viewer boundary', async (t) => {
  const author = await createAuthenticatedSession();
  const follower = await createAuthenticatedSession();
  const stranger = await createAuthenticatedSession();
  const unselected = await createAuthenticatedSession({ selectProfile: false });
  await db.insert(ProfileFollows).values([
    { followerProfileId: follower.profile.id, followeeProfileId: author.profile.id },
    { followerProfileId: unselected.profile.id, followeeProfileId: author.profile.id },
  ]);
  // Owning another Profile with access must not lend that Profile's permissions.
  await db.insert(AccountProfiles).values({
    accountId: stranger.account.id,
    profileId: follower.profile.id,
    role: AccountProfileRole.OWNER,
  });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response('ok', { status: 200 });
  });
  const cases = [
    { visibility: PostVisibility.PUBLIC, allowed: [true, true, true, true] },
    { visibility: PostVisibility.UNLISTED, allowed: [true, true, true, true] },
    { visibility: PostVisibility.FOLLOWERS, allowed: [true, true, false, false] },
    { visibility: PostVisibility.DIRECT, allowed: [true, false, false, false] },
  ];
  for (const { visibility, allowed } of cases) {
    const post = await createPost(author.profile.id, visibility);
    for (const [index, viewer] of [author, follower, stranger, unselected].entries()) {
      await t.test(`${visibility}, viewer ${index}`, async () => {
        const beforeCalls = calls;
        const result = await submitReport(post.id, 'POST', viewer.token);
        assert.deepEqual(result, {
          data: { submitContentReport: { status: allowed[index] ? 'DELIVERED' : 'REJECTED' } },
        });
        assert.equal(calls - beforeCalls, allowed[index] ? 1 : 0);
      });
    }
  }
});

test('Report retries recheck Follow and visibility without borrowing stale access', async (t) => {
  const author = await createAuthenticatedSession();
  const viewer = await createAuthenticatedSession();
  const post = await createPost(author.profile.id, PostVisibility.FOLLOWERS);
  const follow = await db
    .insert(ProfileFollows)
    .values({
      followerProfileId: viewer.profile.id,
      followeeProfileId: author.profile.id,
    })
    .returning()
    .then(firstOrThrow);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response('ok', { status: 200 });
  });
  assert.deepEqual(await submitReport(post.id, 'POST', viewer.token), {
    data: { submitContentReport: { status: 'DELIVERED' } },
  });
  await db.update(Posts).set({ visibility: PostVisibility.DIRECT }).where(eq(Posts.id, post.id));
  assert.deepEqual(await submitReport(post.id, 'POST', viewer.token), {
    data: { submitContentReport: { status: 'REJECTED' } },
  });
  assert.equal(calls, 1);
  await db.update(Posts).set({ visibility: PostVisibility.FOLLOWERS }).where(eq(Posts.id, post.id));
  assert.deepEqual(await submitReport(post.id, 'POST', viewer.token), {
    data: { submitContentReport: { status: 'DELIVERED' } },
  });
  await db.delete(ProfileFollows).where(eq(ProfileFollows.id, follow.id));
  assert.deepEqual(await submitReport(post.id, 'POST', viewer.token), {
    data: { submitContentReport: { status: 'REJECTED' } },
  });
  assert.equal(calls, 2);
});

test('Inactive accounts and revoked sessions cannot submit reports', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response('ok', { status: 200 });
  });
  for (const state of [AccountState.DISABLED, AccountState.SUSPENDED]) {
    const auth = await createAuthenticatedSession();
    await db.update(Accounts).set({ state }).where(eq(Accounts.id, auth.account.id));
    const result = await submitReport(auth.profile.id, 'PROFILE', auth.token);
    assert.equal(result.data, null);
    assert.equal(result.errors?.length, 1);
  }
  const auth = await createAuthenticatedSession();
  await db
    .update(Sessions)
    .set({ state: SessionState.REVOKED })
    .where(eq(Sessions.token, auth.token));
  const result = await submitReport(auth.profile.id, 'PROFILE', auth.token);
  assert.equal(result.data, null);
  assert.equal(result.errors?.length, 1);
  assert.equal(calls, 0);
});

test('Report targets retain Profile, Instance, content and identity validity checks', async (t) => {
  const reporter = await createAuthenticatedSession();
  const author = await createAuthenticatedSession();
  const post = await createPost(author.profile.id, PostVisibility.PUBLIC);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response('ok', { status: 200 });
  });
  for (const state of [ProfileState.DISABLED, ProfileState.SUSPENDED]) {
    await db.update(Profiles).set({ state }).where(eq(Profiles.id, author.profile.id));
    for (const [id, kind] of [
      [author.profile.id, 'PROFILE'],
      [post.id, 'POST'],
    ] as const) {
      assert.deepEqual(await submitReport(id, kind, reporter.token), {
        data: { submitContentReport: { status: 'REJECTED' } },
      });
    }
  }
  await db
    .update(Profiles)
    .set({ state: ProfileState.ACTIVE })
    .where(eq(Profiles.id, author.profile.id));
  const originalInstance = await db
    .select()
    .from(Instances)
    .where(eq(Instances.id, localInstanceId))
    .then(firstOrThrow);
  try {
    await db
      .update(Instances)
      .set({ state: InstanceState.SUSPENDED })
      .where(eq(Instances.id, localInstanceId));
    for (const [id, kind] of [
      [author.profile.id, 'PROFILE'],
      [post.id, 'POST'],
    ] as const) {
      assert.deepEqual(await submitReport(id, kind, reporter.token), {
        data: { submitContentReport: { status: 'REJECTED' } },
      });
    }
  } finally {
    await db
      .update(Instances)
      .set({ state: originalInstance.state })
      .where(eq(Instances.id, localInstanceId));
  }
  await db.update(Posts).set({ currentContentId: null }).where(eq(Posts.id, post.id));
  assert.deepEqual(await submitReport(post.id, 'POST', reporter.token), {
    data: { submitContentReport: { status: 'REJECTED' } },
  });
  for (const targetId of [
    'invalid',
    encodeGlobalId('Profile', author.profile.id),
    encodeGlobalId('Post', crypto.randomUUID()),
  ]) {
    const result = await requestGraphQL(
      mutation,
      {
        input: { targetId, targetType: 'POST', reason: 'SPAM_FRAUD' },
      },
      reporter.token,
    );
    assert.deepEqual(result, { data: { submitContentReport: { status: 'REJECTED' } } });
  }
  assert.equal(calls, 0);
});

test('Stored remote Post and Profile reports use server-resolved identity without remote fetch', async (t) => {
  const reporter = await createAuthenticatedSession();
  const domain = `report-${crypto.randomUUID()}.example`;
  const instance = await db
    .insert(Instances)
    .values({
      domain,
      kind: InstanceKind.ACTIVITYPUB,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const profile = await db
    .insert(Profiles)
    .values({
      displayName: 'Remote report target',
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: 'remote',
      instanceId: instance.id,
      normalizedHandle: 'remote',
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const actorUri = `https://${domain}/users/remote`;
  await db.insert(ActivityPubActors).values({
    profileId: profile.id,
    type: ActivityPubActorType.PERSON,
    uri: actorUri,
  });
  const post = await createPost(profile.id, PostVisibility.UNLISTED);
  const postUri = `https://${domain}/posts/1`;
  await db.insert(ActivityPubPosts).values({
    postId: post.id,
    receivedAt: Temporal.Now.instant(),
    uri: postUri,
  });
  const requests: Request[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return new Response('ok', { status: 200 });
  });
  for (const [id, kind, uri] of [
    [profile.id, 'PROFILE', actorUri],
    [post.id, 'POST', postUri],
  ] as const) {
    assert.deepEqual(await submitReport(id, kind, reporter.token), {
      data: { submitContentReport: { status: 'DELIVERED' } },
    });
    const request = requests.at(-1);
    assert.ok(request);
    assert.equal(request.url, webhookUrl);
    const payload = (await request.json()) as {
      blocks: Array<{ fields?: Array<{ text: string }> }>;
    };
    assert.ok(payload.blocks[1]?.fields?.some(({ text }) => text === `Remote URI: ${uri}`));
    assert.ok(payload.blocks[1]?.fields?.some(({ text }) => text.includes(`/@remote@${domain}`)));
  }
  assert.equal(requests.length, 2);
});

test('GraphQL rejects invalid report input before Slack', async (t) => {
  const auth = await createAuthenticatedSession();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response('ok', { status: 200 });
  });
  const valid = {
    targetId: encodeGlobalId('Profile', auth.profile.id),
    targetType: 'PROFILE',
    reason: 'SPAM_FRAUD',
  };
  for (const [input, expectedStatus] of [
    [{ ...valid, reason: 'INVALID_REASON' }, 400],
    [{ ...valid, details: 'x'.repeat(2001) }, 200],
    [{ ...valid, targetType: 'INVALID_TARGET' }, 400],
    [{ ...valid, reporterAccountId: auth.account.id, kosmoUrl: 'https://attacker.example' }, 400],
  ] as const) {
    const result = await requestGraphQL(mutation, { input }, auth.token, expectedStatus);
    assert.ok(result.errors?.length);
  }
  assert.equal(calls, 0);
});

const submitReport = (id: string, kind: 'POST' | 'PROFILE', token: string) =>
  requestGraphQL(
    mutation,
    {
      input: {
        reason: 'SPAM_FRAUD',
        targetId: encodeGlobalId(kind === 'POST' ? 'Post' : 'Profile', id),
        targetType: kind,
      },
    },
    token,
  );

const requestGraphQL = async <TData = Record<string, unknown>>(
  query: string,
  variables: Record<string, unknown>,
  token?: string,
  expectedStatus = 200,
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
  assert.equal(response.status, expectedStatus);
  return (await response.json()) as GraphQLResult<TData>;
};

const createAuthenticatedSession = async ({
  selectProfile = true,
}: { selectProfile?: boolean } = {}) => {
  const handle = `report-${crypto.randomUUID().slice(0, 8)}`;
  const account = await db
    .insert(Accounts)
    .values({
      displayName: 'Report Account',
      oidcSubject: `report-oidc-${crypto.randomUUID()}`,
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const profile = await db
    .insert(Profiles)
    .values({
      displayName: 'Report Profile',
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId: localInstanceId,
      normalizedHandle: normalizeHandle(handle),
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  await db.insert(AccountProfiles).values({
    accountId: account.id,
    profileId: profile.id,
    role: AccountProfileRole.OWNER,
  });
  const token = `report-token-${crypto.randomUUID()}`;
  await db.insert(Sessions).values({
    accountId: account.id,
    activeProfileId: selectProfile ? profile.id : null,
    state: SessionState.ACTIVE,
    token,
  });
  return { account, handle, profile, token };
};

const createPost = async (profileId: string, visibility: PostVisibility) => {
  const post = await db
    .insert(Posts)
    .values({ profileId, state: PostState.ACTIVE, visibility })
    .returning()
    .then(firstOrThrow);
  const content = await db
    .insert(PostContents)
    .values({ document: postContentDocumentFromText('reportable post'), postId: post.id })
    .returning()
    .then(firstOrThrow);

  return db
    .update(Posts)
    .set({ currentContentId: content.id })
    .where(eq(Posts.id, post.id))
    .returning()
    .then(firstOrThrow);
};

const truncateDatabase = async () => {
  const database = new URL(databaseUrl);
  assert.ok(new Set(['127.0.0.1', '[::1]', 'localhost']).has(database.hostname));
  assert.match(database.pathname, /^\/kosmo_test(?:_[a-z0-9_]+)?$/);
  await pg.unsafe(`
    DO $$
    DECLARE truncate_statement text;
    BEGIN
      SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ')
      INTO truncate_statement FROM pg_tables WHERE schemaname = 'public';
      IF truncate_statement IS NOT NULL THEN EXECUTE truncate_statement; END IF;
    END $$;
  `);
};
