import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, afterEach, mock, test } from 'node:test';
import { Image, Person, Update } from '@fedify/vocab';
import {
  Accounts,
  ActivityPubActors,
  db,
  firstOrThrow,
  Instances,
  Media,
  pg,
  ProfileFollows,
  ProfileMedia,
  Profiles,
} from '@kosmo/core/db';
import {
  AccountState,
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  MediaSource,
  MediaState,
  ProfileFollowPolicy,
  ProfileMediaKind,
  ProfileState,
} from '@kosmo/core/enums';
import { localOutboundFederation } from './local-outbound-federation';
import { sendLocalProfileUpdate } from './local-profile-update-delivery';
import type { Context } from '@fedify/fedify';
import type { Activity, Recipient } from '@fedify/vocab';
import type { LocalOutboundContextData } from './local-outbound-federation';

afterEach(() => {
  mock.restoreAll();
});

after(async () => pg.end());

test('Update(Person)는 canonical actor 표현·followers audience·unique activity identity를 쓴다', async () => {
  const local = await createLocalProfile();
  const avatar = await createMedia(local.accountId, local.profile.id, 'avatar');
  const header = await createMedia(local.accountId, local.profile.id, 'header');
  await db.insert(ProfileMedia).values([
    { kind: ProfileMediaKind.AVATAR, mediaId: avatar.id, profileId: local.profile.id },
    { kind: ProfileMediaKind.HEADER, mediaId: header.id, profileId: local.profile.id },
  ]);
  const active = await createRemoteActor({ sharedInbox: true });
  const suspended = await createRemoteActor({ instanceState: InstanceState.SUSPENDED });
  await db.insert(ProfileFollows).values([
    { followeeProfileId: local.profile.id, followerProfileId: active.profileId },
    { followeeProfileId: local.profile.id, followerProfileId: suspended.profileId },
  ]);
  const fixture = await createContextFixture(local);
  mock.method(localOutboundFederation, 'createContext', () => fixture.context);

  await sendLocalProfileUpdate(local.profile.id);
  await sendLocalProfileUpdate(local.profile.id);

  assert.equal(fixture.calls.length, 2);
  const [first, second] = fixture.calls;
  assert.ok(first?.activity instanceof Update);
  assert.ok(second?.activity instanceof Update);
  assert.notEqual(first.activity.id?.href, second.activity.id?.href);
  assert.equal(first.activity.actorId?.href, fixture.actorUri.href);
  assert.deepEqual(
    first.activity.toIds.map((uri) => uri.href),
    [fixture.followersUri.href],
  );
  const object = await first.activity.getObject();
  assert.ok(object instanceof Person);
  assert.equal(object.id?.href, fixture.actorUri.href);
  assert.equal(object.name?.toString(), local.profile.displayName);
  assert.equal(object.summary?.toString(), local.profile.bio);
  assert.equal(object.manuallyApprovesFollowers, true);
  const icon = await object.getIcon();
  const image = await object.getImage();
  assert.ok(icon instanceof Image);
  assert.ok(image instanceof Image);
  assert.equal(icon.url?.toString(), avatar.url);
  assert.equal(image.url?.toString(), header.url);
  assert.deepEqual(first.sender, { identifier: local.profile.id });
  assert.deepEqual(first.options, { preferSharedInbox: true });
  assert.deepEqual(
    first.recipients.map((recipient) => recipient.id?.href),
    [active.actorUri],
  );
  assert.equal(first.recipients[0]?.endpoints?.sharedInbox?.href, active.sharedInboxUri);
});

test('remote follower가 없으면 HTTP delivery를 시작하지 않는다', async () => {
  const local = await createLocalProfile();
  const fixture = await createContextFixture(local);
  mock.method(localOutboundFederation, 'createContext', () => fixture.context);

  await sendLocalProfileUpdate(local.profile.id);

  assert.equal(fixture.calls.length, 0);
});

