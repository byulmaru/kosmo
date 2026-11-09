import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, mock, test } from 'node:test';
import {
  createFederation,
  generateCryptoKeyPair,
  MemoryKvStore,
  signRequest,
} from '@fedify/fedify';
import {
  Article,
  Create,
  CryptographicKey,
  Document,
  Emoji,
  Hashtag,
  Image,
  LanguageString,
  Mention,
  Note,
  Person,
  PUBLIC_COLLECTION,
} from '@fedify/vocab';
import { getDocumentLoader } from '@fedify/vocab-runtime';
import {
  AccountProfileRole,
  AccountState,
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  NotificationKind,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { postContentDocumentToText } from '@kosmo/core/post-content/server';
import { temporalClient } from '@kosmo/core/temporal/client';
import { postCreateWorkflow } from '@kosmo/core/temporal/post-create';
import {
  remoteProfileLookupWorkflow,
  remoteProfileRefreshWorkflow,
} from '@kosmo/core/temporal/workflows';
import { eq, ne, sql } from 'drizzle-orm';
import { uniqueHref } from './activitypub-uri';
import { resolveStoredInboundMentionCandidates } from './inbound-mention';
import { setInboundObservabilityReporter } from './inbound-observability';
import type { DocumentLoader, InboxContext } from '@fedify/fedify';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type * as CoreServices from '@kosmo/core/services';
import type { RemoteProfileLookupInput } from '@kosmo/core/temporal/workflows';
import type { findPostByActivityPubUri as findPostByActivityPubUriType } from './activitypub-post-uri';
import type { handleInboundCreate as handleInboundCreateType } from './inbound-create';
import type { materializeHydratedRemoteNote as materializeHydratedRemoteNoteType } from './inbound-create-note';
import type { ensureDrizzleLocalProfileActor as ensureDrizzleLocalProfileActorType } from './local-actor-store';
import type * as Materialization from './remote-actor-materialization';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const localProfileId = '019f6f67-1111-7777-8888-123456789abc';
const remoteActorUri = new URL('https://remote.example/users/alice');
const remoteKeyUri = new URL('#main-key', remoteActorUri);
const remoteObjectUri = new URL('https://remote.example/notes/1');
const receivedAt = Temporal.Instant.from('2026-07-16T00:00:00Z');
const createObservation = { activityType: 'Create', handler: 'create' } as const;
const uriFederation = createFederation<void>({ kv: new MemoryKvStore() });
uriFederation.setObjectDispatcher(Note, '/ap/note/{id}', () => null);
const uriContext = uriFederation.createContext(new URL(publicOrigin), undefined);
const nativeWorkflowExecute = temporalClient.workflow.execute.bind(temporalClient.workflow);

type RemoteProfileRefreshOptions = {
  args?: readonly { actorUri: string }[];
  workflowId?: string;
  workflowIdConflictPolicy?: string;
  workflowIdReusePolicy?: string;
};

const assertRemoteProfileRefreshCall = (workflow: unknown, options: unknown, actorUri: string) => {
  assert.equal(workflow, remoteProfileRefreshWorkflow.workflow);
  assert.ok(options && typeof options === 'object');
  const workflowOptions = options as RemoteProfileRefreshOptions;
  assert.deepEqual(workflowOptions.args, [{ actorUri }]);
  assert.equal(
    workflowOptions.workflowId,
    remoteProfileRefreshWorkflow.workflowIdFromArgs({ actorUri }),
  );
  assert.equal(workflowOptions.workflowIdConflictPolicy, 'USE_EXISTING');
  assert.equal(workflowOptions.workflowIdReusePolicy, 'ALLOW_DUPLICATE');
};

const remoteProfileWorkflowCallCount = (
  calls: readonly { readonly arguments: readonly unknown[] }[],
): number =>
  calls.filter(
    ({ arguments: [workflow] }) =>
      workflow === remoteProfileLookupWorkflow.workflow ||
      workflow === remoteProfileRefreshWorkflow.workflow,
  ).length;

const mockRemoteProfileRefresh = (execute: (actorUri: string) => Promise<string>) => {
  const executions = new Map<string, Promise<string>>();

  return mock.method(
    temporalClient.workflow,
    'execute',
    async (workflow: unknown, options: unknown) => {
      assert.ok(options && typeof options === 'object');

      if (workflow === remoteProfileLookupWorkflow.workflow) {
        const workflowOptions = options as {
          args?: readonly RemoteProfileLookupInput[];
          workflowId?: string;
        };
        const input = workflowOptions.args?.[0];
        assert.ok(input && 'actorUri' in input);
        assert.equal(workflowOptions.args?.length, 1);
        assert.equal(
          workflowOptions.workflowId,
          remoteProfileLookupWorkflow.workflowIdFromArgs(input),
        );

        const workflowId = workflowOptions.workflowId;
        assert.ok(typeof workflowId === 'string');
        let execution = executions.get(workflowId);
        if (!execution) {
          execution = Promise.resolve().then(async () => {
            try {
              return await execute(input.actorUri);
            } finally {
              if (executions.get(workflowId) === execution) {
                executions.delete(workflowId);
              }
            }
          });
          executions.set(workflowId, execution);
        }
        return execution;
      }

      if (workflow === postCreateWorkflow.workflow) {
        const workflowOptions = options as {
          args?: readonly { requestId: string; input: { origin: string } }[];
          workflowId?: string;
          workflowIdConflictPolicy?: string;
          workflowIdReusePolicy?: string;
        };
        const args = workflowOptions.args?.[0];
        assert.ok(args);
        assert.equal(workflowOptions.args?.length, 1);
        assert.equal(args.input.origin, 'ACTIVITYPUB');
        assert.equal(workflowOptions.workflowId, 'post-create:' + args.requestId);
        assert.equal(workflowOptions.workflowIdConflictPolicy, 'USE_EXISTING');
        assert.equal(workflowOptions.workflowIdReusePolicy, 'REJECT_DUPLICATE');
        return nativeWorkflowExecute(workflow as never, options as never);
      }

      const actorUri = (options as RemoteProfileRefreshOptions).args?.[0]?.actorUri;
      assert.ok(typeof actorUri === 'string');
      assertRemoteProfileRefreshCall(workflow, options, actorUri);
      return execute(actorUri);
    },
  );
};

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let ActivityPubPosts: typeof CoreDb.ActivityPubPosts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Hashtags: typeof CoreDb.Hashtags;
let Instances: typeof CoreDb.Instances;
let Media: typeof CoreDb.Media;
let Notifications: typeof CoreDb.Notifications;
let pg: typeof CoreDb.pg;
let PostContents: typeof CoreDb.PostContents;
let PostContentHashtags: typeof CoreDb.PostContentHashtags;
let PostMentions: typeof CoreDb.PostMentions;
let Posts: typeof CoreDb.Posts;
let ProfileBlocks: typeof CoreDb.ProfileBlocks;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let ProfileMedia: typeof CoreDb.ProfileMedia;
let Profiles: typeof CoreDb.Profiles;
let createPost: typeof CoreServices.createPost;
let createMentionNotification: typeof CoreServices.createMentionNotification;
let findPostByActivityPubUri: typeof findPostByActivityPubUriType;
let runInboundCreate: typeof handleInboundCreateType;
let materializeRemoteProfileActor: typeof Materialization.materializeRemoteProfileActor;
let materializeHydratedRemoteNote: typeof materializeHydratedRemoteNoteType;
let ensureDrizzleLocalProfileActor: typeof ensureDrizzleLocalProfileActorType;
let localInstanceId: string;

const handleInboundCreate = async (
  context: Parameters<typeof handleInboundCreateType>[0],
  create: Parameters<typeof handleInboundCreateType>[1],
  receivedAt?: Parameters<typeof handleInboundCreateType>[2],
): Promise<void> => {
  await runInboundCreate(context, create, receivedAt);

  const objectUri = uniqueHref(create.objectIds);
  if (objectUri === undefined) {
    return;
  }
  const post = await db
    .select({ postId: ActivityPubPosts.postId })
    .from(ActivityPubPosts)
    .where(eq(ActivityPubPosts.uri, objectUri))
    .limit(1)
    .then((rows) => rows[0]);
  if (post === undefined) {
    return;
  }

  try {
    await temporalClient.workflow.getHandle(`post-create-effects:${post.postId}`).result();
  } catch (error) {
    if (!(error instanceof Error && error.name === 'WorkflowNotFoundError')) {
      throw error;
    }
  }
};

describe('inbound Create dispatch', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.PUBLIC_ORIGIN = publicOrigin;
    ({
      AccountProfiles,
      Accounts,
      ActivityPubActors,
      ActivityPubPosts,
      db,
      firstOrThrow,
      Hashtags,
      Instances,
      Media,
      Notifications,
      pg,
      PostContents,
      PostContentHashtags,
      PostMentions,
      Posts,
      ProfileBlocks,
      ProfileFollows,
      ProfileMedia,
      Profiles,
    } = await import('@kosmo/core/db'));
    const { seedDatabase } = (await import('@kosmo/core/db/seed')) as typeof CoreSeed;
    ({ createMentionNotification, createPost } = await import('@kosmo/core/services'));
    ({ findPostByActivityPubUri } = await import('./activitypub-post-uri'));
    ({ handleInboundCreate: runInboundCreate } = await import('./inbound-create'));
    ({ materializeHydratedRemoteNote } = await import('./inbound-create-note'));
    ({ materializeRemoteProfileActor } = await import('./remote-actor-materialization'));
    ({ ensureDrizzleLocalProfileActor } = await import('./local-actor-store'));
    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;
  });

  beforeEach(async () => {
    mock.restoreAll();
    await db.delete(Notifications);
    await db.update(Posts).set({ currentContentId: null });
    await db.delete(PostContents);
    await db.delete(Posts);
    await db.delete(ProfileMedia);
    await db.delete(Media);
    await db.delete(Profiles);
    await db.delete(Instances).where(ne(Instances.id, localInstanceId));
  });

  afterEach(() => mock.restoreAll());

  after(async () => {
    mock.restoreAll();
    await db.delete(Notifications);
    await db.update(Posts).set({ currentContentId: null });
    await db.delete(PostContents);
    await db.delete(Posts);
    await db.delete(ProfileMedia);
    await db.delete(Media);
    await pg.end();
  });

  test('materializes a hydrated Note without persisting the activity id', async () => {
    const profile = await createStoredRemoteActor();
    const note = new Note({
      attribution: remoteActorUri,
      cc: PUBLIC_COLLECTION,
      content: new LanguageString('<p>Hello</p>', 'en'),
      id: remoteObjectUri,
      mediaType: 'text/html',
      summary: new LanguageString('<p>Content warning</p>', 'en'),
    });
    const create = new Create({
      actor: remoteActorUri,
      id: new URL('https://remote.example/activities/create-1'),
      object: note,
    });

    await handleInboundCreate(createContext(), create, receivedAt);
    const { content, mapping, post } = await getMaterializedPost(remoteObjectUri);

    assert.equal(mapping.uri, remoteObjectUri.href);
    assert.equal(post.profileId, profile.id);
    assert.equal(post.currentContentId, content.id);
    assert.equal(post.visibility, 'UNLISTED');
    assert.equal(content.document.summary, 'Content warning');
    assert.equal(postContentDocumentToText(content.document), 'Hello');
  });

  // Source-derived synthetic fixture, based on Mastodon's ActivityPub Emoji contract and
  // Misskey's MFM shortcode boundary: https://github.com/mastodon/documentation/blob/main/content/en/spec/activitypub.md#emoji
  // and https://github.com/misskey-dev/misskey/blob/develop/packages/backend/src/core/MfmService.ts.
  test('materializes embedded remote Custom Emoji without dereferencing icon or unrelated tag URLs', async () => {
    await createStoredRemoteActor();
    const objectUri = new URL('https://remote.example/notes/emoji');
    const emojiUrl = new URL('https://misskey.example/files/nyan.webp');
    const documentLoads: string[] = [];
    const note = new Note({
      attribution: remoteActorUri,
      content:
        '<p>Hi \u200B:nyan:\u200B <a href="https://example.com/:nyan:">:nyan:</a> ' +
        ':nyan::nyan:</p>',
      id: objectUri,
      mediaType: 'text/html',
      tags: [
        new Emoji({
          name: ':nyan:',
          icon: new Image({
            id: new URL('https://misskey.example/files/nyan-metadata'),
            mediaType: 'image/webp',
            url: emojiUrl,
          }),
        }),
        new Emoji({ name: ':remote:', icon: emojiUrl }),
        new URL('https://remote.example/tags/not-loaded'),
      ],
      to: PUBLIC_COLLECTION,
    });

    const fetchMock = mock.method(globalThis, 'fetch', async () => {
      throw new Error('Remote Custom Emoji must not fetch image bytes');
    });
    try {
      await handleInboundCreate(
        createContext(async (url) => {
          documentLoads.push(url);
          throw new Error(`Remote Custom Emoji must not load ${url}`);
        }),
        new Create({ actor: remoteActorUri, object: note }),
        receivedAt,
      );
    } finally {
      fetchMock.mock.restore();
    }

    const { content } = await getMaterializedPost(objectUri);
    assert.deepEqual(documentLoads, []);
    assert.equal(fetchMock.mock.callCount(), 0);
    assert.deepEqual(content.document.body, {
      type: 'doc',
      attrs: {
        customEmojis: [{ shortcode: ':nyan:', url: emojiUrl.href }],
      },
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hi \u200B:nyan:\u200B ' },
            {
              type: 'text',
              text: ':nyan:',
              marks: [{ type: 'link', attrs: { href: 'https://example.com/:nyan:' } }],
            },
            { type: 'text', text: ' :nyan::nyan:' },
          ],
        },
      ],
    });
    assert.equal(
      postContentDocumentToText(content.document),
      'Hi \u200B:nyan:\u200B :nyan: :nyan::nyan:',
    );
  });

  test('uses a refreshed Profile URL alias for new Notes without changing older Content', async () => {
    const profileUrl = 'https://profile.example/@alice';
    const profile = await createStoredRemoteActor({ profileUrl: null });
    const createMentionNote = (objectUri: URL) =>
      new Note({
        attribution: remoteActorUri,
        content: `<p>Hello <a href="${profileUrl}">@alice</a></p>`,
        id: objectUri,
        mediaType: 'text/html',
        tags: [new Mention({ href: remoteActorUri, name: '@alice' })],
        to: PUBLIC_COLLECTION,
      });
    const originalObjectUri = new URL('https://remote.example/notes/mention-before-refresh');
    const mentionWorkflow = mockRemoteProfileRefresh(async () => {
      throw new Error('Known Mention must not start a remote profile Workflow');
    });

    await handleInboundCreate(
      createContext(),
      new Create({ actor: remoteActorUri, object: createMentionNote(originalObjectUri) }),
      receivedAt,
    );

    const original = await getMaterializedPost(originalObjectUri);
    assert.deepEqual(original.content.document.body.content, [
      {
        type: 'paragraph',
        content: [
          { text: 'Hello ', type: 'text' },
          { marks: [{ attrs: { href: profileUrl }, type: 'link' }], text: '@alice', type: 'text' },
        ],
      },
    ]);
    assert.equal(remoteProfileWorkflowCallCount(mentionWorkflow.mock.calls), 0);
    const unrefreshedActor = await db
      .select({ profileUrl: ActivityPubActors.profileUrl })
      .from(ActivityPubActors)
      .where(eq(ActivityPubActors.profileId, profile.id))
      .then(firstOrThrow);
    assert.equal(unrefreshedActor.profileUrl, null);

    await materializeRemoteProfileActor({
      actorUri: remoteActorUri,
      context: {
        lookupObject: async () =>
          new Person({
            id: remoteActorUri,
            preferredUsername: 'alice',
            url: new URL(profileUrl),
          }),
      } as unknown as Parameters<typeof materializeRemoteProfileActor>[0]['context'],
      now: Temporal.Now.instant().add({ seconds: 1 }),
    });

    const refreshedActor = await db
      .select({ profileUrl: ActivityPubActors.profileUrl })
      .from(ActivityPubActors)
      .where(eq(ActivityPubActors.profileId, profile.id))
      .then(firstOrThrow);
    assert.equal(refreshedActor.profileUrl, profileUrl);

    const newObjectUri = new URL('https://remote.example/notes/mention-after-refresh');
    await handleInboundCreate(
      createContext(),
      new Create({ actor: remoteActorUri, object: createMentionNote(newObjectUri) }),
      receivedAt.add({ seconds: 2 }),
    );

    const createdAfterRefresh = await getMaterializedPost(newObjectUri);
    assert.deepEqual(createdAfterRefresh.content.document.body.content, [
      {
        type: 'paragraph',
        content: [
          { text: 'Hello ', type: 'text' },
          { attrs: { handle: '@alice@remote.example', profileId: profile.id }, type: 'mention' },
        ],
      },
    ]);

    const originalAfterRefresh = await getMaterializedPost(originalObjectUri);
    assert.deepEqual(originalAfterRefresh.content.document, original.content.document);
    assert.deepEqual(
      (await db.select().from(PostMentions)).sort((left, right) =>
        left.postContentId.localeCompare(right.postContentId),
      ),
      [
        { postContentId: original.content.id, profileId: profile.id },
        { postContentId: createdAfterRefresh.content.id, profileId: profile.id },
      ].sort((left, right) => left.postContentId.localeCompare(right.postContentId)),
    );
    assert.equal(remoteProfileWorkflowCallCount(mentionWorkflow.mock.calls), 0);
    mentionWorkflow.mock.restore();
  });

  test('keeps a name-matching untrusted body URL as a safe link and stores the typed relation', async () => {
    const profile = await createStoredRemoteActor({ profileUrl: null });
    const untrustedUrl = 'https://evil.example/login';
    const objectUri = new URL('https://remote.example/notes/untrusted-mention-link');
    const note = new Note({
      attribution: remoteActorUri,
      content: `<p>Hello <a href="${untrustedUrl}">@alice</a></p>`,
      id: objectUri,
      mediaType: 'text/html',
      tags: [
        new Mention({
          href: remoteActorUri,
          name: '@alice',
        }),
      ],
      to: PUBLIC_COLLECTION,
    });
    const fetchMock = mock.method(globalThis, 'fetch', async () => {
      throw new Error('Mention receipt must not fetch the untrusted anchor');
    });

    try {
      await handleInboundCreate(
        createContext(),
        new Create({ actor: remoteActorUri, object: note }),
        receivedAt,
      );
    } finally {
      fetchMock.mock.restore();
    }

    const { content } = await getMaterializedPost(objectUri);
    assert.deepEqual(content.document.body.content, [
      {
        type: 'paragraph',
        content: [
          { text: 'Hello ', type: 'text' },
          {
            marks: [{ attrs: { href: untrustedUrl }, type: 'link' }],
            text: '@alice',
            type: 'text',
          },
        ],
      },
    ]);
    assert.deepEqual(await db.select().from(PostMentions), [
      { postContentId: content.id, profileId: profile.id },
    ]);
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  test('materializes only typed Hashtags that match the remote body and reuses local identity', async () => {
    const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
    const localProfile = await createLocalFollowerProfile(`hashtag-author-${suffix}`);
    const localToken = `#Shared${suffix}`;
    await createPost({
      bodyText: localToken,
      origin: 'LOCAL',
      profileId: localProfile.id,
      visibility: PostVisibility.PUBLIC,
    });
    const sharedName = `shared${suffix}`;
    const localHashtag = await db
      .select()
      .from(Hashtags)
      .where(eq(Hashtags.name, sharedName))
      .then(firstOrThrow);
    const hashtagCountBeforeReceipt = await db.$count(Hashtags);

    const remoteSharedToken = `#ＳＨＡＲＥＤ${suffix.toUpperCase()}`;
    const longToken = `#${'r'.repeat(65)}`;
    const emojiToken = '#remote-tag🔥';
    const spaceToken = '#two words';
    const absentToken = '#absent body expression';
    const bodyOnlyToken = `#bodyonly${suffix}`;
    const unconfirmedToken = `#unconfirmed${suffix}`;
    const sharedHref = `https://remote.example/tags/${suffix}`;
    const longHref = 'https://remote.example/tags/long';
    const emojiHref = 'https://remote.example/tags/remote-tag';
    const spaceHref = 'https://remote.example/tags/two-words';
    const objectUri = new URL(`https://remote.example/notes/hashtag-${suffix}`);
    await createStoredRemoteActor();

    const note = new Note({
      attribution: remoteActorUri,
      content:
        `<p>First <a class="hashtag" href="${sharedHref}"><span>#ＳＨＡＲＥ</span><strong>Ｄ${suffix.toUpperCase()}</strong></a> and ` +
        `<a class="hashtag" href="${sharedHref}">#shared${suffix}</a></p>` +
        `<p>Again ${remoteSharedToken} / <a href="${longHref}">${longToken}</a> / ` +
        `<a href="${emojiHref}">${emojiToken}</a></p>` +
        `<p><a href="${spaceHref}">${spaceToken}</a> ${bodyOnlyToken} ` +
        `<a href="https://evil.example/tags/unconfirmed">${unconfirmedToken}</a> ` +
        `${localToken}Extra abc${localToken} ` +
        `<a href="https://example.com/#shared${suffix}">https://example.com/#shared${suffix}</a></p>`,
      id: objectUri,
      mediaType: 'text/html',
      tags: [
        new Hashtag({ href: new URL(sharedHref), name: remoteSharedToken }),
        new Hashtag({ href: new URL(longHref), name: longToken }),
        new Hashtag({ href: new URL(emojiHref), name: emojiToken }),
        new Hashtag({ href: new URL(spaceHref), name: spaceToken }),
        new Hashtag({
          href: new URL(`https://remote.example/tags/absent-${suffix}`),
          name: absentToken,
        }),
        new URL(`https://remote.example/tags/unloaded-${suffix}`),
      ],
      to: PUBLIC_COLLECTION,
    });
    const documentLoads: string[] = [];
    const fetchMock = mock.method(globalThis, 'fetch', async () => {
      throw new Error('Hashtag receipt must not fetch any Hashtag href');
    });

    try {
      await handleInboundCreate(
        createContext(async (url) => {
          documentLoads.push(url);
          throw new Error(`Hashtag receipt must not load ${url}`);
        }),
        new Create({ actor: remoteActorUri, object: note }),
        receivedAt,
      );
    } finally {
      fetchMock.mock.restore();
    }

    const { content, post } = await getMaterializedPost(objectUri);
    assert.equal(fetchMock.mock.callCount(), 0);
    assert.deepEqual(documentLoads, []);
    assert.equal(post.currentContentId, content.id);
    assert.equal(
      postContentDocumentToText(content.document),
      `First ${remoteSharedToken} and #shared${suffix}\n\n` +
        `Again ${remoteSharedToken} / ${longToken} / ${emojiToken}\n\n` +
        `${spaceToken} ${bodyOnlyToken} ${unconfirmedToken} ${localToken}Extra abc${localToken} ` +
        `https://example.com/#shared${suffix}`,
    );

    const hashtagsByParagraph = content.document.body.content.map((block) =>
      block.type === 'paragraph'
        ? (block.content ?? []).flatMap((node) =>
            node.type === 'hashtag'
              ? [{ hashtagId: node.attrs.hashtagId, token: node.attrs.token }]
              : [],
          )
        : [],
    );
    assert.deepEqual(
      hashtagsByParagraph.map((paragraph) => paragraph.map(({ token }) => token)),
      [
        [remoteSharedToken, `#shared${suffix}`],
        [remoteSharedToken, longToken, emojiToken],
        [spaceToken],
      ],
    );

    const shared = await db
      .select()
      .from(Hashtags)
      .where(eq(Hashtags.name, sharedName))
      .then(firstOrThrow);
    assert.equal(shared.id, localHashtag.id);
    assert.equal(shared.displayName, localHashtag.displayName);
    assert.equal(await db.$count(Hashtags), hashtagCountBeforeReceipt + 3);
    const relations = await db
      .select()
      .from(PostContentHashtags)
      .where(eq(PostContentHashtags.postContentId, content.id));
    const hashtagNodeIds = new Set(hashtagsByParagraph.flat().map(({ hashtagId }) => hashtagId));
    assert.equal(relations.length, 4);
    assert.deepEqual(new Set(relations.map(({ hashtagId }) => hashtagId)), hashtagNodeIds);
    assert.equal(relations.filter(({ hashtagId }) => hashtagId === shared.id).length, 1);
    assert.deepEqual(
      hashtagsByParagraph
        .flat()
        .filter(({ token }) => token === remoteSharedToken)
        .map(({ hashtagId }) => hashtagId),
      [shared.id, shared.id],
    );
    const lastParagraph = content.document.body.content[2];
    assert.ok(lastParagraph?.type === 'paragraph');
    assert.deepEqual(
      lastParagraph.content?.find((node) => node.type === 'text' && node.text === unconfirmedToken),
      {
        type: 'text',
        text: unconfirmedToken,
        marks: [{ type: 'link', attrs: { href: 'https://evil.example/tags/unconfirmed' } }],
      },
    );
    assert.deepEqual(
      lastParagraph.content?.find(
        (node) => node.type === 'text' && node.text === `https://example.com/#shared${suffix}`,
      ),
      {
        type: 'text',
        text: `https://example.com/#shared${suffix}`,
        marks: [{ type: 'link', attrs: { href: `https://example.com/#shared${suffix}` } }],
      },
    );
  });

  test('falls back to the actor URI when a stored profile URL alias is malformed', async () => {
    const profile = await createStoredRemoteActor({ profileUrl: 'not a URL' });
    const objectUri = new URL('https://remote.example/notes/malformed-profile-url');
    const note = new Note({
      attribution: remoteActorUri,
      content: `<p>Hello <a href="${remoteActorUri.href}">@alice</a></p>`,
      id: objectUri,
      mediaType: 'text/html',
      tags: [
        new Mention({
          href: remoteActorUri,
          name: '@different-label',
        }),
      ],
      to: PUBLIC_COLLECTION,
    });

    await handleInboundCreate(
      createContext(),
      new Create({ actor: remoteActorUri, object: note }),
      receivedAt,
    );

    const { content } = await getMaterializedPost(objectUri);
    assert.deepEqual(content.document.body.content, [
      {
        type: 'paragraph',
        content: [
          { text: 'Hello ', type: 'text' },
          { attrs: { handle: '@alice@remote.example', profileId: profile.id }, type: 'mention' },
        ],
      },
    ]);
    assert.deepEqual(await db.select().from(PostMentions), [
      { postContentId: content.id, profileId: profile.id },
    ]);
  });

  test('keeps an actor URL alias ambiguous when multiple Profiles advertise it', async () => {
    const sharedProfileUrl = 'https://profile.example/@same';
    const alice = await createStoredRemoteActor({ profileUrl: sharedProfileUrl });
    const bobActorUri = new URL('https://remote-b.example/users/bob');
    const bob = await createStoredRemoteActor({
      actorUri: bobActorUri,
      handle: 'bob',
      profileUrl: sharedProfileUrl,
    });
    const objectUri = new URL('https://remote.example/notes/ambiguous-mention');
    const note = new Note({
      attribution: remoteActorUri,
      content:
        `<p><a href="${sharedProfileUrl}">@same</a> ` +
        `<a href="${remoteActorUri.href}">@alice</a> ` +
        `<a href="${bobActorUri.href}">@bob</a></p>`,
      id: objectUri,
      mediaType: 'text/html',
      tags: [
        new Mention({ href: remoteActorUri, name: '@alice' }),
        new Mention({ href: bobActorUri, name: '@bob' }),
      ],
      to: PUBLIC_COLLECTION,
    });

    await handleInboundCreate(
      createContext(),
      new Create({ actor: remoteActorUri, object: note }),
      receivedAt,
    );

    const { content } = await getMaterializedPost(objectUri);
    assert.deepEqual(content.document.body.content, [
      {
        type: 'paragraph',
        content: [
          {
            marks: [{ attrs: { href: sharedProfileUrl }, type: 'link' }],
            text: '@same',
            type: 'text',
          },
          { text: ' ', type: 'text' },
          { attrs: { handle: '@alice@remote.example', profileId: alice.id }, type: 'mention' },
          { text: ' ', type: 'text' },
          { attrs: { handle: '@bob@remote-b.example', profileId: bob.id }, type: 'mention' },
        ],
      },
    ]);
    assert.deepEqual(
      (await db.select().from(PostMentions)).sort((left, right) =>
        left.profileId.localeCompare(right.profileId),
      ),
      [
        { postContentId: content.id, profileId: alice.id },
        { postContentId: content.id, profileId: bob.id },
      ].sort((left, right) => left.profileId.localeCompare(right.profileId)),
    );
  });

  test('captures stored relative handles using configured Profile identity', async () => {
    const remoteActor = new URL('https://remote.example/users/mention-target');
    const remoteProfile = await createStoredRemoteActor({
      actorUri: remoteActor,
      handle: 'remote-target',
    });
    const localProfile = await createLocalFollowerProfile('local-target');
    const localActor = new URL(`/ap/actor/${localProfile.id}`, publicOrigin);
    await ensureDrizzleLocalProfileActor({
      actorUri: localActor,
      localInstanceId,
      profileId: localProfile.id,
    });
    const otherLocalActor = new URL('https://other-local.example/ap/actor/target');
    const otherLocalProfile = await createStoredRemoteActor({
      actorUri: otherLocalActor,
      handle: 'other-local-target',
      instanceKind: InstanceKind.LOCAL,
    });

    const { candidates } = await resolveStoredInboundMentionCandidates([
      remoteActor.href,
      localActor.href,
      otherLocalActor.href,
    ]);

    const actorHrefs = new Set([remoteActor.href, localActor.href, otherLocalActor.href]);
    const actual = candidates
      .filter(({ targetHref }) => actorHrefs.has(targetHref))
      .map(({ profileId, relativeHandle }) => {
        assert.ok(relativeHandle);
        return [profileId, relativeHandle] as const;
      })
      .sort(([left], [right]) => left.localeCompare(right));
    const expected: [string, string][] = [
      [remoteProfile.id, '@remote-target@remote.example'],
      [localProfile.id, '@local-target'],
      [otherLocalProfile.id, '@other-local-target@other-local.example'],
    ];
    expected.sort(([left], [right]) => left.localeCompare(right));

    assert.deepEqual(actual, expected);
  });

  test('projects a local Profile Mention when the actor URI and human URL use different forms', async () => {
    await createStoredRemoteActor();
    const target = await createLocalFollowerProfile('test');
    const localActorUri = new URL(`/ap/actor/${target.id}`, publicOrigin);
    await ensureDrizzleLocalProfileActor({
      actorUri: localActorUri,
      localInstanceId,
      profileId: target.id,
    });

    const objectUri = new URL('https://remote.example/notes/local-mention');
    const mentionWorkflow = mockRemoteProfileRefresh(async () => {
      throw new Error('Known local Mention must not start a remote profile Workflow');
    });
    const note = new Note({
      attribution: remoteActorUri,
      content:
        `<p><span class="h-card"><a href="${publicOrigin}/@test" class="u-url mention">` +
        '@<span>test</span></a></span> gdgd</p>',
      id: objectUri,
      mediaType: 'text/html',
      tags: [
        new Mention({
          href: localActorUri,
          name: '@test@dev.kos.moe',
        }),
      ],
      to: PUBLIC_COLLECTION,
    });

    await handleInboundCreate(
      createContext(),
      new Create({ actor: remoteActorUri, object: note }),
      receivedAt,
    );

    const { content } = await getMaterializedPost(objectUri);
    assert.deepEqual(content.document.body.content, [
      {
        type: 'paragraph',
        content: [
          {
            attrs: { handle: '@test', profileId: target.id },
            type: 'mention',
          },
          { text: ' gdgd', type: 'text' },
        ],
      },
    ]);
    assert.deepEqual(await db.select().from(PostMentions), [
      { postContentId: content.id, profileId: target.id },
    ]);
    assert.equal(remoteProfileWorkflowCallCount(mentionWorkflow.mock.calls), 0);
    mentionWorkflow.mock.restore();
  });

  test('matches an unknown Mention by actor URI after a successful remote profile Workflow', async () => {
    const profileUrl = new URL('https://profiles.example/@bob');
    const mentionActorUri = new URL('https://mentions.example/users/bob');
    const objectUri = new URL('https://remote.example/notes/materialized-mention');
    const lookupHrefs: string[] = [];
    const note = new Note({
      attribution: remoteActorUri,
      content: `<p><a href="${profileUrl.href}">@Bob</a></p>`,
      id: objectUri,
      mediaType: 'text/html',
      tags: [new Mention({ href: mentionActorUri, name: '@ignored-name' })],
      to: PUBLIC_COLLECTION,
    });

    await createStoredRemoteActor();
    const executeMock = mockRemoteProfileRefresh(async (actorUri) => {
      lookupHrefs.push(actorUri);
      return (
        await createStoredRemoteActor({
          actorUri: new URL(actorUri),
          handle: 'bob',
          profileUrl: profileUrl.href,
        })
      ).id;
    });
    await handleInboundCreate(
      createContext(),
      new Create({ actor: remoteActorUri, object: note }),
      receivedAt,
    );
    executeMock.mock.restore();

    const { content } = await getMaterializedPost(objectUri);
    const storedActor = await db
      .select({ actor: ActivityPubActors, profile: Profiles })
      .from(ActivityPubActors)
      .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
      .where(eq(ActivityPubActors.uri, mentionActorUri.href))
      .then(firstOrThrow);

    assert.deepEqual(lookupHrefs, [mentionActorUri.href]);
    assert.equal(storedActor.actor.uri, mentionActorUri.href);
    assert.equal(storedActor.actor.profileUrl, profileUrl.href);
    assert.deepEqual(content.document.body.content, [
      {
        type: 'paragraph',
        content: [
          {
            attrs: { handle: '@bob@mentions.example', profileId: storedActor.profile.id },
            type: 'mention',
          },
        ],
      },
    ]);
    assert.deepEqual(await db.select().from(PostMentions), [
      { postContentId: content.id, profileId: storedActor.profile.id },
    ]);
  });

  test(
    'runs all unknown Mention Workflows concurrently with stable matching',
    { timeout: 30_000 },
    async () => {
      const mentionActorUris = Array.from(
        { length: 5 },
        (_, index) => new URL(`https://mentions.example/users/parallel${index}`),
      );
      const objectUri = new URL('https://remote.example/notes/parallel-mention-materialization');
      const lookupHrefs: string[] = [];
      const profileIdsByUri = new Map<string, string>();
      let activeLookups = 0;
      let maxActiveLookups = 0;
      let releaseLookups!: () => void;
      let releaseFallback: ReturnType<typeof setTimeout> | undefined;
      const lookupsReleased = new Promise<void>((resolve) => {
        releaseLookups = resolve;
      });
      const note = new Note({
        attribution: remoteActorUri,
        content: `<p>${mentionActorUris
          .map((actorUri, index) => `<a href="${actorUri.href}">@parallel-${index}</a>`)
          .join(' ')}</p>`,
        id: objectUri,
        mediaType: 'text/html',
        tags: mentionActorUris.map(
          (href, index) => new Mention({ href, name: `@ignored-${index}` }),
        ),
        to: PUBLIC_COLLECTION,
      });

      try {
        await createStoredRemoteActor();
        const mentionInstance = await createStoredRemoteInstance(mentionActorUris[0]!);
        const executeMock = mockRemoteProfileRefresh(async (actorUri) => {
          lookupHrefs.push(actorUri);
          activeLookups += 1;
          maxActiveLookups = Math.max(maxActiveLookups, activeLookups);
          if (lookupHrefs.length === 1) {
            releaseFallback = setTimeout(releaseLookups, 5_000);
          }
          if (lookupHrefs.length === mentionActorUris.length) {
            if (releaseFallback) {
              clearTimeout(releaseFallback);
              releaseFallback = undefined;
            }
            releaseLookups();
          }
          await lookupsReleased;
          activeLookups -= 1;
          const profile = await createStoredRemoteActor({
            actorUri: new URL(actorUri),
            handle: new URL(actorUri).pathname.split('/').at(-1) ?? 'parallel',
            instanceId: mentionInstance.id,
          });
          profileIdsByUri.set(actorUri, profile.id);
          return profile.id;
        });
        await handleInboundCreate(
          createContext(),
          new Create({ actor: remoteActorUri, object: note }),
          receivedAt,
        );
        executeMock.mock.restore();
      } finally {
        if (releaseFallback) {
          clearTimeout(releaseFallback);
        }
      }

      const { content } = await getMaterializedPost(objectUri);

      assert.deepEqual([...lookupHrefs].sort(), mentionActorUris.map(({ href }) => href).sort());
      assert.equal(maxActiveLookups, mentionActorUris.length);
      assert.deepEqual(content.document.body.content, [
        {
          type: 'paragraph',
          content: mentionActorUris.flatMap((actorUri, index) => [
            {
              attrs: {
                handle: `@parallel${index}@mentions.example`,
                profileId: profileIdsByUri.get(actorUri.href),
              },
              type: 'mention',
            },
            ...(index < mentionActorUris.length - 1 ? [{ text: ' ', type: 'text' }] : []),
          ]),
        },
      ]);
      assert.deepEqual(
        (await db.select().from(PostMentions)).map(({ profileId }) => profileId).sort(),
        mentionActorUris.map((actorUri) => profileIdsByUri.get(actorUri.href)).sort(),
      );
    },
  );

  test('omits a remote Mention when the default Temporal client deadline expires', async () => {
    const mentionActorUri = new URL('https://mentions.example/users/deadline');
    const objectUri = new URL('https://remote.example/notes/mention-workflow-deadline');
    let deadlineDurationMs: number | undefined;
    const executeMock = mockRemoteProfileRefresh(async () => new Promise<string>(() => {}));
    const originalWithDeadline = temporalClient.withDeadline.bind(temporalClient);
    const deadlineMock = mock.method(
      temporalClient,
      'withDeadline',
      async (deadline: number | Date, execute: () => Promise<unknown>) => {
        const deadlineAt = deadline instanceof Date ? deadline.getTime() : deadline;
        const remainingMs = deadlineAt - Date.now();
        return originalWithDeadline(deadline, () => {
          const callIndex = executeMock.mock.calls.length;
          const execution = execute();
          const workflow = executeMock.mock.calls[callIndex]?.arguments[0];
          if (
            (workflow === remoteProfileLookupWorkflow.workflow ||
              workflow === remoteProfileRefreshWorkflow.workflow) &&
            remainingMs > 25_000
          ) {
            deadlineDurationMs = remainingMs;
            void execution.catch(() => undefined);
            throw new Error('Temporal client deadline exceeded');
          }
          return execution;
        });
      },
    );
    const restoreReporter = setInboundObservabilityReporter({ log: () => undefined });
    const note = new Note({
      attribution: remoteActorUri,
      content: `<p><a href="${mentionActorUri.href}">@deadline</a></p>`,
      id: objectUri,
      mediaType: 'text/html',
      tags: [new Mention({ href: mentionActorUri, name: '@ignored' })],
      to: PUBLIC_COLLECTION,
    });

    try {
      await createStoredRemoteActor();
      await handleInboundCreate(
        createContext(),
        new Create({ actor: remoteActorUri, object: note }),
        receivedAt,
      );
    } finally {
      deadlineMock.mock.restore();
      executeMock.mock.restore();
      restoreReporter();
    }

    const { content } = await getMaterializedPost(objectUri);
    assert.equal(remoteProfileWorkflowCallCount(executeMock.mock.calls), 1);
    assert.ok(deadlineDurationMs !== undefined && deadlineDurationMs >= 29_900);
    assert.ok(deadlineDurationMs !== undefined && deadlineDurationMs <= 30_000);
    assert.deepEqual(content.document.body.content, [
      {
        type: 'paragraph',
        content: [
          {
            marks: [{ attrs: { href: mentionActorUri.href }, type: 'link' }],
            text: '@deadline',
            type: 'text',
          },
        ],
      },
    ]);
    assert.deepEqual(await db.select().from(PostMentions), []);
  });

  test('keeps failed and unresolved unknown Mentions as links while continuing with other targets', async () => {
    const failedActorUri = new URL('https://mentions.example/users/failed');
    const mismatchedActorUri = new URL('https://mentions.example/users/mismatched');
    const returnedActorUri = new URL('https://mentions.example/users/other');
    const validActorUri = new URL('https://mentions.example/users/valid');
    const profileUrl = new URL('https://profiles.example/@valid');
    const objectUri = new URL('https://remote.example/notes/partial-mention-materialization');
    const lookupHrefs: string[] = [];
    const observations: unknown[] = [];
    const restoreReporter = setInboundObservabilityReporter({
      captureException: () => undefined,
      log: (observation) => observations.push(observation),
    });
    const note = new Note({
      attribution: remoteActorUri,
      content:
        `<p><a href="${failedActorUri.href}">@failed</a> ` +
        `<a href="${mismatchedActorUri.href}">@mismatched</a> ` +
        `<a href="${profileUrl.href}">@valid</a></p>`,
      id: objectUri,
      mediaType: 'text/html',
      tags: [
        new Mention({ href: failedActorUri, name: '@ignored-failure' }),
        new Mention({ href: mismatchedActorUri, name: '@ignored-mismatch' }),
        new Mention({ href: validActorUri, name: '@ignored-valid' }),
      ],
      to: PUBLIC_COLLECTION,
    });

    try {
      await createStoredRemoteActor();
      const mentionInstance = await createStoredRemoteInstance(failedActorUri);
      const returnedProfile = await createStoredRemoteActor({
        actorUri: returnedActorUri,
        handle: 'other',
        instanceId: mentionInstance.id,
      });
      const executeMock = mockRemoteProfileRefresh(async (actorUri) => {
        lookupHrefs.push(actorUri);
        if (actorUri === failedActorUri.href) {
          throw new Error('Remote lookup failed');
        }
        if (actorUri === mismatchedActorUri.href) {
          return returnedProfile.id;
        }
        const profile = await createStoredRemoteActor({
          actorUri: new URL(actorUri),
          handle: 'valid',
          profileUrl: profileUrl.href,
          instanceId: mentionInstance.id,
        });
        return profile.id;
      });
      await handleInboundCreate(
        createContext(),
        new Create({ actor: remoteActorUri, object: note }),
        receivedAt,
      );
      executeMock.mock.restore();
    } finally {
      restoreReporter();
    }

    const { content } = await getMaterializedPost(objectUri);
    const validProfile = await db
      .select({ id: Profiles.id })
      .from(ActivityPubActors)
      .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
      .where(eq(ActivityPubActors.uri, validActorUri.href))
      .then(firstOrThrow);

    assert.deepEqual(
      [...lookupHrefs].sort(),
      [failedActorUri.href, mismatchedActorUri.href, validActorUri.href].sort(),
    );
    assert.deepEqual(content.document.body.content, [
      {
        type: 'paragraph',
        content: [
          {
            marks: [{ attrs: { href: failedActorUri.href }, type: 'link' }],
            text: '@failed',
            type: 'text',
          },
          { text: ' ', type: 'text' },
          {
            marks: [{ attrs: { href: mismatchedActorUri.href }, type: 'link' }],
            text: '@mismatched',
            type: 'text',
          },
          { text: ' ', type: 'text' },
          {
            attrs: { handle: '@valid@mentions.example', profileId: validProfile.id },
            type: 'mention',
          },
        ],
      },
    ]);
    assert.deepEqual(await db.select().from(PostMentions), [
      { postContentId: content.id, profileId: validProfile.id },
    ]);
    assert.deepEqual(
      observations
        .map((observation) => {
          const { activityType, handler, objectOrigin, objectUri, outcome, phase, reasonCode } =
            observation as {
              activityType: 'Create';
              handler: 'create';
              objectOrigin: string;
              objectUri: string;
              outcome: 'external_failure' | 'internal_failure';
              phase: 'actor_lookup';
              reasonCode: 'remote_mention_materialization_rejected';
            };
          return { activityType, handler, objectOrigin, objectUri, outcome, phase, reasonCode };
        })
        .sort((left, right) => left.outcome.localeCompare(right.outcome)),
      [
        {
          activityType: 'Create',
          handler: 'create',
          objectOrigin: objectUri.origin,
          objectUri: objectUri.href,
          outcome: 'internal_failure',
          phase: 'actor_lookup',
          reasonCode: 'remote_mention_materialization_rejected',
        },
      ],
    );
  });

  test('limits unknown remote Mention Workflows to 32 unique targets and keeps the remaining links', async () => {
    const mentionActorUris = Array.from(
      { length: 33 },
      (_, index) => new URL(`https://mentions.example/users/target-${index}`),
    );
    const knownActorUri = new URL('https://mentions.example/users/known');
    const objectUri = new URL('https://remote.example/notes/mention-lookup-budget');
    const lookupHrefs: string[] = [];
    const restoreReporter = setInboundObservabilityReporter({ log: () => undefined });
    let knownProfileId: string | undefined;
    const note = new Note({
      attribution: remoteActorUri,
      content: `<p>${mentionActorUris
        .map((actorUri, index) => `<a href="${actorUri.href}">@target-${index}</a>`)
        .join(' ')} <a href="${knownActorUri.href}">@known</a></p>`,
      id: objectUri,
      mediaType: 'text/html',
      tags: [
        new Mention({ href: mentionActorUris[0]!, name: '@duplicate-one' }),
        new Mention({ href: mentionActorUris[0]!, name: '@duplicate-two' }),
        ...mentionActorUris.slice(1).map((href) => new Mention({ href, name: '@target' })),
        new Mention({ href: knownActorUri, name: '@known' }),
      ],
      to: PUBLIC_COLLECTION,
    });

    try {
      await createStoredRemoteActor();
      knownProfileId = (await createStoredRemoteActor({ actorUri: knownActorUri, handle: 'known' }))
        .id;
      const executeMock = mockRemoteProfileRefresh(async (actorUri) => {
        lookupHrefs.push(actorUri);
        throw new Error('Remote profile lookup failed');
      });
      await handleInboundCreate(
        createContext(),
        new Create({ actor: remoteActorUri, object: note }),
        receivedAt,
      );
      executeMock.mock.restore();
    } finally {
      restoreReporter();
    }

    const { content } = await getMaterializedPost(objectUri);
    const paragraph = content.document.body.content[0];

    assert.deepEqual(
      [...lookupHrefs].sort(),
      mentionActorUris
        .slice(0, 32)
        .map(({ href }) => href)
        .sort(),
    );
    assert.equal(paragraph?.type, 'paragraph');
    assert.equal(
      paragraph?.type === 'paragraph'
        ? (paragraph.content?.filter((node) => node.type === 'mention').length ?? -1)
        : -1,
      1,
    );
    assert.equal(
      paragraph?.type === 'paragraph'
        ? (paragraph.content?.filter(
            (node) => node.type === 'text' && node.marks?.some((mark) => mark.type === 'link'),
          ).length ?? -1)
        : -1,
      33,
    );
    assert.ok(knownProfileId);
    assert.deepEqual(await db.select().from(PostMentions), [
      { postContentId: content.id, profileId: knownProfileId },
    ]);
  });

  test('preserves unresolved or mismatched typed Mentions as safe links while retaining known relations independent of anchor text', async () => {
    const knownProfile = await createStoredRemoteActor({ profileUrl: 'not a URL' });
    const mismatchedTarget = new URL('https://remote-b.example/users/bob');
    await createStoredRemoteActor({ actorUri: mismatchedTarget, handle: 'bob' });
    const unresolvedTarget = new URL('https://unknown.example/users/bob');
    const unsafeDisplayTarget = remoteActorUri;
    const objectUri = new URL('https://remote.example/notes/unresolved-mention');
    const note = new Note({
      attribution: remoteActorUri,
      content:
        `<p><a href="${mismatchedTarget.href}">@wrong</a> ` +
        `<a href="${unresolvedTarget.href}">@bob</a> ` +
        `<a href="${remoteActorUri.origin}/@alice">@different</a> ` +
        `<a href="${unsafeDisplayTarget.href}">\u0001</a></p>`,
      id: objectUri,
      mediaType: 'text/html',
      tags: [
        new Mention({
          href: remoteActorUri,
          name: '@alice',
        }),
        new Mention({
          href: unresolvedTarget,
          name: '@bob',
        }),
        new Mention({
          href: unsafeDisplayTarget,
          name: '@bad',
        }),
      ],
      to: PUBLIC_COLLECTION,
    });
    const profileCount = (await db.select().from(Profiles)).length;
    const actorCount = (await db.select().from(ActivityPubActors)).length;
    const instanceCount = (await db.select().from(Instances)).length;
    const fetchMock = mock.method(globalThis, 'fetch', async () => {
      throw new Error('Unresolved Mention must not trigger remote lookup');
    });
    const executeMock = mockRemoteProfileRefresh(async () => {
      throw new Error('Remote profile lookup failed');
    });

    try {
      await handleInboundCreate(
        createContext(),
        new Create({ actor: remoteActorUri, object: note }),
        receivedAt,
      );
    } finally {
      fetchMock.mock.restore();
      executeMock.mock.restore();
    }

    const { content } = await getMaterializedPost(objectUri);
    assert.deepEqual(content.document.body.content, [
      {
        type: 'paragraph',
        content: [
          {
            marks: [{ attrs: { href: mismatchedTarget.href }, type: 'link' }],
            text: '@wrong',
            type: 'text',
          },
          { text: ' ', type: 'text' },
          {
            marks: [{ attrs: { href: unresolvedTarget.href }, type: 'link' }],
            text: '@bob',
            type: 'text',
          },
          { text: ' ', type: 'text' },
          {
            marks: [{ attrs: { href: `${remoteActorUri.origin}/@alice` }, type: 'link' }],
            text: '@different',
            type: 'text',
          },
          { text: ' ', type: 'text' },
          {
            attrs: { handle: '@alice@remote.example', profileId: knownProfile.id },
            type: 'mention',
          },
        ],
      },
    ]);
    assert.deepEqual(await db.select().from(PostMentions), [
      { postContentId: content.id, profileId: knownProfile.id },
    ]);
    assert.equal((await db.select().from(Profiles)).length, profileCount);
    assert.equal((await db.select().from(ActivityPubActors)).length, actorCount);
    assert.equal((await db.select().from(Instances)).length, instanceCount);
    assert.equal(fetchMock.mock.callCount(), 0);
    assert.equal(remoteProfileWorkflowCallCount(executeMock.mock.calls), 1);
  });

  test('preserves Mention, Content Warning, and an attached Image in one inbound Post', async () => {
    const profile = await createStoredRemoteActor();
    const objectUri = new URL('https://remote.example/notes/mention-with-media');
    const mediaUri = new URL('https://remote.example/media/mention.webp');
    const note = new Note({
      attachments: [
        new Image({
          mediaType: 'image/webp',
          name: 'Mention image',
          url: mediaUri,
        }),
      ],
      attribution: remoteActorUri,
      content: '<p><a href="https://remote.example/users/alice">@alice</a> body</p>',
      id: objectUri,
      mediaType: 'text/html',
      summary: '<p>Content warning</p>',
      tags: [
        new Mention({
          href: remoteActorUri,
          name: '@alice',
        }),
      ],
      to: PUBLIC_COLLECTION,
    });

    await handleInboundCreate(
      createContext(),
      new Create({ actor: remoteActorUri, object: note }),
      receivedAt,
    );

    const { content } = await getMaterializedPost(objectUri);
    const media = await db.select().from(Media).then(firstOrThrow);
    assert.equal(content.document.summary, 'Content warning');
    assert.deepEqual(content.document.body.content, [
      {
        type: 'paragraph',
        content: [
          {
            attrs: { handle: '@alice@remote.example', profileId: profile.id },
            type: 'mention',
          },
          { text: ' body', type: 'text' },
        ],
      },
      { attrs: { mediaId: media.id }, type: 'media' },
    ]);
    assert.equal(postContentDocumentToText(content.document), '@alice@remote.example body');
    assert.deepEqual(
      { altText: media.altText, mediaType: media.mediaType, url: media.url },
      { altText: 'Mention image', mediaType: 'image/webp', url: mediaUri.href },
    );
    assert.deepEqual(await db.select().from(PostMentions), [
      { postContentId: content.id, profileId: profile.id },
    ]);
  });

  test('materializes a public hydrated original from its stored attributed author', async () => {
    const profile = await createStoredRemoteActor();
    const objectUri = new URL('https://objects.example/notes/original');
    const result = await materializeHydratedRemoteNote({
      context: createContext(),
      note: new Note({
        attribution: remoteActorUri,
        content: 'Original',
        id: objectUri,
        to: PUBLIC_COLLECTION,
      }),
      objectUri,
      observation: createObservation,
      receivedAt,
    });

    const materialized = await getMaterializedPost(objectUri);
    assert.deepEqual(result, { postId: materialized.post.id, status: 'created' });
    assert.equal(materialized.post.profileId, profile.id);
    assert.equal(materialized.post.visibility, PostVisibility.PUBLIC);
    assert.equal(postContentDocumentToText(materialized.content.document), 'Original');
  });

  test('forwards an optional signing Profile to the hydrated author lookup Workflow', async () => {
    const signer = await createLocalFollowerProfile('hydrated-author-lookup-signer');
    const author = await createStoredRemoteActor();
    const objectUri = new URL('https://objects.example/notes/signed-author-lookup');
    const lookupInput = {
      actorUri: remoteActorUri.href,
      contextOrigin: publicOrigin,
      profileId: signer.id,
    } satisfies RemoteProfileLookupInput;
    const lookupWorkflow = mock.method(
      temporalClient.workflow,
      'execute',
      async (workflow: unknown, options: unknown) => {
        assert.equal(workflow, remoteProfileLookupWorkflow.workflow);
        assert.ok(options && typeof options === 'object');
        const workflowOptions = options as { args?: unknown[]; workflowId?: string };
        assert.deepEqual(workflowOptions.args, [lookupInput]);
        assert.equal(
          workflowOptions.workflowId,
          remoteProfileLookupWorkflow.workflowIdFromArgs(lookupInput),
        );
        return author.id;
      },
    );

    try {
      const result = await materializeHydratedRemoteNote({
        context: createContext(),
        note: new Note({
          attribution: remoteActorUri,
          content: 'Signed author lookup',
          id: objectUri,
          to: PUBLIC_COLLECTION,
        }),
        objectUri,
        observation: createObservation,
        receivedAt,
        signingProfileId: signer.id,
      });

      assert.equal(result.status, 'created');
      assert.equal(remoteProfileWorkflowCallCount(lookupWorkflow.mock.calls), 1);
      assert.equal((await getMaterializedPost(objectUri)).post.profileId, author.id);
    } finally {
      lookupWorkflow.mock.restore();
    }
  });

  test('materializes a Followers Only hydrated original without a local Follow', async () => {
    const profile = await createStoredRemoteActor();
    const objectUri = new URL('https://objects.example/notes/hydrated-followers');

    const result = await materializeHydratedRemoteNote({
      advertisingActorUri: remoteActorUri,
      context: createContext(),
      note: new Note({
        attribution: remoteActorUri,
        content: 'Followers only original',
        id: objectUri,
        to: new URL('https://remote.example/users/alice/followers'),
      }),
      objectUri,
      observation: createObservation,
      receivedAt,
    });

    const materialized = await getMaterializedPost(objectUri);
    assert.deepEqual(result, { postId: materialized.post.id, status: 'created' });
    assert.equal(materialized.post.profileId, profile.id);
    assert.equal(materialized.post.visibility, PostVisibility.FOLLOWERS);
    assert.equal(
      await db.$count(ProfileFollows, eq(ProfileFollows.followeeProfileId, profile.id)),
      0,
    );
  });

  test('uses the stored author followers URI for generic hydrated visibility', async () => {
    const author = await createStoredRemoteActor();
    const recipient = await createLocalFollowerProfile('hydrated-followers-recipient');
    const recipientActorUri = new URL(`/ap/actor/${recipient.id}`, publicOrigin);
    await ensureDrizzleLocalProfileActor({
      actorUri: recipientActorUri,
      localInstanceId,
      profileId: recipient.id,
    });
    const objectUri = new URL('https://objects.example/notes/hydrated-followers-stored-author');
    const result = await materializeHydratedRemoteNote({
      context: createContext(),
      note: new Note({
        attribution: remoteActorUri,
        content: 'Stored-author Followers-only Mention',
        id: objectUri,
        tags: [new Mention({ href: recipientActorUri, name: '@hydrated-followers-recipient' })],
        to: new URL(`${remoteActorUri.href}/followers`),
      }),
      objectUri,
      observation: createObservation,
      receivedAt,
    });

    const materialized = await getMaterializedPost(objectUri);
    assert.deepEqual(result, { postId: materialized.post.id, status: 'created' });
    assert.equal(materialized.post.profileId, author.id);
    assert.equal(materialized.post.visibility, PostVisibility.FOLLOWERS);
    assert.deepEqual(await db.select().from(PostMentions), [
      { postContentId: materialized.content.id, profileId: recipient.id },
    ]);
  });

  test('uses the Workflow-materialized author for hydrated visibility and Post ownership', async () => {
    const recipient = await createLocalFollowerProfile('hydrated-unknown-followers-recipient');
    const recipientActorUri = new URL(`/ap/actor/${recipient.id}`, publicOrigin);
    await ensureDrizzleLocalProfileActor({
      actorUri: recipientActorUri,
      localInstanceId,
      profileId: recipient.id,
    });
    const followersUri = new URL(`${remoteActorUri.href}/followers`);
    const workflowLookupObject = mock.fn(
      async () =>
        new Person({
          followers: followersUri,
          id: remoteActorUri,
          preferredUsername: 'alice',
        }),
    );
    const contextLookupObject = mock.fn(async () => {
      throw new Error('Hydrated author must not be looked up outside its Workflow');
    });
    const lookupWorkflow = mockRemoteProfileRefresh(async (actorUri) => {
      const profile = await materializeRemoteProfileActor({
        actorUri: new URL(actorUri),
        context: { lookupObject: workflowLookupObject },
      });
      return profile.id;
    });
    const objectUri = new URL('https://objects.example/notes/hydrated-followers-unknown-author');

    try {
      const result = await materializeHydratedRemoteNote({
        context: {
          ...createContext(),
          lookupObject: contextLookupObject,
        } as unknown as InboxContext<void>,
        note: new Note({
          attribution: remoteActorUri,
          content: 'Fetched-author Followers-only Mention',
          id: objectUri,
          tags: [
            new Mention({ href: recipientActorUri, name: '@hydrated-unknown-followers-recipient' }),
          ],
          to: followersUri,
        }),
        objectUri,
        observation: createObservation,
        receivedAt,
      });
      const materialized = await getMaterializedPost(objectUri);
      const storedAuthor = await db
        .select()
        .from(ActivityPubActors)
        .where(eq(ActivityPubActors.uri, remoteActorUri.href))
        .then(firstOrThrow);

      assert.deepEqual(result, { postId: materialized.post.id, status: 'created' });
      assert.equal(materialized.post.profileId, storedAuthor.profileId);
      assert.equal(materialized.post.visibility, PostVisibility.FOLLOWERS);
      assert.equal(remoteProfileWorkflowCallCount(lookupWorkflow.mock.calls), 1);
      assert.equal(workflowLookupObject.mock.callCount(), 1);
      assert.equal(contextLookupObject.mock.callCount(), 0);
      assert.deepEqual(await db.select().from(PostMentions), [
        { postContentId: materialized.content.id, profileId: recipient.id },
      ]);
    } finally {
      lookupWorkflow.mock.restore();
    }
  });

  test('materializes a hydrated DIRECT Note from an unknown author and typed local Mention', async () => {
    const recipient = await createLocalFollowerProfile('hydrated-unknown-direct-recipient');
    const recipientActorUri = new URL(`/ap/actor/${recipient.id}`, publicOrigin);
    await ensureDrizzleLocalProfileActor({
      actorUri: recipientActorUri,
      localInstanceId,
      profileId: recipient.id,
    });
    const lookupObject = mock.fn(
      async () => new Person({ id: remoteActorUri, preferredUsername: 'alice' }),
    );
    const lookupWorkflow = mockRemoteProfileRefresh(async (actorUri) => {
      const profile = await materializeRemoteProfileActor({
        actorUri: new URL(actorUri),
        context: { lookupObject },
      });
      return profile.id;
    });
    const objectUri = new URL('https://objects.example/notes/hydrated-unknown-direct');

    try {
      const result = await materializeHydratedRemoteNote({
        context: { ...createContext(), lookupObject } as unknown as InboxContext<void>,
        note: new Note({
          attribution: remoteActorUri,
          content: 'Fetched-author Mention-only Direct',
          id: objectUri,
          tags: [
            new Mention({ href: recipientActorUri, name: '@hydrated-unknown-direct-recipient' }),
          ],
          to: new URL('https://unrelated.example/users/recipient'),
        }),
        objectUri,
        observation: createObservation,
        receivedAt,
      });
      const materialized = await getMaterializedPost(objectUri);
      const storedAuthor = await db
        .select()
        .from(ActivityPubActors)
        .where(eq(ActivityPubActors.uri, remoteActorUri.href))
        .then(firstOrThrow);

      assert.deepEqual(result, { postId: materialized.post.id, status: 'created' });
      assert.equal(materialized.post.profileId, storedAuthor.profileId);
      assert.equal(materialized.post.visibility, PostVisibility.DIRECT);
      assert.deepEqual(await db.select().from(PostMentions), [
        { postContentId: materialized.content.id, profileId: recipient.id },
      ]);
    } finally {
      lookupWorkflow.mock.restore();
    }
  });

  test('persists an unknown author before rejecting an invalid DIRECT Note with an active local Mention', async () => {
    const recipient = await createLocalFollowerProfile('hydrated-invalid-direct-recipient');
    const recipientActorUri = new URL(`/ap/actor/${recipient.id}`, publicOrigin);
    await ensureDrizzleLocalProfileActor({
      actorUri: recipientActorUri,
      localInstanceId,
      profileId: recipient.id,
    });
    const lookupObject = mock.fn(
      async () => new Person({ id: remoteActorUri, preferredUsername: 'alice' }),
    );
    const lookupWorkflow = mockRemoteProfileRefresh(async (actorUri) => {
      const profile = await materializeRemoteProfileActor({
        actorUri: new URL(actorUri),
        context: { lookupObject },
      });
      return profile.id;
    });
    const objectUri = new URL('https://objects.example/notes/hydrated-invalid-direct');

    try {
      const result = await materializeHydratedRemoteNote({
        context: { ...createContext(), lookupObject } as unknown as InboxContext<void>,
        note: new Note({
          attachments: [new Image({ url: new URL('ftp://remote.example/media/image.webp') })],
          attribution: remoteActorUri,
          content: 'Invalid image',
          id: objectUri,
          tags: [
            new Mention({ href: recipientActorUri, name: '@hydrated-invalid-direct-recipient' }),
          ],
          to: new URL('https://unrelated.example/users/recipient'),
        }),
        objectUri,
        observation: createObservation,
        receivedAt,
      });

      assert.deepEqual(result, { reason: 'invalid_note', status: 'rejected' });
      assert.equal(lookupObject.mock.callCount(), 1);
      assert.equal(remoteProfileWorkflowCallCount(lookupWorkflow.mock.calls), 1);
      assert.equal(
        await db.$count(ActivityPubActors, eq(ActivityPubActors.uri, remoteActorUri.href)),
        1,
      );
      assert.equal(await db.$count(Profiles), 2);
      assert.equal(await db.$count(ActivityPubPosts), 0);
      assert.equal(await db.$count(Posts), 0);
      assert.equal(await db.$count(PostContents), 0);
      assert.equal(await db.$count(PostMentions), 0);
      assert.equal(await db.$count(Media), 0);
    } finally {
      lookupWorkflow.mock.restore();
    }
  });

  test('materializes a hydrated DIRECT Note from a typed local Mention', async () => {
    const author = await createStoredRemoteActor();
    const recipient = await createLocalFollowerProfile('hydrated-direct-recipient');
    const recipientActorUri = new URL(`/ap/actor/${recipient.id}`, publicOrigin);
    await ensureDrizzleLocalProfileActor({
      actorUri: recipientActorUri,
      localInstanceId,
      profileId: recipient.id,
    });
    const objectUri = new URL('https://objects.example/notes/hydrated-direct');
    const note = new Note({
      attribution: remoteActorUri,
      content: 'Hydrated Mention-only Direct',
      id: objectUri,
      tags: [new Mention({ href: recipientActorUri, name: '@hydrated-direct-recipient' })],
      to: new URL('https://unrelated.example/users/recipient'),
    });

    const result = await materializeHydratedRemoteNote({
      context: createContext(),
      note,
      objectUri,
      observation: createObservation,
      receivedAt,
    });

    const materialized = await getMaterializedPost(objectUri);
    assert.deepEqual(result, { postId: materialized.post.id, status: 'created' });
    assert.equal(materialized.post.profileId, author.id);
    assert.equal(materialized.post.visibility, PostVisibility.DIRECT);
    assert.deepEqual(materialized.content.document.body.content, [
      {
        type: 'paragraph',
        content: [{ text: 'Hydrated Mention-only Direct', type: 'text' }],
      },
    ]);
    assert.deepEqual(await db.select().from(PostMentions), [
      { postContentId: materialized.content.id, profileId: recipient.id },
    ]);
  });

  test('persists an unknown author before rejecting a DIRECT Note without an active local typed Mention', async () => {
    const objectUri = new URL('https://objects.example/notes/hydrated-direct-rejected');
    const lookupObject = mock.fn(
      async () => new Person({ id: remoteActorUri, preferredUsername: 'alice' }),
    );
    const lookupWorkflow = mockRemoteProfileRefresh(async (actorUri) => {
      const profile = await materializeRemoteProfileActor({
        actorUri: new URL(actorUri),
        context: { lookupObject },
      });
      return profile.id;
    });

    try {
      const result = await materializeHydratedRemoteNote({
        context: { ...createContext(), lookupObject } as unknown as InboxContext<void>,
        note: new Note({
          attribution: remoteActorUri,
          content: 'Unaddressed Direct',
          id: objectUri,
          to: new URL('https://unrelated.example/users/recipient'),
        }),
        objectUri,
        observation: createObservation,
        receivedAt,
      });

      assert.deepEqual(result, { reason: 'no_active_local_mention', status: 'rejected' });
      assert.equal(lookupObject.mock.callCount(), 1);
      assert.equal(remoteProfileWorkflowCallCount(lookupWorkflow.mock.calls), 1);
      assert.equal(await db.$count(ActivityPubActors), 1);
      assert.equal(await db.$count(Profiles), 1);
      assert.equal(await db.$count(ActivityPubPosts), 0);
      assert.equal(await db.$count(Posts), 0);
      assert.equal(await db.$count(PostContents), 0);
    } finally {
      lookupWorkflow.mock.restore();
    }
  });

  test('requires the advertised actor URI for a Followers Only hydrated original', async () => {
    const objectUri = new URL('https://objects.example/notes/hydrated-followers-rejected');

    const unselectedResult = await materializeHydratedRemoteNote({
      advertisingActorUri: new URL('https://remote.example/users/mallory'),
      context: createContext(),
      note: new Note({
        attribution: remoteActorUri,
        content: 'Wrong advertising actor',
        id: objectUri,
        to: new URL('https://remote.example/users/alice/followers'),
      }),
      objectUri,
      observation: createObservation,
      receivedAt,
    });

    assert.deepEqual(unselectedResult, { reason: 'invalid_note', status: 'rejected' });
    assert.equal(await db.$count(Posts), 0);
  });

  test('a hydrated Note reference does not recover its stored UNRESPONSIVE attributed actor', async () => {
    const profile = await createStoredRemoteActor({ instanceState: InstanceState.UNRESPONSIVE });
    const objectUri = new URL('https://objects.example/notes/unresponsive-attribution');
    const result = await materializeHydratedRemoteNote({
      context: createContext(),
      note: new Note({
        attribution: remoteActorUri,
        content: 'Referenced original',
        id: objectUri,
        to: PUBLIC_COLLECTION,
      }),
      objectUri,
      observation: createObservation,
      receivedAt,
    });
    const materialized = await getMaterializedPost(objectUri);
    const instance = await db
      .select()
      .from(Instances)
      .where(eq(Instances.id, profile.instanceId))
      .then(firstOrThrow);

    assert.deepEqual(result, { postId: materialized.post.id, status: 'created' });
    assert.equal(materialized.post.profileId, profile.id);
    assert.equal(instance.state, InstanceState.UNRESPONSIVE);
  });

  test('rejects a mismatched discovered author without persisting the actor or Post', async () => {
    const objectUri = new URL('https://objects.example/notes/mismatched-author');
    const lookupObject = mock.fn(
      async () =>
        new Person({
          id: new URL('https://remote.example/users/mallory'),
          preferredUsername: 'alice',
        }),
    );
    const lookupWorkflow = mockRemoteProfileRefresh(async (actorUri) => {
      const profile = await materializeRemoteProfileActor({
        actorUri: new URL(actorUri),
        context: { lookupObject },
      });
      return profile.id;
    });

    const result = await materializeHydratedRemoteNote({
      context: { ...createContext(), lookupObject } as unknown as InboxContext<void>,
      note: new Note({
        attribution: remoteActorUri,
        content: 'Mismatched author',
        id: objectUri,
        to: PUBLIC_COLLECTION,
      }),
      objectUri,
      observation: createObservation,
      receivedAt,
    });
    lookupWorkflow.mock.restore();

    assert.deepEqual(result, { reason: 'unusable_author', status: 'rejected' });
    assert.equal(lookupObject.mock.callCount(), 1);
    assert.equal(await db.$count(ActivityPubActors), 0);
    assert.equal(await db.$count(Profiles), 0);
    assert.equal(await db.$count(Posts), 0);
  });

  test('rejects invalid and ineligible hydrated originals after resolving their author', async () => {
    const invalidImageMentionActorUri = new URL('https://mentions.example/users/invalid-image');
    const lookupObject = mock.fn(
      async () => new Person({ id: remoteActorUri, preferredUsername: 'alice' }),
    );
    const lookupWorkflow = mockRemoteProfileRefresh(async (actorUri) => {
      const profile = await materializeRemoteProfileActor({
        actorUri: new URL(actorUri),
        context: { lookupObject },
      });
      return profile.id;
    });
    const context = { ...createContext(), lookupObject } as unknown as InboxContext<void>;
    const cases = [
      {
        expected: { reason: 'invalid_note', status: 'rejected' },
        note: new Note({
          attribution: remoteActorUri,
          content: 'Mismatched object identity',
          id: new URL('https://objects.example/notes/actual-id'),
          to: PUBLIC_COLLECTION,
        }),
        objectUri: new URL('https://objects.example/notes/requested-id'),
      },
      {
        expected: { reason: 'invalid_note', status: 'rejected' },
        note: new Note({
          content: 'Missing attribution',
          id: new URL('https://objects.example/notes/missing-attribution'),
          to: PUBLIC_COLLECTION,
        }),
      },
      {
        expected: { reason: 'invalid_note', status: 'rejected' },
        note: new Note({
          attributions: [remoteActorUri, new URL('https://remote.example/users/mallory')],
          content: 'Ambiguous attribution',
          id: new URL('https://objects.example/notes/ambiguous-attribution'),
          to: PUBLIC_COLLECTION,
        }),
      },
      {
        expected: { reason: 'invalid_note', status: 'rejected' },
        note: new Note({
          attribution: new URL('acct:alice@remote.example'),
          content: 'Unsupported attribution',
          id: new URL('https://objects.example/notes/non-http-attribution'),
          to: PUBLIC_COLLECTION,
        }),
      },
      {
        expected: { reason: 'no_active_local_mention', status: 'rejected' },
        note: new Note({
          attribution: remoteActorUri,
          content: 'No verified followers marker',
          id: new URL('https://objects.example/notes/unverified-followers-marker'),
          to: new URL('https://remote.example/users/alice/followers'),
        }),
      },
      {
        expected: { reason: 'unsupported_note', status: 'rejected' },
        note: new Note({
          attachments: [new URL('https://remote.example/media/iri-only')],
          attribution: remoteActorUri,
          id: new URL('https://objects.example/notes/empty'),
          to: PUBLIC_COLLECTION,
        }),
      },
      {
        expected: { reason: 'note_content_length_exceeded', status: 'rejected' },
        note: new Note({
          attribution: remoteActorUri,
          content: 'x'.repeat(10_001),
          id: new URL('https://objects.example/notes/oversized'),
          to: PUBLIC_COLLECTION,
        }),
      },
      {
        expected: { reason: 'note_content_length_exceeded', status: 'rejected' },
        note: new Note({
          attachments: [new Image({ url: new URL('data:image/png;base64,AA==') })],
          attribution: remoteActorUri,
          content: 'x'.repeat(10_001),
          id: new URL('https://objects.example/notes/oversized-invalid-media'),
          mediaType: 'text/plain',
          tags: [new Mention({ href: invalidImageMentionActorUri, name: '@ignored' })],
          to: PUBLIC_COLLECTION,
        }),
      },
      {
        expected: { reason: 'invalid_note', status: 'rejected' },
        note: new Note({
          attachments: [new Image({ url: new URL('data:image/png;base64,AA==') })],
          attribution: remoteActorUri,
          content: 'Invalid image',
          id: new URL('https://objects.example/notes/invalid-media'),
          tags: [new Mention({ href: invalidImageMentionActorUri, name: '@ignored' })],
          to: PUBLIC_COLLECTION,
        }),
      },
    ];

    try {
      for (const { expected, note, objectUri } of cases) {
        assert.ok(note.id);
        assert.deepEqual(
          await materializeHydratedRemoteNote({
            context,
            note,
            objectUri: objectUri ?? note.id,
            observation: createObservation,
            receivedAt,
          }),
          expected,
        );
      }

      assert.equal(remoteProfileWorkflowCallCount(lookupWorkflow.mock.calls), 5);
      assert.equal(lookupObject.mock.callCount(), 5);
    } finally {
      lookupWorkflow.mock.restore();
    }

    assert.equal(await db.$count(ActivityPubActors), 1);
    assert.equal(await db.$count(Profiles), 1);
    assert.equal(await db.$count(Posts), 0);
    assert.equal(await db.$count(Media), 0);
  });

  test('preserves a resolved empty anchor Mention when deciding whether a hydrated Note is empty', async () => {
    const authorProfile = await createStoredRemoteActor();
    const mentionActorUri = new URL('https://mentions.example/users/empty-anchor');
    const objectUri = new URL('https://objects.example/notes/empty-anchor-mention');
    const lookupHrefs: string[] = [];
    const executeMock = mockRemoteProfileRefresh(async (actorUri) => {
      if (actorUri === remoteActorUri.href) {
        return authorProfile.id;
      }
      lookupHrefs.push(actorUri);
      return (
        await createStoredRemoteActor({
          actorUri: new URL(actorUri),
          handle: 'bob',
        })
      ).id;
    });
    const result = await materializeHydratedRemoteNote({
      context: createContext(),
      note: new Note({
        attribution: remoteActorUri,
        content: `<p><a href="${mentionActorUri.href}"></a></p>`,
        id: objectUri,
        mediaType: 'text/html',
        tags: [new Mention({ href: mentionActorUri, name: '@ignored' })],
        to: PUBLIC_COLLECTION,
      }),
      objectUri,
      observation: createObservation,
      receivedAt,
    });
    executeMock.mock.restore();

    const { content } = await getMaterializedPost(objectUri);
    const mentionProfile = await db
      .select({ id: Profiles.id })
      .from(ActivityPubActors)
      .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
      .where(eq(ActivityPubActors.uri, mentionActorUri.href))
      .then(firstOrThrow);

    assert.equal(result.status, 'created');
    assert.deepEqual(lookupHrefs, [mentionActorUri.href]);
    assert.deepEqual(content.document.body.content, [
      {
        type: 'paragraph',
        content: [
          {
            attrs: { handle: '@bob@mentions.example', profileId: mentionProfile.id },
            type: 'mention',
          },
        ],
      },
    ]);
    assert.deepEqual(await db.select().from(PostMentions), [
      { postContentId: content.id, profileId: mentionProfile.id },
    ]);
  });

  test('materializes an unknown attributed author before an attachment-only original', async () => {
    const objectUri = new URL('https://objects.example/notes/attachment-only');
    const mediaUrl = new URL('https://remote.example/media/attachment-only.png');
    const lookupObject = mock.fn(
      async () => new Person({ id: remoteActorUri, preferredUsername: 'alice' }),
    );
    const lookupWorkflow = mockRemoteProfileRefresh(async (actorUri) => {
      const profile = await materializeRemoteProfileActor({
        actorUri: new URL(actorUri),
        context: { lookupObject },
      });
      return profile.id;
    });

    try {
      const result = await materializeHydratedRemoteNote({
        context: { ...createContext(), lookupObject } as unknown as InboxContext<void>,
        note: new Note({
          attachments: [new Image({ mediaType: null, name: null, url: mediaUrl })],
          attribution: remoteActorUri,
          id: objectUri,
          to: PUBLIC_COLLECTION,
        }),
        objectUri,
        observation: createObservation,
        receivedAt,
      });
      const materialized = await getMaterializedPost(objectUri);
      const [actor] = await db.select().from(ActivityPubActors);
      const [media] = await db.select().from(Media);

      assert.deepEqual(result, { postId: materialized.post.id, status: 'created' });
      assert.equal(actor?.uri, remoteActorUri.href);
      assert.equal(materialized.post.profileId, actor?.profileId);
      assert.equal(postContentDocumentToText(materialized.content.document), '');
      assert.equal(media?.url, mediaUrl.href);
      assert.equal(media?.mediaType, null);
      assert.equal(media?.altText, null);
    } finally {
      lookupWorkflow.mock.restore();
    }
  });

  test('rolls back an unsaved author Profile projection when hydrated materialization fails internally', async () => {
    const objectUri = new URL('https://objects.example/notes/author-persistence-failure');
    const actor = new Person({
      icon: new Image({
        mediaType: 'image/png',
        name: 'Avatar',
        url: new URL('https://remote.example/media/unsaved-avatar.png'),
      }),
      id: remoteActorUri,
      preferredUsername: 'alice',
    });
    const lookupObject = mock.fn(async () => actor);
    const fetchMock = mock.method(globalThis, 'fetch', async () =>
      Response.json(
        { subject: 'acct:alice@remote.example' },
        { headers: { 'Content-Type': 'application/jrd+json' } },
      ),
    );
    await pg`
      CREATE FUNCTION fail_hydrated_author_profile_media_insert() RETURNS trigger
      LANGUAGE plpgsql AS $function$
      BEGIN
        RAISE EXCEPTION 'intentional hydrated author profile media failure';
      END
      $function$
    `;
    await pg`
      CREATE TRIGGER fail_hydrated_author_profile_media_insert
      BEFORE INSERT ON profile_media
      FOR EACH ROW EXECUTE FUNCTION fail_hydrated_author_profile_media_insert()
    `;
    const lookupInput = {
      actorUri: remoteActorUri.href,
      contextOrigin: publicOrigin,
    } satisfies RemoteProfileLookupInput;
    const executeMock = mock.method(
      temporalClient.workflow,
      'execute',
      async (workflow: unknown, options: unknown) => {
        assert.equal(workflow, remoteProfileLookupWorkflow.workflow);
        assert.ok(options && typeof options === 'object');
        const workflowOptions = options as { args?: unknown[]; workflowId?: string };
        assert.deepEqual(workflowOptions.args, [lookupInput]);
        assert.equal(
          workflowOptions.workflowId,
          remoteProfileLookupWorkflow.workflowIdFromArgs(lookupInput),
        );
        const profile = await materializeRemoteProfileActor({
          actorUri: remoteActorUri,
          context: { lookupObject },
        });
        return profile.id;
      },
    );

    try {
      await assert.rejects(
        materializeHydratedRemoteNote({
          context: { ...createContext(), lookupObject } as unknown as InboxContext<void>,
          note: new Note({
            attribution: remoteActorUri,
            content: 'Author persistence failure',
            id: objectUri,
            to: PUBLIC_COLLECTION,
          }),
          objectUri,
          observation: createObservation,
          receivedAt,
        }),
      );
      assert.equal(remoteProfileWorkflowCallCount(executeMock.mock.calls), 1);
      assert.equal(lookupObject.mock.callCount(), 1);
    } finally {
      executeMock.mock.restore();
      await pg`DROP TRIGGER fail_hydrated_author_profile_media_insert ON profile_media`;
      await pg`DROP FUNCTION fail_hydrated_author_profile_media_insert()`;
      fetchMock.mock.restore();
    }

    assert.equal(await db.$count(ActivityPubActors), 0);
    assert.equal(await db.$count(Profiles), 0);
    assert.equal(await db.$count(ProfileMedia), 0);
    assert.equal(await db.$count(Media), 0);
    assert.equal(await db.$count(ActivityPubPosts), 0);
    assert.equal(await db.$count(Posts), 0);
    assert.equal(await db.$count(PostContents), 0);
    assert.equal(await db.$count(Instances), 2);
  });

  test('preserves a committed discovered author when Post materialization fails', async () => {
    const objectUri = new URL('https://objects.example/notes/post-failure');
    const lookupObject = mock.fn(
      async () => new Person({ id: remoteActorUri, preferredUsername: 'alice' }),
    );
    const lookupWorkflow = mockRemoteProfileRefresh(async (actorUri) => {
      const profile = await materializeRemoteProfileActor({
        actorUri: new URL(actorUri),
        context: { lookupObject },
      });
      return profile.id;
    });
    await pg`
      create function fail_original_post_content() returns trigger
      language plpgsql as $function$
      begin
        raise exception 'intentional original post content failure';
      end
      $function$
    `;
    await pg`
      create trigger fail_original_post_content
      before insert on post_content
      for each row execute function fail_original_post_content()
    `;

    try {
      await assert.rejects(
        materializeHydratedRemoteNote({
          context: { ...createContext(), lookupObject } as unknown as InboxContext<void>,
          note: new Note({
            attachments: [new Image({ url: new URL('https://remote.example/media/rollback.png') })],
            attribution: remoteActorUri,
            content: 'Post failure',
            id: objectUri,
            to: PUBLIC_COLLECTION,
          }),
          objectUri,
          observation: createObservation,
          receivedAt,
        }),
      );
    } finally {
      await pg`drop trigger fail_original_post_content on post_content`;
      await pg`drop function fail_original_post_content()`;
      lookupWorkflow.mock.restore();
    }

    assert.equal(await db.$count(ActivityPubActors), 1);
    assert.equal(await db.$count(Profiles), 1);
    assert.equal(await db.$count(Instances), 2);
    assert.equal(await db.$count(ActivityPubPosts), 0);
    assert.equal(await db.$count(Posts), 0);
    assert.equal(await db.$count(PostContents), 0);
    assert.equal(await db.$count(Media), 0);
  });

  test('returns the existing Post without changing first-write state for duplicate originals', async () => {
    await createStoredRemoteActor();
    const objectUri = new URL('https://objects.example/notes/duplicate-original');
    const first = await materializeHydratedRemoteNote({
      context: createContext(),
      note: new Note({
        attribution: remoteActorUri,
        content: 'First',
        id: objectUri,
        to: PUBLIC_COLLECTION,
      }),
      objectUri,
      observation: createObservation,
      receivedAt,
    });
    const duplicate = await materializeHydratedRemoteNote({
      context: createContext(),
      note: new Note({
        attribution: remoteActorUri,
        cc: PUBLIC_COLLECTION,
        content: 'Changed',
        id: objectUri,
        replyTarget: new URL('https://remote.example/notes/late-parent'),
      }),
      objectUri,
      observation: createObservation,
      receivedAt: receivedAt.add({ hours: 1 }),
    });
    const materialized = await getMaterializedPost(objectUri);

    assert.equal(first.status, 'created');
    assert.deepEqual(duplicate, { postId: materialized.post.id, status: 'duplicate' });
    assert.equal(materialized.post.visibility, PostVisibility.PUBLIC);
    assert.equal(materialized.post.replyParentId, null);
    assert.equal(postContentDocumentToText(materialized.content.document), 'First');
    assert.equal(await db.$count(PostContents), 1);
  });

  test('materializes public and unlisted originals with DB-only Parent resolution and fallback', async () => {
    await createStoredRemoteActor();
    const localAuthor = await createLocalFollowerProfile('local-parent-author');
    const localParent = await createPost({
      bodyText: 'Local parent',
      origin: 'LOCAL',
      profileId: localAuthor.id,
      visibility: PostVisibility.FOLLOWERS,
    });
    const localParentUri = new URL(`/ap/note/${localParent.post.id}`, publicOrigin);
    const remoteParentUri = new URL('https://remote.example/notes/original-parent');
    await handleInboundCreate(
      createContext(),
      createRemoteCreate({ objectUri: remoteParentUri }),
      receivedAt,
    );
    const remoteParent = await getMaterializedPost(remoteParentUri);
    const publicReplyUri = new URL('https://objects.example/notes/public-reply');
    const unlistedReplyUri = new URL('https://objects.example/notes/unlisted-reply');
    const fallbackReplyUri = new URL('https://objects.example/notes/fallback-reply');

    await materializeHydratedRemoteNote({
      context: createContext(),
      note: new Note({
        attribution: remoteActorUri,
        content: 'Public source reply',
        id: publicReplyUri,
        replyTarget: localParentUri,
        to: PUBLIC_COLLECTION,
      }),
      objectUri: publicReplyUri,
      observation: createObservation,
      receivedAt,
    });
    await materializeHydratedRemoteNote({
      context: createContext(),
      note: new Note({
        attribution: remoteActorUri,
        cc: PUBLIC_COLLECTION,
        content: 'Unlisted source reply',
        id: unlistedReplyUri,
        replyTarget: remoteParentUri,
      }),
      objectUri: unlistedReplyUri,
      observation: createObservation,
      receivedAt,
    });
    await materializeHydratedRemoteNote({
      context: createContext(),
      note: new Note({
        attribution: remoteActorUri,
        content: 'Fallback source reply',
        id: fallbackReplyUri,
        replyTargets: [
          new URL('https://remote.example/notes/unknown-1'),
          new URL('https://remote.example/notes/unknown-2'),
        ],
        to: PUBLIC_COLLECTION,
      }),
      objectUri: fallbackReplyUri,
      observation: createObservation,
      receivedAt,
    });

    const publicReply = await getMaterializedPost(publicReplyUri);
    const unlistedReply = await getMaterializedPost(unlistedReplyUri);
    const fallbackReply = await getMaterializedPost(fallbackReplyUri);
    assert.equal(publicReply.post.replyParentId, localParent.post.id);
    assert.equal(publicReply.post.visibility, PostVisibility.PUBLIC);
    assert.equal(unlistedReply.post.replyParentId, remoteParent.post.id);
    assert.equal(unlistedReply.post.visibility, PostVisibility.UNLISTED);
    assert.equal(fallbackReply.post.replyParentId, null);
  });

  test('propagates Parent lookup failures without falling back or creating a Post', async () => {
    await createStoredRemoteActor();
    const databaseFailureUri = new URL('https://objects.example/notes/parent-db-failure');

    await pg`alter table activitypub_post rename to unavailable_activitypub_post`;
    try {
      await assert.rejects(
        materializeHydratedRemoteNote({
          context: createContext(),
          note: new Note({
            attribution: remoteActorUri,
            content: 'Database failure must propagate',
            id: databaseFailureUri,
            replyTarget: new URL('https://remote.example/notes/parent'),
            to: PUBLIC_COLLECTION,
          }),
          objectUri: databaseFailureUri,
          observation: createObservation,
          receivedAt,
        }),
      );
    } finally {
      await pg`alter table unavailable_activitypub_post rename to activitypub_post`;
    }

    const parserFailureUri = new URL('https://objects.example/notes/parent-parser-failure');
    await assert.rejects(
      materializeHydratedRemoteNote({
        context: {
          ...createContext(),
          parseUri: () => {
            throw new Error('intentional Parent parser failure');
          },
        },
        note: new Note({
          attribution: remoteActorUri,
          content: 'Parser failure must propagate',
          id: parserFailureUri,
          replyTarget: new URL(`/ap/note/${localProfileId}`, publicOrigin),
          to: PUBLIC_COLLECTION,
        }),
        objectUri: parserFailureUri,
        observation: createObservation,
        receivedAt,
      }),
      /intentional Parent parser failure/,
    );

    assert.equal(await db.$count(Posts), 0);
  });

  test('converges an original lookup and Create delivery on one Post identity', async () => {
    const profile = await createStoredRemoteActor();
    const objectUri = new URL('https://remote.example/notes/original-create-race');
    const note = () =>
      new Note({
        attribution: remoteActorUri,
        content: 'Concurrent source',
        id: objectUri,
        to: PUBLIC_COLLECTION,
      });

    const [original] = await Promise.all([
      materializeHydratedRemoteNote({
        context: createContext(),
        note: note(),
        objectUri,
        observation: createObservation,
        receivedAt,
      }),
      handleInboundCreate(
        createContext(),
        new Create({ actor: remoteActorUri, object: note() }),
        receivedAt,
      ),
    ]);
    const materialized = await getMaterializedPost(objectUri);

    assert.equal(original.status === 'rejected' ? null : original.postId, materialized.post.id);
    assert.equal(materialized.post.profileId, profile.id);
    assert.equal(await db.$count(ActivityPubPosts), 1);
    assert.equal(await db.$count(Posts), 1);
    assert.equal(await db.$count(PostContents), 1);
  });

  test('keeps a committed original when effects start fails', async (t) => {
    await createStoredRemoteActor();
    const objectUri = new URL('https://objects.example/notes/effects-failure');
    const errorLog = mock.method(console, 'error', () => undefined);
    t.mock.method(temporalClient.workflow, 'start', async () => {
      throw new Error('Temporal unavailable');
    });

    try {
      const result = await materializeHydratedRemoteNote({
        context: createContext(),
        note: new Note({
          attribution: remoteActorUri,
          content: 'Committed before effects',
          id: objectUri,
          to: PUBLIC_COLLECTION,
        }),
        objectUri,
        observation: createObservation,
        receivedAt,
      });
      const materialized = await getMaterializedPost(objectUri);
      assert.deepEqual(result, { postId: materialized.post.id, status: 'created' });
    } finally {
      errorLog.mock.restore();
    }
  });

  test('keeps recognized visibility markers with extra actor audience values', async () => {
    const profile = await createStoredRemoteActor();
    const follower = await createLocalFollowerProfile('marker-follower');
    await db.insert(ProfileFollows).values({
      followerProfileId: follower.id,
      followeeProfileId: profile.id,
    });

    const mentionActorUri = new URL('https://mention.example/users/bob');
    const foreignFollowersUri = new URL('https://foreign.example/users/bob/followers');
    const cases = [
      {
        objectUri: new URL('https://remote.example/notes/marker-public'),
        expected: PostVisibility.PUBLIC,
        note: new Note({
          attribution: remoteActorUri,
          content: 'Public marker',
          id: new URL('https://remote.example/notes/marker-public'),
          tos: [PUBLIC_COLLECTION, mentionActorUri],
        }),
      },
      {
        objectUri: new URL('https://remote.example/notes/marker-unlisted'),
        expected: PostVisibility.UNLISTED,
        note: new Note({
          attribution: remoteActorUri,
          cc: PUBLIC_COLLECTION,
          content: 'Unlisted marker',
          id: new URL('https://remote.example/notes/marker-unlisted'),
          to: mentionActorUri,
        }),
      },
      {
        objectUri: new URL('https://remote.example/notes/marker-followers'),
        expected: PostVisibility.FOLLOWERS,
        note: new Note({
          attribution: remoteActorUri,
          content: 'Followers marker',
          id: new URL('https://remote.example/notes/marker-followers'),
          tos: [
            new URL('https://remote.example/users/alice/followers'),
            new URL('https://remote.example/users/alice/followers'),
            mentionActorUri,
            foreignFollowersUri,
          ],
        }),
      },
    ];

    for (const { expected, note, objectUri } of cases) {
      await handleInboundCreate(
        createContext(),
        new Create({ actor: remoteActorUri, object: note }),
        receivedAt,
      );
      assert.equal((await getMaterializedPost(objectUri)).post.visibility, expected);
    }

    assert.equal((await db.select().from(Notifications)).length, 0);
    assert.equal((await db.select().from(ProfileFollows)).length, 1);
  });

  test('materializes Mention-only DIRECT Create deliveries with the canonical visibility policy', async () => {
    const author = await createStoredRemoteActor();
    const recipient = await createLocalFollowerProfile('direct-recipient');
    const unmentionedInboxOwner = await createLocalFollowerProfile('direct-inbox-owner');
    const unmentionedFollower = await createLocalFollowerProfile('direct-unmentioned-follower');
    const remoteMentionActorUri = new URL('https://mention.example/users/direct-target');
    const remoteMention = await createStoredRemoteActor({
      actorUri: remoteMentionActorUri,
      handle: 'direct-target',
    });
    const recipientActorUri = new URL(`/ap/actor/${recipient.id}`, publicOrigin);
    await ensureDrizzleLocalProfileActor({
      actorUri: recipientActorUri,
      localInstanceId,
      profileId: recipient.id,
    });
    await db.insert(ProfileFollows).values({
      followerProfileId: unmentionedFollower.id,
      followeeProfileId: author.id,
    });

    const objectUri = new URL('https://remote.example/notes/direct-personal');
    const create = new Create({
      actor: remoteActorUri,
      object: new Note({
        attribution: remoteActorUri,
        content: 'Mention-only Direct',
        id: objectUri,
        tags: [
          new Mention({ href: recipientActorUri, name: '@direct-recipient' }),
          new Mention({ href: remoteMentionActorUri, name: '@direct-target' }),
        ],
        to: new URL('https://unrelated.example/users/recipient'),
      }),
    });

    await handleInboundCreate(
      createContext(undefined, unmentionedInboxOwner.id),
      create,
      receivedAt,
    );
    await handleInboundCreate(createContext(undefined, recipient.id), create, receivedAt);
    await handleInboundCreate(createContext(), create, receivedAt);

    const { post } = await getMaterializedPost(objectUri);
    assert.equal(post.visibility, PostVisibility.DIRECT);
    assert.deepEqual(
      (await db.select().from(PostMentions)).map(({ profileId }) => profileId).sort(),
      [recipient.id, remoteMention.id].sort(),
    );
    assert.equal(await db.$count(ActivityPubPosts), 1);
    assert.equal(await db.$count(Posts), 1);
    assert.equal(await db.$count(PostContents), 1);

    const { visiblePostWhere, visibleProfileWhere } = await import('@kosmo/core/visibility');
    const canView = async (viewerProfileId: string | null) =>
      db
        .select({
          visible: visiblePostWhere({
            db,
            post: Posts,
            profileVisible: sql<boolean>`${visibleProfileWhere({
              profile: Profiles,
              instance: Instances,
            })}`,
            viewerProfileId,
          }),
        })
        .from(Posts)
        .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(eq(Posts.id, post.id))
        .then(firstOrThrow)
        .then(({ visible }) => visible);

    assert.equal(await canView(author.id), true);
    assert.equal(await canView(recipient.id), true);
    assert.equal(await canView(unmentionedInboxOwner.id), false);
    assert.equal(await canView(unmentionedFollower.id), false);
    assert.equal(await canView(null), false);

    const recipientAccount = await db
      .insert(Accounts)
      .values({
        displayName: 'direct-recipient',
        oidcSubject: `activitypub-direct-${crypto.randomUUID()}`,
        state: AccountState.ACTIVE,
      })
      .returning()
      .then(firstOrThrow);
    try {
      await db.insert(AccountProfiles).values({
        accountId: recipientAccount.id,
        profileId: recipient.id,
        role: AccountProfileRole.OWNER,
      });
      const [notificationId] = await createMentionNotification(post.id);
      assert.ok(notificationId);
      assert.deepEqual(await createMentionNotification(post.id), [notificationId]);
      assert.deepEqual(
        await db
          .select({
            kind: Notifications.kind,
            recipientProfileId: Notifications.recipientProfileId,
          })
          .from(Notifications)
          .where(eq(Notifications.sourceId, post.id)),
        [{ kind: NotificationKind.MENTION, recipientProfileId: recipient.id }],
      );
    } finally {
      await db.delete(Accounts).where(eq(Accounts.id, recipientAccount.id));
    }

    const sharedObjectUri = new URL('https://remote.example/notes/direct-shared');
    await handleInboundCreate(
      createContext(),
      new Create({
        actor: remoteActorUri,
        object: new Note({
          attribution: remoteActorUri,
          content: 'Mention-only shared Direct',
          id: sharedObjectUri,
          tags: [new Mention({ href: recipientActorUri, name: '@direct-recipient' })],
        }),
      }),
      receivedAt,
    );
    assert.equal(
      (await getMaterializedPost(sharedObjectUri)).post.visibility,
      PostVisibility.DIRECT,
    );
    assert.equal(await db.$count(ActivityPubPosts), 2);
    assert.equal(await db.$count(Posts), 2);
    assert.equal(await db.$count(PostContents), 2);
  });

  test('rejects address-only and ineligible DIRECT Mention targets', async () => {
    await createStoredRemoteActor();
    const recipient = await createLocalFollowerProfile('direct-address-recipient');
    const recipientActorUri = new URL(`/ap/actor/${recipient.id}`, publicOrigin);
    await ensureDrizzleLocalProfileActor({
      actorUri: recipientActorUri,
      localInstanceId,
      profileId: recipient.id,
    });

    const remoteOnlyMentionUri = new URL('https://remote-mention.example/users/only');
    await createStoredRemoteActor({
      actorUri: remoteOnlyMentionUri,
      handle: 'remote-only',
    });
    const disabledLocalMentionUri = new URL('https://disabled-local.example/users/mention');
    await createStoredRemoteActor({
      actorUri: disabledLocalMentionUri,
      handle: 'disabled-local',
      instanceKind: InstanceKind.LOCAL,
      profileState: ProfileState.DISABLED,
    });
    const suspendedLocalInstanceMentionUri = new URL(
      'https://suspended-local.example/users/mention',
    );
    await createStoredRemoteActor({
      actorUri: suspendedLocalInstanceMentionUri,
      handle: 'suspended-local',
      instanceKind: InstanceKind.LOCAL,
      instanceState: InstanceState.SUSPENDED,
    });

    const cases = [
      {
        context: createContext(undefined, recipient.id),
        note: new Note({
          attribution: remoteActorUri,
          bcc: new URL('https://unmentioned.example/users/recipient'),
          bto: recipientActorUri,
          content: 'Audience fields do not grant Direct access',
          id: new URL('https://remote.example/notes/direct-address-only'),
          to: recipientActorUri,
        }),
      },
      {
        context: createContext(),
        note: new Note({
          attribution: remoteActorUri,
          content: 'A remote-only Mention is not a shared inbox recipient',
          id: new URL('https://remote.example/notes/direct-remote-only'),
          tags: [new Mention({ href: remoteOnlyMentionUri, name: '@remote-only' })],
        }),
      },
      {
        context: createContext(),
        note: new Note({
          attribution: remoteActorUri,
          content: 'A disabled local Profile is not a shared inbox recipient',
          id: new URL('https://remote.example/notes/direct-disabled-local'),
          tags: [new Mention({ href: disabledLocalMentionUri, name: '@disabled-local' })],
        }),
      },
      {
        context: createContext(),
        note: new Note({
          attribution: remoteActorUri,
          content: 'A suspended local Instance is not a shared inbox recipient',
          id: new URL('https://remote.example/notes/direct-suspended-local'),
          tags: [new Mention({ href: suspendedLocalInstanceMentionUri, name: '@suspended-local' })],
        }),
      },
    ];

    const logs: unknown[] = [];
    const restoreReporter = setInboundObservabilityReporter({
      log: (observation) => logs.push(observation),
    });
    try {
      for (const { context, note } of cases) {
        await handleInboundCreate(
          context,
          new Create({ actor: remoteActorUri, object: note }),
          receivedAt,
        );
      }
    } finally {
      restoreReporter();
    }

    assert.deepEqual(
      logs,
      cases.map(({ note }) => {
        assert.ok(note.id);
        return {
          activityType: 'Create',
          actorOrigin: remoteActorUri.origin,
          handler: 'create',
          objectOrigin: note.id.origin,
          objectUri: note.id.href,
          outcome: 'rejected',
          phase: 'validation',
          reasonCode: 'no_active_local_mention',
        };
      }),
    );
    assert.equal(await db.$count(ActivityPubPosts), 0);
    assert.equal(await db.$count(Posts), 0);
    assert.equal(await db.$count(PostContents), 0);
    assert.equal(await db.$count(PostMentions), 0);
    assert.equal(await db.$count(Notifications), 0);
  });

  test('skips actor-only and foreign-followers-only audiences without side effects', async () => {
    await createStoredRemoteActor();
    const cases = [
      {
        id: new URL('https://remote.example/notes/actor-only'),
        to: new URL('https://mention.example/users/bob'),
      },
      {
        id: new URL('https://remote.example/notes/foreign-followers-only'),
        to: new URL('https://foreign.example/users/bob/followers'),
      },
    ];

    for (const { id, to } of cases) {
      await handleInboundCreate(
        createContext(),
        new Create({
          actor: remoteActorUri,
          object: new Note({
            attribution: remoteActorUri,
            content: 'unsupported audience',
            id,
            to,
          }),
        }),
        receivedAt,
      );
    }

    assert.equal((await db.select().from(ActivityPubPosts)).length, 0);
    assert.equal((await db.select().from(Posts)).length, 0);
    assert.equal((await db.select().from(PostContents)).length, 0);
    assert.equal((await db.select().from(Notifications)).length, 0);
  });

  test('materializes Followers Only Create deliveries without a local Follow', async () => {
    const author = await createStoredRemoteActor();
    const recipient = await createLocalFollowerProfile('unfollowed-recipient');
    const deliveries = [
      { context: createContext(undefined, recipient.id), path: 'personal' },
      { context: createContext(), path: 'shared' },
    ];

    for (const { context, path } of deliveries) {
      const objectUri = new URL(`https://remote.example/notes/followers-${path}`);
      await handleInboundCreate(
        context,
        new Create({
          actor: remoteActorUri,
          object: new Note({
            attribution: remoteActorUri,
            content: `Followers ${path}`,
            id: objectUri,
            to: new URL('https://remote.example/users/alice/followers'),
          }),
        }),
        receivedAt,
      );

      const materialized = await getMaterializedPost(objectUri);
      assert.equal(materialized.post.profileId, author.id);
      assert.equal(materialized.post.visibility, PostVisibility.FOLLOWERS);
    }

    assert.equal(
      await db.$count(ProfileFollows, eq(ProfileFollows.followeeProfileId, author.id)),
      0,
    );
  });

  test('projects the first four embedded image attachments without fetching IRI-only attachments', async () => {
    const profile = await createStoredRemoteActor();
    const documentLoader = mock.fn<DocumentLoader>(async (url) => {
      throw new Error(`Attachment network lookup must not run: ${url}`);
    });
    const urls = Array.from(
      { length: 4 },
      (_, index) => new URL(`HTTPS://REMOTE.EXAMPLE:443/media/${index}/../${index}.webp`),
    );
    const note = new Note({
      attachments: [
        new Article({ url: new URL('https://remote.example/article') }),
        new Document({
          mediaType: 'audio/ogg',
          url: new URL('https://remote.example/media/audio.ogg'),
        }),
        new Document({
          mediaType: 'not a media type',
          url: new URL('https://remote.example/media/malformed'),
        }),
        new URL('https://remote.example/media/iri-only'),
        new Document({
          mediaType: 'image/webp',
          name: 'first image',
          url: urls[0],
        }),
        new Image({ mediaType: 'image/webp', url: urls[1] }),
        new Document({ mediaType: 'IMAGE/PNG; profile=remote', url: urls[2] }),
        new Image({ mediaType: null, url: urls[3] }),
        new Image({ name: 'ignored invalid fifth image' }),
      ],
      attribution: remoteActorUri,
      content: null,
      id: remoteObjectUri,
      to: PUBLIC_COLLECTION,
    });

    await handleInboundCreate(
      createContext(documentLoader),
      new Create({ actor: remoteActorUri, object: note }),
      receivedAt,
    );

    const { content, post } = await getMaterializedPost(remoteObjectUri);
    const media = await db.select().from(Media).where(eq(Media.profileId, profile.id));
    const mediaByUrl = new Map(media.map((item) => [item.url, item]));
    const canonicalUrls = urls.map((url) => new URL(url.href).href);
    assert.equal(documentLoader.mock.calls.length, 0);
    assert.deepEqual(
      media
        .map(({ altText, mediaType, url }) => ({ altText, mediaType, url }))
        .sort((left, right) => left.url!.localeCompare(right.url!)),
      canonicalUrls
        .map((url, index) => ({
          altText: index === 0 ? 'first image' : null,
          mediaType: index === 2 ? 'IMAGE/PNG; profile=remote' : index === 3 ? null : 'image/webp',
          url,
        }))
        .sort((left, right) => left.url.localeCompare(right.url)),
    );
    assert.deepEqual(
      content.document.body.content.flatMap((block) =>
        block.type === 'media' ? [block.attrs] : [],
      ),
      canonicalUrls.map((url) => ({ mediaId: mediaByUrl.get(url)?.id })),
    );
    assert.equal(post.currentContentId, content.id);
  });

  test('rejects a Note atomically when one of the selected Images has an invalid URL', async () => {
    await createStoredRemoteActor();
    const mentionActorUri = new URL('https://mentions.example/users/invalid-image');
    const mentionWorkflow = mockRemoteProfileRefresh(async () => {
      throw new Error('Invalid image must be rejected before remote profile lookup');
    });
    const cases = [
      [new Image({ name: 'missing URL' })],
      [
        new Image({
          urls: [
            new URL('https://remote.example/media/one.webp'),
            new URL('https://remote.example/media/two.webp'),
          ],
        }),
      ],
      [new Image({ url: new URL('ftp://remote.example/media/image.webp') })],
    ];

    for (const [index, attachments] of cases.entries()) {
      const objectUri = new URL(`https://remote.example/notes/invalid-image-${index}`);
      await handleInboundCreate(
        createContext(),
        new Create({
          actor: remoteActorUri,
          object: new Note({
            attachments,
            attribution: remoteActorUri,
            content: 'must not persist',
            id: objectUri,
            tags: [new Mention({ href: mentionActorUri, name: '@ignored' })],
            to: PUBLIC_COLLECTION,
          }),
        }),
        receivedAt,
      );
    }

    assert.equal(remoteProfileWorkflowCallCount(mentionWorkflow.mock.calls), 0);
    mentionWorkflow.mock.restore();
    assert.equal((await db.select().from(Media)).length, 0);
    assert.equal((await db.select().from(ActivityPubPosts)).length, 0);
    assert.equal((await db.select().from(Posts)).length, 0);
    assert.equal((await db.select().from(PostContents)).length, 0);
  });

  test('stores same-URL attachments as separate Remote Media', async () => {
    await createStoredRemoteActor();
    const sharedUrl = new URL('https://remote.example/media/shared.webp');

    await handleInboundCreate(
      createContext(),
      new Create({
        actor: remoteActorUri,
        object: new Note({
          attachments: [
            new Image({ mediaType: 'image/webp', name: 'First', url: sharedUrl }),
            new Image({ mediaType: 'image/png', name: 'Second', url: sharedUrl }),
          ],
          attribution: remoteActorUri,
          content: 'same URL, separate attachments',
          id: remoteObjectUri,
          to: PUBLIC_COLLECTION,
        }),
      }),
      receivedAt,
    );

    const media = await db.select().from(Media);
    assert.equal(media.length, 2);
    const { content } = await getMaterializedPost(remoteObjectUri);
    const mediaById = new Map(media.map((item) => [item.id, item]));
    assert.deepEqual(
      content.document.body.content
        .flatMap((block) => (block.type === 'media' ? [mediaById.get(block.attrs.mediaId)] : []))
        .map((item) => ({
          altText: item?.altText,
          mediaType: item?.mediaType,
          url: item?.url,
        })),
      [
        { altText: 'First', mediaType: 'image/webp', url: sharedUrl.href },
        { altText: 'Second', mediaType: 'image/png', url: sharedUrl.href },
      ],
    );
  });

  test('duplicate Create does not add or update Remote Media', async () => {
    await createStoredRemoteActor();
    const firstUrl = new URL('https://remote.example/media/first.webp');
    const duplicateUrl = new URL('https://remote.example/media/duplicate-delivery.webp');
    const create = (image: Image) =>
      new Create({
        actor: remoteActorUri,
        object: new Note({
          attachments: [image],
          attribution: remoteActorUri,
          content: 'first write wins',
          id: remoteObjectUri,
          to: PUBLIC_COLLECTION,
        }),
      });

    await handleInboundCreate(
      createContext(),
      create(new Image({ mediaType: 'image/webp', url: firstUrl })),
      receivedAt,
    );
    await handleInboundCreate(
      createContext(),
      create(new Image({ mediaType: 'image/png', url: duplicateUrl })),
      receivedAt.add({ minutes: 1 }),
    );

    assert.deepEqual(
      (await db.select().from(Media)).map(({ mediaType, url }) => ({ mediaType, url })),
      [{ mediaType: 'image/webp', url: firstUrl.href }],
    );
  });

  test('concurrent Notes with the same Remote URL keep separate Media identities', async () => {
    await createStoredRemoteActor();
    const mediaUrl = new URL('https://remote.example/media/concurrent.webp');
    const objectUris = [
      new URL('https://remote.example/notes/concurrent-media-1'),
      new URL('https://remote.example/notes/concurrent-media-2'),
    ];

    await Promise.all(
      objectUris.map((objectUri) =>
        handleInboundCreate(
          createContext(),
          new Create({
            actor: remoteActorUri,
            object: new Note({
              attachments: [new Image({ mediaType: 'image/webp', url: mediaUrl })],
              attribution: remoteActorUri,
              id: objectUri,
              to: PUBLIC_COLLECTION,
            }),
          }),
          receivedAt,
        ),
      ),
    );

    const media = await db.select().from(Media);
    assert.equal(media.length, 2);
    assert.equal((await db.select().from(ActivityPubPosts)).length, 2);
    const referencedMediaIds = new Set<string>();
    for (const objectUri of objectUris) {
      const { content } = await getMaterializedPost(objectUri);
      const mediaIds = content.document.body.content.flatMap((block) =>
        block.type === 'media' ? [block.attrs.mediaId] : [],
      );
      assert.equal(mediaIds.length, 1);
      referencedMediaIds.add(mediaIds[0]!);
    }
    assert.deepEqual(referencedMediaIds, new Set(media.map(({ id }) => id)));
    assert.equal(referencedMediaIds.size, 2);
  });

  test('deduplicates actor and object hrefs before dispatch', async () => {
    await createStoredRemoteActor({ instanceState: InstanceState.UNRESPONSIVE });
    const note = new Note({
      attribution: remoteActorUri,
      id: remoteObjectUri,
      to: PUBLIC_COLLECTION,
    });
    const create = new Create({
      actors: [remoteActorUri, new URL(remoteActorUri.href)],
      objects: [note, new URL(remoteObjectUri.href)],
    });

    await handleInboundCreate(createContext(), create, receivedAt);

    assert.equal((await getMaterializedPost(remoteObjectUri)).mapping.uri, remoteObjectUri.href);
  });

  test('skips unavailable actors before hydration and logs the object URI', async () => {
    const cases = [
      { name: 'unknown' },
      { name: 'inactive', profileState: ProfileState.DISABLED },
      { instanceKind: InstanceKind.LOCAL, name: 'non-ActivityPub' },
      { instanceState: InstanceState.SUSPENDED, name: 'SUSPENDED' },
    ];
    const observations: unknown[] = [];
    const restoreReporter = setInboundObservabilityReporter({
      log: (observation) => observations.push(observation),
    });

    try {
      for (const { instanceKind, instanceState, name, profileState } of cases) {
        await db.delete(Profiles);
        await db.delete(Instances).where(ne(Instances.id, localInstanceId));
        if (name !== 'unknown') {
          await createStoredRemoteActor({ instanceKind, instanceState, profileState });
        }
        const documentLoader = mock.fn(async () => {
          throw new Error('hydration must not run');
        });

        assert.equal(
          await handleInboundCreate(
            createContext(documentLoader),
            new Create({ actor: remoteActorUri, object: remoteObjectUri }),
            receivedAt,
          ),
          undefined,
          name,
        );
        assert.equal(documentLoader.mock.calls.length, 0, name);
      }
    } finally {
      restoreReporter();
    }

    assert.deepEqual(
      observations.map((observation) => {
        const { objectOrigin, objectUri } = observation as {
          objectOrigin?: string;
          objectUri?: string;
        };
        return [objectOrigin, objectUri];
      }),
      cases.map(() => [remoteObjectUri.origin, remoteObjectUri.href]),
    );
  });

  test('rejects missing or multiple actor/object identities before hydration', async () => {
    await createStoredRemoteActor();
    const documentLoader = mock.fn(async () => {
      throw new Error('hydration must not run');
    });
    const activities = [
      new Create({ object: remoteObjectUri }),
      new Create({
        actors: [remoteActorUri, new URL('https://remote.example/users/mallory')],
        object: remoteObjectUri,
      }),
      new Create({ actor: remoteActorUri }),
      new Create({
        actor: remoteActorUri,
        objects: [remoteObjectUri, new URL('https://remote.example/notes/2')],
      }),
    ];
    const observations: unknown[] = [];
    const restoreReporter = setInboundObservabilityReporter({
      log: (observation) => observations.push(observation),
    });

    try {
      for (const create of activities) {
        assert.equal(
          await handleInboundCreate(createContext(documentLoader), create, receivedAt),
          undefined,
        );
      }
      assert.equal(documentLoader.mock.calls.length, 0);
    } finally {
      restoreReporter();
    }

    assert.deepEqual(
      observations.map((observation) => {
        const { objectOrigin, objectUri } = observation as {
          objectOrigin?: string;
          objectUri?: string;
        };
        return [objectOrigin, objectUri];
      }),
      [
        [remoteObjectUri.origin, remoteObjectUri.href],
        [remoteObjectUri.origin, remoteObjectUri.href],
        [undefined, undefined],
        [undefined, undefined],
      ],
    );
  });

  test('skips unsupported object types and failed hydration', async () => {
    const observations: unknown[] = [];
    const restoreReporter = setInboundObservabilityReporter({
      log: (observation) => observations.push(observation),
    });
    const article = new Article({
      attribution: remoteActorUri,
      id: remoteObjectUri,
      to: PUBLIC_COLLECTION,
    });

    try {
      await createStoredRemoteActor();
      assert.equal(
        await handleInboundCreate(
          createContext(),
          new Create({ actor: remoteActorUri, object: article }),
          receivedAt,
        ),
        undefined,
      );

      const failedLoader = mock.fn(async () => {
        throw new Error('remote object unavailable');
      });
      assert.equal(
        await handleInboundCreate(
          createContext(failedLoader),
          new Create({ actor: remoteActorUri, object: remoteObjectUri }),
          receivedAt,
        ),
        undefined,
      );
      assert.equal(failedLoader.mock.calls.length, 1);
      assert.equal((await db.select().from(ActivityPubPosts)).length, 0);
    } finally {
      restoreReporter();
    }

    assert.deepEqual(observations, [
      {
        activityType: 'Create',
        actorOrigin: remoteActorUri.origin,
        handler: 'create',
        objectOrigin: remoteObjectUri.origin,
        objectUri: remoteObjectUri.href,
        outcome: 'external_failure',
        phase: 'protocol',
        reasonCode: 'create_object_not_note',
      },
      {
        activityType: 'Create',
        actorOrigin: remoteActorUri.origin,
        handler: 'create',
        objectOrigin: remoteObjectUri.origin,
        objectUri: remoteObjectUri.href,
        outcome: 'external_failure',
        phase: 'object_lookup',
        reasonCode: 'create_object_lookup_failed',
      },
    ]);
  });

  test('rejects mismatched identity, attribution, and non-public Notes while falling back unresolved replies', async () => {
    await createStoredRemoteActor();
    const notes = [
      new Note({ id: remoteObjectUri, to: PUBLIC_COLLECTION }),
      new Note({
        attribution: new URL('https://remote.example/users/mallory'),
        id: remoteObjectUri,
        to: PUBLIC_COLLECTION,
      }),
      new Note({
        attributions: [remoteActorUri, new URL('https://remote.example/users/mallory')],
        id: remoteObjectUri,
        to: PUBLIC_COLLECTION,
      }),
      new Note({
        attribution: remoteActorUri,
        id: remoteObjectUri,
        replyTarget: new URL('https://remote.example/notes/parent'),
        to: PUBLIC_COLLECTION,
      }),
      new Note({
        attribution: remoteActorUri,
        id: remoteObjectUri,
        replyTarget: new Note({ content: 'Parent without an ID' }),
        to: PUBLIC_COLLECTION,
      }),
      new Note({
        attribution: remoteActorUri,
        id: remoteObjectUri,
        to: new URL('https://remote.example/users/bob'),
      }),
      new Note({
        attribution: remoteActorUri,
        id: remoteObjectUri,
      }),
    ];

    for (const note of notes) {
      await handleInboundCreate(
        createContext(),
        new Create({ actor: remoteActorUri, object: note }),
        receivedAt,
      );
    }

    const mismatchedNote = new Note({
      attribution: remoteActorUri,
      id: new URL('https://remote.example/notes/different'),
      to: PUBLIC_COLLECTION,
    });
    const mismatchedLoader = mock.fn(async (url: string) => ({
      contextUrl: null,
      document: await mismatchedNote.toJsonLd({ format: 'expand' }),
      documentUrl: url,
    }));
    await handleInboundCreate(
      createContext(mismatchedLoader),
      new Create({ actor: remoteActorUri, object: remoteObjectUri }),
      receivedAt,
    );

    assert.equal((await db.select().from(ActivityPubPosts)).length, 1);
    assert.equal((await db.select().from(Posts)).length, 1);
    assert.equal((await db.select().from(PostContents)).length, 1);
    assert.equal((await getMaterializedPost(remoteObjectUri)).post.replyParentId, null);
  });

  test('materializes replies to stored Remote and canonical Local Parent identities', async () => {
    const remoteProfile = await createStoredRemoteActor();
    const remoteParentUri = new URL('https://remote.example/notes/remote-parent');
    await handleInboundCreate(
      createContext(),
      createRemoteCreate({ objectUri: remoteParentUri }),
      receivedAt,
    );
    const remoteParent = await getMaterializedPost(remoteParentUri);

    const localProfile = await db
      .insert(Profiles)
      .values({
        displayName: 'local',
        followPolicy: ProfileFollowPolicy.OPEN,
        handle: 'local',
        instanceId: localInstanceId,
        normalizedHandle: 'local',
        state: ProfileState.ACTIVE,
      })
      .returning()
      .then(firstOrThrow);
    const localParent = await createPost({
      bodyText: 'Local parent',
      origin: 'LOCAL',
      profileId: localProfile.id,
      visibility: PostVisibility.PUBLIC,
    });

    const remoteReplyUri = new URL('https://remote.example/notes/remote-reply');
    const localReplyUri = new URL('https://remote.example/notes/local-reply');
    await handleInboundCreate(
      createContext(),
      createRemoteCreate({ objectUri: remoteReplyUri, replyTarget: remoteParentUri }),
      receivedAt,
    );
    await handleInboundCreate(
      createContext(),
      createRemoteCreate({
        objectUri: localReplyUri,
        replyTarget: new URL(`/ap/note/${localParent.post.id}`, publicOrigin),
      }),
      receivedAt,
    );

    assert.equal(
      (await getMaterializedPost(remoteReplyUri)).post.replyParentId,
      remoteParent.post.id,
    );
    assert.equal(
      (await getMaterializedPost(localReplyUri)).post.replyParentId,
      localParent.post.id,
    );
    assert.equal((await getMaterializedPost(remoteReplyUri)).post.profileId, remoteProfile.id);
    assert.equal(
      await db
        .select()
        .from(Notifications)
        .then((rows) => rows.length),
      0,
    );
  });

  test('Active Profile Block은 inbound Create Reply를 양방향 rejected projection으로 관측하고 fallback하지 않는다', async () => {
    const remoteProfile = await createStoredRemoteActor();
    const firstParentProfile = await createLocalFollowerProfile('blocked-parent-owner');
    const secondParentProfile = await createLocalFollowerProfile('blocked-parent-target');
    const firstParent = await createPost({
      bodyText: 'first blocked parent',
      origin: 'LOCAL',
      profileId: firstParentProfile.id,
      visibility: PostVisibility.PUBLIC,
    });
    const secondParent = await createPost({
      bodyText: 'second blocked parent',
      origin: 'LOCAL',
      profileId: secondParentProfile.id,
      visibility: PostVisibility.PUBLIC,
    });
    await db.insert(ProfileBlocks).values([
      {
        ownerProfileId: firstParentProfile.id,
        targetProfileId: remoteProfile.id,
      },
      {
        ownerProfileId: remoteProfile.id,
        targetProfileId: secondParentProfile.id,
      },
    ]);
    const firstReplyUri = new URL('https://remote.example/notes/blocked-reply-one');
    const secondReplyUri = new URL('https://remote.example/notes/blocked-reply-two');
    const logs: unknown[] = [];
    const restoreReporter = setInboundObservabilityReporter({
      log: (observation) => logs.push(observation),
    });

    try {
      await handleInboundCreate(
        createContext(),
        createRemoteCreate({
          objectUri: firstReplyUri,
          replyTarget: new URL(`/ap/note/${firstParent.post.id}`, publicOrigin),
        }),
        receivedAt,
      );
      await handleInboundCreate(
        createContext(),
        createRemoteCreate({
          objectUri: secondReplyUri,
          replyTarget: new URL(`/ap/note/${secondParent.post.id}`, publicOrigin),
        }),
        receivedAt,
      );
    } finally {
      restoreReporter();
    }

    assert.equal(
      (await db.select().from(Posts).where(eq(Posts.profileId, remoteProfile.id))).length,
      0,
    );
    assert.equal((await db.select().from(ActivityPubPosts)).length, 0);
    assert.equal((await db.select().from(PostContents)).length, 2);
    assert.deepEqual(logs, [
      {
        activityType: 'Create',
        actorOrigin: remoteActorUri.origin,
        handler: 'create',
        objectOrigin: firstReplyUri.origin,
        objectUri: firstReplyUri.href,
        outcome: 'rejected',
        phase: 'projection',
        reasonCode: 'reply_profile_blocked',
      },
      {
        activityType: 'Create',
        actorOrigin: remoteActorUri.origin,
        handler: 'create',
        objectOrigin: secondReplyUri.origin,
        objectUri: secondReplyUri.href,
        outcome: 'rejected',
        phase: 'projection',
        reasonCode: 'reply_profile_blocked',
      },
    ]);
    assert.equal(
      logs.some(
        (observation) =>
          typeof observation === 'object' &&
          observation !== null &&
          'outcome' in observation &&
          observation.outcome === 'internal_failure',
      ),
      false,
    );
  });

  test('does not resolve a current canonical URI to a Post from a previous Local Instance', async () => {
    const previousInstance = await db
      .insert(Instances)
      .values({
        canonicalOrigin: 'https://previous.example',
        domain: 'previous.example',
        kind: InstanceKind.LOCAL,
        state: InstanceState.ACTIVE,
      })
      .returning()
      .then(firstOrThrow);
    const previousProfile = await db
      .insert(Profiles)
      .values({
        displayName: 'previous',
        followPolicy: ProfileFollowPolicy.OPEN,
        handle: 'previous',
        instanceId: previousInstance.id,
        normalizedHandle: 'previous',
        state: ProfileState.ACTIVE,
      })
      .returning()
      .then(firstOrThrow);
    const previousPost = await createPost({
      bodyText: 'Previous local Post',
      origin: 'LOCAL',
      profileId: previousProfile.id,
      visibility: PostVisibility.PUBLIC,
    });

    assert.equal(
      await findPostByActivityPubUri(
        createContext(),
        new URL(`/ap/note/${previousPost.post.id}`, publicOrigin),
      ),
      undefined,
    );
    assert.equal(
      await findPostByActivityPubUri(
        {
          canonicalOrigin: previousInstance.canonicalOrigin!,
          parseUri: (uri: URL | null) =>
            uriFederation
              .createContext(new URL(previousInstance.canonicalOrigin!), undefined)
              .parseUri(uri),
        },
        new URL(`/ap/note/${previousPost.post.id}`, previousInstance.canonicalOrigin!),
      ),
      previousPost.post.id,
    );
  });

  test('materializes an inbound Reply through the remote Post Workflow', async () => {
    await createStoredRemoteActor();
    const localProfile = await db
      .insert(Profiles)
      .values({
        displayName: 'notification failure recipient',
        followPolicy: ProfileFollowPolicy.OPEN,
        handle: 'notification_failure_recipient',
        instanceId: localInstanceId,
        normalizedHandle: 'notification_failure_recipient',
        state: ProfileState.ACTIVE,
      })
      .returning()
      .then(firstOrThrow);
    const parent = await createPost({
      bodyText: 'Local parent',
      origin: 'LOCAL',
      profileId: localProfile.id,
      visibility: PostVisibility.PUBLIC,
    });
    const replyUri = new URL('https://remote.example/notes/notification-failure-reply');
    await handleInboundCreate(
      createContext(),
      createRemoteCreate({
        objectUri: replyUri,
        replyTarget: new URL(`/ap/note/${parent.post.id}`, publicOrigin),
      }),
      receivedAt,
    );

    assert.equal((await getMaterializedPost(replyUri)).post.replyParentId, parent.post.id);
  });

  test('stores ambiguous, unsupported, unknown, forged Local, and contentless Parent inputs as top-level Posts', async () => {
    const profile = await createStoredRemoteActor();
    const sourceUri = new URL('https://remote.example/notes/repost-source');
    await handleInboundCreate(
      createContext(),
      createRemoteCreate({ objectUri: sourceUri }),
      receivedAt,
    );
    const source = await getMaterializedPost(sourceUri);
    const contentlessParent = await db
      .insert(Posts)
      .values({
        profileId: profile.id,
        repostSourceId: source.post.id,
        state: PostState.ACTIVE,
        visibility: PostVisibility.UNLISTED,
      })
      .returning()
      .then(firstOrThrow);
    const contentlessParentUri = new URL('https://remote.example/notes/contentless-parent');
    await db.insert(ActivityPubPosts).values({
      postId: contentlessParent.id,
      receivedAt,
      uri: contentlessParentUri.href,
    });
    assert.equal(
      await findPostByActivityPubUri(createContext(), contentlessParentUri),
      contentlessParent.id,
    );
    const existingPostCount = await db.$count(Posts);
    const existingContentCount = await db.$count(PostContents);
    const existingMappingCount = await db.$count(ActivityPubPosts);
    const parentLoader = mock.fn(async () => {
      throw new Error('Reply Parent must not be fetched');
    });
    const invalidNotes = [
      new Note({
        attribution: remoteActorUri,
        content: 'Multiple Parent fallback',
        id: new URL('https://remote.example/notes/multiple-parent'),
        replyTargets: [
          new URL('https://remote.example/notes/parent-1'),
          new URL('https://remote.example/notes/parent-2'),
        ],
        to: PUBLIC_COLLECTION,
      }),
      new Note({
        attribution: remoteActorUri,
        content: 'Unsupported Parent fallback',
        id: new URL('https://remote.example/notes/non-http-parent'),
        replyTarget: new URL('urn:uuid:019f6f67-1111-7777-8888-123456789abc'),
        to: PUBLIC_COLLECTION,
      }),
      new Note({
        attribution: remoteActorUri,
        content: 'Unknown Parent fallback',
        id: new URL('https://remote.example/notes/unknown-parent'),
        replyTarget: new URL('https://remote.example/notes/unknown'),
        to: PUBLIC_COLLECTION,
      }),
      new Note({
        attribution: remoteActorUri,
        content: 'Forged Local Parent fallback',
        id: new URL('https://remote.example/notes/forged-local-parent'),
        replyTarget: new URL(
          'https://attacker.example/ap/note/019f6f67-1111-7777-8888-123456789abc',
        ),
        to: PUBLIC_COLLECTION,
      }),
      new Note({
        attribution: remoteActorUri,
        content: 'Contentless Parent fallback',
        id: new URL('https://remote.example/notes/contentless-reply'),
        replyTarget: contentlessParentUri,
        to: PUBLIC_COLLECTION,
      }),
      new Note({
        attribution: remoteActorUri,
        content: 'Embedded Parent fallback',
        id: new URL('https://remote.example/notes/embedded-parent-without-id'),
        replyTarget: new Note({ content: 'Parent without an ID' }),
        to: PUBLIC_COLLECTION,
      }),
    ];

    for (const note of invalidNotes) {
      await handleInboundCreate(
        createContext(parentLoader),
        new Create({ actor: remoteActorUri, object: note }),
        receivedAt,
      );
    }

    assert.equal(parentLoader.mock.calls.length, 0);
    assert.equal(await db.$count(Posts), existingPostCount + invalidNotes.length);
    assert.equal(await db.$count(PostContents), existingContentCount + invalidNotes.length);
    assert.equal(await db.$count(ActivityPubPosts), existingMappingCount + invalidNotes.length);
    for (const note of invalidNotes) {
      assert.equal((await getMaterializedPost(note.id!)).post.replyParentId, null);
    }
  });

  test('preserves first-write Parent state for top-level fallback and resolved Reply duplicates', async () => {
    await createStoredRemoteActor();
    const firstParentUri = new URL('https://remote.example/notes/late-parent');
    const secondParentUri = new URL('https://remote.example/notes/second-parent');
    const replyUri = new URL('https://remote.example/notes/deferred-reply');
    const deferredReply = () =>
      createRemoteCreate({ objectUri: replyUri, replyTarget: firstParentUri });

    await handleInboundCreate(createContext(), deferredReply(), receivedAt);
    assert.equal((await getMaterializedPost(replyUri)).post.replyParentId, null);

    await handleInboundCreate(
      createContext(),
      createRemoteCreate({ objectUri: firstParentUri }),
      receivedAt,
    );
    await handleInboundCreate(createContext(), deferredReply(), receivedAt);
    const firstParent = await getMaterializedPost(firstParentUri);
    const fallback = await getMaterializedPost(replyUri);
    assert.equal(fallback.post.replyParentId, null);

    const resolvedReplyUri = new URL('https://remote.example/notes/resolved-reply');
    await handleInboundCreate(
      createContext(),
      createRemoteCreate({ objectUri: resolvedReplyUri, replyTarget: firstParentUri }),
      receivedAt,
    );
    const resolvedReply = await getMaterializedPost(resolvedReplyUri);
    assert.equal(resolvedReply.post.replyParentId, firstParent.post.id);

    await handleInboundCreate(
      createContext(),
      createRemoteCreate({ objectUri: secondParentUri }),
      receivedAt,
    );
    await handleInboundCreate(
      createContext(),
      createRemoteCreate({ objectUri: resolvedReplyUri, replyTarget: secondParentUri }),
      receivedAt.add({ hours: 1 }),
    );

    assert.equal((await getMaterializedPost(replyUri)).post.replyParentId, null);
    assert.equal(
      (await getMaterializedPost(resolvedReplyUri)).post.replyParentId,
      firstParent.post.id,
    );
    assert.equal(
      (await db.select().from(PostContents).where(eq(PostContents.postId, resolvedReply.post.id)))
        .length,
      1,
    );
  });

  test('uses Fedify defaults to hydrate a cross-origin Note before dispatch', async () => {
    await createStoredRemoteActor();
    const objectUri = new URL('https://objects.example/notes/1');
    const note = new Note({
      attribution: remoteActorUri,
      id: objectUri,
      to: PUBLIC_COLLECTION,
    });
    const documentLoader = mock.fn(async (url: string) => ({
      contextUrl: null,
      document: await note.toJsonLd({ format: 'expand' }),
      documentUrl: url,
    }));

    await handleInboundCreate(
      createContext(documentLoader),
      new Create({ actor: remoteActorUri, object: objectUri }),
      receivedAt,
    );

    assert.equal((await getMaterializedPost(objectUri)).mapping.uri, objectUri.href);
    assert.equal(documentLoader.mock.calls.length, 1);
  });

  test('signed Create reaches the dispatcher through personal and shared inboxes', async () => {
    const remoteProfile = await createStoredRemoteActor();
    await createLocalFollowerProfile('inbox-recipient', localProfileId);
    await db.insert(ProfileFollows).values({
      followerProfileId: localProfileId,
      followeeProfileId: remoteProfile.id,
    });
    const fixture = await createInboxFixture();
    const audience = [
      new URL('https://remote.example/users/alice/followers'),
      new URL('https://mention.example/users/bob'),
    ];

    const personalResponse = await fixture.federation.fetch(
      await fixture.createSignedCreateRequest(
        `/ap/actor/${localProfileId}/inbox`,
        new URL('https://remote.example/notes/personal'),
        new URL('https://remote.example/activities/create-personal'),
        undefined,
        audience,
      ),
      { contextData: undefined },
    );
    const sharedResponse = await fixture.federation.fetch(
      await fixture.createSignedCreateRequest(
        '/inbox',
        new URL('https://remote.example/notes/shared'),
        null,
        undefined,
        audience,
      ),
      { contextData: undefined },
    );

    assert.equal(personalResponse.status, 202, await personalResponse.text());
    assert.equal(sharedResponse.status, 202, await sharedResponse.text());
    assert.deepEqual((await db.select().from(ActivityPubPosts)).map(({ uri }) => uri).sort(), [
      'https://remote.example/notes/personal',
      'https://remote.example/notes/shared',
    ]);
    assert.deepEqual(
      (await db.select({ visibility: Posts.visibility }).from(Posts)).map(
        ({ visibility }) => visibility,
      ),
      [PostVisibility.FOLLOWERS, PostVisibility.FOLLOWERS],
    );
  });

  test('commits one Post for concurrent personal and shared deliveries of the same object', async () => {
    const profile = await createStoredRemoteActor();
    const fixture = await createInboxFixture();
    const objectUri = new URL('https://remote.example/notes/concurrent-inboxes');

    const [personalResponse, sharedResponse] = await Promise.all([
      fixture.federation.fetch(
        await fixture.createSignedCreateRequest(
          `/ap/actor/${localProfileId}/inbox`,
          objectUri,
          new URL('https://remote.example/activities/create-concurrent-personal'),
        ),
        { contextData: undefined },
      ),
      fixture.federation.fetch(
        await fixture.createSignedCreateRequest(
          '/inbox',
          objectUri,
          new URL('https://remote.example/activities/create-concurrent-shared'),
        ),
        { contextData: undefined },
      ),
    ]);

    assert.equal(personalResponse.status, 202, await personalResponse.text());
    assert.equal(sharedResponse.status, 202, await sharedResponse.text());
    assert.equal((await db.select().from(ActivityPubPosts)).length, 1);
    assert.equal((await db.select().from(Posts).where(eq(Posts.profileId, profile.id))).length, 1);
    assert.equal((await db.select().from(PostContents)).length, 1);
  });

  test('commits one Reply Parent relation for concurrent personal and shared deliveries', async () => {
    await createStoredRemoteActor();
    const fixture = await createInboxFixture();
    const parentUri = new URL('https://remote.example/notes/inbox-parent');
    const replyUri = new URL('https://remote.example/notes/concurrent-inbox-reply');
    await handleInboundCreate(
      createContext(),
      createRemoteCreate({ objectUri: parentUri }),
      receivedAt,
    );
    const parent = await getMaterializedPost(parentUri);

    const [personalResponse, sharedResponse] = await Promise.all([
      fixture.federation.fetch(
        await fixture.createSignedCreateRequest(
          `/ap/actor/${localProfileId}/inbox`,
          replyUri,
          new URL('https://remote.example/activities/create-reply-personal'),
          parentUri,
        ),
        { contextData: undefined },
      ),
      fixture.federation.fetch(
        await fixture.createSignedCreateRequest('/inbox', replyUri, null, parentUri),
        { contextData: undefined },
      ),
    ]);

    assert.equal(personalResponse.status, 202, await personalResponse.text());
    assert.equal(sharedResponse.status, 202, await sharedResponse.text());
    assert.equal((await getMaterializedPost(replyUri)).post.replyParentId, parent.post.id);
    assert.equal(
      (await db.select().from(ActivityPubPosts).where(eq(ActivityPubPosts.uri, replyUri.href)))
        .length,
      1,
    );
  });

  test('skips unsupported remote content without writing rows', async () => {
    await createStoredRemoteActor();
    const note = new Note({
      attribution: remoteActorUri,
      content: 'not an image',
      id: remoteObjectUri,
      mediaType: 'image/png',
      to: PUBLIC_COLLECTION,
    });

    await handleInboundCreate(
      createContext(),
      new Create({ actor: remoteActorUri, object: note }),
      receivedAt,
    );

    assert.equal((await db.select().from(ActivityPubPosts)).length, 0);
    assert.equal((await db.select().from(Posts)).length, 0);
    assert.equal((await db.select().from(PostContents)).length, 0);
  });

  test('rejects an over-limit Note before Media materialization and records a bounded reason', async () => {
    await createStoredRemoteActor();
    const objectUri = new URL('https://remote.example/notes/over-limit');
    const logs: unknown[] = [];
    const metrics: unknown[] = [];
    const restoreReporter = setInboundObservabilityReporter({
      countMetric: (name, attributes) => metrics.push({ attributes, name }),
      log: (observation) => logs.push(observation),
    });

    try {
      await handleInboundCreate(
        createContext(),
        new Create({
          actor: remoteActorUri,
          object: new Note({
            attachments: [
              new Image({
                mediaType: 'image/webp',
                url: new URL('https://remote.example/media/over-limit.webp'),
              }),
              new Image({ name: 'malformed attachment without URL' }),
            ],
            attribution: remoteActorUri,
            content: 'a'.repeat(10_001),
            id: objectUri,
            mediaType: 'text/plain',
            to: PUBLIC_COLLECTION,
          }),
        }),
        receivedAt,
      );
    } finally {
      restoreReporter();
    }

    assert.deepEqual(logs, [
      {
        activityType: 'Create',
        actorOrigin: remoteActorUri.origin,
        handler: 'create',
        objectOrigin: objectUri.origin,
        objectUri: objectUri.href,
        outcome: 'rejected',
        phase: 'projection',
        reasonCode: 'note_content_length_exceeded',
      },
    ]);
    assert.doesNotMatch(JSON.stringify(logs), /a{100}/u);
    assert.deepEqual(metrics, [
      {
        attributes: {
          activity_type: 'Create',
          handler: 'create',
          outcome: 'rejected',
          phase: 'projection',
          reason_code: 'note_content_length_exceeded',
        },
        name: 'activitypub.inbound.note_content_length_exceeded',
      },
    ]);
    assert.doesNotMatch(JSON.stringify(metrics), /a{100}|remote\.example|over-limit/u);
    assert.equal(await db.$count(Media), 0);
    assert.equal(await db.$count(ActivityPubPosts), 0);
    assert.equal(await db.$count(Posts), 0);
    assert.equal(await db.$count(PostContents), 0);
  });

  test('rejects an over-limit hydrated Note before canonical storage', async () => {
    await createStoredRemoteActor();
    const objectUri = new URL('https://objects.example/notes/over-limit-iri');
    const logs: unknown[] = [];
    const restoreReporter = setInboundObservabilityReporter({
      log: (observation) => logs.push(observation),
    });
    const note = new Note({
      attribution: remoteActorUri,
      content: 'a'.repeat(10_001),
      id: objectUri,
      mediaType: 'text/plain',
      to: PUBLIC_COLLECTION,
    });
    const documentLoader = mock.fn(async (url: string) => ({
      contextUrl: null,
      document: await note.toJsonLd({ format: 'expand' }),
      documentUrl: url,
    }));

    try {
      await handleInboundCreate(
        createContext(documentLoader),
        new Create({ actor: remoteActorUri, object: objectUri }),
        receivedAt,
      );
    } finally {
      restoreReporter();
    }

    assert.deepEqual(logs, [
      {
        activityType: 'Create',
        actorOrigin: remoteActorUri.origin,
        handler: 'create',
        objectOrigin: objectUri.origin,
        objectUri: objectUri.href,
        outcome: 'rejected',
        phase: 'projection',
        reasonCode: 'note_content_length_exceeded',
      },
    ]);
    assert.doesNotMatch(JSON.stringify(logs), /a{100}/u);
    assert.equal(documentLoader.mock.calls.length, 1);
    assert.equal(await db.$count(Media), 0);
    assert.equal(await db.$count(ActivityPubPosts), 0);
    assert.equal(await db.$count(Posts), 0);
    assert.equal(await db.$count(PostContents), 0);
  });

  test('preserves the bounded rejection reason for a hydrated action without Create observation', async () => {
    await createStoredRemoteActor();
    const objectUri = new URL('https://objects.example/notes/over-limit-action');
    const logs: unknown[] = [];
    const metrics: unknown[] = [];
    const restoreReporter = setInboundObservabilityReporter({
      countMetric: (name, attributes) => metrics.push({ attributes, name }),
      log: (observation) => logs.push(observation),
    });

    try {
      const result = await materializeHydratedRemoteNote({
        context: createContext(),
        note: new Note({
          attribution: remoteActorUri,
          content: 'a'.repeat(10_001),
          id: objectUri,
          mediaType: 'text/plain',
          to: PUBLIC_COLLECTION,
        }),
        objectUri,
        observation: {
          activityType: 'Announce',
          handler: 'announce',
        },
        receivedAt,
      });

      assert.deepEqual(result, {
        reason: 'note_content_length_exceeded',
        status: 'rejected',
      });
    } finally {
      restoreReporter();
    }

    assert.deepEqual(logs, [
      {
        activityType: 'Announce',
        handler: 'announce',
        objectOrigin: objectUri.origin,
        objectUri: objectUri.href,
        outcome: 'rejected',
        phase: 'projection',
        reasonCode: 'note_content_length_exceeded',
      },
    ]);
    assert.doesNotMatch(JSON.stringify(logs), /a{100}/u);
    assert.deepEqual(metrics, [
      {
        attributes: {
          activity_type: 'Announce',
          handler: 'announce',
          outcome: 'rejected',
          phase: 'projection',
          reason_code: 'note_content_length_exceeded',
        },
        name: 'activitypub.inbound.note_content_length_exceeded',
      },
    ]);
    assert.doesNotMatch(JSON.stringify(metrics), /a{100}|objects\.example|over-limit-action/u);
    assert.equal(await db.$count(Media), 0);
    assert.equal(await db.$count(ActivityPubPosts), 0);
    assert.equal(await db.$count(Posts), 0);
    assert.equal(await db.$count(PostContents), 0);
  });

  test('applies the content budget at the embedded Create and hydrated action boundaries', async () => {
    await createStoredRemoteActor();
    const embeddedCases = [
      { expected: 'created', length: 9_999 },
      { expected: 'created', length: 10_000 },
      { expected: 'rejected', length: 10_001 },
    ] as const;
    const hydratedCases = [
      { expected: 'created', length: 9_999 },
      { expected: 'created', length: 10_000 },
      { expected: 'rejected', length: 10_001 },
    ] as const;

    for (const { expected, length } of embeddedCases) {
      const objectUri = new URL(`https://remote.example/notes/budget-embedded-${length}`);
      await handleInboundCreate(
        createContext(),
        new Create({
          actor: remoteActorUri,
          object: new Note({
            attribution: remoteActorUri,
            content: 'a'.repeat(length),
            id: objectUri,
            mediaType: 'text/plain',
            to: PUBLIC_COLLECTION,
          }),
        }),
        receivedAt,
      );

      if (expected === 'created') {
        assert.equal((await getMaterializedPost(objectUri)).post.visibility, PostVisibility.PUBLIC);
      } else {
        assert.equal(await db.$count(Posts), 2);
      }
    }

    for (const { expected, length } of hydratedCases) {
      const objectUri = new URL(`https://objects.example/notes/budget-hydrated-${length}`);
      const result = await materializeHydratedRemoteNote({
        context: createContext(),
        note: new Note({
          attribution: remoteActorUri,
          content: 'a'.repeat(length),
          id: objectUri,
          mediaType: 'text/plain',
          to: PUBLIC_COLLECTION,
        }),
        objectUri,
        observation: createObservation,
        receivedAt,
      });

      if (expected === 'created') {
        assert.equal(result.status, 'created');
        assert.equal((await getMaterializedPost(objectUri)).post.visibility, PostVisibility.PUBLIC);
      } else {
        assert.deepEqual(result, {
          reason: 'note_content_length_exceeded',
          status: 'rejected',
        });
      }
    }

    assert.equal(await db.$count(Posts), 4);
    assert.equal(await db.$count(PostContents), 4);
    assert.equal(await db.$count(ActivityPubPosts), 4);
  });

  test('rejects over-budget Note content before resolving typed Mention targets', async () => {
    const mentionActorUri = new URL('https://mentions.example/users/over-budget');
    const objectUri = new URL('https://remote.example/notes/over-budget-mention');
    const mentionWorkflow = mockRemoteProfileRefresh(async () => {
      throw new Error('Over-budget content must be rejected before remote profile lookup');
    });
    const restoreReporter = setInboundObservabilityReporter({ log: () => undefined });

    try {
      await createStoredRemoteActor();
      await handleInboundCreate(
        createContext(),
        new Create({
          actor: remoteActorUri,
          object: new Note({
            attribution: remoteActorUri,
            content: 'a'.repeat(10_001),
            id: objectUri,
            mediaType: 'text/plain',
            tags: [new Mention({ href: mentionActorUri, name: '@ignored' })],
            to: PUBLIC_COLLECTION,
          }),
        }),
        receivedAt,
      );
    } finally {
      restoreReporter();
    }

    assert.equal(remoteProfileWorkflowCallCount(mentionWorkflow.mock.calls), 0);
    mentionWorkflow.mock.restore();
    assert.equal(await db.$count(Posts), 0);
  });

  test('rejects an embedded Note with more than 16 matched Mention nodes as a whole', async () => {
    const mentionActorUri = new URL('https://mentions.example/users/mention-limit');
    const objectUri = new URL('https://remote.example/notes/mention-node-limit');
    const logs: unknown[] = [];
    const restoreReporter = setInboundObservabilityReporter({
      log: (observation) => logs.push(observation),
    });

    try {
      await createStoredRemoteActor();
      await createStoredRemoteActor({ actorUri: mentionActorUri, handle: 'mention-limit' });
      await handleInboundCreate(
        createContext(),
        new Create({
          actor: remoteActorUri,
          object: new Note({
            attribution: remoteActorUri,
            content: `<p>${Array.from(
              { length: 17 },
              () => `<a href="${mentionActorUri.href}">@mention-limit</a>`,
            ).join(' ')}</p>`,
            id: objectUri,
            mediaType: 'text/html',
            tags: [new Mention({ href: mentionActorUri, name: '@ignored' })],
            to: PUBLIC_COLLECTION,
          }),
        }),
        receivedAt,
      );
    } finally {
      restoreReporter();
    }

    assert.deepEqual(logs, [
      {
        activityType: 'Create',
        actorOrigin: remoteActorUri.origin,
        handler: 'create',
        objectOrigin: objectUri.origin,
        objectUri: objectUri.href,
        outcome: 'rejected',
        phase: 'projection',
        reasonCode: 'note_mention_limit_exceeded',
      },
    ]);
    assert.equal(await db.$count(Media), 0);
    assert.equal(await db.$count(ActivityPubPosts), 0);
    assert.equal(await db.$count(Posts), 0);
    assert.equal(await db.$count(PostContents), 0);
    assert.equal(await db.$count(PostMentions), 0);
  });

  test('rejects a hydrated Note with an oversized Mention username as a whole', async () => {
    const mentionActorUri = new URL('https://mentions.example/users/long-handle');
    const objectUri = new URL('https://objects.example/notes/long-mention-handle');
    const author = await createStoredRemoteActor();
    const lookupWorkflow = mockRemoteProfileRefresh(async (actorUri) => {
      assert.equal(actorUri, remoteActorUri.href);
      return author.id;
    });
    const logs: unknown[] = [];
    const restoreReporter = setInboundObservabilityReporter({
      log: (observation) => logs.push(observation),
    });
    const note = new Note({
      attribution: remoteActorUri,
      content: `<p><a href="${mentionActorUri.href}">@long-handle</a></p>`,
      id: objectUri,
      mediaType: 'text/html',
      tags: [new Mention({ href: mentionActorUri, name: '@ignored' })],
      to: PUBLIC_COLLECTION,
    });

    try {
      await createStoredRemoteActor({
        actorUri: mentionActorUri,
        handle: 'a'.repeat(65),
      });
      const result = await materializeHydratedRemoteNote({
        context: createContext(),
        note,
        objectUri,
        observation: { activityType: 'Unknown', handler: 'create' },
        receivedAt,
      });

      assert.deepEqual(result, {
        reason: 'note_mention_limit_exceeded',
        status: 'rejected',
      });
      assert.equal(remoteProfileWorkflowCallCount(lookupWorkflow.mock.calls), 1);
    } finally {
      lookupWorkflow.mock.restore();
      restoreReporter();
    }

    assert.deepEqual(logs, [
      {
        activityType: 'Unknown',
        handler: 'create',
        objectOrigin: objectUri.origin,
        objectUri: objectUri.href,
        outcome: 'rejected',
        phase: 'projection',
        reasonCode: 'note_mention_limit_exceeded',
      },
    ]);
    assert.equal(await db.$count(Media), 0);
    assert.equal(await db.$count(ActivityPubPosts), 0);
    assert.equal(await db.$count(Posts), 0);
    assert.equal(await db.$count(PostContents), 0);
    assert.equal(await db.$count(PostMentions), 0);
  });

  test('converges unsaved Actor and Post identity for concurrent hydrated materialization without loser Media', async () => {
    const objectUri = new URL('https://objects.example/notes/concurrent-new-materialization');
    const mediaUrl = new URL('https://remote.example/media/concurrent-new-materialization.webp');
    const actor = new Person({ id: remoteActorUri, preferredUsername: 'alice' });
    const lookupObject = mock.fn(async () => actor);
    const lookupWorkflow = mockRemoteProfileRefresh(async (actorUri) => {
      const profile = await materializeRemoteProfileActor({
        actorUri: new URL(actorUri),
        context: { lookupObject },
      });
      return profile.id;
    });
    const note = () =>
      new Note({
        attachments: [new Image({ mediaType: 'image/webp', url: mediaUrl })],
        attribution: remoteActorUri,
        content: 'Concurrent new materialization',
        id: objectUri,
        mediaType: 'text/plain',
        to: PUBLIC_COLLECTION,
      });

    try {
      const results = await Promise.all([
        materializeHydratedRemoteNote({
          context: { ...createContext(), lookupObject } as unknown as InboxContext<void>,
          note: note(),
          objectUri,
          observation: createObservation,
          receivedAt,
        }),
        materializeHydratedRemoteNote({
          context: { ...createContext(), lookupObject } as unknown as InboxContext<void>,
          note: note(),
          objectUri,
          observation: createObservation,
          receivedAt,
        }),
      ]);

      assert.deepEqual(results.map((result) => result.status).sort(), ['created', 'duplicate']);
      assert.equal(lookupObject.mock.callCount(), 1);
      const materialized = await getMaterializedPost(objectUri);
      assert.equal(await db.$count(ActivityPubActors), 1);
      assert.equal(await db.$count(Profiles), 1);
      assert.equal(await db.$count(Posts), 1);
      assert.equal(await db.$count(PostContents), 1);
      assert.equal(await db.$count(ActivityPubPosts), 1);
      assert.equal(await db.$count(Media), 1);
      assert.equal(materialized.post.profileId, (await db.select().from(Profiles))[0]?.id);
      assert.deepEqual(
        materialized.content.document.body.content
          .filter((block) => block.type === 'media')
          .map((block) => block.attrs.mediaId),
        [(await db.select().from(Media))[0]?.id],
      );
    } finally {
      lookupWorkflow.mock.restore();
    }
  });

  test('keeps the first content, visibility, and timestamps for duplicate Create', async () => {
    const profile = await createStoredRemoteActor();
    const mentionLabel = '@alice';
    const firstHashtagToken = `#first${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;
    const changedHashtagToken = `#changed${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;
    const firstHashtagName = firstHashtagToken.slice(1);
    const changedHashtagName = changedHashtagToken.slice(1);
    const firstHashtagHref = new URL('https://remote.example/tags/first');
    const changedHashtagHref = new URL('https://remote.example/tags/changed');
    const publishedAt = Temporal.Instant.from('2026-07-15T12:00:00Z');
    const first = new Note({
      attribution: remoteActorUri,
      content:
        `<p>First <a href="${remoteActorUri.href}">${mentionLabel}</a> ` +
        `<a href="${firstHashtagHref.href}">${firstHashtagToken}</a></p>`,
      id: remoteObjectUri,
      mediaType: 'text/html',
      published: publishedAt,
      summary: '<p>Content warning</p>',
      tags: [
        new Mention({ href: remoteActorUri, name: mentionLabel }),
        new Hashtag({ href: firstHashtagHref, name: firstHashtagToken }),
      ],
      to: PUBLIC_COLLECTION,
    });

    const logs: unknown[] = [];
    const errorLog = mock.method(console, 'error', () => undefined);
    const restoreReporter = setInboundObservabilityReporter({
      log: (observation) => logs.push(observation),
    });
    try {
      await handleInboundCreate(
        createContext(),
        new Create({ actor: remoteActorUri, object: first }),
        receivedAt,
      );
      await handleInboundCreate(
        createContext(),
        new Create({
          actor: remoteActorUri,
          object: new Note({
            attribution: remoteActorUri,
            cc: PUBLIC_COLLECTION,
            content:
              `<div>\n  <p>First <a class="h-card" href="${remoteActorUri.href}">` +
              `<span>${mentionLabel}</span></a> ` +
              `<a href="${changedHashtagHref.href}">${changedHashtagToken}</a></p>\n</div>`,
            id: remoteObjectUri,
            mediaType: 'text/html',
            published: receivedAt.add({ hours: 1 }),
            tags: [
              new Mention({ href: remoteActorUri, name: mentionLabel }),
              new Hashtag({ href: changedHashtagHref, name: changedHashtagToken }),
            ],
          }),
        }),
        receivedAt.add({ hours: 2 }),
      );
    } finally {
      errorLog.mock.restore();
      restoreReporter();
    }

    assert.deepEqual(logs, [
      {
        activityType: 'Create',
        actorOrigin: remoteActorUri.origin,
        handler: 'create',
        objectOrigin: remoteObjectUri.origin,
        outcome: 'noop',
        phase: 'projection',
        reasonCode: 'duplicate_create_noop',
      },
    ]);

    const { content, mapping, post } = await getMaterializedPost(remoteObjectUri);
    assert.equal(post.visibility, 'PUBLIC');
    assert.equal(post.createdAt.toString(), publishedAt.toString());
    assert.equal(mapping.receivedAt.toString(), receivedAt.toString());
    assert.equal(mapping.publishedAt?.toString(), publishedAt.toString());
    assert.equal(content.createdAt.toString(), receivedAt.toString());
    assert.equal(content.document.summary, 'Content warning');
    assert.equal(
      postContentDocumentToText(content.document),
      `First @alice@remote.example ${firstHashtagToken}`,
    );
    assert.equal((await db.select().from(PostContents)).length, 1);
    assert.deepEqual(await db.select().from(PostMentions), [
      { postContentId: content.id, profileId: profile.id },
    ]);
    const firstHashtag = await db
      .select()
      .from(Hashtags)
      .where(eq(Hashtags.name, firstHashtagName.toLowerCase()))
      .then(firstOrThrow);
    assert.deepEqual(await db.select().from(PostContentHashtags), [
      { postContentId: content.id, hashtagId: firstHashtag.id },
    ]);
    assert.deepEqual(
      await db.select().from(Hashtags).where(eq(Hashtags.name, changedHashtagName.toLowerCase())),
      [],
    );

    const futureObjectUri = new URL('https://remote.example/notes/future');
    const futurePublishedAt = receivedAt.add({ hours: 24 });
    await handleInboundCreate(
      createContext(),
      new Create({
        actor: remoteActorUri,
        object: new Note({
          attribution: remoteActorUri,
          id: futureObjectUri,
          published: futurePublishedAt,
          to: PUBLIC_COLLECTION,
        }),
      }),
      receivedAt,
    );

    const future = await getMaterializedPost(futureObjectUri);
    assert.equal(future.post.createdAt.toString(), receivedAt.toString());
    assert.equal(future.mapping.publishedAt?.toString(), futurePublishedAt.toString());
  });

  test('rolls back the concurrent object URI loser on independent connections', async () => {
    const profile = await createStoredRemoteActor();
    await pg`create sequence inbound_create_attempts`;
    await pg`
      create function synchronize_inbound_create() returns trigger
      language plpgsql as $function$
      declare
        attempt bigint;
      begin
        attempt := nextval('inbound_create_attempts');
        if attempt <= 2 then
          while (select last_value from inbound_create_attempts) < 2 loop
            perform pg_sleep(0.01);
          end loop;
        end if;
        return new;
      end
      $function$
    `;
    await pg`
      create trigger synchronize_inbound_create
      before insert on activitypub_post
      for each row execute function synchronize_inbound_create()
    `;

    const create = () =>
      new Create({
        actor: remoteActorUri,
        object: new Note({
          attribution: remoteActorUri,
          content: 'Concurrent',
          id: remoteObjectUri,
          to: PUBLIC_COLLECTION,
        }),
      });

    try {
      await Promise.all([
        handleInboundCreate(createContext(), create(), receivedAt),
        handleInboundCreate(createContext(), create(), receivedAt),
      ]);
      const [{ attempts }] = await pg<
        { attempts: number }[]
      >`select last_value::integer as attempts from inbound_create_attempts`;
      assert.equal(attempts, 2);
    } finally {
      await pg`drop trigger synchronize_inbound_create on activitypub_post`;
      await pg`drop function synchronize_inbound_create()`;
      await pg`drop sequence inbound_create_attempts`;
    }

    assert.equal((await db.select().from(ActivityPubPosts)).length, 1);
    assert.equal((await db.select().from(Posts).where(eq(Posts.profileId, profile.id))).length, 1);
    assert.equal((await db.select().from(PostContents)).length, 1);
  });

  test('rolls back a partial materialization and allows retry', async () => {
    await createStoredRemoteActor();
    const hashtagToken = `#retry${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;
    const hashtagName = hashtagToken.slice(1);
    const hashtagHref = new URL('https://remote.example/tags/retry');
    const create = () =>
      new Create({
        actor: remoteActorUri,
        object: new Note({
          attachments: [
            new Image({
              mediaType: 'image/webp',
              url: new URL('https://remote.example/media/retryable.webp'),
            }),
          ],
          attribution: remoteActorUri,
          content: `<p>Retryable <a href="${hashtagHref.href}">${hashtagToken}</a></p>`,
          id: remoteObjectUri,
          mediaType: 'text/html',
          tags: [new Hashtag({ href: hashtagHref, name: hashtagToken })],
          to: PUBLIC_COLLECTION,
        }),
      });
    await pg`
      create function fail_inbound_post_content_hashtag() returns trigger
      language plpgsql as $function$
      begin
        raise exception 'intentional post content hashtag failure';
      end
      $function$
    `;
    await pg`
      create trigger fail_inbound_post_content_hashtag
      before insert on post_content_hashtag
      for each row execute function fail_inbound_post_content_hashtag()
    `;

    try {
      await assert.rejects(handleInboundCreate(createContext(), create(), receivedAt));
      assert.equal((await db.select().from(ActivityPubPosts)).length, 0);
      assert.equal((await db.select().from(Posts)).length, 0);
      assert.equal((await db.select().from(PostContents)).length, 0);
      assert.equal((await db.select().from(PostContentHashtags)).length, 0);
      assert.deepEqual(await db.select().from(Hashtags).where(eq(Hashtags.name, hashtagName)), []);
      assert.equal((await db.select().from(Media)).length, 0);
    } finally {
      await pg`drop trigger fail_inbound_post_content_hashtag on post_content_hashtag`;
      await pg`drop function fail_inbound_post_content_hashtag()`;
    }

    await handleInboundCreate(createContext(), create(), receivedAt);
    const materialized = await getMaterializedPost(remoteObjectUri);
    assert.equal(materialized.mapping.uri, remoteObjectUri.href);
    const hashtag = await db
      .select()
      .from(Hashtags)
      .where(eq(Hashtags.name, hashtagName))
      .then(firstOrThrow);
    assert.deepEqual(await db.select().from(PostContentHashtags), [
      { postContentId: materialized.content.id, hashtagId: hashtag.id },
    ]);
    const paragraph = materialized.content.document.body.content[0];
    assert.ok(paragraph?.type === 'paragraph');
    assert.deepEqual(paragraph.content, [
      { type: 'text', text: 'Retryable ' },
      { type: 'hashtag', attrs: { hashtagId: hashtag.id, token: hashtagToken } },
    ]);
    assert.equal((await db.select().from(Media)).length, 1);
  });
});

const createContext = (
  documentLoader: DocumentLoader = async (url) => {
    throw new Error(`Unexpected document URL: ${url}`);
  },
  recipient: string | null = null,
  lookupObject?: (actorUri: URL) => Promise<unknown>,
) =>
  ({
    canonicalOrigin: publicOrigin,
    documentLoader,
    ...(lookupObject ? { lookupObject } : {}),
    parseUri: (uri: URL | null) => uriContext.parseUri(uri),
    recipient,
  }) as unknown as InboxContext<void>;

const createRemoteCreate = ({ objectUri, replyTarget }: { objectUri: URL; replyTarget?: URL }) =>
  new Create({
    actor: remoteActorUri,
    object: new Note({
      attribution: remoteActorUri,
      content: 'Hello',
      id: objectUri,
      ...(replyTarget ? { replyTarget } : {}),
      to: PUBLIC_COLLECTION,
    }),
  });

const createStoredRemoteInstance = async (
  actorUri: URL,
  {
    instanceKind = InstanceKind.ACTIVITYPUB,
    instanceState = InstanceState.ACTIVE,
  }: { instanceKind?: InstanceKind; instanceState?: InstanceState } = {},
) =>
  db
    .insert(Instances)
    .values({
      canonicalOrigin: actorUri.origin,
      domain: actorUri.hostname,
      kind: instanceKind,
      state: instanceState,
    })
    .returning()
    .then(firstOrThrow);

const createStoredRemoteActor = async ({
  actorUri = remoteActorUri,
  handle = 'alice',
  instanceKind = InstanceKind.ACTIVITYPUB,
  instanceState = InstanceState.ACTIVE,
  instanceId,
  profileUrl,
  profileState = ProfileState.ACTIVE,
}: {
  actorUri?: URL;
  handle?: string;
  instanceKind?: InstanceKind;
  instanceState?: InstanceState;
  instanceId?: string;
  profileUrl?: string | null;
  profileState?: ProfileState;
} = {}) => {
  const profileInstanceId =
    instanceId ?? (await createStoredRemoteInstance(actorUri, { instanceKind, instanceState })).id;
  const profile = await db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId: profileInstanceId,
      normalizedHandle: handle,
      state: profileState,
    })
    .returning()
    .then(firstOrThrow);

  await db.insert(ActivityPubActors).values({
    lastFetchedAt: Temporal.Now.instant(),
    profileId: profile.id,
    ...(profileUrl === undefined ? {} : { profileUrl }),
    type: ActivityPubActorType.PERSON,
    uri: actorUri.href,
    followersUri: `${actorUri.href}/followers`,
  });

  return profile;
};

const createLocalFollowerProfile = async (
  handle: string,
  id?: string,
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
      ...(id === undefined ? {} : { id }),
      instanceId,
      normalizedHandle: handle,
      state,
    })
    .returning()
    .then(firstOrThrow);

const getMaterializedPost = async (objectUri: URL) => {
  const mapping = await db
    .select()
    .from(ActivityPubPosts)
    .where(eq(ActivityPubPosts.uri, objectUri.href))
    .then(firstOrThrow);
  const post = await db.select().from(Posts).where(eq(Posts.id, mapping.postId)).then(firstOrThrow);
  assert.ok(post.currentContentId);
  const content = await db
    .select()
    .from(PostContents)
    .where(eq(PostContents.id, post.currentContentId))
    .then(firstOrThrow);

  return { content, mapping, post };
};

const createInboxFixture = async () => {
  const remoteKeyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
  const remoteKey = new CryptographicKey({
    id: remoteKeyUri,
    owner: remoteActorUri,
    publicKey: remoteKeyPair.publicKey,
  });
  const remoteActor = new Person({ id: remoteActorUri, publicKey: remoteKey });
  const documents = new Map<string, unknown>([
    [remoteActorUri.href, await remoteActor.toJsonLd({ format: 'expand' })],
    [remoteKeyUri.href, await remoteKey.toJsonLd({ format: 'expand' })],
  ]);
  const documentLoader: DocumentLoader = async (url) => {
    const document = documents.get(url);
    if (!document) {
      throw new Error(`Unexpected document URL: ${url}`);
    }

    return { contextUrl: null, document, documentUrl: url };
  };
  const contextLoader = getDocumentLoader();
  const federation = createFederation<void>({
    authenticatedDocumentLoaderFactory: () => documentLoader,
    contextLoaderFactory: () => contextLoader,
    documentLoaderFactory: () => documentLoader,
    kv: new MemoryKvStore(),
  });
  const localKeyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
  federation
    .setActorDispatcher('/ap/actor/{identifier}', (context, identifier) =>
      identifier === localProfileId ? new Person({ id: context.getActorUri(identifier) }) : null,
    )
    .setKeyPairsDispatcher(() => [localKeyPair]);
  federation
    .setInboxListeners('/ap/actor/{identifier}/inbox', '/inbox')
    .on(Create, handleInboundCreate);

  const createSignedCreateRequest = async (
    path: string,
    objectUri: URL,
    activityId: URL | null,
    replyTarget?: URL,
    audience: URL | URL[] = PUBLIC_COLLECTION,
  ) => {
    const note = new Note({
      attribution: remoteActorUri,
      content: 'Hello',
      id: objectUri,
      ...(replyTarget ? { replyTarget } : {}),
      ...(Array.isArray(audience) ? { tos: audience } : { to: audience }),
    });
    documents.set(objectUri.href, await note.toJsonLd({ format: 'expand' }));
    const activity = new Create({ actor: remoteActorUri, id: activityId, object: note });
    const request = new Request(new URL(path, 'https://kos.moe'), {
      body: JSON.stringify(await activity.toJsonLd({ contextLoader })),
      headers: { 'content-type': 'application/activity+json' },
      method: 'POST',
    });

    return signRequest(request, remoteKeyPair.privateKey, remoteKeyUri);
  };

  return { createSignedCreateRequest, federation };
};
