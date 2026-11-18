import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import dns from 'node:dns/promises';
import { after, before, beforeEach, describe, test } from 'node:test';
import { generateCryptoKeyPair, signRequest, verifyRequest } from '@fedify/fedify';
import { CryptographicKey, Follow, Person } from '@fedify/vocab';
import { getDocumentLoader } from '@fedify/vocab-runtime';
import {
  AccountProfileRole,
  AccountState,
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
} from '@kosmo/core/enums';
import { temporalClient } from '@kosmo/core/temporal/client';
import { profileFollowPairWorkflowId } from '@kosmo/core/temporal/follow-command';
import { eq, inArray, ne } from 'drizzle-orm';
import type { LookupAddress, LookupAllOptions } from 'node:dns';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type * as FederationModule from './federation';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const localProfileId = '019f6f67-1111-7777-8888-123456789abc';
const remoteProfileId = '019f6f67-2222-7777-8888-123456789abc';
const officialProfileId = '019f6f67-3333-7777-8888-123456789abc';
const explicitProfileId = '019f6f67-4444-7777-8888-123456789abc';
const serverActorUri = new URL('/ap/actor/~instance', publicOrigin);
const localInstanceActorHandle = 'kosmo.instance';
const remoteActorUri = new URL(`https://example.com/users/${crypto.randomUUID()}`);

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let ProfileFollowRequests: typeof CoreDb.ProfileFollowRequests;
let Profiles: typeof CoreDb.Profiles;
let seedDatabase: typeof CoreSeed.seedDatabase;
let federation: typeof FederationModule.federation;
let localInstanceActorIdentifier: typeof FederationModule.localInstanceActorIdentifier;
let localInstanceId: string;
const testAccountIds: string[] = [];

