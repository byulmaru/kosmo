import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, mock, test } from 'node:test';
import { Accept, Follow } from '@fedify/vocab';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { eq, inArray } from 'drizzle-orm';
import type { Context } from '@fedify/fedify';
import type { Activity, Recipient } from '@fedify/vocab';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { federation as Federation } from './federation';

const publicOrigin = 'http://127.0.0.1:4173';
const remoteActorUri = 'https://remote.example/users/alice';
const remoteInboxUri = 'https://remote.example/users/alice/inbox';
const remoteSharedInboxUri = 'https://remote.example/inbox';

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let db: typeof CoreDb.db;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Profiles: typeof CoreDb.Profiles;
let federation: typeof Federation;
let closeFedifyQueue: () => Promise<void>;
let resendApprovedFollowAccept: (value: unknown) => Promise<{
  status: 'queued';
  profileFollowId: string;
  followerProfileId: string;
  followeeProfileId: string;
}>;
let localInstanceId: string;
let remoteInstanceId: string;
let remoteProfileId: string;
let localProfileId: string;
let profileFollowId: string;

describe('resend-approved-follow-accept', () => {
  before(async () => {
    process.env.PUBLIC_ORIGIN = publicOrigin;
    process.env.FEDIFY_QUEUE_DATABASE_URL = 'postgres://127.0.0.1:54321/unused';

    ({ ActivityPubActors, db, Instances, pg, ProfileFollows, Profiles } =
      await import('@kosmo/core/db'));
    const { seedDatabase } = (await import('@kosmo/core/db/seed')) as typeof CoreSeed;
    ({ federation } = await import('./federation'));
    ({ closeFedifyQueue } = await import('./queue'));
    ({ resendApprovedFollowAccept } = await import('../scripts/resend-approved-follow-accept'));

    localInstanceId = (await seedDatabase({ publicOrigin })).localInstance.id;
  });

  beforeEach(async () => {
    const [remoteInstance] = await db
      .insert(Instances)
      .values({
        domain: 'remote.example',
        kind: InstanceKind.ACTIVITYPUB,
        state: InstanceState.ACTIVE,
      })
      .returning({ id: Instances.id });
    remoteInstanceId = remoteInstance!.id;

    const [remoteProfile] = await db
      .insert(Profiles)
      .values({
        instanceId: remoteInstanceId,
        handle: 'alice',
        normalizedHandle: 'alice',
        displayName: 'Alice',
        followPolicy: ProfileFollowPolicy.OPEN,
      })
      .returning({ id: Profiles.id });
    remoteProfileId = remoteProfile!.id;

    const [localProfile] = await db
      .insert(Profiles)
      .values({
        instanceId: localInstanceId,
        handle: 'bob',
        normalizedHandle: 'bob',
        displayName: 'Bob',
        followPolicy: ProfileFollowPolicy.OPEN,
      })
      .returning({ id: Profiles.id });
    localProfileId = localProfile!.id;

    await db.insert(ActivityPubActors).values({
      profileId: remoteProfileId,
      type: ActivityPubActorType.PERSON,
      uri: remoteActorUri,
      inboxUri: remoteInboxUri,
      sharedInboxUri: remoteSharedInboxUri,
    });

    const [profileFollow] = await db
      .insert(ProfileFollows)
      .values({ followerProfileId: remoteProfileId, followeeProfileId: localProfileId })
      .returning({ id: ProfileFollows.id });
    profileFollowId = profileFollow!.id;
  });

  afterEach(async () => {
    mock.restoreAll();
    await db.delete(ProfileFollows).where(eq(ProfileFollows.id, profileFollowId));
    await db.delete(Profiles).where(inArray(Profiles.id, [remoteProfileId, localProfileId]));
    await db.delete(Instances).where(eq(Instances.id, remoteInstanceId));
  });

  after(async () => {
    await closeFedifyQueue();
    await pg.end();
  });

  test('queues one ID-less Accept for the exact active remote-to-local relationship', async () => {
    const fixture = createContextFixture();
    const contextOrigins: URL[] = [];
    mock.method(federation, 'createContext', (origin: URL) => {
      contextOrigins.push(origin);
      return fixture.context;
    });

    const result = await resendApprovedFollowAccept({
      profileFollowId,
      followerProfileId: remoteProfileId,
      followeeProfileId: localProfileId,
    });

    assert.deepEqual(result, {
      status: 'queued',
      profileFollowId,
      followerProfileId: remoteProfileId,
      followeeProfileId: localProfileId,
    });
    assert.deepEqual(
      contextOrigins.map((origin) => origin.href),
      [new URL(publicOrigin).href],
    );
    assert.equal(fixture.calls.length, 1);

    const call = fixture.calls[0]!;
    assert.ok(call.activity instanceof Accept);
    assert.equal(call.activity.actorId?.href, `${publicOrigin}/ap/actor/${localProfileId}`);
    assert.deepEqual(
      call.activity.toIds.map((uri) => uri.href),
      [remoteActorUri],
    );
    const receivedFollow = await call.activity.getObject();
    assert.ok(receivedFollow instanceof Follow);
    assert.equal(receivedFollow.id, null);
    assert.equal(receivedFollow.published, null);
    assert.equal(receivedFollow.actorId?.href, remoteActorUri);
    assert.equal(receivedFollow.objectId?.href, `${publicOrigin}/ap/actor/${localProfileId}`);
    assert.deepEqual(call.sender, { identifier: localProfileId });
    assert.equal(call.recipient.id?.href, remoteActorUri);
    assert.equal(call.recipient.inboxId?.href, remoteInboxUri);
    assert.equal(call.recipient.endpoints?.sharedInbox?.href, remoteSharedInboxUri);
    assert.equal(call.options, undefined);
  });

  test('does not send when the exact current relationship row has been removed', async () => {
    const fixture = createContextFixture();
    mock.method(federation, 'createContext', () => fixture.context);
    await db.delete(ProfileFollows).where(eq(ProfileFollows.id, profileFollowId));

    await assert.rejects(
      resendApprovedFollowAccept({
        profileFollowId,
        followerProfileId: remoteProfileId,
        followeeProfileId: localProfileId,
      }),
      /No current profile_follow row/,
    );
    assert.equal(fixture.calls.length, 0);
  });

  test('does not send when the supplied directed pair differs from the current row', async () => {
    const fixture = createContextFixture();
    mock.method(federation, 'createContext', () => fixture.context);

    await assert.rejects(
      resendApprovedFollowAccept({
        profileFollowId,
        followerProfileId: localProfileId,
        followeeProfileId: remoteProfileId,
      }),
      /No current profile_follow row matches the supplied ID/,
    );
    assert.equal(fixture.calls.length, 0);
  });

  test('does not send when a current profile or instance is inactive', async () => {
    const fixture = createContextFixture();
    mock.method(federation, 'createContext', () => fixture.context);
    await db
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(eq(Profiles.id, remoteProfileId));

    await assert.rejects(
      resendApprovedFollowAccept({
        profileFollowId,
        followerProfileId: remoteProfileId,
        followeeProfileId: localProfileId,
      }),
      /not active remote-to-local/,
    );
    assert.equal(fixture.calls.length, 0);

    await db
      .update(Profiles)
      .set({ state: ProfileState.ACTIVE })
      .where(eq(Profiles.id, remoteProfileId));
    await db
      .update(Instances)
      .set({ state: InstanceState.SUSPENDED })
      .where(eq(Instances.id, remoteInstanceId));

    await assert.rejects(
      resendApprovedFollowAccept({
        profileFollowId,
        followerProfileId: remoteProfileId,
        followeeProfileId: localProfileId,
      }),
      /not active remote-to-local/,
    );
    assert.equal(fixture.calls.length, 0);
  });

  test('does not send when the current remote actor has no inbox', async () => {
    const fixture = createContextFixture();
    mock.method(federation, 'createContext', () => fixture.context);
    await db
      .update(ActivityPubActors)
      .set({ inboxUri: null })
      .where(eq(ActivityPubActors.profileId, remoteProfileId));

    await assert.rejects(
      resendApprovedFollowAccept({
        profileFollowId,
        followerProfileId: remoteProfileId,
        followeeProfileId: localProfileId,
      }),
      /Remote actor inbox must be an HTTP\(S\) URL/,
    );
    assert.equal(fixture.calls.length, 0);
  });
});

interface SendActivityCall {
  readonly activity: Activity;
  readonly options: { readonly orderingKey?: string } | undefined;
  readonly recipient: Recipient;
  readonly sender: { readonly identifier: string };
}

const createContextFixture = () => {
  const calls: SendActivityCall[] = [];
  const context = {
    canonicalOrigin: publicOrigin,
    getActorUri: (identifier: string) => new URL(`/ap/actor/${identifier}`, publicOrigin),
    sendActivity: async (
      sender: { identifier: string },
      recipient: Recipient,
      activity: Activity,
      options?: { orderingKey?: string },
    ) => {
      calls.push({ activity, options, recipient, sender });
    },
  } as Context<void>;

  return { calls, context };
};
