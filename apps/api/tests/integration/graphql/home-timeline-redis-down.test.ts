import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  AccountProfileRole,
  AccountState,
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
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
process.env.REDIS_URL = 'redis://127.0.0.1:1';
process.env.DATABASE_URL = databaseUrl;

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let Posts: typeof CoreDb.Posts;
let PostContents: typeof CoreDb.PostContents;
let Profiles: typeof CoreDb.Profiles;
let Sessions: typeof CoreDb.Sessions;
let deriveContext: typeof DeriveContext;
let yoga: typeof YogaRouter;
let app: Hono<Env>;
let instanceId: string;
let accountId: string;
let profileId: string;
let postId: string;
let contentId: string;
let sessionId: string;
let token: string;

before(async () => {
  process.env.NODE_ENV = 'production';
  process.env.PUBLIC_ORIGIN = 'http://127.0.0.1:4173';
  process.env.ENVIRONMENT = 'test';

  ({
    AccountProfiles,
    Accounts,
    db,
    firstOrThrow,
    Instances,
    pg,
    Posts,
    PostContents,
    Profiles,
    Sessions,
  } = await import('@kosmo/core/db'));
  ({ deriveContext } = await import('../../../src/context'));
  ({ yoga } = await import('../../../src/graphql'));

  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  const instance = await db
    .insert(Instances)
    .values({
      canonicalOrigin: `https://home-down-${suffix}.example`,
      domain: `home-down-${suffix}.example`,
      kind: InstanceKind.LOCAL,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  instanceId = instance.id;
  const account = await db
    .insert(Accounts)
    .values({
      displayName: `Redis down ${suffix}`,
      oidcSubject: `home-redis-down-${suffix}`,
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  accountId = account.id;
  const profile = await db
    .insert(Profiles)
    .values({
      displayName: `home-down-${suffix}`,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: `home-down-${suffix}`,
      instanceId,
      normalizedHandle: `home-down-${suffix}`,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  profileId = profile.id;
  await db.insert(AccountProfiles).values({
    accountId,
    profileId,
    role: AccountProfileRole.OWNER,
  });
  token = `home-down-token-${suffix}`;
  const session = await db
    .insert(Sessions)
    .values({
      accountId,
      activeProfileId: profileId,
      state: SessionState.ACTIVE,
      token,
    })
    .returning()
    .then(firstOrThrow);
  sessionId = session.id;

  const post = await db
    .insert(Posts)
    .values({
      profileId,
      state: PostState.ACTIVE,
      visibility: PostVisibility.PUBLIC,
    })
    .returning()
    .then(firstOrThrow);
  postId = post.id;
  const content = await db
    .insert(PostContents)
    .values({
      document: postContentDocumentFromText('Home DB fallback while Redis is down'),
      postId,
    })
    .returning()
    .then(firstOrThrow);
  contentId = content.id;
  await db.update(Posts).set({ currentContentId: contentId }).where(eq(Posts.id, postId));

  app = new Hono<Env>();
  app.use('*', async (context, next) => {
    context.set('context', await deriveContext(context));
    return next();
  });
  app.route('/graphql', yoga);
});

after(async () => {
  await db.update(Posts).set({ currentContentId: null }).where(eq(Posts.id, postId));
  await db.delete(Sessions).where(eq(Sessions.id, sessionId));
  await db.delete(PostContents).where(eq(PostContents.id, contentId));
  await db.delete(Posts).where(eq(Posts.id, postId));
  await db.delete(AccountProfiles).where(eq(AccountProfiles.accountId, accountId));
  await db.delete(Accounts).where(eq(Accounts.id, accountId));
  await db.delete(Profiles).where(eq(Profiles.id, profileId));
  await db.delete(Instances).where(eq(Instances.id, instanceId));
  await pg.end();
});

test('returns DB Home rows without GraphQL errors when the configured Redis endpoint is unavailable', async () => {
  const response = await app.request('/graphql', {
    body: JSON.stringify({
      query: `query HomeDuringRedisDowntime {
          homeTimeline(first: 10) {
            edges { cursor node { id content { bodyText } } }
            pageInfo { endCursor hasNextPage hasPreviousPage }
          }
        }`,
    }),
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  assert.equal(response.status, 200);
  const result = (await response.json()) as {
    readonly data?: {
      readonly homeTimeline: {
        readonly edges: readonly {
          readonly cursor: string;
          readonly node: {
            readonly id: string;
            readonly content: { readonly bodyText: string } | null;
          };
        }[];
      };
    } | null;
    readonly errors?: readonly { readonly message: string }[];
  };
  assert.equal(result.errors, undefined, JSON.stringify(result.errors));
  assert.deepEqual(
    result.data?.homeTimeline.edges.map(({ cursor, node }) => [
      cursor,
      node.id,
      node.content?.bodyText,
    ]),
    [[`db:${postId}`, encodeGlobalId('Post', postId), 'Home DB fallback while Redis is down']],
  );
});
