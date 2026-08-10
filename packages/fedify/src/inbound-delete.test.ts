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
  Create,
  CryptographicKey,
  Delete,
  Note,
  Person,
  PUBLIC_COLLECTION,
  Tombstone,
} from '@fedify/vocab';
import { getDocumentLoader } from '@fedify/vocab-runtime';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { eq, ne } from 'drizzle-orm';
import { createFedifyExecutionContext } from './fedify-execution';
import { setInboundObservabilityReporter } from './inbound-observability';
import type { DocumentLoader, InboxContext } from '@fedify/fedify';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type * as CoreServices from '@kosmo/core/services';
import type { FedifyExecutionContext } from './fedify-execution';
import type { handleInboundCreate as handleInboundCreateType } from './inbound-create';
import type { handleInboundDelete as handleInboundDeleteType } from './inbound-delete';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const receivedAt = Temporal.Instant.from('2026-07-30T00:00:00Z');

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let ActivityPubPosts: typeof CoreDb.ActivityPubPosts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let PostContents: typeof CoreDb.PostContents;
let Posts: typeof CoreDb.Posts;
let Profiles: typeof CoreDb.Profiles;
let createPost: typeof CoreServices.createPost;
let handleInboundCreate: typeof handleInboundCreateType;
let handleInboundDelete: typeof handleInboundDeleteType;
let localInstanceId: string;

