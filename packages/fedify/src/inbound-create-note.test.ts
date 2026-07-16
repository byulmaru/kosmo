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
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { eq, ne } from 'drizzle-orm';
import type { DocumentLoader, InboxContext } from '@fedify/fedify';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type * as InboundCreateNote from './inbound-create-note';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const localProfileId = '019f6f67-1111-7777-8888-123456789abc';
const remoteActorUri = new URL('https://remote.example/users/alice');
const remoteKeyUri = new URL('#main-key', remoteActorUri);
const remoteObjectUri = new URL('https://remote.example/notes/1');
const receivedAt = Temporal.Instant.from('2026-07-16T00:00:00Z');

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let Profiles: typeof CoreDb.Profiles;
let handleInboundCreateNote: typeof InboundCreateNote.handleInboundCreateNote;
let localInstanceId: string;

describe('inbound Create(Note)', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.PUBLIC_ORIGIN = publicOrigin;
    ({ ActivityPubActors, db, firstOrThrow, Instances, pg, Profiles } =
      await import('@kosmo/core/db'));
    const { seedDatabase } = (await import('@kosmo/core/db/seed')) as typeof CoreSeed;
    ({ handleInboundCreateNote } = await import('./inbound-create-note'));
    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;
  });

  beforeEach(async () => {
    await db.delete(Profiles);
    await db.delete(Instances).where(ne(Instances.id, localInstanceId));
  });

  after(async () => {
    await pg.end();
  });

  test('returns primitive PUBLIC input for a stored actor without carrying the activity id', async () => {
    await createStoredRemoteActor();
    const published = Temporal.Instant.from('2026-07-15T12:00:00Z');
    const note = new Note({
      attribution: remoteActorUri,
      content: new LanguageString('<p>Hello</p>', 'en'),
      id: remoteObjectUri,
      mediaType: 'text/html',
      published,
      summary: new LanguageString('Content warning', 'en'),
      to: PUBLIC_COLLECTION,
    });
    const create = new Create({
      actor: remoteActorUri,
      id: new URL('https://remote.example/activities/create-1'),
      object: note,
    });

    const result = await handleInboundCreateNote(createContext(), create, receivedAt);

    assert.deepEqual(result, {
      actorUri: remoteActorUri.href,
      content: '<p>Hello</p>',
      mediaType: 'text/html',
      objectUri: remoteObjectUri.href,
      published,
      receivedAt,
      summary: 'Content warning',
      visibility: PostVisibility.PUBLIC,
    });
    assert.equal('activityId' in result!, false);
  });

  test('deduplicates actor, object, and attribution hrefs and projects cc Public as UNLISTED', async () => {
    await createStoredRemoteActor({ instanceState: InstanceState.UNRESPONSIVE });
    const note = new Note({
      attributions: [remoteActorUri, new URL(remoteActorUri.href)],
      cc: PUBLIC_COLLECTION,
      content: 'Hello',
      id: remoteObjectUri,
    });
    const create = new Create({
      actors: [remoteActorUri, new URL(remoteActorUri.href)],
      objects: [note, new URL(remoteObjectUri.href)],
    });

    const result = await handleInboundCreateNote(createContext(), create, receivedAt);

    assert.equal(result?.visibility, PostVisibility.UNLISTED);
    assert.equal(result?.objectUri, remoteObjectUri.href);
    assert.equal(
      (
        await db
          .select({ state: Instances.state })
          .from(Instances)
          .where(eq(Instances.domain, 'remote.example'))
          .then(firstOrThrow)
      ).state,
      InstanceState.UNRESPONSIVE,
    );
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
      const create = new Create({ actor: remoteActorUri, object: remoteObjectUri });

      assert.equal(
        await handleInboundCreateNote(createContext(documentLoader), create, receivedAt),
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
    const otherActorUri = new URL('https://remote.example/users/mallory');
    const otherObjectUri = new URL('https://remote.example/notes/2');
    const activities = [
      new Create({ object: remoteObjectUri }),
      new Create({ actors: [remoteActorUri, otherActorUri], object: remoteObjectUri }),
      new Create({ actor: remoteActorUri }),
      new Create({ actor: remoteActorUri, objects: [remoteObjectUri, otherObjectUri] }),
    ];

    for (const create of activities) {
      assert.equal(
        await handleInboundCreateNote(createContext(documentLoader), create, receivedAt),
        undefined,
      );
    }
    assert.equal(documentLoader.mock.calls.length, 0);
  });

  test('rejects non-Note, mismatched identity or attribution, replies, and non-public addressing', async () => {
    await createStoredRemoteActor();
    const invalidObjects = [
      new Article({ attribution: remoteActorUri, id: remoteObjectUri, to: PUBLIC_COLLECTION }),
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
        to: new URL('https://remote.example/users/bob'),
      }),
    ];

    for (const object of invalidObjects) {
      const create = new Create({ actor: remoteActorUri, object });
      assert.equal(await handleInboundCreateNote(createContext(), create, receivedAt), undefined);
    }

    const mismatchedNote = new Note({
      attribution: remoteActorUri,
      id: new URL('https://remote.example/notes/different'),
      to: PUBLIC_COLLECTION,
    });
    const mismatchedDocumentLoader = mock.fn(async (url: string) => ({
      contextUrl: null,
      document: await mismatchedNote.toJsonLd({ format: 'expand' }),
      documentUrl: url,
    }));
    assert.equal(
      await handleInboundCreateNote(
        createContext(mismatchedDocumentLoader),
        new Create({ actor: remoteActorUri, object: remoteObjectUri }),
        receivedAt,
      ),
      undefined,
    );
  });

  test('uses Fedify cross-origin defaults and skips a failed IRI hydration', async () => {
    await createStoredRemoteActor();
    const crossOriginObjectUri = new URL('https://objects.example/notes/1');
    const note = new Note({
      attribution: remoteActorUri,
      id: crossOriginObjectUri,
      to: PUBLIC_COLLECTION,
    });
    const documentLoader = mock.fn(async (url: string) => ({
      contextUrl: null,
      document: await note.toJsonLd({ format: 'expand' }),
      documentUrl: url,
    }));
    const create = new Create({
      actor: remoteActorUri,
      id: new URL('https://remote.example/activities/create-cross-origin'),
      object: crossOriginObjectUri,
    });

    assert.equal(
      (await handleInboundCreateNote(createContext(documentLoader), create, receivedAt))?.objectUri,
      crossOriginObjectUri.href,
    );
    assert.equal(documentLoader.mock.calls.length, 1);

    const failedLoader = mock.fn(async () => {
      throw new Error('remote object unavailable');
    });
    assert.equal(
      await handleInboundCreateNote(
        createContext(failedLoader),
        new Create({ actor: remoteActorUri, object: remoteObjectUri }),
        receivedAt,
      ),
      undefined,
    );
    assert.equal(failedLoader.mock.calls.length, 1);
  });

  test('signed Create reaches the same validation boundary through personal and shared inboxes', async () => {
    await createStoredRemoteActor();
    const calls: Array<InboundCreateNote.InboundCreateNoteMaterializationInput | undefined> = [];
    const fixture = await createInboxFixture(async (context, activity) => {
      calls.push(await handleInboundCreateNote(context, activity, receivedAt));
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
    assert.deepEqual(
      calls.map((input) => input?.objectUri),
      ['https://remote.example/notes/personal', 'https://remote.example/notes/shared'],
    );
    assert.ok(calls.every((input) => input && !('activityId' in input)));
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
  const actor = await db
    .insert(ActivityPubActors)
    .values({
      profileId: profile.id,
      type: ActivityPubActorType.PERSON,
      uri: remoteActorUri.href,
    })
    .returning()
    .then(firstOrThrow);

  return { actor, instance, profile };
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
    const activity = new Create({
      actor: remoteActorUri,
      id: activityId,
      object: note,
    });
    const request = new Request(new URL(path, 'https://kos.moe'), {
      body: JSON.stringify(await activity.toJsonLd({ contextLoader })),
      headers: { 'content-type': 'application/activity+json' },
      method: 'POST',
    });

    return signRequest(request, remoteKeyPair.privateKey, remoteKeyUri);
  };

  return { createSignedCreateRequest, federation };
};