test('recipient delivery 실패는 caller가 격리할 수 있도록 reject한다', async () => {
  const local = await createLocalProfile();
  const active = await createRemoteActor({});
  await db.insert(ProfileFollows).values({
    followeeProfileId: local.profile.id,
    followerProfileId: active.profileId,
  });
  const fixture = await createContextFixture(local, true);
  mock.method(localOutboundFederation, 'createContext', () => fixture.context);

  await assert.rejects(sendLocalProfileUpdate(local.profile.id), /delivery failed/);
});

type LocalFixture = Awaited<ReturnType<typeof createLocalProfile>>;

interface SendActivityCall {
  readonly activity: Activity;
  readonly options: { readonly preferSharedInbox: boolean };
  readonly recipients: Recipient[];
  readonly sender: { readonly identifier: string };
}

const createContextFixture = async (local: LocalFixture, fail = false) => {
  const actual = localOutboundFederation.createContext(new URL(local.canonicalOrigin), {
    localInstanceId: local.instanceId,
  });
  const keyPairs = await actual.getActorKeyPairs(local.profile.id);
  const calls: SendActivityCall[] = [];
  const context = {
    canonicalOrigin: actual.canonicalOrigin,
    getActorKeyPairs: async () => keyPairs,
    getActorUri: actual.getActorUri.bind(actual),
    getFollowersUri: actual.getFollowersUri.bind(actual),
    getFollowingUri: actual.getFollowingUri.bind(actual),
    sendActivity: async (
      sender: { identifier: string },
      recipients: Recipient | Recipient[],
      activity: Activity,
      options: { preferSharedInbox: boolean },
    ) => {
      if (fail) {
        throw new Error('delivery failed');
      }
      calls.push({
        activity,
        options,
        recipients: Array.isArray(recipients) ? recipients : [recipients],
        sender,
      });
    },
  } as unknown as Context<LocalOutboundContextData>;

  return {
    actorUri: actual.getActorUri(local.profile.id),
    calls,
    context,
    followersUri: actual.getFollowersUri(local.profile.id),
  };
};

const createLocalProfile = async () => {
  const suffix = crypto.randomUUID();
  const canonicalOrigin = `https://${suffix}.local.example`;
  const instance = await db
    .insert(Instances)
    .values({
      canonicalOrigin,
      domain: `${suffix}.local.example`,
      kind: InstanceKind.LOCAL,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const profile = await db
    .insert(Profiles)
    .values({
      bio: 'Canonical bio',
      displayName: 'Canonical name',
      followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
      handle: suffix,
      instanceId: instance.id,
      normalizedHandle: suffix,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const account = await db
    .insert(Accounts)
    .values({ displayName: suffix, oidcSubject: suffix, state: AccountState.ACTIVE })
    .returning()
    .then(firstOrThrow);
  return { accountId: account.id, canonicalOrigin, instanceId: instance.id, profile };
};

const createMedia = async (accountId: string, profileId: string, kind: string) =>
  db
    .insert(Media)
    .values({
      accountId,
      mediaType: 'image/webp',
      profileId,
      readyAt: Temporal.Now.instant(),
      source: MediaSource.LOCAL,
      state: MediaState.READY,
      storageReference: `${kind}-${crypto.randomUUID()}`,
      uploadExpiresAt: Temporal.Now.instant().add({ minutes: 5 }),
      url: `https://media.example/${kind}-${crypto.randomUUID()}.webp`,
    })
    .returning()
    .then(firstOrThrow);

const createRemoteActor = async ({
  instanceState = InstanceState.ACTIVE,
  sharedInbox = false,
}: {
  instanceState?: InstanceState;
  sharedInbox?: boolean;
}) => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.remote.example`,
      kind: InstanceKind.ACTIVITYPUB,
      state: instanceState,
    })
    .returning()
    .then(firstOrThrow);
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
  const actorUri = `https://${instance.domain}/users/${suffix}`;
  const sharedInboxUri = sharedInbox ? `https://${instance.domain}/inbox` : null;
  await db.insert(ActivityPubActors).values({
    inboxUri: `${actorUri}/inbox`,
    profileId: profile.id,
    sharedInboxUri,
    type: ActivityPubActorType.PERSON,
    uri: actorUri,
  });
  return { actorUri, profileId: profile.id, sharedInboxUri };
};