describe('inbound Delete dispatch', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.PUBLIC_ORIGIN = publicOrigin;
    ({
      ActivityPubActors,
      ActivityPubPosts,
      db,
      firstOrThrow,
      Instances,
      pg,
      PostContents,
      Posts,
      Profiles,
    } = await import('@kosmo/core/db'));
    const { seedDatabase } = (await import('@kosmo/core/db/seed')) as typeof CoreSeed;
    ({ createPost } = await import('@kosmo/core/services'));
    ({ handleInboundCreate } = await import('./inbound-create'));
    ({ handleInboundDelete } = await import('./inbound-delete'));
    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;
  });

  beforeEach(async () => {
    await db.update(Posts).set({ currentContentId: null });
    await db.delete(PostContents);
    await db.delete(Posts);
    await db.delete(Profiles);
    await db.delete(Instances).where(ne(Instances.id, localInstanceId));
  });

  after(async () => {
    await db.update(Posts).set({ currentContentId: null });
    await db.delete(PostContents);
    await db.delete(Posts);
    await pg.end();
  });

  test('deletes the exact mapped remote Post without hydration and preserves its projection', async () => {
    const actorUri = new URL('https://remote.example/users/alice');
    const objectUri = new URL('https://remote.example/notes/1');
    const profile = await createStoredRemoteActor(actorUri);
    const materialized = await materializeRemotePost(profile.id, objectUri);
    const documentLoader = mock.fn(async () => {
      throw new Error('the inbox context loader must not run');
    });

    await handleInboundDelete(
      createContext(documentLoader),
      new Delete({ actor: actorUri, object: objectUri }),
    );

    const firstDelete = await storedProjection(objectUri);
    assert.equal(firstDelete.post.state, PostState.DELETED);
    assert.ok(firstDelete.post.deletedAt);
    assert.equal(firstDelete.post.currentContentId, materialized.content.id);
    assert.equal(firstDelete.mapping.id, materialized.mapping.id);
    assert.equal(firstDelete.content.id, materialized.content.id);
    assert.equal(documentLoader.mock.calls.length, 0);

    await handleInboundDelete(
      createContext(documentLoader),
      new Delete({ actor: actorUri, object: objectUri }),
    );
    const repeated = await storedProjection(objectUri);
    assert.equal(repeated.post.deletedAt?.toString(), firstDelete.post.deletedAt.toString());
    assert.equal(documentLoader.mock.calls.length, 0);
  });

  test('does not delete a mapped Post when an object-less Delete lookup fails', async () => {
    const actorUri = new URL('https://remote.example/users/alice');
    const objectUri = new URL('https://remote.example/notes/lookup-failure');
    const profile = await createStoredRemoteActor(actorUri);
    await materializeRemotePost(profile.id, objectUri);

    class FailedLookupDelete extends Delete {
      override get objectId(): URL | null {
        return null;
      }

      override async getObject(): Promise<null> {
        return null;
      }
    }

    const logs: unknown[] = [];
    const captures: unknown[] = [];
    const restoreReporter = setInboundObservabilityReporter({
      captureException: (error) => captures.push(error),
      log: (observation) => logs.push(observation),
    });

    try {
      await handleInboundDelete(
        createContext(),
        new FailedLookupDelete({ actor: actorUri, object: objectUri }),
      );
    } finally {
      restoreReporter();
    }

    assert.equal((await storedProjection(objectUri)).post.state, PostState.ACTIVE);
    assert.deepEqual(logs, [
      {
        activityType: 'Delete',
        actorOrigin: actorUri.origin,
        handler: 'delete',
        objectOrigin: objectUri.origin,
        outcome: 'external_failure',
        phase: 'object_lookup',
        reasonCode: 'delete_object_lookup_failed',
      },
    ]);
    assert.equal(captures.length, 0);
  });

  test('accepts a same-id embedded Tombstone and rejects other embedded objects', async () => {
    const actorUri = new URL('https://remote.example/users/alice');
    const profile = await createStoredRemoteActor(actorUri);
    const tombstoneUri = new URL('https://remote.example/notes/tombstone');
    const noteUri = new URL('https://remote.example/notes/note');
    const mismatchedUri = new URL('https://remote.example/notes/mismatched');
    await materializeRemotePost(profile.id, tombstoneUri);
    await materializeRemotePost(profile.id, noteUri);
    await materializeRemotePost(profile.id, mismatchedUri);

    await handleInboundDelete(
      createContext(),
      new Delete({ actor: actorUri, object: new Tombstone({ id: tombstoneUri }) }),
    );
    await handleInboundDelete(
      createContext(),
      new Delete({ actor: actorUri, object: new Note({ id: noteUri }) }),
    );
    await handleInboundDelete(
      createContext(),
      new Delete({
        actor: actorUri,
        objects: [mismatchedUri, new Tombstone({ id: new URL(`${mismatchedUri.href}/other`) })],
      }),
    );

    assert.equal((await storedProjection(tombstoneUri)).post.state, PostState.DELETED);
    assert.equal((await storedProjection(noteUri)).post.state, PostState.ACTIVE);
    assert.equal((await storedProjection(mismatchedUri)).post.state, PostState.ACTIVE);
  });

  test('deletes a verified Post while its remote author is unavailable', async () => {
    const cases = [
      { instanceState: InstanceState.SUSPENDED, name: 'suspended instance' },
      { profileState: ProfileState.DISABLED, name: 'disabled profile' },
      { profileState: ProfileState.SUSPENDED, name: 'suspended profile' },
    ];

    for (const [index, options] of cases.entries()) {
      const actorUri = new URL(`https://guard-${index}.example/users/alice`);
      const objectUri = new URL(`https://guard-${index}.example/notes/1`);
      const profile = await createStoredRemoteActor(actorUri, options);
      await materializeRemotePost(profile.id, objectUri);
      await handleInboundDelete(
        createContext(),
        new Delete({ actor: actorUri, object: objectUri }),
      );
      assert.equal((await storedProjection(objectUri)).post.state, PostState.DELETED, options.name);
    }
  });

  test('rejects unknown, non-ActivityPub, ambiguous, and non-author identities', async () => {
    const localActorUri = new URL('https://local-kind.example/users/alice');
    const localObjectUri = new URL('https://local-kind.example/notes/1');
    const localKindProfile = await createStoredRemoteActor(localActorUri, {
      instanceKind: InstanceKind.LOCAL,
    });
    await materializeRemotePost(localKindProfile.id, localObjectUri);
    await handleInboundDelete(
      createContext(),
      new Delete({ actor: localActorUri, object: localObjectUri }),
    );
    assert.equal((await storedProjection(localObjectUri)).post.state, PostState.ACTIVE);

    const authorUri = new URL('https://author.example/users/alice');
    const otherUri = new URL('https://other.example/users/mallory');
    const objectUri = new URL('https://author.example/notes/1');
    const author = await createStoredRemoteActor(authorUri);
    await createStoredRemoteActor(otherUri);
    await materializeRemotePost(author.id, objectUri);

    const rejected = [
      new Delete({ actor: new URL('https://unknown.example/users/alice'), object: objectUri }),
      new Delete({ actor: otherUri, object: objectUri }),
      new Delete({ actors: [authorUri, otherUri], object: objectUri }),
      new Delete({ actor: authorUri, objects: [objectUri, new URL(`${objectUri.href}/other`)] }),
    ];
    for (const activity of rejected) {
      await handleInboundDelete(createContext(), activity);
    }
    assert.equal((await storedProjection(objectUri)).post.state, PostState.ACTIVE);
  });

  test('does not change a Local Post or a different mapped object', async () => {
    const actorUri = new URL('https://remote.example/users/alice');
    const remote = await createStoredRemoteActor(actorUri);
    const mappedUri = new URL('https://remote.example/notes/mapped');
    const differentUri = new URL('https://remote.example/notes/different');
    await materializeRemotePost(remote.id, mappedUri);
    const localProfile = await createProfile(localInstanceId, 'local');
    const localPost = await createPost({
      document: postContentDocumentFromText('local'),
      origin: 'LOCAL',
      profileId: localProfile.id,
      visibility: PostVisibility.PUBLIC,
    });

    await handleInboundDelete(
      createContext(),
      new Delete({ actor: actorUri, object: differentUri }),
    );
    await handleInboundDelete(
      createContext(),
      new Delete({
        actor: actorUri,
        object: new URL(`/ap/note/${localPost.post.id}`, publicOrigin),
      }),
    );

    assert.equal((await storedProjection(mappedUri)).post.state, PostState.ACTIVE);
    assert.equal(
      await db
        .select({ state: Posts.state })
        .from(Posts)
        .where(eq(Posts.id, localPost.post.id))
        .then(firstOrThrow)
        .then(({ state }) => state),
      PostState.ACTIVE,
    );
  });

  test('does not treat an Announce mapping as a Delete(Note) target', async () => {
    const actorUri = new URL('https://remote.example/users/alice');
    const sourceUri = new URL('https://remote.example/notes/source');
    const announceUri = new URL('https://remote.example/activities/announce-1');
    const profile = await createStoredRemoteActor(actorUri);
    const source = await materializeRemotePost(profile.id, sourceUri);
    const repost = await db
      .insert(Posts)
      .values({
        profileId: profile.id,
        repostSourceId: source.post.id,
        state: PostState.ACTIVE,
        visibility: PostVisibility.UNLISTED,
      })
      .returning()
      .then(firstOrThrow);
    const mapping = await db
      .insert(ActivityPubPosts)
      .values({
        postId: repost.id,
        receivedAt,
        uri: announceUri.href,
      })
      .returning()
      .then(firstOrThrow);

    await handleInboundDelete(
      createContext(),
      new Delete({ actor: actorUri, object: announceUri }),
    );

    assert.equal(
      await db
        .select({ state: Posts.state })
        .from(Posts)
        .where(eq(Posts.id, repost.id))
        .then(firstOrThrow)
        .then(({ state }) => state),
      PostState.ACTIVE,
    );
    assert.equal(
      await db
        .select({ id: ActivityPubPosts.id })
        .from(ActivityPubPosts)
        .where(eq(ActivityPubPosts.id, mapping.id))
        .then((rows) => rows.length),
      1,
    );
  });

  test('keeps Delete-before-Create absent and keeps duplicate Create tombstoned', async () => {
    const actorUri = new URL('https://remote.example/users/alice');
    await createStoredRemoteActor(actorUri);
    const futureUri = new URL('https://remote.example/notes/future');
    await handleInboundDelete(createContext(), new Delete({ actor: actorUri, object: futureUri }));
    assert.equal((await db.select().from(ActivityPubPosts)).length, 0);

    await handleInboundCreate(createContext(), createActivity(actorUri, futureUri), receivedAt);
    assert.equal((await storedProjection(futureUri)).post.state, PostState.ACTIVE);
    await handleInboundDelete(createContext(), new Delete({ actor: actorUri, object: futureUri }));
    const deletedAt = (await storedProjection(futureUri)).post.deletedAt;
    await handleInboundCreate(
      createContext(),
      createActivity(actorUri, futureUri),
      receivedAt.add({ hours: 1 }),
    );

    const duplicate = await storedProjection(futureUri);
    assert.equal(duplicate.post.state, PostState.DELETED);
    assert.equal(duplicate.post.deletedAt?.toString(), deletedAt?.toString());
    assert.equal((await db.select().from(PostContents)).length, 1);
  });

  test('uses committed mapping visibility for first Create/Delete ordering', async () => {
    const actorUri = new URL('https://remote.example/users/alice');
    const profile = await createStoredRemoteActor(actorUri);
    const objectUri = new URL('https://remote.example/notes/uncommitted');

    await db.transaction(async (tx) => {
      await createPost(
        {
          document: postContentDocumentFromText('uncommitted'),
          objectUri: objectUri.href,
          origin: 'ACTIVITYPUB',
          profileId: profile.id,
          publishedAt: null,
          receivedAt,
          visibility: PostVisibility.PUBLIC,
        },
        tx,
      );
      await handleInboundDelete(
        createContext(),
        new Delete({ actor: actorUri, object: objectUri }),
      );
    });
    assert.equal((await storedProjection(objectUri)).post.state, PostState.ACTIVE);

    await handleInboundDelete(createContext(), new Delete({ actor: actorUri, object: objectUri }));
    assert.equal((await storedProjection(objectUri)).post.state, PostState.DELETED);
  });

  test('concurrent Deletes produce one stable tombstone transition', async () => {
    const actorUri = new URL('https://remote.example/users/alice');
    const objectUri = new URL('https://remote.example/notes/concurrent');
    const profile = await createStoredRemoteActor(actorUri);
    await materializeRemotePost(profile.id, objectUri);

    await Promise.all(
      Array.from({ length: 4 }, () =>
        handleInboundDelete(createContext(), new Delete({ actor: actorUri, object: objectUri })),
      ),
    );
    const deletedAt = (await storedProjection(objectUri)).post.deletedAt;
    assert.ok(deletedAt);
    await handleInboundDelete(createContext(), new Delete({ actor: actorUri, object: objectUri }));
    assert.equal(
      (await storedProjection(objectUri)).post.deletedAt?.toString(),
      deletedAt.toString(),
    );
  });

  test('rolls back the canonical transition when the database update fails', async () => {
    const actorUri = new URL('https://remote.example/users/alice');
    const objectUri = new URL('https://remote.example/notes/rollback');
    const profile = await createStoredRemoteActor(actorUri);
    await materializeRemotePost(profile.id, objectUri);
    await pg`
      create function fail_inbound_delete() returns trigger
      language plpgsql as $function$
      begin
        raise exception 'intentional inbound delete failure';
      end
      $function$
    `;
    await pg`
      create trigger fail_inbound_delete
      before update on post
      for each row execute function fail_inbound_delete()
    `;

    try {
      await assert.rejects(
        handleInboundDelete(createContext(), new Delete({ actor: actorUri, object: objectUri })),
        (error) =>
          error instanceof Error &&
          error.cause instanceof Error &&
          error.cause.message === 'intentional inbound delete failure',
      );
    } finally {
      await pg`drop trigger fail_inbound_delete on post`;
      await pg`drop function fail_inbound_delete()`;
    }

    const stored = await storedProjection(objectUri);
    assert.equal(stored.post.state, PostState.ACTIVE);
    assert.equal(stored.post.deletedAt, null);
  });

  test('signed Delete reaches the typed listener through personal and shared inboxes', async () => {
    const actorUri = new URL('https://remote.example/users/alice');
    const profile = await createStoredRemoteActor(actorUri);
    const personalUri = new URL('https://remote.example/notes/personal');
    const sharedUri = new URL('https://remote.example/notes/shared');
    await materializeRemotePost(profile.id, personalUri);
    await materializeRemotePost(profile.id, sharedUri);
    const fixture = await createInboxFixture(actorUri);

    const personalResponse = await fixture.federation.fetch(
      await fixture.createSignedDeleteRequest('/ap/actor/local/inbox', personalUri),
      { contextData: createFedifyExecutionContext() },
    );
    const sharedResponse = await fixture.federation.fetch(
      await fixture.createSignedDeleteRequest('/inbox', sharedUri),
      { contextData: createFedifyExecutionContext() },
    );

    assert.equal(personalResponse.status, 202, await personalResponse.text());
    assert.equal(sharedResponse.status, 202, await sharedResponse.text());
    assert.equal((await storedProjection(personalUri)).post.state, PostState.DELETED);
    assert.equal((await storedProjection(sharedUri)).post.state, PostState.DELETED);
  });
});

