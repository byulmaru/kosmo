import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, mock, test } from 'node:test';
import {
  createFederation,
  generateCryptoKeyPair,
  MemoryKvStore,
  signRequest,
} from '@fedify/fedify';
import { Article, Create, CryptographicKey, Note, Person, PUBLIC_COLLECTION } from '@fedify/vocab';
import { getDocumentLoader } from '@fedify/vocab-runtime';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { postContentDocumentToText } from '@kosmo/core/post-content/server';
import { eq, ne } from 'drizzle-orm';
import type { DocumentLoader, InboxContext } from '@fedify/fedify';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { handleInboundCreate as handleInboundCreateType } from './inbound-create';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const localProfileId = '019f6f67-1111-7777-8888-123456789abc';
const remoteActorUri = new URL('https://remote.example/users/alice');
const remoteKeyUri = new URL('#main-key', remoteActorUri);
const remoteObjectUri = new URL('https://remote.example/notes/1');
const receivedAt = Temporal.Instant.from('2026-07-16T00:00:00Z');

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let ActivityPubPosts: typeof CoreDb.ActivityPubPosts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let PostContents: typeof CoreDb.PostContents;
let Posts: typeof CoreDb.Posts;
let Profiles: typeof CoreDb.Profiles;
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
      pg,
      PostContents,
      Posts,
      Profiles,
    } = await import('@kosmo/core/db'));
    const { seedDatabase } = (await import('@kosmo/core/db/seed')) as typeof CoreSeed;
    ({ handleInboundCreate } = await import('./inbound-create'));
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

  test('materializes a hydrated Note without persisting the activity id', async () => {
    const profile = await createStoredRemoteActor();
    const note = new Note({
      attribution: remoteActorUri,
      content: 'Hello',
      id: remoteObjectUri,
      to: PUBLIC_COLLECTION,
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
    assert.equal(postContentDocumentToText(content.document), 'Hello');
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
    await createStoredRemoteActor();
    const fixture = await createInboxFixture(async (context, activity) => {
      await handleInboundCreate(context, activity, receivedAt);
    });

    const personalResponse = await fixture.federation.fetch(
      await fixture.createSignedCreateRequest(
        `/ap/actor/${localProfileId}/inbox`,
        new URL('https://remote.example/notes/personal'),
        new URL('https://remote.example/activities/create-personal'),
      ),
      { contextData: undefined },
    );
    const sharedResponse = await fixture.federation.fetch(
      await fixture.createSignedCreateRequest(
        '/inbox',
        new URL('https://remote.example/notes/shared'),
        null,
      ),
      { contextData: undefined },
    );

    assert.equal(personalResponse.status, 202, await personalResponse.text());
    assert.equal(sharedResponse.status, 202, await sharedResponse.text());
    assert.deepEqual((await db.select().from(ActivityPubPosts)).map(({ uri }) => uri).sort(), [
      'https://remote.example/notes/personal',
      'https://remote.example/notes/shared',
    ]);
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
    } finally {
      await pg`drop trigger fail_inbound_post_content on post_content`;
      await pg`drop function fail_inbound_post_content()`;
    }

    await handleInboundCreate(createContext(), create(), receivedAt);
    assert.equal((await getMaterializedPost(remoteObjectUri)).mapping.uri, remoteObjectUri.href);
  });
});

const createContext = (
  documentLoader: DocumentLoader = async (url) => {
    throw new Error(`Unexpected document URL: ${url}`);
  },
) => ({ documentLoader }) as unknown as InboxContext<void>;

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
  });

  return profile;
};

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

const createInboxFixture = async (
  onCreate: (context: InboxContext<void>, activity: Create) => Promise<void>,
) => {
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
  federation.setInboxListeners('/ap/actor/{identifier}/inbox', '/inbox').on(Create, onCreate);

  const createSignedCreateRequest = async (
    path: string,
    objectUri: URL,
    activityId: URL | null,
  ) => {
    const note = new Note({
      attribution: remoteActorUri,
      content: 'Hello',
      id: objectUri,
      to: PUBLIC_COLLECTION,
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
