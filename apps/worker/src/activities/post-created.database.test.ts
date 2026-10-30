import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { afterEach, before, test } from 'node:test';
import {
  AccountState,
  InstanceKind,
  InstanceState,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { inArray } from 'drizzle-orm';
import type * as coreDb from '@kosmo/core/db';
import type { capturePostCreatedActivity as CapturePostCreatedActivity } from './post-created';

process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let db: typeof coreDb.db;
let Accounts: typeof coreDb.Accounts;
let Instances: typeof coreDb.Instances;
let Posts: typeof coreDb.Posts;
let Profiles: typeof coreDb.Profiles;
let firstOrThrow: typeof coreDb.firstOrThrow;
let capturePostCreatedActivity: typeof CapturePostCreatedActivity;

before(async () => {
  ({ Accounts, Instances, Posts, Profiles, db, firstOrThrow } = await import('@kosmo/core/db'));
  ({ capturePostCreatedActivity } = await import('./post-created'));
});

const accountIds = new Set<string>();
const instanceIds = new Set<string>();
const postIds = new Set<string>();
const profileIds = new Set<string>();

const environmentKeys = ['ENVIRONMENT', 'POSTHOG_HOST', 'POSTHOG_KEY'] as const;
const originalEnvironment = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]]),
);

function setEnvironment(
  values: Partial<Record<(typeof environmentKeys)[number], string | undefined>>,
): void {
  for (const key of environmentKeys) {
    const value = values[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

const createAuthor = async () => {
  const suffix = crypto.randomUUID();
  const account = await db
    .insert(Accounts)
    .values({ displayName: suffix, oidcSubject: suffix, state: AccountState.ACTIVE })
    .returning()
    .then(firstOrThrow);
  accountIds.add(account.id);
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind: InstanceKind.LOCAL,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  instanceIds.add(instance.id);
  const profile = await db
    .insert(Profiles)
    .values({
      displayName: suffix,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: suffix,
      instanceId: instance.id,
      normalizedHandle: suffix,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  profileIds.add(profile.id);
  return { account, profile };
};

const createPost = async (profileId: string, actorAccountId: string | null) => {
  const post = await db
    .insert(Posts)
    .values({
      actorAccountId,
      currentContentId: null,
      profileId,
      replyParentId: null,
      repostSourceId: null,
      state: PostState.ACTIVE,
      visibility: PostVisibility.FOLLOWERS,
    })
    .returning()
    .then(firstOrThrow);
  postIds.add(post.id);
  return post;
};

afterEach(async () => {
  if (postIds.size > 0) {
    await db.delete(Posts).where(inArray(Posts.id, [...postIds]));
    postIds.clear();
  }
  if (profileIds.size > 0) {
    await db.delete(Profiles).where(inArray(Profiles.id, [...profileIds]));
    profileIds.clear();
  }
  if (instanceIds.size > 0) {
    await db.delete(Instances).where(inArray(Instances.id, [...instanceIds]));
    instanceIds.clear();
  }
  if (accountIds.size > 0) {
    await db.delete(Accounts).where(inArray(Accounts.id, [...accountIds]));
    accountIds.clear();
  }
});

test('post_created capture skips development, missing Posts, and Posts without an Account', async (t) => {
  let requests = 0;
  t.after(() => setEnvironment(originalEnvironment));
  t.mock.method(globalThis, 'fetch', async () => {
    requests += 1;
    return new Response(null, { status: 200 });
  });

  setEnvironment({ ENVIRONMENT: 'dev', POSTHOG_HOST: undefined, POSTHOG_KEY: undefined });
  await capturePostCreatedActivity({
    analyticsPlatform: 'web',
    postId: crypto.randomUUID(),
  });
  assert.equal(requests, 0);

  const author = await createAuthor();
  const post = await createPost(author.profile.id, null);
  setEnvironment({ ENVIRONMENT: 'prod', POSTHOG_HOST: undefined, POSTHOG_KEY: undefined });
  await capturePostCreatedActivity({ analyticsPlatform: 'native', postId: post.id });
  await capturePostCreatedActivity({ analyticsPlatform: 'native', postId: crypto.randomUUID() });
  assert.equal(requests, 0);
});

test('post_created capture uses the committed Post identity, profile, visibility, and time', async (t) => {
  const author = await createAuthor();
  const post = await createPost(author.profile.id, author.account.id);
  let requestUrl: string | undefined;
  let payload: Record<string, unknown> | undefined;
  t.after(() => setEnvironment(originalEnvironment));
  setEnvironment({
    ENVIRONMENT: 'prod',
    POSTHOG_HOST: 'https://us.i.posthog.com',
    POSTHOG_KEY: 'capture-key',
  });
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    requestUrl = String(input);
    assert.equal(init?.method, 'POST');
    assert.ok(init?.signal);
    payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(null, { status: 200 });
  });

  await capturePostCreatedActivity({ analyticsPlatform: 'web', postId: post.id });

  const accountGlobalId = encodeGlobalId('Account', author.account.id);
  assert.equal(requestUrl, 'https://us.i.posthog.com/capture/');
  assert.deepEqual(payload, {
    api_key: 'capture-key',
    event: 'post_created',
    distinct_id: accountGlobalId,
    timestamp: post.createdAt.toString(),
    uuid: post.id,
    properties: {
      $user_id: accountGlobalId,
      client_platform: 'web',
      selected_profile_id: encodeGlobalId('Profile', author.profile.id),
      visibility: PostVisibility.FOLLOWERS,
    },
  });
});

test('post_created capture rejects invalid production configuration and HTTP failures', async (t) => {
  const author = await createAuthor();
  const post = await createPost(author.profile.id, author.account.id);
  let requests = 0;
  t.after(() => setEnvironment(originalEnvironment));
  setEnvironment({ ENVIRONMENT: 'prod', POSTHOG_HOST: undefined, POSTHOG_KEY: 'capture-key' });
  await assert.rejects(
    capturePostCreatedActivity({ analyticsPlatform: 'native', postId: post.id }),
    /POSTHOG_HOST and POSTHOG_KEY are required/,
  );

  process.env.POSTHOG_HOST = 'http://us.i.posthog.com';
  await assert.rejects(
    capturePostCreatedActivity({ analyticsPlatform: 'native', postId: post.id }),
    /POSTHOG_HOST must use HTTPS/,
  );

  process.env.POSTHOG_HOST = 'https://us.i.posthog.com';
  t.mock.method(globalThis, 'fetch', async () => {
    requests += 1;
    return new Response(null, { status: 503 });
  });
  await assert.rejects(
    capturePostCreatedActivity({ analyticsPlatform: 'native', postId: post.id }),
    /PostHog capture failed with HTTP 503/,
  );
  assert.equal(requests, 1);
});