const createContext = (
  documentLoader = async (url: string) => {
    throw new Error(`Unexpected document URL: ${url}`);
  },
) => ({ documentLoader }) as unknown as InboxContext<FedifyExecutionContext>;

const createStoredRemoteActor = async (
  actorUri: URL,
  {
    instanceKind = InstanceKind.ACTIVITYPUB,
    instanceState = InstanceState.ACTIVE,
    profileState = ProfileState.ACTIVE,
  }: {
    instanceKind?: InstanceKind;
    instanceState?: InstanceState;
    name?: string;
    profileState?: ProfileState;
  } = {},
) => {
  const instance = await db
    .insert(Instances)
    .values({
      canonicalOrigin: actorUri.origin,
      domain: actorUri.hostname,
      kind: instanceKind,
      state: instanceState,
    })
    .returning()
    .then(firstOrThrow);
  const profile = await createProfile(
    instance.id,
    actorUri.hostname.replaceAll('.', '-'),
    profileState,
  );
  await db.insert(ActivityPubActors).values({
    profileId: profile.id,
    type: ActivityPubActorType.PERSON,
    uri: actorUri.href,
  });
  return profile;
};

const createProfile = async (
  instanceId: string,
  handle: string,
  state: ProfileState = ProfileState.ACTIVE,
) =>
  db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId,
      normalizedHandle: handle,
      state,
    })
    .returning()
    .then(firstOrThrow);

