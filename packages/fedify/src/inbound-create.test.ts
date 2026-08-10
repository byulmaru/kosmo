import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, mock, test } from 'node:test';
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
  Image,
  LanguageString,
  Note,
  Person,
  PUBLIC_COLLECTION,
} from '@fedify/vocab';
import { getDocumentLoader } from '@fedify/vocab-runtime';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  NotificationKind,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import {
  postContentDocumentFromText,
  postContentDocumentToText,
} from '@kosmo/core/post-content/server';
import { eq, ne, sql } from 'drizzle-orm';
import { createFedifyExecutionContext } from './fedify-execution';
import { setInboundObservabilityReporter } from './inbound-observability';
import type { DocumentLoader, InboxContext } from '@fedify/fedify';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type * as CoreServices from '@kosmo/core/services';
import type { findPostByActivityPubUri as findPostByActivityPubUriType } from './activitypub-post-uri';
import type { FedifyExecutionContext } from './fedify-execution';
import type { handleInboundCreate as handleInboundCreateType } from './inbound-create';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const localProfileId = '019f6f67-1111-7777-8888-123456789abc';
const remoteActorUri = new URL('https://remote.example/users/alice');
const remoteKeyUri = new URL('#main-key', remoteActorUri);
const remoteObjectUri = new URL('https://remote.example/notes/1');
const receivedAt = Temporal.Instant.from('2026-07-16T00:00:00Z');
const uriFederation = createFederation<void>({ kv: new MemoryKvStore() });
uriFederation.setObjectDispatcher(Note, '/ap/note/{id}', () => null);
const uriContext = uriFederation.createContext(new URL(publicOrigin), undefined);

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let ActivityPubPosts: typeof CoreDb.ActivityPubPosts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let Media: typeof CoreDb.Media;
let Notifications: typeof CoreDb.Notifications;
let pg: typeof CoreDb.pg;
let PostContents: typeof CoreDb.PostContents;
let Posts: typeof CoreDb.Posts;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Profiles: typeof CoreDb.Profiles;
let createPost: typeof CoreServices.createPost;
let findPostByActivityPubUri: typeof findPostByActivityPubUriType;
let handleInboundCreate: typeof handleInboundCreateType;
let localInstanceId: string;

