import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { Note } from '@fedify/vocab';
import {
  ActivityPubActors,
  db,
  firstOrThrow,
  Instances,
  pg,
  ProfileFollows,
  Profiles,
} from '@kosmo/core/db';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { eq, inArray } from 'drizzle-orm';
import { dispatchActivityPubActivity } from './outbound-recipient-dispatch';
import type { Context } from '@fedify/fedify';
import type { Activity } from '@fedify/vocab';

const profileIds = new Set<string>();
const instanceIds = new Set<string>();

const createProfile = async ({
  kind,
  handle = crypto.randomUUID(),
}: {
  readonly kind: InstanceKind;
  readonly handle?: string;
}) => {
  const domain = `${crypto.randomUUID()}.example`;
  const instance = await db
    .insert(Instances)
    .values({
      canonicalOrigin: kind === InstanceKind.LOCAL ? `https://${domain}` : null,
      domain,
      kind,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  instanceIds.add(instance.id);
  const profile = await db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId: instance.id,
      normalizedHandle: handle,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  profileIds.add(profile.id);
  return { instance, profile };
};

const addRemoteActor = async (profileId: string, domain: string, handle: string) => {
  const uri = `https://${domain}/users/${handle}`;
  await db.insert(ActivityPubActors).values({
    inboxUri: `${uri}/inbox`,
    profileId,
    type: ActivityPubActorType.PERSON,
    uri,
  });
  return uri;
};

afterEach(async () => {
  if (profileIds.size > 0) {
    await db.delete(Profiles).where(inArray(Profiles.id, [...profileIds]));
  }
  if (instanceIds.size > 0) {
    await db.delete(Instances).where(inArray(Instances.id, [...instanceIds]));
  }
  profileIds.clear();
  instanceIds.clear();
});

after(async () => {
  await pg.end();
});

test('direct-only dispatcher는 target 하나만 queue에 handoff하고 ordering key를 전달한다', async () => {
  const { profile: owner } = await createProfile({ kind: InstanceKind.LOCAL });
  const { instance: targetInstance, profile: target } = await createProfile({
    kind: InstanceKind.ACTIVITYPUB,
  });
  const { instance: followerInstance, profile: follower } = await createProfile({
    kind: InstanceKind.ACTIVITYPUB,
  });
  const targetUri = await addRemoteActor(target.id, targetInstance.domain, target.handle);
  const followerUri = await addRemoteActor(follower.id, followerInstance.domain, follower.handle);
  await db.insert(ProfileFollows).values({
    followerProfileId: follower.id,
    followeeProfileId: owner.id,
  });

  const calls: Array<{
    readonly orderingKey?: string;
    readonly recipients: readonly string[];
  }> = [];
  const context = {
    sendActivity: async (
      _sender: { readonly identifier: string },
      recipients: { readonly id?: URL } | readonly { readonly id?: URL }[],
      _activity: Activity,
      options?: { readonly orderingKey?: string },
    ) => {
      const values = Array.isArray(recipients) ? recipients : [recipients];
      calls.push({
        orderingKey: options?.orderingKey,
        recipients: values.flatMap((recipient) =>
          recipient.id === undefined ? [] : [recipient.id.href],
        ),
      });
    },
  } as unknown as Context<{ readonly localInstanceId: string }>;

  const result = await dispatchActivityPubActivity({
    activity: new Note({ id: new URL('https://local.example/ap/note/1') }) as unknown as Activity,
    actorProfileId: owner.id,
    context,
    directOnly: true,
    directProfileIds: [target.id],
    orderingKey: `profile-block:${owner.id}:${target.id}`,
  });

  assert.deepEqual(result, { recipientCount: 1, status: 'SETTLED' });
  assert.deepEqual(calls, [
    {
      orderingKey: `profile-block:${owner.id}:${target.id}`,
      recipients: [targetUri],
    },
  ]);
  assert.equal(calls[0]?.recipients.includes(followerUri), false);
});

test('기존 dispatcher 호출은 direct target과 follower audience를 유지하고 recipient가 없으면 pending을 반환한다', async () => {
  const { profile: owner } = await createProfile({ kind: InstanceKind.LOCAL });
  const { instance, profile: follower } = await createProfile({ kind: InstanceKind.ACTIVITYPUB });
  const followerUri = await addRemoteActor(follower.id, instance.domain, follower.handle);
  await db.insert(ProfileFollows).values({
    followerProfileId: follower.id,
    followeeProfileId: owner.id,
  });
  const context = {
    sendActivity: async () => undefined,
  } as unknown as Context<{ readonly localInstanceId: string }>;

  const existingCallerResult = await dispatchActivityPubActivity({
    activity: new Note({ id: new URL('https://local.example/ap/note/2') }) as unknown as Activity,
    actorProfileId: owner.id,
    context,
    directProfileIds: [],
  });
  assert.deepEqual(existingCallerResult, { recipientCount: 1, status: 'SETTLED' });
  assert.equal(followerUri.startsWith('https://'), true);

  await db
    .update(Profiles)
    .set({ state: ProfileState.DISABLED })
    .where(eq(Profiles.id, follower.id));
  const noRecipientResult = await dispatchActivityPubActivity({
    activity: new Note({ id: new URL('https://local.example/ap/note/3') }) as unknown as Activity,
    actorProfileId: owner.id,
    context,
    directOnly: true,
    directProfileIds: [follower.id],
  });
  assert.deepEqual(noRecipientResult, {
    reason: 'recipient_unavailable',
    recipientCount: 0,
    status: 'PENDING',
  });
});