describe('local Instance ActivityPub actor', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.PUBLIC_ORIGIN = publicOrigin;

    ({
      AccountProfiles,
      Accounts,
      ActivityPubActors,
      db,
      firstOrThrow,
      Instances,
      pg,
      ProfileFollowRequests,
      Profiles,
    } = await import('@kosmo/core/db'));
    ({ seedDatabase } = await import('@kosmo/core/db/seed'));
    ({ federation, localInstanceActorIdentifier } = await import('./federation'));

    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;
  });

  beforeEach(async () => {
    await db.delete(Profiles);
    if (testAccountIds.length > 0) {
      await db.delete(Accounts).where(inArray(Accounts.id, testAccountIds));
      testAccountIds.length = 0;
    }
    await db.delete(Instances).where(ne(Instances.id, localInstanceId));
  });

  after(async () => {
    await pg.end();
  });

  test('serves a stable public Application through its Mastodon WebFinger handle', async () => {
    const actorResponse = await federation.fetch(
      new Request(serverActorUri, { headers: { accept: 'application/activity+json' } }),
      { contextData: undefined },
    );
    assert.equal(actorResponse.status, 200);
    assert.match(actorResponse.headers.get('content-type') ?? '', /application\/activity\+json/);

    const actor = (await actorResponse.json()) as {
      assertionMethod?: Array<{
        controller?: string;
        id?: string;
        publicKeyMultibase?: string;
        type?: string;
      }>;
      id?: string;
      inbox?: string;
      preferredUsername?: string;
      publicKey?: { id?: string; owner?: string; publicKeyPem?: string };
      type?: string;
    };
    const actorUri = serverActorUri.href;
    const publicKeyId = `${actorUri}#main-key`;
    assert.equal(actor.id, actorUri);
    assert.equal(actor.type, 'Application');
    assert.equal(actor.inbox, `${publicOrigin}/inbox`);
    assert.equal(actor.preferredUsername, localInstanceActorHandle);
    assert.equal(actor.publicKey?.id, publicKeyId);
    assert.equal(actor.publicKey?.owner, actorUri);
    assert.ok(actor.publicKey?.publicKeyPem);
    assert.equal(actor.assertionMethod?.length, 1);
    assert.equal(actor.assertionMethod?.[0]?.id, `${actorUri}#multikey-2`);
    assert.equal(actor.assertionMethod?.[0]?.controller, actorUri);
    assert.equal(actor.assertionMethod?.[0]?.type, 'Multikey');
    assert.ok(actor.assertionMethod?.[0]?.publicKeyMultibase);
    assert.equal(JSON.stringify(actor).includes('privateKey'), false);

    const repeatedResponse = await federation.fetch(
      new Request(serverActorUri, { headers: { accept: 'application/activity+json' } }),
      { contextData: undefined },
    );
    assert.equal(repeatedResponse.status, 200);
    const repeatedActor = (await repeatedResponse.json()) as typeof actor;
    assert.equal(repeatedActor.publicKey?.id, actor.publicKey?.id);
    assert.equal(repeatedActor.publicKey?.publicKeyPem, actor.publicKey?.publicKeyPem);
    assert.deepEqual(repeatedActor.assertionMethod, actor.assertionMethod);

    const webFingerUrl = new URL('/.well-known/webfinger', publicOrigin);
    webFingerUrl.searchParams.set(
      'resource',
      `acct:${localInstanceActorHandle}@${new URL(publicOrigin).host}`,
    );
    const webFingerResponse = await federation.fetch(new Request(webFingerUrl), {
      contextData: undefined,
    });
    assert.equal(webFingerResponse.status, 200);
    const webFinger = (await webFingerResponse.json()) as {
      aliases?: string[];
      links?: Array<{ href?: string; rel?: string; type?: string }>;
      subject?: string;
    };
    assert.equal(
      webFinger.subject,
      `acct:${localInstanceActorHandle}@${new URL(publicOrigin).host}`,
    );
    assert.ok(webFinger.aliases?.includes(actorUri));
    assert.ok(
      webFinger.links?.some(
        (link) =>
          link.rel === 'self' &&
          link.href === actorUri &&
          link.type === 'application/activity+json',
      ),
    );
    assert.equal(
      webFinger.links?.some((link) => link.rel === 'http://webfinger.net/rel/profile-page'),
      false,
    );
    assert.deepEqual(await db.select().from(Profiles), []);
    const actorRow = await db
      .select()
      .from(ActivityPubActors)
      .where(eq(ActivityPubActors.uri, actorUri));
    assert.deepEqual(actorRow, []);
  });

  test('preserves local Profile actors while rejecting requests on a foreign host', async () => {
    const profile = await createLocalProfile('alice');
    const profileActorUri = new URL(`/ap/actor/${profile.id}`, publicOrigin);
    const profileActorResponse = await federation.fetch(
      new Request(profileActorUri, { headers: { accept: 'application/activity+json' } }),
      { contextData: undefined },
    );
    assert.equal(profileActorResponse.status, 200);
    const profileActor = (await profileActorResponse.json()) as {
      id?: string;
      preferredUsername?: string;
      type?: string;
    };
    assert.equal(profileActor.id, profileActorUri.href);
    assert.equal(profileActor.type, 'Person');
    assert.equal(profileActor.preferredUsername, 'alice');

    const alternateServerActorResponse = await federation.fetch(
      new Request(serverActorUri.href.replace(new URL(publicOrigin).host, 'alternate.example'), {
        headers: { accept: 'application/activity+json' },
      }),
      { contextData: undefined },
    );
    assert.equal(alternateServerActorResponse.status, 404);

    const alternateHostResponse = await federation.fetch(
      new Request(profileActorUri.href.replace(new URL(publicOrigin).host, 'alternate.example'), {
        headers: { accept: 'application/activity+json' },
      }),
      { contextData: undefined },
    );
    assert.equal(alternateHostResponse.status, 404);
  });

  test('uses the official local Profile only for contextless Threads.net document GETs', async (t) => {
    t.mock.method(
      dns,
      'lookup',
      async (hostname: string, options: LookupAllOptions): Promise<LookupAddress[]> => {
        assert.ok(hostname.length > 0);
        assert.equal(options.all, true);
        return [{ address: '1.1.1.1', family: 4 }];
      },
    );

    const officialProfile = await createLocalProfile('kosmo', officialProfileId);
    const explicitProfile = await createLocalProfile('alice', explicitProfileId);
    const context = federation.createContext(new URL(publicOrigin), undefined);
    const actorDocuments = new Map<string, unknown>();

    for (const identifier of [
      localInstanceActorIdentifier,
      officialProfile.id,
      explicitProfile.id,
    ]) {
      const actorUri = context.getActorUri(identifier);
      const response = await federation.fetch(
        new Request(actorUri, { headers: { accept: 'application/activity+json' } }),
        { contextData: undefined },
      );
      assert.equal(response.status, 200);
      actorDocuments.set(actorUri.href, await response.json());
    }

    const signedFetches: Array<{ keyId: string; spec: string; url: string }> = [];
    t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      assert.equal(request.method, 'GET');

      const verifiedKey = await verifyRequest(request, {
        contextLoader: getDocumentLoader(),
        documentLoader: async (url) => {
          const actorUri = new URL(url);
          actorUri.hash = '';
          const document = actorDocuments.get(actorUri.href);
          assert.ok(document, `Unexpected signing actor: ${url}`);
          return { contextUrl: null, document, documentUrl: url };
        },
      });
      assert.ok(verifiedKey, `Request signature did not verify: ${request.url}`);
      signedFetches.push({
        keyId: verifiedKey.id?.href ?? '',
        spec: request.headers.has('signature-input') ? 'rfc9421' : 'draft-cavage',
        url: request.url,
      });

      if (
        new URL(request.url).origin === 'https://threads.net' &&
        request.headers.has('signature-input')
      ) {
        return new Response(null, { status: 401 });
      }

      return new Response(
        JSON.stringify({
          '@context': 'https://www.w3.org/ns/activitystreams',
          id: request.url,
          type: 'Note',
        }),
        { headers: { 'content-type': 'application/activity+json' } },
      );
    });

    const instanceKeyId = new URL('#main-key', context.getActorUri(localInstanceActorIdentifier))
      .href;
    const officialProfileKeyId = new URL('#main-key', context.getActorUri(officialProfile.id)).href;
    const explicitProfileKeyId = new URL('#main-key', context.getActorUri(explicitProfile.id)).href;
    const threadsUrl = new URL('https://threads.net/notes/contextless');
    const instanceLoader = await context.getDocumentLoader({
      identifier: localInstanceActorIdentifier,
    });
    await instanceLoader(threadsUrl.href);

    const initialThreadsFetches = signedFetches.filter(
      (request) => request.url === threadsUrl.href,
    );
    assert.deepEqual(
      initialThreadsFetches.map((request) => request.spec),
      ['rfc9421', 'draft-cavage'],
    );
    assert.ok(initialThreadsFetches.every((request) => request.keyId === officialProfileKeyId));

    const cachedThreadsUrl = new URL('https://threads.net/notes/cached');
    const cachedContext = federation.createContext(new URL(publicOrigin), undefined);
    const cachedInstanceLoader = await cachedContext.getDocumentLoader({
      identifier: localInstanceActorIdentifier,
    });
    await cachedInstanceLoader(cachedThreadsUrl.href);
    assert.deepEqual(
      signedFetches
        .filter((request) => request.url === cachedThreadsUrl.href)
        .map((request) => request.spec),
      ['draft-cavage'],
    );
    assert.ok(
      signedFetches
        .filter((request) => request.url === cachedThreadsUrl.href)
        .every((request) => request.keyId === officialProfileKeyId),
    );

    const explicitThreadsUrl = new URL('https://threads.net/notes/explicit-profile');
    const explicitLoader = await context.getDocumentLoader({ identifier: explicitProfile.id });
    await explicitLoader(explicitThreadsUrl.href);
    const explicitThreadsFetches = signedFetches.filter(
      (request) => request.url === explicitThreadsUrl.href,
    );
    assert.ok(explicitThreadsFetches.length > 0);
    assert.ok(explicitThreadsFetches.every((request) => request.keyId === explicitProfileKeyId));

    for (const uri of [
      new URL('https://remote.example/notes/direct'),
      new URL('https://threads.net.example/notes/lookalike'),
    ]) {
      await instanceLoader(uri.href);
      const originFetches = signedFetches.filter((request) => request.url === uri.href);
      assert.ok(originFetches.length > 0);
      assert.ok(originFetches.every((request) => request.keyId === instanceKeyId));
    }
  });

  test('falls back to the server actor when the official local Profile is unavailable', async (t) => {
    t.mock.method(
      dns,
      'lookup',
      async (hostname: string, options: LookupAllOptions): Promise<LookupAddress[]> => {
        assert.ok(hostname.length > 0);
        assert.equal(options.all, true);
        return [{ address: '1.1.1.1', family: 4 }];
      },
    );

    const context = federation.createContext(new URL(publicOrigin), undefined);
    const actorUri = context.getActorUri(localInstanceActorIdentifier);
    const actorResponse = await federation.fetch(
      new Request(actorUri, { headers: { accept: 'application/activity+json' } }),
      { contextData: undefined },
    );
    assert.equal(actorResponse.status, 200);
    const actorDocument = await actorResponse.json();
    const signedKeyIds: string[] = [];

    t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const verifiedKey = await verifyRequest(request, {
        contextLoader: getDocumentLoader(),
        documentLoader: async (url) => ({
          contextUrl: null,
          document: actorDocument,
          documentUrl: url,
        }),
      });
      assert.ok(verifiedKey, `Request signature did not verify: ${request.url}`);
      signedKeyIds.push(verifiedKey.id?.href ?? '');
      return new Response(
        JSON.stringify({
          '@context': 'https://www.w3.org/ns/activitystreams',
          id: request.url,
          type: 'Note',
        }),
        { headers: { 'content-type': 'application/activity+json' } },
      );
    });

    const loader = await context.getDocumentLoader({ identifier: localInstanceActorIdentifier });
    await loader('https://threads.net/notes/no-official-profile');

    assert.ok(signedKeyIds.length > 0);
    assert.ok(signedKeyIds.every((keyId) => keyId === new URL('#main-key', actorUri).href));
  });

  test('uses the server actor key for shared-inbox AUTHORIZED_FETCH and accepts the Follow', async (t) => {
    const { localProfile, remoteProfile, remoteInstance } = await createInboxFixture();
    const actorResponse = await federation.fetch(
      new Request(serverActorUri, { headers: { accept: 'application/activity+json' } }),
      { contextData: undefined },
    );
    assert.equal(actorResponse.status, 200);
    const serverActorDocument = await actorResponse.json();
    const serverActorKeyId = new URL('#main-key', serverActorUri);
    const remoteKeyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
    const remoteKeyId = new URL('#main-key', remoteActorUri);
    const remoteKey = new CryptographicKey({
      id: remoteKeyId,
      owner: remoteActorUri,
      publicKey: remoteKeyPair.publicKey,
    });
    const remoteActorDocument = await new Person({
      id: remoteActorUri,
      publicKey: remoteKey,
    }).toJsonLd({ format: 'expand' });
    const contextLoader = getDocumentLoader();
    const signedFetches: string[] = [];

    t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      if (
        request.method !== 'GET' ||
        new URL(request.url).origin !== remoteInstance.canonicalOrigin
      ) {
        return new Response(null, { status: 405 });
      }

      const key = await verifyRequest(request, {
        contextLoader,
        documentLoader: async (url) => ({
          contextUrl: null,
          document: serverActorDocument,
          documentUrl: url,
        }),
      });
      if (key?.id?.href !== serverActorKeyId.href) {
        return new Response(null, { status: 401 });
      }

      signedFetches.push(request.url);
      return new Response(JSON.stringify(remoteActorDocument), {
        headers: { 'content-type': 'application/activity+json' },
      });
    });

    const follow = new Follow({
      actor: remoteActorUri,
      id: new URL(`/activities/${crypto.randomUUID()}`, remoteActorUri),
      object: new URL(`/ap/actor/${localProfile.id}`, publicOrigin),
    });
    const unsignedRequest = new Request(new URL('/inbox', publicOrigin), {
      body: JSON.stringify(await follow.toJsonLd({ contextLoader })),
      headers: { 'content-type': 'application/activity+json' },
      method: 'POST',
    });
    const workflowId = profileFollowPairWorkflowId({
      followeeProfileId: localProfile.id,
      followerProfileId: remoteProfile.id,
    });

    try {
      const response = await federation.fetch(
        await signRequest(unsignedRequest, remoteKeyPair.privateKey, remoteKeyId),
        { contextData: undefined },
      );

      assert.equal(response.status, 202, await response.text());
      assert.ok(signedFetches.length > 0);
      assert.ok(
        signedFetches.every((url) => {
          const actorDocumentUrl = new URL(url);
          actorDocumentUrl.hash = '';
          return actorDocumentUrl.href === remoteActorUri.href;
        }),
        JSON.stringify(signedFetches),
      );
      const [requestRow] = await db.select().from(ProfileFollowRequests);
      assert.equal(requestRow?.followeeProfileId, localProfile.id);
      assert.equal(requestRow?.followerProfileId, remoteProfile.id);
    } finally {
      const handle = temporalClient.workflow.getHandle(workflowId);
      await handle.terminate('test fixture cleanup').catch(() => undefined);
      await handle.result().catch(() => undefined);
    }
  });
});