describe('inbound Create dispatch', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.PUBLIC_ORIGIN = publicOrigin;
    ({
      ActivityPubActors,
      ActivityPubPosts,
      db,
      firstOrThrow,
      Instances,
      Media,
      Notifications,
      pg,
      PostContents,
      Posts,
      ProfileFollows,
      Profiles,
    } = await import('@kosmo/core/db'));
    const { seedDatabase } = (await import('@kosmo/core/db/seed')) as typeof CoreSeed;
    ({ createPost } = await import('@kosmo/core/services'));
    ({ findPostByActivityPubUri } = await import('./activitypub-post-uri'));
    ({ handleInboundCreate } = await import('./inbound-create'));
    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;
  });

  beforeEach(async () => {
    await db.delete(Notifications);
    await db.update(Posts).set({ currentContentId: null });
    await db.delete(PostContents);
    await db.delete(Posts);
    await db.delete(Media);
    await db.delete(Profiles);
    await db.delete(Instances).where(ne(Instances.id, localInstanceId));
  });

  after(async () => {
    await db.delete(Notifications);
    await db.update(Posts).set({ currentContentId: null });
    await db.delete(PostContents);
    await db.delete(Posts);
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

  test('requires an established local follower for Followers Only personal and shared deliveries', async () => {
    const profile = await createStoredRemoteActor();
    const follower = await createLocalFollowerProfile('accepted-follower');
    const objectUri = new URL('https://remote.example/notes/followers-relevance');
    const note = new Note({
      attribution: remoteActorUri,
      content: 'Followers only',
      id: objectUri,
      to: new URL('https://remote.example/users/alice/followers'),
    });

    await handleInboundCreate(
      createContext(undefined, follower.id),
      new Create({ actor: remoteActorUri, object: note }),
      receivedAt,
    );
    assert.equal((await db.select().from(ActivityPubPosts)).length, 0);

    await db.insert(ProfileFollows).values({
      followerProfileId: follower.id,
      followeeProfileId: profile.id,
    });
    await handleInboundCreate(
      createContext(undefined, follower.id),
      new Create({ actor: remoteActorUri, object: note }),
      receivedAt,
    );
    assert.equal((await getMaterializedPost(objectUri)).post.visibility, PostVisibility.FOLLOWERS);

    const sharedObjectUri = new URL('https://remote.example/notes/followers-shared-relevance');
    await handleInboundCreate(
      createContext(),
      new Create({
        actor: remoteActorUri,
        object: new Note({
          attribution: remoteActorUri,
          content: 'Followers shared',
          id: sharedObjectUri,
          to: new URL('https://remote.example/users/alice/followers'),
        }),
      }),
      receivedAt,
    );
    assert.equal(
      (await getMaterializedPost(sharedObjectUri)).post.visibility,
      PostVisibility.FOLLOWERS,
    );
  });

  test('requires an active local follower on an active local instance for shared delivery', async () => {
    const profile = await createStoredRemoteActor();
    const remoteFollowerInstance = await db
      .insert(Instances)
      .values({
        canonicalOrigin: 'https://remote-follower.example',
        domain: 'remote-follower.example',
        kind: InstanceKind.ACTIVITYPUB,
        state: InstanceState.ACTIVE,
      })
      .returning()
      .then(firstOrThrow);
    const remoteFollower = await createLocalFollowerProfile('remote-follower', undefined, {
      instanceId: remoteFollowerInstance.id,
    });
    await db.insert(ProfileFollows).values({
      followerProfileId: remoteFollower.id,
      followeeProfileId: profile.id,
    });

    const deliver = async (objectUri: URL) =>
      handleInboundCreate(
        createContext(),
        new Create({
          actor: remoteActorUri,
          object: new Note({
            attribution: remoteActorUri,
            content: 'Followers only',
            id: objectUri,
            to: new URL('https://remote.example/users/alice/followers'),
          }),
        }),
        receivedAt,
      );

    await deliver(new URL('https://remote.example/notes/remote-follower-only'));
    assert.equal((await db.select().from(ActivityPubPosts)).length, 0);

    for (const [index, state] of [ProfileState.SUSPENDED, ProfileState.DISABLED].entries()) {
      const inactiveFollower = await createLocalFollowerProfile(
        `inactive-follower-${index}`,
        undefined,
        {
          state,
        },
      );
      await db.insert(ProfileFollows).values({
        followerProfileId: inactiveFollower.id,
        followeeProfileId: profile.id,
      });
      await deliver(new URL(`https://remote.example/notes/inactive-follower-${index}`));
      assert.equal((await db.select().from(ActivityPubPosts)).length, 0);
    }

    const suspendedInstance = await db
      .insert(Instances)
      .values({
        canonicalOrigin: 'https://suspended-local.example',
        domain: 'suspended-local.example',
        kind: InstanceKind.LOCAL,
        state: InstanceState.SUSPENDED,
      })
      .returning()
      .then(firstOrThrow);
    const suspendedInstanceFollower = await createLocalFollowerProfile(
      'suspended-instance-follower',
      undefined,
      { instanceId: suspendedInstance.id },
    );
    await db.insert(ProfileFollows).values({
      followerProfileId: suspendedInstanceFollower.id,
      followeeProfileId: profile.id,
    });
    await deliver(new URL('https://remote.example/notes/suspended-instance-follower'));
    assert.equal((await db.select().from(ActivityPubPosts)).length, 0);

    const activeFollower = await createLocalFollowerProfile('active-follower');
    await db.insert(ProfileFollows).values({
      followerProfileId: activeFollower.id,
      followeeProfileId: profile.id,
    });
    const activeObjectUri = new URL('https://remote.example/notes/active-follower');
    await deliver(activeObjectUri);
    assert.equal(
      (await getMaterializedPost(activeObjectUri)).post.visibility,
      PostVisibility.FOLLOWERS,
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
            to: PUBLIC_COLLECTION,
          }),
        }),
        receivedAt,
      );
    }

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

  test('rejects unknown, inactive, non-ActivityPub, and SUSPENDED actors before hydration', async () => {
    const cases = [
      { name: 'unknown' },
      { name: 'inactive', profileState: ProfileState.DISABLED },
      { instanceKind: InstanceKind.LOCAL, name: 'non-ActivityPub' },
      { instanceState: InstanceState.SUSPENDED, name: 'SUSPENDED' },
    ];

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

    for (const create of activities) {
      assert.equal(
        await handleInboundCreate(createContext(documentLoader), create, receivedAt),
        undefined,
      );
    }
    assert.equal(documentLoader.mock.calls.length, 0);
  });

  test('skips unsupported object types and failed hydration', async () => {
    await createStoredRemoteActor();
    const article = new Article({
      attribution: remoteActorUri,
      id: remoteObjectUri,
      to: PUBLIC_COLLECTION,
    });

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
      document: postContentDocumentFromText('Local parent'),
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
    const localParentReply = await getMaterializedPost(localReplyUri);
    assert.deepEqual(
      await db
        .select({
          kind: Notifications.kind,
          recipientProfileId: Notifications.recipientProfileId,
          sourceId: Notifications.sourceId,
        })
        .from(Notifications),
      [
        {
          kind: NotificationKind.REPLY,
          recipientProfileId: localProfile.id,
          sourceId: localParentReply.post.id,
        },
      ],
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
      document: postContentDocumentFromText('Previous local Post'),
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

  test('keeps an inbound Reply committed when Notification creation fails', async () => {
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
      document: postContentDocumentFromText('Local parent'),
      origin: 'LOCAL',
      profileId: localProfile.id,
      visibility: PostVisibility.PUBLIC,
    });
    const replyUri = new URL('https://remote.example/notes/notification-failure-reply');
    await db.execute(
      sql`ALTER TABLE ${Notifications} ADD CONSTRAINT notification_inbound_reply_create_failure CHECK (false) NOT VALID`,
    );
    const captures: { context: { tags: Record<string, string> }; error: unknown }[] = [];
    const restoreReporter = setInboundObservabilityReporter({
      captureException: (error, context) => captures.push({ context, error }),
      log: () => undefined,
    });

    try {
      await handleInboundCreate(
        createContext(),
        createRemoteCreate({
          objectUri: replyUri,
          replyTarget: new URL(`/ap/note/${parent.post.id}`, publicOrigin),
        }),
        receivedAt,
      );
    } finally {
      restoreReporter();
      await db.execute(
        sql`ALTER TABLE ${Notifications} DROP CONSTRAINT notification_inbound_reply_create_failure`,
      );
    }

    assert.equal((await getMaterializedPost(replyUri)).post.replyParentId, parent.post.id);
    assert.equal((await db.select().from(Notifications)).length, 0);
    assert.equal(captures.length, 1);
    assert.equal(captures[0]?.context.tags.reason_code, 'reply_notification_effect_failed');
    assert.ok(captures[0]?.error instanceof Error);
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
      { contextData: createFedifyExecutionContext() },
    );
    const sharedResponse = await fixture.federation.fetch(
      await fixture.createSignedCreateRequest(
        '/inbox',
        new URL('https://remote.example/notes/shared'),
        null,
        undefined,
        audience,
      ),
      { contextData: createFedifyExecutionContext() },
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
        { contextData: createFedifyExecutionContext() },
      ),
      fixture.federation.fetch(
        await fixture.createSignedCreateRequest(
          '/inbox',
          objectUri,
          new URL('https://remote.example/activities/create-concurrent-shared'),
        ),
        { contextData: createFedifyExecutionContext() },
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
        { contextData: createFedifyExecutionContext() },
      ),
      fixture.federation.fetch(
        await fixture.createSignedCreateRequest('/inbox', replyUri, null, parentUri),
        { contextData: createFedifyExecutionContext() },
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

  test('keeps the first content, visibility, and timestamps for duplicate Create', async () => {
    await createStoredRemoteActor();
    const publishedAt = Temporal.Instant.from('2026-07-15T12:00:00Z');
    const first = new Note({
      attribution: remoteActorUri,
      content: '<p>First</p>',
      id: remoteObjectUri,
      mediaType: 'text/html',
      published: publishedAt,
      summary: '<p>Content warning</p>',
      to: PUBLIC_COLLECTION,
    });

    const logs: unknown[] = [];
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
            content: 'Changed',
            id: remoteObjectUri,
            mediaType: 'text/plain',
            published: receivedAt.add({ hours: 1 }),
          }),
        }),
        receivedAt.add({ hours: 2 }),
      );
    } finally {
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
    assert.equal(postContentDocumentToText(content.document), 'First');
    assert.equal((await db.select().from(PostContents)).length, 1);

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
          content: 'Retryable',
          id: remoteObjectUri,
          to: PUBLIC_COLLECTION,
        }),
      });
    await pg`
      create function fail_inbound_post_content() returns trigger
      language plpgsql as $function$
      begin
        raise exception 'intentional post content failure';
      end
      $function$
    `;
    await pg`
      create trigger fail_inbound_post_content
      before insert on post_content
      for each row execute function fail_inbound_post_content()
    `;

    try {
      await assert.rejects(handleInboundCreate(createContext(), create(), receivedAt));
      assert.equal((await db.select().from(ActivityPubPosts)).length, 0);
      assert.equal((await db.select().from(Posts)).length, 0);
      assert.equal((await db.select().from(PostContents)).length, 0);
      assert.equal((await db.select().from(Media)).length, 0);
    } finally {
      await pg`drop trigger fail_inbound_post_content on post_content`;
      await pg`drop function fail_inbound_post_content()`;
    }

    await handleInboundCreate(createContext(), create(), receivedAt);
    assert.equal((await getMaterializedPost(remoteObjectUri)).mapping.uri, remoteObjectUri.href);
    assert.equal((await db.select().from(Media)).length, 1);
  });
});

