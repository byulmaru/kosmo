import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, mock, test } from 'node:test';
import { generateCryptoKeyPair, signRequest } from '@fedify/fedify';
import { Accept, CryptographicKey, Follow, Person, Undo } from '@fedify/vocab';
import { getDocumentLoader } from '@fedify/vocab-runtime';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
} from '@kosmo/core/enums';
import { eq, ne, sql } from 'drizzle-orm';
import type { InboxContext } from '@fedify/fedify';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type * as FederationModule from './federation';
import type * as InboundFollow from './inbound-follow';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const localProfileId = '019f6f67-1111-7777-8888-123456789abc';
const localActorUri = new URL(`/ap/actor/${localProfileId}`, publicOrigin);
const remoteActorUri = new URL('https://remote.example/users/alice');

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let Notifications: typeof CoreDb.Notifications;
let pg: typeof CoreDb.pg;
let ProfileFollowRequests: typeof CoreDb.ProfileFollowRequests;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Profiles: typeof CoreDb.Profiles;
let federation: typeof FederationModule.federation;
let handleInboundFollow: typeof InboundFollow.handleInboundFollow;
let handleInboundUndo: typeof InboundFollow.handleInboundUndo;
let localInstanceId: string;

describe('inbound Follow and Undo', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.PUBLIC_ORIGIN = publicOrigin;
    ({
      ActivityPubActors,
      db,
      firstOrThrow,
      Instances,
      Notifications,
      pg,
      ProfileFollowRequests,
      ProfileFollows,
      Profiles,
    } = await import('@kosmo/core/db'));
    const { seedDatabase } = (await import('@kosmo/core/db/seed')) as typeof CoreSeed;
    ({ handleInboundFollow, handleInboundUndo } = await import('./inbound-follow'));
    ({ federation } = await import('./federation'));
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

  test('routes personal Follow, sends Accept, and removes by actor pair despite a different Follow id', async () => {
    const fixture = await createFixture();
    const sendActivity = mock.fn(async () => undefined);
    const context = createContext({ recipient: localProfileId, sendActivity });
    const follow = new Follow({
      actor: remoteActorUri,
      id: new URL('https://remote.example/activities/follow-1'),
      object: localActorUri,
      published: Temporal.Instant.from('2026-07-15T00:00:00Z'),
    });

    await handleInboundFollow(context, follow);

    const relation = await db.select().from(ProfileFollows).limit(1).then(firstOrThrow);
    assert.equal(relation.followerProfileId, fixture.remoteProfile.id);
    assert.equal(relation.followeeProfileId, fixture.localProfile.id);
    assert.equal(
      await db
        .select()
        .from(Notifications)
        .where(eq(Notifications.sourceId, relation.id))
        .then((rows) => rows.length),
      1,
    );
    assert.equal(sendActivity.mock.calls.length, 1);
    const accept = (sendActivity.mock.calls as unknown as Array<{ arguments: unknown[] }>)[0]
      ?.arguments[2];
    assert.ok(accept instanceof Accept);
    assert.equal((await accept.getObject())?.id?.href, follow.id?.href);

    await handleInboundUndo(
      context,
      new Undo({
        actor: remoteActorUri,
        object: new Follow({
          actor: remoteActorUri,
          id: new URL('https://remote.example/activities/different-follow-id'),
          object: localActorUri,
        }),
        published: Temporal.Instant.from('2026-07-15T00:00:01Z'),
      }),
    );

    assert.equal((await db.select().from(ProfileFollows)).length, 0);
    assert.equal(
      await db
        .select()
        .from(Notifications)
        .where(eq(Notifications.sourceId, relation.id))
        .then((rows) => rows.length),
      0,
    );
    const [local, remote] = await Promise.all([
      db.select().from(Profiles).where(eq(Profiles.id, fixture.localProfile.id)).then(firstOrThrow),
      db
        .select()
        .from(Profiles)
        .where(eq(Profiles.id, fixture.remoteProfile.id))
        .then(firstOrThrow),
    ]);
    assert.equal(local.followersCount, 0);
    assert.equal(remote.followingCount, 0);
  });

  test('routes signed Follow and Undo through the production listener to Notification lifecycle', async () => {
    const fixture = await createFixture({ remoteInbox: false });
    const remoteKeyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
    const remoteKeyUri = new URL('#main-key', remoteActorUri);
    const remoteKey = new CryptographicKey({
      id: remoteKeyUri,
      owner: remoteActorUri,
      publicKey: remoteKeyPair.publicKey,
    });
    const remoteActor = new Person({ id: remoteActorUri, publicKey: remoteKey });
    const remoteActorDocument = await remoteActor.toJsonLd({ format: 'expand' });
    const remoteKeyDocument = await remoteKey.toJsonLd({ format: 'expand' });
    const fetchMock = mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : input.toString();
      const document =
        url === remoteActorUri.href
          ? remoteActorDocument
          : url === remoteKeyUri.href
            ? remoteKeyDocument
            : undefined;
      if (!document) {
        throw new Error(`Unexpected fetch URL: ${url}`);
      }
      return new Response(JSON.stringify(document), {
        headers: { 'content-type': 'application/activity+json' },
      });
    });
    const contextLoader = getDocumentLoader();
    const createSignedRequest = async (activity: Follow | Undo) =>
      signRequest(
        new Request(new URL(`/ap/actor/${localProfileId}/inbox`, publicOrigin), {
          body: JSON.stringify(await activity.toJsonLd({ contextLoader })),
          headers: { 'content-type': 'application/activity+json' },
          method: 'POST',
        }),
        remoteKeyPair.privateKey,
        remoteKeyUri,
      );

    try {
      const follow = new Follow({
        actor: remoteActorUri,
        id: new URL('https://remote.example/activities/production-follow'),
        object: localActorUri,
      });
      const followResponse = await federation.fetch(await createSignedRequest(follow), {
        contextData: undefined,
      });
      assert.equal(followResponse.status, 202, await followResponse.text());

      const relation = await db.select().from(ProfileFollows).limit(1).then(firstOrThrow);
      assert.equal(relation.followerProfileId, fixture.remoteProfile.id);
      assert.equal(relation.followeeProfileId, fixture.localProfile.id);
      assert.equal(
        await db
          .select()
          .from(Notifications)
          .where(eq(Notifications.sourceId, relation.id))
          .then((rows) => rows.length),
        1,
      );

      const undoResponse = await federation.fetch(
        await createSignedRequest(
          new Undo({
            actor: remoteActorUri,
            id: new URL('https://remote.example/activities/production-undo'),
            object: new Follow({ actor: remoteActorUri, object: localActorUri }),
          }),
        ),
        { contextData: undefined },
      );
      assert.equal(undoResponse.status, 202, await undoResponse.text());
      assert.equal((await db.select().from(ProfileFollows)).length, 0);
      assert.equal(
        await db
          .select()
          .from(Notifications)
          .where(eq(Notifications.sourceId, relation.id))
          .then((rows) => rows.length),
        0,
      );
    } finally {
      fetchMock.mock.restore();
    }
  });

  test('preserves the projection for embedded Undo actor or object mismatch', async () => {
    await createFixture();
    const context = createContext({ recipient: localProfileId });
    await handleInboundFollow(
      context,
      new Follow({ actor: remoteActorUri, object: localActorUri }),
    );

    await handleInboundUndo(
      context,
      new Undo({
        actor: remoteActorUri,
        object: new Follow({
          actor: new URL('https://remote.example/users/mallory'),
          object: localActorUri,
        }),
      }),
    );
    await handleInboundUndo(
      context,
      new Undo({
        actor: remoteActorUri,
        object: new Follow({
          actor: remoteActorUri,
          object: new URL(`${publicOrigin}/ap/actor/019f6f67-2222-7777-8888-123456789abc`),
        }),
      }),
    );

    assert.equal((await db.select().from(ProfileFollows)).length, 1);
  });

  test('deduplicates concurrent inbound Follow relation, counts, and Notification', async () => {
    const fixture = await createFixture();
    const context = createContext({ recipient: localProfileId });
    const follow = new Follow({ actor: remoteActorUri, object: localActorUri });

    await Promise.all([handleInboundFollow(context, follow), handleInboundFollow(context, follow)]);

    const relation = await db.select().from(ProfileFollows).limit(1).then(firstOrThrow);
    assert.equal((await db.select().from(ProfileFollows)).length, 1);
    assert.equal(
      await db
        .select()
        .from(Notifications)
        .where(eq(Notifications.sourceId, relation.id))
        .then((rows) => rows.length),
      1,
    );
    assert.equal(
      (
        await db
          .select()
          .from(Profiles)
          .where(eq(Profiles.id, fixture.localProfile.id))
          .then(firstOrThrow)
      ).followersCount,
      1,
    );
    assert.equal(
      (
        await db
          .select()
          .from(Profiles)
          .where(eq(Profiles.id, fixture.remoteProfile.id))
          .then(firstOrThrow)
      ).followingCount,
      1,
    );
  });

  test('routes shared-inbox approval-required Follow without Accept', async () => {
    await createFixture({ followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED });
    const sendActivity = mock.fn(async () => undefined);
    const context = createContext({ recipient: null, sendActivity });

    await handleInboundFollow(
      context,
      new Follow({ actor: remoteActorUri, object: localActorUri }),
    );

    assert.equal((await db.select().from(ProfileFollowRequests)).length, 1);
    assert.equal((await db.select().from(ProfileFollows)).length, 0);
    assert.equal((await db.select().from(Notifications)).length, 0);
    assert.equal(sendActivity.mock.calls.length, 0);

    await handleInboundUndo(
      context,
      new Undo({
        actor: remoteActorUri,
        object: new Follow({ actor: remoteActorUri, object: localActorUri }),
      }),
    );
    assert.equal((await db.select().from(ProfileFollowRequests)).length, 0);
    assert.equal((await db.select().from(Notifications)).length, 0);
  });

  test('keeps inbound Follow successful when Notification creation fails', async () => {
    const fixture = await createFixture();
    await db.execute(
      sql`ALTER TABLE ${Notifications} ADD CONSTRAINT notification_inbound_handler_create_failure CHECK (false) NOT VALID`,
    );

    try {
      await handleInboundFollow(
        createContext({ recipient: localProfileId }),
        new Follow({ actor: remoteActorUri, object: localActorUri }),
      );
    } finally {
      await db.execute(
        sql`ALTER TABLE ${Notifications} DROP CONSTRAINT notification_inbound_handler_create_failure`,
      );
    }

    assert.equal((await db.select().from(ProfileFollows)).length, 1);
    assert.equal((await db.select().from(Notifications)).length, 0);
    assert.equal(
      (
        await db
          .select()
          .from(Profiles)
          .where(eq(Profiles.id, fixture.localProfile.id))
          .then(firstOrThrow)
      ).followersCount,
      1,
    );
  });

  test('keeps inbound Undo successful when Notification cleanup fails', async () => {
    await createFixture();
    const context = createContext({ recipient: localProfileId });
    await handleInboundFollow(
      context,
      new Follow({ actor: remoteActorUri, object: localActorUri }),
    );
    const relation = await db.select().from(ProfileFollows).limit(1).then(firstOrThrow);
    await db.execute(sql`
      CREATE FUNCTION fail_inbound_notification_delete() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'notification delete failed';
      END;
      $$
    `);
    await db.execute(sql`
      CREATE TRIGGER notification_inbound_handler_delete_failure
      BEFORE DELETE ON ${Notifications}
      FOR EACH ROW EXECUTE FUNCTION fail_inbound_notification_delete()
    `);

    try {
      await handleInboundUndo(
        context,
        new Undo({
          actor: remoteActorUri,
          object: new Follow({ actor: remoteActorUri, object: localActorUri }),
        }),
      );
    } finally {
      await db.execute(
        sql`DROP TRIGGER notification_inbound_handler_delete_failure ON ${Notifications}`,
      );
      await db.execute(sql`DROP FUNCTION fail_inbound_notification_delete()`);
    }

    assert.equal((await db.select().from(ProfileFollows)).length, 0);
    assert.equal(
      await db
        .select()
        .from(Notifications)
        .where(eq(Notifications.sourceId, relation.id))
        .then((rows) => rows.length),
      1,
    );
  });

  test('validates the personal recipient before any unknown-actor network lookup', async () => {
    await createFixture();
    const lookupObject = mock.fn(async () => null);
    const lookupWebFinger = mock.fn(async () => null);
    const context = createContext({
      lookupObject,
      lookupWebFinger,
      recipient: 'different-profile',
    });

    await handleInboundFollow(
      context,
      new Follow({
        actor: new URL('https://unknown.example/users/mallory'),
        object: localActorUri,
      }),
    );

    assert.equal(lookupObject.mock.calls.length, 0);
    assert.equal(lookupWebFinger.mock.calls.length, 0);
    assert.equal((await db.select().from(ProfileFollows)).length, 0);
  });

  test('ignores expected actor validation failures but propagates lookup outages', async () => {
    await createFixture();
    const unknownActorUri = new URL('https://unknown.example/users/mallory');
    const follow = new Follow({ actor: unknownActorUri, object: localActorUri });

    await handleInboundFollow(
      createContext({
        lookupWebFinger: mock.fn(async () => null),
        recipient: localProfileId,
      }),
      follow,
    );

    await assert.rejects(
      handleInboundFollow(
        createContext({
          lookupWebFinger: mock.fn(async () => {
            throw new Error('WebFinger unavailable');
          }),
          recipient: localProfileId,
        }),
        follow,
      ),
      /WebFinger unavailable/,
    );
    assert.equal((await db.select().from(ProfileFollows)).length, 0);
  });

  test('keeps the projection when Accept delivery fails and ignores IRI-only Undo', async () => {
    const fixture = await createFixture();
    const context = createContext({
      recipient: localProfileId,
      sendActivity: mock.fn(async () => {
        throw new Error('delivery failed');
      }),
    });
    const follow = new Follow({ actor: remoteActorUri, object: localActorUri });
    await handleInboundFollow(context, follow);
    await db
      .update(Instances)
      .set({ state: InstanceState.UNRESPONSIVE })
      .where(eq(Instances.id, fixture.remoteInstance.id));

    await handleInboundUndo(
      context,
      new Undo({ actor: remoteActorUri, object: new URL('https://remote.example/follow/1') }),
    );

    assert.equal((await db.select().from(ProfileFollows)).length, 1);
    assert.deepEqual(
      await db
        .select({ state: Instances.state })
        .from(Instances)
        .where(eq(Instances.id, fixture.remoteInstance.id))
        .then(firstOrThrow),
      { state: InstanceState.ACTIVE },
    );
  });

  test('reactivates a stored UNRESPONSIVE actor from Undo without network lookup', async () => {
    const fixture = await createFixture({ remoteInstanceState: InstanceState.UNRESPONSIVE });
    const lookupObject = mock.fn(async () => null);
    const lookupWebFinger = mock.fn(async () => null);
    const context = createContext({ lookupObject, lookupWebFinger, recipient: localProfileId });
    await db.insert(ProfileFollows).values({
      followeeProfileId: fixture.localProfile.id,
      followerProfileId: fixture.remoteProfile.id,
    });
    await db.update(Profiles).set({ followersCount: 1 }).where(eq(Profiles.id, localProfileId));
    await db
      .update(Profiles)
      .set({ followingCount: 1 })
      .where(eq(Profiles.id, fixture.remoteProfile.id));

    await handleInboundUndo(
      context,
      new Undo({
        actor: remoteActorUri,
        object: new Follow({ actor: remoteActorUri, object: localActorUri }),
      }),
    );

    assert.equal((await db.select().from(ProfileFollows)).length, 0);
    const remoteInstance = await db
      .select()
      .from(Instances)
      .where(eq(Instances.id, fixture.remoteInstance.id))
      .then(firstOrThrow);
    assert.equal(remoteInstance.state, InstanceState.ACTIVE);
    assert.equal(lookupObject.mock.calls.length, 0);
    assert.equal(lookupWebFinger.mock.calls.length, 0);
  });

  test('ignores Undo from a stored SUSPENDED actor without network lookup', async () => {
    const fixture = await createFixture({ remoteInstanceState: InstanceState.SUSPENDED });
    const lookupObject = mock.fn(async () => null);
    const lookupWebFinger = mock.fn(async () => null);
    const context = createContext({ lookupObject, lookupWebFinger, recipient: localProfileId });
    await db.insert(ProfileFollows).values({
      followeeProfileId: fixture.localProfile.id,
      followerProfileId: fixture.remoteProfile.id,
    });

    await handleInboundUndo(
      context,
      new Undo({
        actor: remoteActorUri,
        object: new Follow({ actor: remoteActorUri, object: localActorUri }),
      }),
    );

    assert.equal((await db.select().from(ProfileFollows)).length, 1);
    assert.equal(lookupObject.mock.calls.length, 0);
    assert.equal(lookupWebFinger.mock.calls.length, 0);
  });
});