const createLocalProfile = (handle: string, id = localProfileId) =>
  db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      id,
      instanceId: localInstanceId,
      normalizedHandle: handle,
    })
    .returning()
    .then(firstOrThrow);

const createInboxFixture = async () => {
  const remoteInstance = await db
    .insert(Instances)
    .values({
      canonicalOrigin: remoteActorUri.origin,
      domain: new URL(remoteActorUri).hostname,
      kind: InstanceKind.ACTIVITYPUB,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const localProfile = await db
    .insert(Profiles)
    .values({
      displayName: 'Local',
      followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
      handle: 'local',
      id: localProfileId,
      instanceId: localInstanceId,
      normalizedHandle: 'local',
    })
    .returning()
    .then(firstOrThrow);
  const remoteProfile = await db
    .insert(Profiles)
    .values({
      displayName: 'Alice',
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: 'alice',
      id: remoteProfileId,
      instanceId: remoteInstance.id,
      normalizedHandle: 'alice',
    })
    .returning()
    .then(firstOrThrow);
  const account = await db
    .insert(Accounts)
    .values({
      displayName: 'Local owner',
      oidcSubject: `server-actor-${crypto.randomUUID()}`,
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  testAccountIds.push(account.id);
  await db.insert(AccountProfiles).values({
    accountId: account.id,
    profileId: localProfile.id,
    role: AccountProfileRole.OWNER,
  });
  await db.insert(ActivityPubActors).values([
    {
      profileId: localProfile.id,
      type: ActivityPubActorType.PERSON,
      uri: new URL(`/ap/actor/${localProfile.id}`, publicOrigin).href,
    },
    {
      inboxUri: `${remoteActorUri.href}/inbox`,
      lastFetchedAt: Temporal.Now.instant(),
      profileId: remoteProfile.id,
      sharedInboxUri: `${remoteActorUri.origin}/inbox`,
      type: ActivityPubActorType.PERSON,
      uri: remoteActorUri.href,
    },
  ]);

  return { localProfile, remoteInstance, remoteProfile };
};