const materializeRemotePost = async (profileId: string, objectUri: URL) => {
  const created = await createPost({
    document: postContentDocumentFromText(objectUri.href),
    objectUri: objectUri.href,
    origin: 'ACTIVITYPUB',
    profileId,
    publishedAt: null,
    receivedAt,
    visibility: PostVisibility.PUBLIC,
  });
  assert.equal(created.created, true);
  return storedProjection(objectUri);
};

const storedProjection = async (objectUri: URL) => {
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

const createActivity = (actorUri: URL, objectUri: URL) =>
  new Create({
    actor: actorUri,
    object: new Note({
      attribution: actorUri,
      content: 'Hello',
      id: objectUri,
      to: PUBLIC_COLLECTION,
    }),
  });

const createInboxFixture = async (actorUri: URL) => {
  const remoteKeyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
  const remoteKeyUri = new URL('#main-key', actorUri);
  const remoteKey = new CryptographicKey({
    id: remoteKeyUri,
    owner: actorUri,
    publicKey: remoteKeyPair.publicKey,
  });
  const remoteActor = new Person({ id: actorUri, publicKey: remoteKey });
  const documents = new Map<string, unknown>([
    [actorUri.href, await remoteActor.toJsonLd({ format: 'expand' })],
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
      identifier === 'local' ? new Person({ id: context.getActorUri(identifier) }) : null,
    )
    .setKeyPairsDispatcher(() => [localKeyPair]);
  federation
    .setInboxListeners('/ap/actor/{identifier}/inbox', '/inbox')
    .on(Delete, handleInboundDelete);

  const createSignedDeleteRequest = async (path: string, objectUri: URL) => {
    const activity = new Delete({ actor: actorUri, object: objectUri });
    const request = new Request(new URL(path, 'https://kos.moe'), {
      body: JSON.stringify(await activity.toJsonLd({ contextLoader })),
      headers: { 'content-type': 'application/activity+json' },
      method: 'POST',
    });
    return signRequest(request, remoteKeyPair.privateKey, remoteKeyUri);
  };

  return { createSignedDeleteRequest, federation };
};
