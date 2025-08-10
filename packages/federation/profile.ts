import {
  getActorHandle,
  type Application,
  type Group,
  type Organization,
  type Person,
  type Service,
} from '@fedify/fedify';
import type { Transaction } from '@kosmo/db';
import { db as database, firstOrThrow, Instances, Profiles } from '@kosmo/db';
import { InstanceType } from '@kosmo/enum';

type Actor = Application | Group | Organization | Person | Service;

type GetOrCreateProfileParams = {
  actor: Actor;
  tx?: Transaction;
};
export const getOrCreateProfile = async ({ actor, tx }: GetOrCreateProfileParams) => {
  const db = tx ?? database;

  const [handle, domain] = (await getActorHandle(actor, { trimLeadingAt: true })).split('@', 2);

  const instance = await db
    .insert(Instances)
    .values({
      domain,
      type: InstanceType.ACTIVITYPUB,
    })
    .onConflictDoUpdate({
      target: [Instances.domain],
      set: { type: InstanceType.ACTIVITYPUB },
    })
    .returning({ id: Instances.id })
    .then(firstOrThrow);

  const profileData = {
    handle,
    inboxUri: actor.inboxId!.href,
    sharedInboxUri: actor.endpoints?.sharedInbox?.href,
    displayName: actor.name?.toString(),
    url: actor.url?.href?.toString(),
    instanceId: instance.id,
  };

  const profile = await db
    .insert(Profiles)
    .values({
      uri: actor.id!.href,
      ...profileData,
    })
    .onConflictDoUpdate({
      target: [Profiles.uri],
      set: {
        ...profileData,
      },
    })
    .returning()
    .then(firstOrThrow);

  return profile;
};