const createContext = (
  documentLoader: DocumentLoader = async (url) => {
    throw new Error(`Unexpected document URL: ${url}`);
  },
  recipient: string | null = null,
) =>
  ({
    canonicalOrigin: publicOrigin,
    documentLoader,
    parseUri: (uri: URL | null) => uriContext.parseUri(uri),
    recipient,
  }) as unknown as InboxContext<FedifyExecutionContext>;

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

const createStoredRemoteActor = async ({
  instanceKind = InstanceKind.ACTIVITYPUB,
  instanceState = InstanceState.ACTIVE,
  profileState = ProfileState.ACTIVE,
}: {
  instanceKind?: InstanceKind;
  instanceState?: InstanceState;
  profileState?: ProfileState;
} = {}) => {
  const instance = await db
    .insert(Instances)
    .values({
      canonicalOrigin: 'https://remote.example',
      domain: 'remote.example',
      kind: instanceKind,
      state: instanceState,
    })
    .returning()
    .then(firstOrThrow);
  const profile = await db
    .insert(Profiles)
    .values({
      displayName: 'alice',
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: 'alice',
      instanceId: instance.id,
      normalizedHandle: 'alice',
      state: profileState,
    })
    .returning()
    .then(firstOrThrow);

  await db.insert(ActivityPubActors).values({
    profileId: profile.id,
    type: ActivityPubActorType.PERSON,
    uri: remoteActorUri.href,
    followersUri: `${remoteActorUri.href}/followers`,
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
  const federation = createFederation<FedifyExecutionContext>({
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