const createFixture = async ({
  followPolicy = ProfileFollowPolicy.OPEN,
  remoteInbox = true,
  remoteInstanceState = InstanceState.ACTIVE,
}: {
  followPolicy?: ProfileFollowPolicy;
  remoteInbox?: boolean;
  remoteInstanceState?: InstanceState;
} = {}) => {
  const remoteInstance = await db
    .insert(Instances)
    .values({
      domain: 'remote.example',
      kind: InstanceKind.ACTIVITYPUB,
      state: remoteInstanceState,
    })
    .returning()
    .then(firstOrThrow);
  const localProfile = await db
    .insert(Profiles)
    .values({
      displayName: 'Local',
      followPolicy,
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
      instanceId: remoteInstance.id,
      normalizedHandle: 'alice',
    })
    .returning()
    .then(firstOrThrow);
  await db.insert(ActivityPubActors).values([
    {
      profileId: localProfile.id,
      type: ActivityPubActorType.PERSON,
      uri: localActorUri.href,
    },
    {
      inboxUri: remoteInbox ? 'https://remote.example/users/alice/inbox' : null,
      profileId: remoteProfile.id,
      sharedInboxUri: remoteInbox ? 'https://remote.example/inbox' : null,
      type: ActivityPubActorType.PERSON,
      uri: remoteActorUri.href,
    },
  ]);

  return { localProfile, remoteInstance, remoteProfile };
};

const createContext = ({
  lookupObject = mock.fn(async () => null),
  lookupWebFinger = mock.fn(async () => null),
  recipient,
  sendActivity = mock.fn(async () => undefined),
}: {
  lookupObject?: ReturnType<typeof mock.fn>;
  lookupWebFinger?: ReturnType<typeof mock.fn>;
  recipient: string | null;
  sendActivity?: ReturnType<typeof mock.fn>;
}): InboxContext<void> =>
  ({
    canonicalOrigin: publicOrigin,
    getActorUri: (identifier: string) => new URL(`/ap/actor/${identifier}`, publicOrigin),
    lookupObject,
    lookupWebFinger,
    recipient,
    sendActivity,
  }) as unknown as InboxContext<void>;
